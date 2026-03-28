use crate::banner::print_banner;
use crate::compiler::pipeline::CompilationPipeline;
use crate::config::ServerConfig;
use crate::errors::broadcaster::ErrorBroadcaster;
use crate::errors::categories::{extract_snippet, DevError, ErrorCategory};
use crate::hmr::recovery::RestartTriggers;
use crate::hmr::websocket::HmrHub;
use crate::server::diagnostics;
use crate::server::html_shell;
use crate::server::logging::RequestLoggingLayer;
use crate::server::module_server::{self, DevServerState};
use crate::server::theme_css;
use crate::watcher;
use crate::watcher::file_watcher::{Debouncer, FileWatcher, FileWatcherConfig};
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
pub fn build_router(config: &ServerConfig) -> (Router, Arc<DevServerState>) {
    let pipeline = CompilationPipeline::new(config.root_dir.clone(), config.src_dir.clone());

    // Load theme CSS from the project (if available)
    let theme_css = theme_css::load_theme_css(&config.root_dir);

    let hmr_hub = HmrHub::new();
    let error_broadcaster = ErrorBroadcaster::new();
    let module_graph = watcher::new_shared_module_graph();

    let state = Arc::new(DevServerState {
        pipeline,
        root_dir: config.root_dir.clone(),
        src_dir: config.src_dir.clone(),
        entry_file: config.entry_file.clone(),
        deps_dir: config.deps_dir(),
        theme_css,
        hmr_hub,
        module_graph,
        error_broadcaster,
        start_time: Instant::now(),
        enable_ssr: config.enable_ssr,
    });

    // Routes: HMR WebSocket, error WebSocket, diagnostics, fallback
    let router = Router::new()
        .route("/__vertz_hmr", get(ws_handler))
        .route("/__vertz_errors", get(ws_error_handler))
        .route("/__vertz_diagnostics", get(diagnostics_handler))
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

    if path.starts_with("/@deps/") {
        return module_server::handle_deps_request(state, req).await;
    }

    if path.starts_with("/@css/") {
        return module_server::handle_css_request(state, req).await;
    }

    if path.starts_with("/src/") {
        return module_server::handle_source_file(state, req).await;
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

            let ssr_options = crate::ssr::render::SsrOptions {
                root_dir: state.root_dir.clone(),
                entry_file: state.entry_file.clone(),
                url: path.clone(),
                title: "Vertz App".to_string(),
                theme_css: state.theme_css.clone(),
                session,
                preload_hints: vec![],
                enable_hmr: true,
            };

            let result = crate::ssr::render::render_to_html(&ssr_options).await;

            if result.render_time_ms > 0.0 {
                eprintln!(
                    "[SSR] {} rendered in {:.1}ms ({})",
                    path,
                    result.render_time_ms,
                    if result.is_ssr { "ssr" } else { "client-only" }
                );
            }

            // Report SSR errors with actionable suggestions
            if let Some(ref error_msg) = result.error {
                let suggestion = crate::errors::suggestions::suggest_ssr_fix(error_msg);
                let mut error = DevError::ssr(error_msg).with_file(
                    state.entry_file.to_string_lossy().to_string(),
                );
                if let Some(s) = suggestion {
                    error = error.with_suggestion(s);
                }
                let broadcaster = state.error_broadcaster.clone();
                tokio::spawn(async move {
                    broadcaster.report_error(error).await;
                });
            }

            return axum::response::Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                .header(header::CACHE_CONTROL, "no-cache")
                .body(Body::from(result.html))
                .unwrap();
        }

        // Fallback: client-only HTML shell (when SSR is disabled)
        let html = html_shell::generate_html_shell(
            &state.entry_file,
            &state.root_dir,
            &[],
            state.theme_css.as_deref(),
            "Vertz App",
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

/// Guess a MIME type from a file path extension.
fn mime_type_for_path(path: &str) -> &'static str {
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
    } else {
        "application/octet-stream"
    }
}

/// Start the HTTP server with the given configuration.
///
/// This function binds to the configured port (with auto-increment on conflict),
/// prints the startup banner, starts the file watcher, and serves until a
/// shutdown signal is received.
pub async fn start_server(config: ServerConfig) -> io::Result<()> {
    let start = Instant::now();

    let bind = try_bind(&config).await?;
    let actual_port = bind.port;

    let mut actual_config = config.clone();
    actual_config.port = actual_port;

    print_banner(&actual_config, start.elapsed());

    let (router, state) = build_router(&config);

    let restart_triggers = RestartTriggers::default();

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
                    let mut debouncer = Debouncer::new(50);

                    loop {
                        tokio::select! {
                            Some(change) = rx.recv() => {
                                debouncer.add(change);
                            }
                            _ = tokio::time::sleep(std::time::Duration::from_millis(60)),
                              if debouncer.has_pending() => {
                                if !debouncer.is_ready() {
                                    continue;
                                }
                                let changes = debouncer.drain();
                                for change in &changes {
                                    eprintln!(
                                        "[Server] File changed: {}",
                                        change.path.display()
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

                                    // Compilation succeeded — process the change normally
                                    let result = watcher::process_file_change(
                                        change,
                                        watcher_state.pipeline.cache(),
                                        &watcher_state.module_graph,
                                        &entry_file,
                                    );

                                    crate::hmr::broadcast_update(
                                        &watcher_state.hmr_hub,
                                        &result,
                                        &root_dir,
                                    )
                                    .await;
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

    axum::serve(bind.listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(io::Error::other)
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
    use std::path::PathBuf;

    #[tokio::test]
    async fn test_try_bind_succeeds_on_free_port() {
        let config = ServerConfig::new(0, "127.0.0.1".to_string(), PathBuf::from("public"));
        let result = try_bind(&config).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_try_bind_auto_increments_on_busy_port() {
        // Bind a port to make it busy
        let blocker = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let blocked_port = blocker.local_addr().unwrap().port();

        let config = ServerConfig::new(
            blocked_port,
            "127.0.0.1".to_string(),
            PathBuf::from("public"),
        );
        let result = try_bind(&config).await.unwrap();

        // Should have incremented to the next port
        assert!(result.port > blocked_port);
        assert!(result.port <= blocked_port + MAX_PORT_ATTEMPTS);

        // Clean up
        drop(blocker);
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
        let (_router, state) = build_router(&config);
        // If this compiles and runs, the router was created successfully
        assert_eq!(state.root_dir, tmp.path().to_path_buf());
    }

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
}
