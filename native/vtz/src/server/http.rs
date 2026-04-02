use crate::banner::print_banner_with_upstream;
use crate::compiler::pipeline::CompilationPipeline;
use crate::config::ServerConfig;
use crate::deps::linked::{discover_linked_packages, WatchTarget};
use crate::errors::broadcaster::ErrorBroadcaster;
use crate::errors::categories::{extract_snippet, DevError, ErrorCategory};
use crate::hmr::recovery::RestartTriggers;
use crate::hmr::websocket::HmrHub;
use crate::runtime::persistent_isolate::{
    IsolateRequest, PersistentIsolate, PersistentIsolateOptions,
};
use crate::server::console_log::{ConsoleLog, LogLevel};
use crate::server::diagnostics;
use crate::server::html_shell;
use crate::server::logging::RequestLoggingLayer;
use crate::server::mcp::{self, McpSessions};
use crate::server::mcp_events::{self, McpEventHub};
use crate::server::module_server::{self, DevServerState};
use crate::server::theme_css;
use crate::tsconfig;
use crate::typecheck::process;
use crate::watcher;
use crate::watcher::dep_watcher::{DepWatcher, DepWatcherConfig};
use crate::watcher::file_watcher::{FileWatcher, FileWatcherConfig, SmartDebouncer};
use axum::body::Body;
use axum::extract::ws::WebSocketUpgrade;
use axum::extract::State;
use axum::http::{header, Request, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use std::io;
use std::sync::Arc;
use std::time::Instant;
use tokio::net::TcpListener;

const MAX_PORT_ATTEMPTS: u16 = 10;

/// Bind result containing the listener and the actual port used.
#[derive(Debug)]
pub struct BindResult {
    pub listener: TcpListener,
    pub port: u16,
}

/// Attempt to bind to the configured port, auto-incrementing on conflict.
///
/// Tries up to `MAX_PORT_ATTEMPTS` ports starting from `config.port`.
/// Returns the listener and the actual port bound to.
pub async fn try_bind(config: &ServerConfig) -> io::Result<BindResult> {
    let mut last_error = None;

    for offset in 0..MAX_PORT_ATTEMPTS {
        let port = config.port + offset;
        let addr = format!("{}:{}", config.host, port);

        match TcpListener::bind(&addr).await {
            Ok(listener) => {
                if offset > 0 {
                    eprintln!("Port {} in use, using {}", config.port + offset - 1, port);
                }
                return Ok(BindResult { listener, port });
            }
            Err(e) if e.kind() == io::ErrorKind::AddrInUse => {
                last_error = Some(e);
                continue;
            }
            Err(e) => return Err(e),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        io::Error::new(
            io::ErrorKind::AddrInUse,
            format!(
                "Could not bind to any port in range {}–{}",
                config.port,
                config.port + MAX_PORT_ATTEMPTS - 1
            ),
        )
    }))
}

/// Build the axum router with all dev server routes.
///
/// The router uses a single fallback handler that dispatches based on URL path prefix:
/// 1. `/__vertz_hmr` → WebSocket HMR endpoint
/// 2. `/__vertz_errors` → WebSocket error broadcast endpoint
/// 3. `/__vertz_diagnostics` → JSON health check endpoint
/// 4. `/@deps/**` → pre-bundled dependency serving
/// 5. `/@css/**` → extracted CSS serving
/// 6. `/src/**` → on-demand compilation + serving
/// 7. Static files from public_dir
/// 8. Fallback → HTML shell for SPA routing (page routes)
pub fn build_router(
    config: &ServerConfig,
    plugin: Arc<dyn crate::plugin::FrameworkPlugin>,
) -> (Router, Arc<DevServerState>) {
    // Parse tsconfig.json path aliases for import resolution
    let tsconfig_path = config
        .tsconfig_path
        .clone()
        .unwrap_or_else(|| config.root_dir.join("tsconfig.json"));
    let tsconfig_paths = tsconfig::parse_tsconfig_paths(&tsconfig_path);
    if !tsconfig_paths.is_empty() {
        eprintln!(
            "[config] Loaded {} path alias(es) from {}",
            tsconfig_paths.paths.len(),
            tsconfig_path.display()
        );
    }

    // Load .env files and build public env vars for compile-time replacement
    let prefixes = plugin.env_public_prefixes();
    let prefix_refs: Vec<&str> = prefixes.iter().map(|s| s.as_str()).collect();
    let all_env = crate::env::load_env_files(&config.root_dir, "development");
    let public_env = crate::env::build_public_env(&all_env, &prefix_refs, "development");
    if !public_env.is_empty() {
        let user_vars: Vec<&String> = public_env
            .keys()
            .filter(|k| !matches!(k.as_str(), "MODE" | "DEV" | "PROD" | "BASE_URL"))
            .collect();
        if !user_vars.is_empty() {
            eprintln!(
                "[env] Loaded {} public env var(s) from .env files",
                user_vars.len()
            );
        }
    }

    let css_transform =
        crate::compiler::postcss::find_postcss_config(&config.root_dir).map(|config_path| {
            std::sync::Arc::new(crate::compiler::postcss::PostCssCssTransform::new(
                config_path,
            )) as std::sync::Arc<dyn crate::compiler::css_transform::CssTransform>
        });

    let mut pipeline = CompilationPipeline::new(
        config.root_dir.clone(),
        config.src_dir.clone(),
        plugin.clone(),
    )
    .with_tsconfig_paths(tsconfig_paths)
    .with_env(public_env);

    if let Some(transform) = css_transform {
        pipeline = pipeline.with_css_transform(transform);
    }

    // Load theme CSS from the project (if available)
    let theme_css = theme_css::load_theme_css(&config.root_dir);

    let hmr_hub = HmrHub::new();
    let error_broadcaster = ErrorBroadcaster::with_root_dir(config.root_dir.clone());
    let console_log = ConsoleLog::new();
    let mcp_sessions = McpSessions::new();
    let mcp_event_hub = McpEventHub::new();
    let module_graph = watcher::new_shared_module_graph();

    // Create persistent V8 isolate for API route delegation and SSR rendering.
    // The isolate is created when SSR is enabled or a server_entry exists.
    let api_isolate = if config.enable_ssr || config.server_entry.is_some() {
        let opts = PersistentIsolateOptions {
            root_dir: config.root_dir.clone(),
            ssr_entry: config.ssr_entry.clone(),
            server_entry: config.server_entry.clone(),
            channel_capacity: 256,
        };
        match PersistentIsolate::new(opts) {
            Ok(isolate) => {
                let mode = match (&config.server_entry, config.enable_ssr) {
                    (Some(entry), true) => format!("API ({}) + SSR", entry.display()),
                    (Some(entry), false) => format!("API ({})", entry.display()),
                    (None, true) => "SSR only".to_string(),
                    (None, false) => "idle".to_string(),
                };
                eprintln!("[Server] Persistent V8 isolate created (mode: {})", mode);
                Some(Arc::new(isolate))
            }
            Err(e) => {
                eprintln!("[Server] Failed to create persistent isolate: {}", e);
                None
            }
        }
    } else {
        None
    };

    // Load proxy configuration from .vertzrc
    let api_proxy = {
        let vertzrc = crate::pm::vertzrc::load_vertzrc(&config.root_dir).unwrap_or_default();
        vertzrc.proxy.as_ref().and_then(|proxy_json| {
            match crate::server::api_proxy::ProxyConfig::from_json(proxy_json) {
                Ok(proxy_config) => {
                    if !proxy_config.rules.is_empty() {
                        let prefixes: Vec<&str> = proxy_config
                            .rules
                            .iter()
                            .map(|r| r.prefix.as_str())
                            .collect();
                        eprintln!(
                            "[proxy] Loaded {} rule(s): {}",
                            prefixes.len(),
                            prefixes.join(", ")
                        );
                    }
                    Some(Arc::new(proxy_config))
                }
                Err(e) => {
                    eprintln!("[proxy] Failed to parse proxy config: {}", e);
                    None
                }
            }
        })
    };

    let state = Arc::new(DevServerState {
        plugin,
        pipeline,
        root_dir: config.root_dir.clone(),
        src_dir: config.src_dir.clone(),
        entry_file: config.entry_file.clone(),
        deps_dir: config.deps_dir(),
        theme_css,
        hmr_hub,
        module_graph,
        error_broadcaster,
        console_log,
        mcp_sessions,
        mcp_event_hub,
        start_time: Instant::now(),
        enable_ssr: config.enable_ssr,
        port: config.port,
        typecheck_enabled: config.enable_typecheck,
        api_isolate: Arc::new(std::sync::RwLock::new(api_isolate)),
        api_proxy,
        auto_install: config.auto_install,
        auto_install_lock: Arc::new(tokio::sync::Mutex::new(())),
        auto_install_inflight: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        auto_install_failed: Arc::new(std::sync::Mutex::new(std::collections::HashSet::new())),
    });

    // Routes: HMR WebSocket, error WebSocket, diagnostics, AI API, fallback
    let router = Router::new()
        .route("/__vertz_hmr", get(ws_handler))
        .route("/__vertz_errors", get(ws_error_handler))
        .route("/__vertz_diagnostics", get(diagnostics_handler))
        .route("/__vertz_ai/errors", get(ai_errors_handler))
        .route("/__vertz_ai/render", get(ai_render_handler))
        .route("/__vertz_ai/console", get(ai_console_handler))
        .route(
            "/__vertz_ai/navigate",
            axum::routing::post(ai_navigate_handler),
        )
        .route("/__vertz_mcp/sse", get(mcp::mcp_sse_handler))
        .route(
            "/__vertz_mcp/message",
            axum::routing::post(mcp::mcp_message_handler),
        )
        .route(
            "/__vertz_mcp",
            axum::routing::post(mcp::mcp_streamable_handler),
        )
        .route("/__vertz_mcp/events", get(ws_mcp_events_handler))
        .fallback(dev_server_handler)
        .with_state(state.clone())
        .layer(RequestLoggingLayer);

    (router, state)
}

/// WebSocket upgrade handler for the HMR endpoint.
async fn ws_handler(
    State(state): State<Arc<DevServerState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        state.hmr_hub.handle_connection(socket).await;
    })
}

/// WebSocket upgrade handler for the error broadcast endpoint.
async fn ws_error_handler(
    State(state): State<Arc<DevServerState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        state.error_broadcaster.handle_connection(socket).await;
    })
}

/// WebSocket upgrade handler for the MCP LLM event push endpoint.
async fn ws_mcp_events_handler(
    State(state): State<Arc<DevServerState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        let server_status = mcp_events::build_server_status(&state).await;
        let error_snapshot = mcp_events::build_error_snapshot(&state.error_broadcaster).await;
        state
            .mcp_event_hub
            .handle_connection(socket, server_status, error_snapshot)
            .await;
    })
}

/// JSON error endpoint for LLM consumption: `GET /__vertz_ai/errors`
///
/// Returns all current errors with file paths, line/column numbers,
/// code snippets, and suggestions — structured for easy parsing.
async fn ai_errors_handler(
    State(state): State<Arc<DevServerState>>,
) -> axum::response::Response<Body> {
    let errors = state.error_broadcaster.all_errors_cloned().await;

    let json = serde_json::json!({
        "errors": errors,
        "count": errors.len(),
    });

    let body = serde_json::to_string_pretty(&json).unwrap_or_else(|_| "{}".to_string());

    axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(body))
        .unwrap()
}

/// SSR render endpoint for LLM consumption: `GET /__vertz_ai/render?url=/path`
///
/// Renders the given URL server-side using the persistent isolate and returns
/// the HTML. Gives LLMs a "text screenshot" of the page without needing
/// Playwright.
async fn ai_render_handler(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> axum::response::Response<Body> {
    // Extract ?url= query parameter
    let url = req
        .uri()
        .query()
        .and_then(|q| q.split('&').find_map(|pair| pair.strip_prefix("url=")))
        .unwrap_or("/")
        .to_string();

    if !state.enable_ssr {
        return axum::response::Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
            .body(Body::from(
                serde_json::json!({
                    "error": "SSR is not enabled",
                    "html": null,
                })
                .to_string(),
            ))
            .unwrap();
    }

    // Use the persistent isolate for SSR
    let isolate = state
        .api_isolate
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    if let Some(isolate) = isolate.as_ref() {
        if isolate.is_initialized() {
            let ssr_req = crate::runtime::persistent_isolate::SsrRequest {
                url: url.clone(),
                session_json: None,
                cookies: None,
            };

            match isolate.handle_ssr(ssr_req).await {
                Ok(ssr_resp) => {
                    state.console_log.push(
                        LogLevel::Info,
                        format!(
                            "AI render: {} ({:.1}ms, {})",
                            url,
                            ssr_resp.render_time_ms,
                            if ssr_resp.is_ssr {
                                "ssr"
                            } else {
                                "client-only"
                            }
                        ),
                        Some("ai"),
                    );

                    let css_string = format_ssr_css(&ssr_resp.css_entries);
                    let entry_url = crate::ssr::html_document::entry_path_to_url(
                        &state.entry_file,
                        &state.root_dir,
                    );
                    let html = crate::ssr::html_document::assemble_ssr_document(
                        &crate::ssr::html_document::SsrHtmlOptions {
                            title: "Vertz App",
                            ssr_content: &ssr_resp.content,
                            inline_css: &css_string,
                            theme_css: state.theme_css.as_deref(),
                            entry_url: &entry_url,
                            preload_hints: &[],
                            enable_hmr: false,
                            ssr_data: ssr_resp.ssr_data.as_deref(),
                            head_tags: ssr_resp.head_tags.as_deref(),
                        },
                    );

                    return axum::response::Response::builder()
                        .status(StatusCode::OK)
                        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                        .header(header::CACHE_CONTROL, "no-cache")
                        .header(
                            "X-Vertz-Render-Time",
                            format!("{:.1}ms", ssr_resp.render_time_ms),
                        )
                        .header(
                            "X-Vertz-SSR",
                            if ssr_resp.is_ssr { "true" } else { "false" },
                        )
                        .header(
                            "X-Vertz-SSR-Error",
                            ssr_resp.error.as_deref().unwrap_or("none"),
                        )
                        .body(Body::from(html))
                        .unwrap();
                }
                Err(e) => {
                    let error_msg = format!("Persistent SSR error: {}", e);
                    eprintln!("[SSR] AI render: {}", error_msg);
                    state
                        .console_log
                        .push(LogLevel::Error, error_msg, Some("ai"));
                }
            }
        }
    }

    // Fallback: client-only HTML shell
    state.console_log.push(
        LogLevel::Info,
        format!("AI render: {} (client-only, no persistent isolate)", url),
        Some("ai"),
    );

    let html = html_shell::generate_html_shell(
        &state.entry_file,
        &state.root_dir,
        &[],
        state.theme_css.as_deref(),
        "Vertz App",
        state.plugin.as_ref(),
    );

    axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-cache")
        .header("X-Vertz-SSR", "false")
        .header("X-Vertz-SSR-Error", "persistent isolate not available")
        .body(Body::from(html))
        .unwrap()
}

/// Console log endpoint for LLM consumption: `GET /__vertz_ai/console?last=N`
///
/// Returns recent console log entries (compilation, SSR, watcher diagnostics).
async fn ai_console_handler(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> axum::response::Response<Body> {
    let last_n: usize = req
        .uri()
        .query()
        .and_then(|q| q.split('&').find_map(|pair| pair.strip_prefix("last=")))
        .and_then(|v| v.parse().ok())
        .unwrap_or(50);

    let entries = state.console_log.last_n(last_n);

    let json = serde_json::json!({
        "entries": entries,
        "count": entries.len(),
        "total": state.console_log.len(),
    });

    let body = serde_json::to_string_pretty(&json).unwrap_or_else(|_| "{}".to_string());

    axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(body))
        .unwrap()
}

/// Navigate endpoint for LLM control: `POST /__vertz_ai/navigate`
///
/// Sends a navigation command to the browser via HMR WebSocket.
/// Body: `{ "to": "/tasks/123" }`
async fn ai_navigate_handler(
    State(state): State<Arc<DevServerState>>,
    body: axum::body::Bytes,
) -> axum::response::Response<Body> {
    #[derive(serde::Deserialize)]
    struct NavigateRequest {
        to: String,
    }

    let req: NavigateRequest = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => {
            return axum::response::Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(Body::from(
                    serde_json::json!({ "error": format!("Invalid JSON: {}", e) }).to_string(),
                ))
                .unwrap();
        }
    };

    let navigate_to = req.to.clone();

    state
        .hmr_hub
        .broadcast(crate::hmr::protocol::HmrMessage::Navigate { to: req.to.clone() })
        .await;

    state.console_log.push(
        LogLevel::Info,
        format!("AI navigate: {}", navigate_to),
        Some("ai"),
    );

    let json = serde_json::json!({
        "ok": true,
        "navigated_to": navigate_to,
    });

    axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .body(Body::from(json.to_string()))
        .unwrap()
}

/// JSON diagnostics endpoint handler.
async fn diagnostics_handler(
    State(state): State<Arc<DevServerState>>,
) -> axum::response::Response<Body> {
    let snap = diagnostics::collect_diagnostics(
        state.start_time,
        state.pipeline.cache().len(),
        &state.module_graph,
        &state.hmr_hub,
        &state.error_broadcaster,
    )
    .await;

    let json = serde_json::to_string(&snap).unwrap_or_else(|_| "{}".to_string());

    axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(json))
        .unwrap()
}

/// Central request handler for the dev server.
///
/// Dispatches based on URL path prefix:
/// - `/@deps/` → dependency serving
/// - `/@css/` → CSS serving
/// - `/src/` → source compilation
/// - everything else → static files or HTML shell
async fn dev_server_handler(
    state: State<Arc<DevServerState>>,
    req: Request<Body>,
) -> axum::response::Response<Body> {
    let path = req.uri().path().to_string();

    // Per-path API proxy: check before all other path-based dispatch.
    // Only forward to the proxy when a rule matches, since try_proxy_request
    // consumes the request and we need it for later handlers.
    let has_proxy_match = state
        .api_proxy
        .as_ref()
        .and_then(|cfg| crate::server::api_proxy::find_matching_rule(cfg, &path))
        .is_some();
    if has_proxy_match {
        if let Some(ref proxy_config) = state.api_proxy {
            return crate::server::api_proxy::try_proxy_request(proxy_config, req)
                .await
                .unwrap_or_else(|| {
                    axum::response::Response::builder()
                        .status(StatusCode::BAD_GATEWAY)
                        .body(Body::from("Proxy error"))
                        .unwrap()
                });
        }
    }

    if path.starts_with("/@deps/") {
        return module_server::handle_deps_request(state, req).await;
    }

    if path.starts_with("/@css/") {
        return module_server::handle_css_request(state, req).await;
    }

    if path.starts_with("/src/") {
        return module_server::handle_source_file(state, req).await;
    }

    // API route delegation: /api/* → persistent V8 isolate
    if path.starts_with("/api/") || path == "/api" {
        return handle_api_request(state, req, &path).await;
    }

    // Check for static files in public_dir
    let public_file = state
        .root_dir
        .join("public")
        .join(path.trim_start_matches('/'));
    if public_file.is_file() {
        let content = std::fs::read(&public_file).unwrap_or_default();
        let content_type = mime_type_for_path(&path);
        return axum::response::Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, content_type)
            .body(Body::from(content))
            .unwrap();
    }

    // SPA fallback: return HTML shell for page routes
    // Only serve HTML shell when the client accepts text/html (browser navigation).
    // API/asset requests that slip through should get 404, not HTML.
    let accepts_html = req
        .headers()
        .get(header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.contains("text/html"))
        .unwrap_or(true); // Default to true for requests without Accept header

    if html_shell::is_page_route(&path) && accepts_html {
        // SSR: render the page server-side with pre-rendered HTML
        if state.enable_ssr {
            let cookie_header = req
                .headers()
                .get(header::COOKIE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());

            let session =
                crate::ssr::session::extract_session_from_cookies(cookie_header.as_deref());

            // Use persistent isolate for SSR (the only supported strategy)
            let isolate = state
                .api_isolate
                .read()
                .unwrap_or_else(|e| e.into_inner())
                .clone();
            if let Some(isolate) = isolate.as_ref() {
                if isolate.is_initialized() {
                    let session_json = serde_json::to_string(&session).ok();
                    let ssr_req = crate::runtime::persistent_isolate::SsrRequest {
                        url: path.clone(),
                        session_json,
                        cookies: cookie_header.clone(),
                    };

                    match isolate.handle_ssr(ssr_req).await {
                        Ok(ssr_resp) => {
                            if ssr_resp.render_time_ms > 0.0 {
                                let render_msg = format!(
                                    "{} rendered in {:.1}ms ({})",
                                    path,
                                    ssr_resp.render_time_ms,
                                    if ssr_resp.is_ssr {
                                        "ssr-persistent"
                                    } else {
                                        "client-only"
                                    }
                                );
                                eprintln!("[SSR] {}", render_msg);
                                state
                                    .console_log
                                    .push(LogLevel::Info, render_msg, Some("ssr"));
                            }

                            // Handle redirect from ProtectedRoute during SSR
                            if let Some(ref redirect_to) = ssr_resp.redirect {
                                return axum::response::Response::builder()
                                    .status(StatusCode::FOUND)
                                    .header(header::LOCATION, redirect_to.as_str())
                                    .body(Body::empty())
                                    .unwrap();
                            }

                            // Assemble the full HTML document from SSR response
                            let css_string = format_ssr_css(&ssr_resp.css_entries);
                            let entry_url = crate::ssr::html_document::entry_path_to_url(
                                &state.entry_file,
                                &state.root_dir,
                            );
                            let html = crate::ssr::html_document::assemble_ssr_document(
                                &crate::ssr::html_document::SsrHtmlOptions {
                                    title: "Vertz App",
                                    ssr_content: &ssr_resp.content,
                                    inline_css: &css_string,
                                    theme_css: state.theme_css.as_deref(),
                                    entry_url: &entry_url,
                                    preload_hints: &[],
                                    enable_hmr: true,
                                    ssr_data: ssr_resp.ssr_data.as_deref(),
                                    head_tags: ssr_resp.head_tags.as_deref(),
                                },
                            );

                            return axum::response::Response::builder()
                                .status(StatusCode::OK)
                                .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                                .header(header::CACHE_CONTROL, "no-cache")
                                .body(Body::from(html))
                                .unwrap();
                        }
                        Err(e) => {
                            let error_msg = format!("Persistent SSR error: {}", e);
                            eprintln!("[SSR] {} — serving client shell", error_msg);
                            state
                                .console_log
                                .push(LogLevel::Error, error_msg, Some("ssr"));
                            // Fall through to client-only shell
                        }
                    }
                }
            }

            // Persistent isolate not ready or failed — serve client-only shell.
            // The client will hydrate and render in the browser.
        }

        // Fallback: client-only HTML shell (when SSR is disabled)
        let html = html_shell::generate_html_shell(
            &state.entry_file,
            &state.root_dir,
            &[],
            state.theme_css.as_deref(),
            "Vertz App",
            state.plugin.as_ref(),
        );
        return axum::response::Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CACHE_CONTROL, "no-cache")
            .body(Body::from(html))
            .unwrap();
    }

    // 404 for everything else
    axum::response::Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from("Not Found"))
        .unwrap()
}

/// Format CSS entries from persistent isolate SSR into inline style tags.
pub fn format_ssr_css(entries: &[(String, Option<String>)]) -> String {
    if entries.is_empty() {
        return String::new();
    }
    let mut seen = std::collections::HashSet::new();
    let mut parts = Vec::new();
    for (css, id) in entries {
        if let Some(id) = id {
            if !seen.insert(id.as_str()) {
                continue;
            }
        }
        if !css.is_empty() {
            parts.push(css.as_str());
        }
    }
    if parts.is_empty() {
        return String::new();
    }
    format!("  <style data-vertz-ssr>{}</style>\n", parts.join("\n"))
}

/// Maximum API request body size (10 MB).
const MAX_API_BODY_SIZE: usize = 10 * 1024 * 1024;

/// Handle API requests by delegating to the persistent V8 isolate.
///
/// Converts the Axum `Request` into an `IsolateRequest`, sends it to the
/// persistent V8 thread, and converts the `IsolateResponse` back to an Axum
/// `Response`.
async fn handle_api_request(
    state: State<Arc<DevServerState>>,
    req: Request<Body>,
    path: &str,
) -> axum::response::Response<Body> {
    let isolate = match state
        .api_isolate
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
    {
        Some(isolate) => isolate,
        None => {
            return axum::response::Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(Body::from(
                    r#"{"error":"No server entry configured. Create src/server.ts with a default export handler."}"#,
                ))
                .unwrap();
        }
    };

    if !isolate.is_initialized() {
        return axum::response::Response::builder()
            .status(StatusCode::SERVICE_UNAVAILABLE)
            .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
            .body(Body::from(
                r#"{"error":"API isolate is still initializing. Try again shortly."}"#,
            ))
            .unwrap();
    }

    // Convert Axum Request → IsolateRequest
    let method = req.method().to_string();
    let url = format!(
        "http://localhost:{}{}",
        state.port,
        req.uri()
            .path_and_query()
            .map(|pq| pq.as_str())
            .unwrap_or(path)
    );
    let headers: Vec<(String, String)> = req
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let body_bytes = match axum::body::to_bytes(req.into_body(), MAX_API_BODY_SIZE).await {
        Ok(b) if !b.is_empty() => Some(b.to_vec()),
        Ok(_) => None,
        Err(_) => {
            return axum::response::Response::builder()
                .status(StatusCode::PAYLOAD_TOO_LARGE)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(Body::from(
                    r#"{"error":"Request body exceeds 10 MB limit."}"#,
                ))
                .unwrap();
        }
    };

    let isolate_req = IsolateRequest {
        method,
        url,
        headers,
        body: body_bytes,
    };

    let start = Instant::now();
    match isolate.handle_request(isolate_req).await {
        Ok(response) => {
            let elapsed = start.elapsed();
            state.console_log.push(
                LogLevel::Info,
                format!(
                    "{} {} → {} ({:.1}ms)",
                    "API",
                    path,
                    response.status,
                    elapsed.as_secs_f64() * 1000.0
                ),
                Some("api"),
            );

            let mut builder = axum::response::Response::builder().status(response.status);
            for (key, value) in &response.headers {
                builder = builder.header(key.as_str(), value.as_str());
            }
            // Ensure CORS headers for dev
            builder = builder.header("access-control-allow-origin", "*");
            builder.body(Body::from(response.body)).unwrap()
        }
        Err(e) => {
            let error_msg = format!("API handler error: {}", e);
            eprintln!("[Server] {}", error_msg);
            state
                .console_log
                .push(LogLevel::Error, error_msg, Some("api"));

            let body = serde_json::json!({ "error": e.to_string() }).to_string();
            axum::response::Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(Body::from(body))
                .unwrap()
        }
    }
}

/// Guess a MIME type from a file path extension.
pub fn mime_type_for_path(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".js") || path.ends_with(".mjs") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "image/jpeg"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else if path.ends_with(".woff") {
        "font/woff"
    } else if path.ends_with(".ttf") {
        "font/ttf"
    } else if path.ends_with(".eot") {
        "application/vnd.ms-fontobject"
    } else if path.ends_with(".gif") {
        "image/gif"
    } else if path.ends_with(".webp") {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

/// Start the HTTP server with the given configuration.
///
/// This function binds to the configured port (with auto-increment on conflict),
/// prints the startup banner, starts the file watcher, and serves until a
/// shutdown signal is received.
/// Optional channels for external lifecycle control (used by desktop mode).
pub struct ServerLifecycle {
    /// Sends the actual bound port when the server is ready to accept connections.
    pub ready_tx: tokio::sync::oneshot::Sender<u16>,
    /// Receives a signal to shut down the server (e.g., when the webview window closes).
    pub shutdown_rx: tokio::sync::oneshot::Receiver<()>,
}

pub async fn start_server(config: ServerConfig) -> io::Result<()> {
    start_server_with_lifecycle(config, None).await
}

pub async fn start_server_with_lifecycle(
    config: ServerConfig,
    lifecycle: Option<ServerLifecycle>,
) -> io::Result<()> {
    let start = Instant::now();

    let bind = try_bind(&config).await?;
    let actual_port = bind.port;

    let mut actual_config = config.clone();
    actual_config.port = actual_port;

    // Split lifecycle channels
    let (ready_tx, shutdown_rx) = match lifecycle {
        Some(lc) => (Some(lc.ready_tx), Some(lc.shutdown_rx)),
        None => (None, None),
    };

    // Notify the caller that the server is ready (desktop mode uses this)
    if let Some(tx) = ready_tx {
        let _ = tx.send(actual_port);
    }

    // Discover upstream deps early so the banner can show them
    let upstream_package_names: Vec<String> = if config.watch_deps {
        let linked = discover_linked_packages(&config.root_dir);
        linked.iter().map(|lp| lp.name.clone()).collect()
    } else {
        vec![]
    };

    // Register with proxy if running
    let proxy_subdomain = crate::proxy::client::register_dev_server(
        &config.root_dir,
        actual_port,
        config.proxy_name.as_deref(),
    );

    print_banner_with_upstream(&actual_config, start.elapsed(), &upstream_package_names);

    if let Some(ref sub) = proxy_subdomain {
        use owo_colors::OwoColorize;
        let proxy_dir = crate::proxy::routes::proxy_dir();
        let scheme = if crate::proxy::tls::has_server_cert(&proxy_dir) {
            "https"
        } else {
            "http"
        };
        let proxy_url = if let Some(port) = crate::proxy::daemon::read_port_file(&proxy_dir) {
            format!("{scheme}://{sub}.localhost:{port}")
        } else {
            format!("{scheme}://{sub}.localhost")
        };
        eprintln!("  {}  {}", "Proxy:".dimmed(), proxy_url.cyan().underline());
        eprintln!();
    }

    // Select plugin based on config (CLI flag > .vertzrc > auto-detect > default)
    let plugin: Arc<dyn crate::plugin::FrameworkPlugin> = match config.plugin {
        crate::config::PluginChoice::React => {
            Arc::new(crate::plugin::react::ReactPlugin::default())
        }
        crate::config::PluginChoice::Vertz => Arc::new(crate::plugin::vertz::VertzPlugin),
    };

    let (router, state) = build_router(&config, plugin);

    // Start type checker (tsc/tsgo) if enabled.
    // Kept alive until server shutdown — Drop kills the child process.
    let _typecheck_handle = if config.enable_typecheck {
        let checker = process::detect_checker(&config.root_dir, config.typecheck_binary.as_deref());

        match checker {
            Some(binary) => {
                match process::start_typecheck(
                    &binary,
                    config.tsconfig_path.as_deref(),
                    state.error_broadcaster.clone(),
                    Some(config.root_dir.clone()),
                )
                .await
                {
                    Ok(handle) => Some(handle),
                    Err(e) => {
                        eprintln!(
                            "[Server] Failed to start type checker ({}): {}",
                            binary.name, e
                        );
                        None
                    }
                }
            }
            None => {
                eprintln!(
                    "[Server] TypeScript checker not found \u{2014} type checking disabled. \
                     Install with: bun add -d typescript"
                );
                None
            }
        }
    } else {
        None
    };

    // Start MCP event relay tasks (error broadcaster → McpEventHub, HMR → McpEventHub)
    mcp_events::start_relay_tasks(
        &state.mcp_event_hub,
        &state.error_broadcaster,
        &state.hmr_hub,
    );

    let restart_triggers = RestartTriggers {
        config_files: state.plugin.restart_triggers(),
    };

    // Start the file watcher if src_dir exists
    if config.src_dir.exists() {
        let watcher_config = FileWatcherConfig::default();
        match FileWatcher::start(&config.src_dir, watcher_config) {
            Ok((_watcher, mut rx)) => {
                let watcher_state = state.clone();
                let entry_file = config.entry_file.clone();
                let root_dir = config.root_dir.clone();

                // Spawn file watcher task with error broadcasting
                tokio::spawn(async move {
                    let mut debouncer = SmartDebouncer::new();

                    loop {
                        tokio::select! {
                            Some(change) = rx.recv() => {
                                debouncer.add(change);
                            }
                            _ = tokio::time::sleep(std::time::Duration::from_millis(6)),
                              if debouncer.has_pending() => {
                                if !debouncer.is_ready() {
                                    continue;
                                }
                                let changes = debouncer.drain();

                                // Clear auto-install failed blacklist on any file change.
                                // Developer may have fixed a typo in an import.
                                watcher_state.auto_install_failed.lock().unwrap().clear();

                                // Restart the persistent isolate once per batch.
                                // Any source file change can affect SSR (app.tsx
                                // imports components transitively) or API routes,
                                // so we restart on every change using the zero-
                                // downtime create-then-swap pattern.
                                {
                                    let opts = {
                                        let guard = watcher_state
                                            .api_isolate
                                            .read()
                                            .unwrap_or_else(|e| e.into_inner());
                                        guard.as_ref().map(|iso| iso.options().clone())
                                    };
                                    if let Some(opts) = opts {
                                        match PersistentIsolate::new(opts) {
                                            Ok(new_isolate) => {
                                                let old = {
                                                    let mut guard = watcher_state
                                                        .api_isolate
                                                        .write()
                                                        .unwrap_or_else(|e| e.into_inner());
                                                    guard.replace(Arc::new(new_isolate))
                                                };
                                                if let Some(old_arc) = old {
                                                    let refs = Arc::strong_count(&old_arc);
                                                    if refs > 1 {
                                                        eprintln!(
                                                            "[Server] Old isolate still draining ({} refs)",
                                                            refs - 1
                                                        );
                                                    }
                                                }
                                                eprintln!("[Server] Isolate restarted (source change)");
                                            }
                                            Err(e) => {
                                                eprintln!(
                                                    "[Server] Failed to restart isolate: {} (old isolate still serving)",
                                                    e
                                                );
                                            }
                                        }
                                    }
                                }

                                for change in &changes {
                                    let change_msg = format!("File changed: {}", change.path.display());
                                    eprintln!("[Server] {}", change_msg);
                                    watcher_state.console_log.push(
                                        crate::server::console_log::LogLevel::Info,
                                        change_msg,
                                        Some("watcher"),
                                    );

                                    // Emit file_change event to MCP LLM clients
                                    // Never leak absolute paths — use file_name() as last resort
                                    let relative_path = change.path
                                        .strip_prefix(&root_dir)
                                        .map(|p| p.to_string_lossy().to_string())
                                        .unwrap_or_else(|_| {
                                            change.path.file_name()
                                                .map(|n| n.to_string_lossy().to_string())
                                                .unwrap_or_else(|| "<unknown>".to_string())
                                        });
                                    let kind_str = match change.kind {
                                        crate::watcher::file_watcher::FileChangeKind::Create => "create",
                                        crate::watcher::file_watcher::FileChangeKind::Modify => "modify",
                                        crate::watcher::file_watcher::FileChangeKind::Remove => "delete",
                                    };
                                    watcher_state.mcp_event_hub.broadcast(
                                        mcp_events::McpEvent::FileChange {
                                            timestamp: mcp_events::iso_timestamp(),
                                            data: mcp_events::FileChangeData {
                                                path: relative_path,
                                                kind: kind_str.to_string(),
                                            },
                                        },
                                    );

                                    // Check for config/dependency changes
                                    if restart_triggers.is_restart_trigger(&change.path) {
                                        eprintln!(
                                            "[Server] Config/dependency change detected: {}",
                                            change.path.display()
                                        );
                                        // Broadcast full reload to clients
                                        watcher_state.hmr_hub.broadcast(
                                            crate::hmr::protocol::HmrMessage::FullReload {
                                                reason: format!(
                                                    "Config file changed: {}",
                                                    change.path.file_name()
                                                        .unwrap_or_default()
                                                        .to_string_lossy()
                                                ),
                                            },
                                        ).await;
                                        // Clear compilation cache for full rebuild
                                        watcher_state.pipeline.cache().clear();
                                        continue;
                                    }

                                    // Clear any previous errors for this file
                                    let file_str = change.path.to_string_lossy().to_string();
                                    watcher_state.error_broadcaster
                                        .clear_file(ErrorCategory::Build, &file_str)
                                        .await;
                                    // Also clear SSR errors — a fixed source file means SSR
                                    // will succeed on next render.
                                    watcher_state.error_broadcaster
                                        .clear_category(ErrorCategory::Ssr)
                                        .await;

                                    // Attempt recompilation for error recovery
                                    let compile_result = watcher_state.pipeline
                                        .compile_for_browser(&change.path);

                                    // Check if compilation produced an error module
                                    if compile_result.code.contains("console.error(`[vertz] Compilation error:") {
                                        // Read the source to provide a snippet
                                        let source = std::fs::read_to_string(&change.path)
                                            .unwrap_or_default();
                                        let snippet = if !source.is_empty() {
                                            Some(extract_snippet(&source, 1, 3))
                                        } else {
                                            None
                                        };

                                        let mut error = DevError::build(
                                            format!("Compilation failed: {}", file_str)
                                        ).with_file(file_str.clone());

                                        if let Some(s) = snippet {
                                            error = error.with_snippet(s);
                                        }

                                        watcher_state.error_broadcaster
                                            .report_error(error)
                                            .await;

                                        continue;
                                    }

                                    // Update module graph with this file's imports
                                    // so transitive dependents are invalidated correctly.
                                    let source = std::fs::read_to_string(&change.path)
                                        .unwrap_or_default();
                                    if !source.is_empty() {
                                        let deps = crate::deps::scanner::scan_local_dependencies(
                                            &source,
                                            &change.path,
                                        );
                                        if let Ok(mut graph) = watcher_state.module_graph.write() {
                                            graph.update_module(&change.path, deps);
                                        }
                                    }

                                    // Compilation succeeded — process the change normally
                                    let result = watcher::process_file_change(
                                        change,
                                        watcher_state.pipeline.cache(),
                                        &watcher_state.module_graph,
                                        &entry_file,
                                    );

                                    // Use plugin's HMR strategy to decide what action to take
                                    let action = watcher_state.plugin.hmr_strategy(&result);
                                    if !matches!(action, crate::plugin::HmrAction::Handled) {
                                        let message = crate::plugin::hmr_action_to_message(
                                            &action,
                                            &root_dir,
                                        );
                                        watcher_state.hmr_hub.broadcast(message).await;
                                    }
                                }
                            }
                        }
                    }
                });

                // Keep the watcher alive by boxing it (it stops on drop)
                // The watcher lives for the duration of the server
                let _watcher_handle = Box::new(_watcher);
                // Move it into a spawned task to keep it alive
                tokio::spawn(async move {
                    // Hold the watcher reference until shutdown
                    let _keep_alive = _watcher_handle;
                    tokio::signal::ctrl_c().await.ok();
                });
            }
            Err(e) => {
                eprintln!("[Server] Warning: File watcher failed to start: {}", e);
            }
        }
    }

    // Start the dep watcher for upstream dependency changes
    if config.watch_deps {
        let linked = discover_linked_packages(&config.root_dir);

        // Build watch targets from auto-discovered + extra paths
        let mut watch_targets: Vec<WatchTarget> = linked
            .iter()
            .map(|lp| WatchTarget {
                watch_dir: lp.target.clone(), // already canonicalized
                output_dir_name: lp.output_dir_name.clone(),
                package_name: Some(lp.name.clone()),
            })
            .collect();

        // Add extraWatchPaths from config (canonicalized)
        for path_str in &config.extra_watch_paths {
            let path = config.root_dir.join(path_str);
            match path.canonicalize() {
                Ok(canonical) => watch_targets.push(WatchTarget {
                    watch_dir: canonical,
                    output_dir_name: None,
                    package_name: None,
                }),
                Err(_) => {
                    eprintln!(
                        "[DepWatcher] Warning: extra watch path does not exist: {}",
                        path_str
                    );
                }
            }
        }

        if !watch_targets.is_empty() {
            let dep_config = DepWatcherConfig::default();
            match DepWatcher::start(&watch_targets, dep_config) {
                Ok((_dep_watcher, mut dep_rx)) => {
                    let dep_state = state.clone();
                    let root_dir = config.root_dir.clone();
                    let deps_dir = config.deps_dir();

                    // Spawn dep watcher event loop
                    tokio::spawn(async move {
                        // Batch-only mode: u64::MAX batch window forces all events
                        // through the batch path. 200ms batch debounce, 500ms max-wait.
                        let mut debouncer =
                            SmartDebouncer::with_timings(u64::MAX, 200).with_max_wait(500);

                        loop {
                            tokio::select! {
                                Some(change) = dep_rx.recv() => {
                                    // Convert DepChange to FileChange for debouncer
                                    debouncer.add(crate::watcher::file_watcher::FileChange {
                                        path: change.path,
                                        kind: crate::watcher::file_watcher::FileChangeKind::Modify,
                                    });
                                }
                                _ = tokio::time::sleep(std::time::Duration::from_millis(50)),
                                  if debouncer.has_pending() => {
                                    if !debouncer.is_ready() {
                                        continue;
                                    }
                                    let changes = debouncer.drain();

                                    // Reconstruct DepChange from FileChange paths
                                    // by mapping back to watch targets
                                    let dep_changes: Vec<crate::watcher::dep_watcher::DepChange> = changes
                                        .iter()
                                        .map(|c| crate::watcher::dep_watcher::DepChange {
                                            package: crate::watcher::dep_watcher::map_path_to_package(
                                                &c.path, &watch_targets,
                                            ),
                                            path: c.path.clone(),
                                        })
                                        .collect();

                                    // Handle re-bundling on a blocking thread (esbuild is sync)
                                    let rd = root_dir.clone();
                                    let dd = deps_dir.clone();
                                    let result = tokio::task::spawn_blocking(move || {
                                        crate::watcher::dep_watcher::handle_dep_changes(
                                            &dep_changes, &rd, &dd,
                                        )
                                    })
                                    .await;

                                    match result {
                                        Ok(dep_result) => {
                                            // Broadcast re-bundle errors to the overlay
                                            for (pkg, err_msg) in &dep_result.failed {
                                                let error = DevError::build(format!(
                                                    "Failed to re-bundle upstream dep {}: {}",
                                                    pkg, err_msg
                                                ));
                                                dep_state
                                                    .error_broadcaster
                                                    .report_error(error)
                                                    .await;
                                            }

                                            if dep_result.should_clear_cache {
                                                // Clear compilation cache
                                                dep_state.pipeline.cache().clear();

                                                // Full reload
                                                dep_state
                                                    .hmr_hub
                                                    .broadcast(
                                                        crate::hmr::protocol::HmrMessage::FullReload {
                                                            reason: dep_result.reload_reason,
                                                        },
                                                    )
                                                    .await;
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!(
                                                "[Server] Dep watcher spawn_blocking failed: {}",
                                                e
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    });

                    // Keep the dep watcher alive
                    let _dep_watcher_handle = Box::new(_dep_watcher);
                    tokio::spawn(async move {
                        let _keep_alive = _dep_watcher_handle;
                        tokio::signal::ctrl_c().await.ok();
                    });
                }
                Err(e) => {
                    eprintln!("[Server] Warning: Failed to start dep watcher: {}", e);
                }
            }
        }
    }

    let shutdown_future = async move {
        if let Some(rx) = shutdown_rx {
            // Desktop mode: wait for either external shutdown or OS signal
            tokio::select! {
                _ = shutdown_signal() => {},
                _ = rx => {},
            }
        } else {
            shutdown_signal().await;
        }
    };

    let result = axum::serve(bind.listener, router)
        .with_graceful_shutdown(shutdown_future)
        .await
        .map_err(io::Error::other);

    // Deregister from proxy on shutdown
    if let Some(sub) = proxy_subdomain {
        crate::proxy::client::deregister_dev_server(&sub);
    }

    result
}

/// Wait for a shutdown signal (SIGINT or SIGTERM).
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install SIGINT handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }

    eprintln!("\nShutting down...");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::categories::DevError;
    use crate::server::console_log::LogLevel;
    use std::path::PathBuf;
    use tower::ServiceExt;

    /// Create a test router with SSR disabled and a temp directory.
    fn make_test_router() -> (Router, Arc<DevServerState>, tempfile::TempDir) {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("src")).unwrap();
        std::fs::create_dir_all(tmp.path().join("public")).unwrap();
        let mut config = ServerConfig::with_root(
            3000,
            "localhost".to_string(),
            PathBuf::from("public"),
            tmp.path().to_path_buf(),
        );
        config.enable_ssr = false;
        let plugin: Arc<dyn crate::plugin::FrameworkPlugin> =
            Arc::new(crate::plugin::vertz::VertzPlugin);
        let (router, state) = build_router(&config, plugin);
        (router, state, tmp)
    }

    /// Read an axum response body into bytes.
    async fn body_bytes(resp: axum::response::Response<Body>) -> Vec<u8> {
        axum::body::to_bytes(resp.into_body(), 1024 * 1024)
            .await
            .unwrap()
            .to_vec()
    }

    /// Read an axum response body as a JSON Value.
    async fn body_json(resp: axum::response::Response<Body>) -> serde_json::Value {
        let bytes = body_bytes(resp).await;
        serde_json::from_slice(&bytes).unwrap()
    }

    // ─── try_bind ────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_try_bind_succeeds_on_free_port() {
        let config = ServerConfig::new(0, "127.0.0.1".to_string(), PathBuf::from("public"));
        let result = try_bind(&config).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_try_bind_auto_increments_on_busy_port() {
        let blocker = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let blocked_port = blocker.local_addr().unwrap().port();

        let config = ServerConfig::new(
            blocked_port,
            "127.0.0.1".to_string(),
            PathBuf::from("public"),
        );
        let result = try_bind(&config).await.unwrap();

        assert!(result.port > blocked_port);
        assert!(result.port <= blocked_port + MAX_PORT_ATTEMPTS);
        drop(blocker);
    }

    #[tokio::test]
    async fn test_try_bind_fails_when_all_ports_exhausted() {
        // Find a free starting port
        let probe = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let start_port = probe.local_addr().unwrap().port();
        drop(probe);

        // Block all MAX_PORT_ATTEMPTS ports
        let mut blockers = Vec::new();
        for offset in 0..MAX_PORT_ATTEMPTS {
            let port = start_port + offset;
            if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", port)).await {
                blockers.push(listener);
            }
        }

        // Only run the test if we managed to block all ports
        if blockers.len() == MAX_PORT_ATTEMPTS as usize {
            let config =
                ServerConfig::new(start_port, "127.0.0.1".to_string(), PathBuf::from("public"));
            let result = try_bind(&config).await;
            assert!(result.is_err());
            let err = result.unwrap_err();
            assert_eq!(err.kind(), io::ErrorKind::AddrInUse);
        }
    }

    // ─── build_router ────────────────────────────────────────────────

    fn test_plugin() -> Arc<dyn crate::plugin::FrameworkPlugin> {
        Arc::new(crate::plugin::vertz::VertzPlugin)
    }

    #[test]
    fn test_build_router_returns_router_and_state() {
        let tmp = tempfile::tempdir().unwrap();
        let config = ServerConfig::with_root(
            3000,
            "localhost".to_string(),
            PathBuf::from("public"),
            tmp.path().to_path_buf(),
        );
        let (_router, state) = build_router(&config, test_plugin());
        assert_eq!(state.root_dir, tmp.path().to_path_buf());
    }

    #[test]
    fn test_build_router_with_ssr_disabled() {
        let tmp = tempfile::tempdir().unwrap();
        let mut config = ServerConfig::with_root(
            3000,
            "localhost".to_string(),
            PathBuf::from("public"),
            tmp.path().to_path_buf(),
        );
        config.enable_ssr = false;
        let (_router, state) = build_router(&config, test_plugin());
        assert!(!state.enable_ssr);
    }

    #[test]
    fn test_build_router_state_fields_populated() {
        let tmp = tempfile::tempdir().unwrap();
        let config = ServerConfig::with_root(
            4000,
            "localhost".to_string(),
            PathBuf::from("public"),
            tmp.path().to_path_buf(),
        );
        let (_router, state) = build_router(&config, test_plugin());
        assert_eq!(state.port, 4000);
        assert_eq!(state.root_dir, tmp.path().to_path_buf());
        assert_eq!(state.src_dir, tmp.path().join("src"));
        assert!(state.console_log.is_empty());
    }

    // ─── mime_type_for_path ──────────────────────────────────────────

    #[test]
    fn test_mime_type_for_path() {
        assert_eq!(
            mime_type_for_path("/index.html"),
            "text/html; charset=utf-8"
        );
        assert_eq!(mime_type_for_path("/style.css"), "text/css; charset=utf-8");
        assert_eq!(
            mime_type_for_path("/app.js"),
            "application/javascript; charset=utf-8"
        );
        assert_eq!(
            mime_type_for_path("/data.json"),
            "application/json; charset=utf-8"
        );
        assert_eq!(mime_type_for_path("/logo.png"), "image/png");
        assert_eq!(mime_type_for_path("/photo.jpg"), "image/jpeg");
        assert_eq!(mime_type_for_path("/icon.svg"), "image/svg+xml");
        assert_eq!(
            mime_type_for_path("/unknown.xyz"),
            "application/octet-stream"
        );
    }

    #[test]
    fn test_mime_type_mjs() {
        assert_eq!(
            mime_type_for_path("/module.mjs"),
            "application/javascript; charset=utf-8"
        );
    }

    #[test]
    fn test_mime_type_jpeg() {
        assert_eq!(mime_type_for_path("/photo.jpeg"), "image/jpeg");
    }

    #[test]
    fn test_mime_type_ico() {
        assert_eq!(mime_type_for_path("/favicon.ico"), "image/x-icon");
    }

    #[test]
    fn test_mime_type_fonts() {
        assert_eq!(mime_type_for_path("/font.woff2"), "font/woff2");
        assert_eq!(mime_type_for_path("/font.woff"), "font/woff");
    }

    // ─── format_ssr_css ──────────────────────────────────────────────

    #[test]
    fn test_format_ssr_css_empty_entries() {
        assert_eq!(format_ssr_css(&[]), "");
    }

    #[test]
    fn test_format_ssr_css_single_entry_no_id() {
        let entries = vec![("body { margin: 0 }".to_string(), None)];
        let result = format_ssr_css(&entries);
        assert!(result.contains("body { margin: 0 }"));
        assert!(result.contains("<style data-vertz-ssr>"));
    }

    #[test]
    fn test_format_ssr_css_dedup_by_id() {
        let entries = vec![
            (".a { color: red }".to_string(), Some("comp-a".to_string())),
            (".a { color: red }".to_string(), Some("comp-a".to_string())),
        ];
        let result = format_ssr_css(&entries);
        // Should only appear once due to dedup
        assert_eq!(result.matches(".a { color: red }").count(), 1);
    }

    #[test]
    fn test_format_ssr_css_skips_empty_css() {
        let entries = vec![
            ("".to_string(), None),
            ("".to_string(), Some("empty".to_string())),
        ];
        let result = format_ssr_css(&entries);
        assert_eq!(result, "");
    }

    #[test]
    fn test_format_ssr_css_mixed_entries() {
        let entries = vec![
            (".a { color: red }".to_string(), Some("comp-a".to_string())),
            ("".to_string(), Some("empty".to_string())),
            (".b { color: blue }".to_string(), Some("comp-b".to_string())),
            (".a { color: red }".to_string(), Some("comp-a".to_string())), // duplicate
            (".c { margin: 0 }".to_string(), None),                        // no id
        ];
        let result = format_ssr_css(&entries);
        assert_eq!(result.matches(".a { color: red }").count(), 1);
        assert!(result.contains(".b { color: blue }"));
        assert!(result.contains(".c { margin: 0 }"));
    }

    // ─── ai_errors_handler ───────────────────────────────────────────

    #[tokio::test]
    async fn test_ai_errors_returns_empty() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/__vertz_ai/errors")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json; charset=utf-8"
        );
        assert_eq!(
            resp.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-cache"
        );

        let json = body_json(resp).await;
        assert_eq!(json["count"], 0);
        assert!(json["errors"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_ai_errors_returns_reported_errors() {
        let (router, state, _tmp) = make_test_router();

        // Report an error before querying
        state
            .error_broadcaster
            .report_error(DevError::build("test compilation error"))
            .await;

        let req = Request::builder()
            .uri("/__vertz_ai/errors")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let json = body_json(resp).await;
        assert_eq!(json["count"], 1);
        let errors = json["errors"].as_array().unwrap();
        assert_eq!(errors.len(), 1);
    }

    // ─── ai_console_handler ──────────────────────────────────────────

    #[tokio::test]
    async fn test_ai_console_returns_empty() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/__vertz_ai/console")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let json = body_json(resp).await;
        assert_eq!(json["count"], 0);
        assert_eq!(json["total"], 0);
        assert!(json["entries"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_ai_console_returns_pushed_entries() {
        let (router, state, _tmp) = make_test_router();

        state
            .console_log
            .push(LogLevel::Info, "hello world", Some("test"));

        let req = Request::builder()
            .uri("/__vertz_ai/console")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        let json = body_json(resp).await;
        assert_eq!(json["count"], 1);
        assert_eq!(json["total"], 1);
        let entries = json["entries"].as_array().unwrap();
        assert_eq!(entries[0]["message"], "hello world");
    }

    #[tokio::test]
    async fn test_ai_console_respects_last_param() {
        let (router, state, _tmp) = make_test_router();

        for i in 0..5 {
            state
                .console_log
                .push(LogLevel::Info, format!("msg-{}", i), None);
        }

        let req = Request::builder()
            .uri("/__vertz_ai/console?last=2")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        let json = body_json(resp).await;
        assert_eq!(json["count"], 2);
        assert_eq!(json["total"], 5);
    }

    // ─── ai_navigate_handler ─────────────────────────────────────────

    #[tokio::test]
    async fn test_ai_navigate_success() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .method("POST")
            .uri("/__vertz_ai/navigate")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"to": "/tasks/123"}"#))
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let json = body_json(resp).await;
        assert_eq!(json["ok"], true);
        assert_eq!(json["navigated_to"], "/tasks/123");
    }

    #[tokio::test]
    async fn test_ai_navigate_invalid_json() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .method("POST")
            .uri("/__vertz_ai/navigate")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from("not json"))
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        let json = body_json(resp).await;
        let error = json["error"].as_str().unwrap();
        assert!(error.contains("Invalid JSON"));
    }

    #[tokio::test]
    async fn test_ai_navigate_logs_to_console() {
        let (router, state, _tmp) = make_test_router();
        let req = Request::builder()
            .method("POST")
            .uri("/__vertz_ai/navigate")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"to": "/settings"}"#))
            .unwrap();
        let _resp = router.oneshot(req).await.unwrap();

        // Navigation should have been logged
        let entries = state.console_log.last_n(10);
        assert!(entries.iter().any(|e| e.message.contains("/settings")));
    }

    // ─── ai_render_handler ───────────────────────────────────────────

    #[tokio::test]
    async fn test_ai_render_ssr_disabled() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/__vertz_ai/render?url=/test")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let json = body_json(resp).await;
        assert_eq!(json["error"], "SSR is not enabled");
        assert!(json["html"].is_null());
    }

    #[tokio::test]
    async fn test_ai_render_ssr_disabled_default_url() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/__vertz_ai/render")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let json = body_json(resp).await;
        assert_eq!(json["error"], "SSR is not enabled");
    }

    // ─── diagnostics_handler ─────────────────────────────────────────

    #[tokio::test]
    async fn test_diagnostics_returns_json() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/__vertz_diagnostics")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json; charset=utf-8"
        );
        let json = body_json(resp).await;
        // Diagnostics should have standard fields
        assert!(json.get("uptime_secs").is_some());
    }

    // ─── dev_server_handler: 404 ─────────────────────────────────────

    #[tokio::test]
    async fn test_unknown_path_returns_404_for_non_html_accept() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/some/random/path.xyz")
            .header(header::ACCEPT, "application/json")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        let text = String::from_utf8(body_bytes(resp).await).unwrap();
        assert_eq!(text, "Not Found");
    }

    // ─── dev_server_handler: static files ────────────────────────────

    #[tokio::test]
    async fn test_static_file_served_from_public_dir() {
        let (router, _state, tmp) = make_test_router();

        // Create a static file in public/
        let public_dir = tmp.path().join("public");
        std::fs::create_dir_all(&public_dir).unwrap();
        std::fs::write(public_dir.join("hello.txt"), "hello world").unwrap();

        let req = Request::builder()
            .uri("/hello.txt")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let text = String::from_utf8(body_bytes(resp).await).unwrap();
        assert_eq!(text, "hello world");
    }

    #[tokio::test]
    async fn test_static_file_correct_mime_type() {
        let (router, _state, tmp) = make_test_router();

        let public_dir = tmp.path().join("public");
        std::fs::write(public_dir.join("style.css"), "body {}").unwrap();

        let req = Request::builder()
            .uri("/style.css")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/css; charset=utf-8"
        );
    }

    // ─── dev_server_handler: SPA fallback ────────────────────────────

    #[tokio::test]
    async fn test_spa_fallback_returns_html_shell() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/tasks/123")
            .header(header::ACCEPT, "text/html")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );
        let text = String::from_utf8(body_bytes(resp).await).unwrap();
        assert!(text.contains("<!DOCTYPE html>") || text.contains("<html"));
    }

    #[tokio::test]
    async fn test_spa_fallback_skipped_for_non_html_accept() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/tasks/123")
            .header(header::ACCEPT, "application/json")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_root_path_returns_html_shell() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/")
            .header(header::ACCEPT, "text/html")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );
    }

    // ─── dev_server_handler: @deps, @css, /src dispatch ──────────────

    #[tokio::test]
    async fn test_deps_request_dispatched() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/@deps/nonexistent.js")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        // Should dispatch to handle_deps_request, which returns 404 for missing deps
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_css_request_dispatched() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/@css/nonexistent.css")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        // CSS handler returns 404 for missing CSS
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_src_request_dispatched() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/src/nonexistent.tsx")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        // Source handler returns 404 for missing source files
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    // ─── handle_api_request ──────────────────────────────────────────

    #[tokio::test]
    async fn test_api_request_no_isolate_returns_404() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/api/users")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        let json = body_json(resp).await;
        let error = json["error"].as_str().unwrap();
        assert!(error.contains("No server entry configured"));
    }

    #[tokio::test]
    async fn test_api_root_no_isolate_returns_404() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder().uri("/api").body(Body::empty()).unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        let json = body_json(resp).await;
        assert!(json["error"].as_str().unwrap().contains("No server entry"));
    }

    #[tokio::test]
    async fn test_api_post_no_isolate_returns_404() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .method("POST")
            .uri("/api/users")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"name": "test"}"#))
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    // ─── WebSocket handlers (non-upgrade rejection) ──────────────────

    #[tokio::test]
    async fn test_hmr_ws_rejects_non_upgrade() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/__vertz_hmr")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        // axum returns non-200 for non-WebSocket requests to WS endpoints
        assert_ne!(resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_error_ws_rejects_non_upgrade() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/__vertz_errors")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_ne!(resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_mcp_events_ws_rejects_non_upgrade() {
        let (router, _state, _tmp) = make_test_router();
        let req = Request::builder()
            .uri("/__vertz_mcp/events")
            .body(Body::empty())
            .unwrap();
        let resp = router.oneshot(req).await.unwrap();

        assert_ne!(resp.status(), StatusCode::OK);
    }

    // ── MIME type tests ──

    #[test]
    fn test_mime_type_for_gif() {
        assert_eq!(mime_type_for_path("/img/anim.gif"), "image/gif");
    }

    #[test]
    fn test_mime_type_for_webp() {
        assert_eq!(mime_type_for_path("/img/photo.webp"), "image/webp");
    }

    #[test]
    fn test_mime_type_for_ttf() {
        assert_eq!(mime_type_for_path("/fonts/inter.ttf"), "font/ttf");
    }

    #[test]
    fn test_mime_type_for_eot() {
        assert_eq!(
            mime_type_for_path("/fonts/legacy.eot"),
            "application/vnd.ms-fontobject"
        );
    }
}
