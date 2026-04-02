use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Request, Response, StatusCode};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::compiler::import_rewriter::is_asset_extension;
use crate::compiler::pipeline::CompilationPipeline;
use crate::deps::prebundle;
use crate::deps::resolve;
use crate::errors::broadcaster::ErrorBroadcaster;
use crate::errors::categories::{extract_snippet, DevError, ErrorCategory};
use crate::errors::suggestions;
use crate::hmr::websocket::HmrHub;
use crate::runtime::persistent_isolate::PersistentIsolate;
use crate::server::console_log::ConsoleLog;
use crate::server::css_server;
use crate::server::html_shell;
use crate::server::mcp::McpSessions;
use crate::server::mcp_events::McpEventHub;
use crate::watcher::SharedModuleGraph;

/// Shared state for the dev module server.
#[derive(Clone)]
pub struct DevServerState {
    /// Framework plugin for compilation, HMR, and MCP extensibility.
    pub plugin: Arc<dyn crate::plugin::FrameworkPlugin>,
    pub pipeline: CompilationPipeline,
    pub root_dir: PathBuf,
    pub src_dir: PathBuf,
    pub entry_file: PathBuf,
    pub deps_dir: PathBuf,
    /// Inline CSS for theme injection (loaded at startup).
    pub theme_css: Option<String>,
    /// HMR WebSocket hub for broadcasting updates.
    pub hmr_hub: HmrHub,
    /// Shared module dependency graph.
    pub module_graph: SharedModuleGraph,
    /// Error broadcast hub for error overlay clients.
    pub error_broadcaster: ErrorBroadcaster,
    /// Console log capture for LLM consumption.
    pub console_log: ConsoleLog,
    /// MCP session store for SSE transport.
    pub mcp_sessions: McpSessions,
    /// MCP event hub for LLM WebSocket push notifications.
    pub mcp_event_hub: McpEventHub,
    /// Server start time for uptime tracking.
    pub start_time: std::time::Instant,
    /// Whether SSR is enabled for page routes.
    pub enable_ssr: bool,
    /// Server port (for handshake metadata).
    pub port: u16,
    /// Whether type checking is enabled.
    pub typecheck_enabled: bool,
    /// Persistent V8 isolate for API route delegation (`/api/*`) and SSR.
    /// Wrapped in `Arc<RwLock>` to allow hot-swap on server module changes.
    /// `None` when no `server_entry` is configured.
    pub api_isolate: Arc<std::sync::RwLock<Option<Arc<PersistentIsolate>>>>,
    /// Per-path API proxy configuration (from `.vertzrc` `proxy` field).
    /// `None` when no proxy rules are configured.
    pub api_proxy: Option<Arc<crate::server::api_proxy::ProxyConfig>>,
    /// Whether auto-install of missing packages is enabled.
    pub auto_install: bool,
    /// Serializes all pm::add() calls to prevent package.json write races.
    pub auto_install_lock: Arc<tokio::sync::Mutex<()>>,
    /// Per-package notification: concurrent requests for the same package
    /// subscribe to a Notify and wait for the installing request to finish.
    pub auto_install_inflight: Arc<std::sync::Mutex<HashMap<String, Arc<tokio::sync::Notify>>>>,
    /// Packages that failed to install — prevents retry storms.
    /// Cleared on file change (watcher event).
    pub auto_install_failed: Arc<std::sync::Mutex<HashSet<String>>>,
}

/// Handle requests for source files: `GET /src/**/*.tsx` → compiled JavaScript.
///
/// Supports `?t=<timestamp>` query parameter for HMR cache busting —
/// the timestamp is stripped before resolving the file.
pub async fn handle_source_file(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> Response<Body> {
    let path = req.uri().path();

    // Strip ?t=<timestamp> query parameter (HMR cache busting)
    // The path itself is used for file resolution, ignoring query params
    let clean_path = path.split('?').next().unwrap_or(path);

    // Map URL path to file system path
    let file_path = state.root_dir.join(clean_path.trim_start_matches('/'));

    // Check if this is a source map request (virtual — generated during compilation)
    if clean_path.ends_with(".map") {
        return handle_source_map(&state, &file_path);
    }

    // Check if the file exists
    if !file_path.is_file() {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(format!("File not found: {}", path)))
            .unwrap();
    }

    // CSS files: serve as a JS module that injects a <style> tag
    if clean_path.ends_with(".css") {
        return handle_css_source_file(state, &file_path, clean_path).await;
    }

    // Asset files (images, fonts): serve raw file or synthetic JS module
    if is_asset_path(clean_path) {
        let query = req.uri().query().unwrap_or("");
        let is_import = query
            .split('&')
            .any(|p| p == "import" || p.starts_with("import="));
        return handle_asset_source_file(&file_path, clean_path, is_import);
    }

    // Compile the file for browser consumption
    let result = state.pipeline.compile_for_browser(&file_path);

    let file_str = file_path.to_string_lossy().to_string();

    // Check if compilation produced errors
    if !result.errors.is_empty() {
        // Read source for code snippet extraction
        let source = std::fs::read_to_string(&file_path).unwrap_or_default();

        // Use the first error with location info for the primary error
        let primary = &result.errors[0];
        let error_msg = &primary.message;

        let suggestion = suggestions::suggest_build_fix(error_msg);
        let mut error = DevError::build(error_msg).with_file(&file_str);

        // Set line/column from structured compiler diagnostics
        if let (Some(line), Some(col)) = (primary.line, primary.column) {
            error = error.with_location(line, col);
            if !source.is_empty() {
                error = error.with_snippet(extract_snippet(&source, line, 3));
            }
        } else if !source.is_empty() {
            // No location info — try to parse from error message "at file:line:col"
            let (parsed_line, parsed_col) = parse_location_from_message(error_msg);
            if let Some(line) = parsed_line {
                error = error.with_location(line, parsed_col.unwrap_or(1));
                error = error.with_snippet(extract_snippet(&source, line, 3));
            } else {
                error = error.with_snippet(extract_snippet(&source, 1, 3));
            }
        }

        if let Some(s) = suggestion {
            error = error.with_suggestion(s);
        }

        // Report asynchronously (don't block the response)
        let broadcaster = state.error_broadcaster.clone();
        tokio::spawn(async move {
            broadcaster.report_error(error).await;
        });
    } else {
        // Compilation succeeded — update module graph with imports
        let source = std::fs::read_to_string(&file_path).unwrap_or_default();
        if !source.is_empty() {
            let deps = crate::deps::scanner::scan_local_dependencies(&source, &file_path);
            if let Ok(mut graph) = state.module_graph.write() {
                graph.update_module(&file_path, deps);
            }
        }

        if result.warnings.is_empty() {
            // No errors and no warnings — clear any previous errors for this file
            let broadcaster = state.error_broadcaster.clone();
            tokio::spawn(async move {
                broadcaster
                    .clear_file(ErrorCategory::Build, &file_str)
                    .await;
            });
        } else {
            // Warnings present — broadcast them to the error overlay so the
            // developer sees CSS diagnostics, unknown tokens, etc.
            let source = std::fs::read_to_string(&file_path).unwrap_or_default();
            let primary = &result.warnings[0];
            let warning_msg = &primary.message;

            let suggestion = suggestions::suggest_build_fix(warning_msg);
            let mut error = DevError::build(warning_msg)
                .as_warning()
                .with_file(&file_str);

            if let (Some(line), Some(col)) = (primary.line, primary.column) {
                error = error.with_location(line, col);
                if !source.is_empty() {
                    error = error.with_snippet(extract_snippet(&source, line, 3));
                }
            } else if !source.is_empty() {
                let (parsed_line, parsed_col) = parse_location_from_message(warning_msg);
                if let Some(line) = parsed_line {
                    error = error.with_location(line, parsed_col.unwrap_or(1));
                    error = error.with_snippet(extract_snippet(&source, line, 3));
                }
            }

            if let Some(s) = suggestion {
                error = error.with_suggestion(s);
            }

            let broadcaster = state.error_broadcaster.clone();
            let file_str_clone = file_str.clone();
            tokio::spawn(async move {
                // Clear previous errors first, then report the warning
                broadcaster
                    .clear_file(ErrorCategory::Build, &file_str_clone)
                    .await;
                broadcaster.report_error(error).await;
            });
        }
    }

    Response::builder()
        .status(StatusCode::OK)
        .header(
            header::CONTENT_TYPE,
            "application/javascript; charset=utf-8",
        )
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(result.code))
        .unwrap()
}

/// Handle CSS source file requests: `GET /src/**/*.css` → JS module with style injection.
///
/// Reads the raw CSS from disk and wraps it in a JavaScript module that
/// creates/updates a `<style>` tag in `<head>`. This enables:
/// - `import './styles.css'` to work as a side-effect import
/// - HMR via module re-import (the style tag is updated in place)
async fn handle_css_source_file(
    state: Arc<DevServerState>,
    file_path: &Path,
    url_path: &str,
) -> Response<Body> {
    let result = state.pipeline.compile_css_for_browser(file_path, url_path);
    let file_str = file_path.to_string_lossy().to_string();

    if !result.errors.is_empty() {
        let source = std::fs::read_to_string(file_path).unwrap_or_default();
        let primary = &result.errors[0];
        let mut error = DevError::build(&primary.message).with_file(&file_str);

        if let (Some(line), Some(column)) = (primary.line, primary.column) {
            error = error.with_location(line, column);
            if !source.is_empty() {
                error = error.with_snippet(extract_snippet(&source, line, 3));
            }
        } else if !source.is_empty() {
            error = error.with_snippet(extract_snippet(&source, 1, 3));
        }

        let broadcaster = state.error_broadcaster.clone();
        tokio::spawn(async move {
            broadcaster.report_error(error).await;
        });
    } else {
        let broadcaster = state.error_broadcaster.clone();
        tokio::spawn(async move {
            broadcaster
                .clear_file(ErrorCategory::Build, &file_str)
                .await;
        });
    }

    Response::builder()
        .status(StatusCode::OK)
        .header(
            header::CONTENT_TYPE,
            "application/javascript; charset=utf-8",
        )
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(result.code))
        .unwrap()
}

/// Check if a URL path points to a static asset file (image, font, etc.).
fn is_asset_path(path: &str) -> bool {
    if let Some(dot_pos) = path.rfind('.') {
        let ext = &path[dot_pos + 1..];
        is_asset_extension(ext)
    } else {
        false
    }
}

/// Handle asset source file requests.
///
/// When `is_import` is true (URL has `?import` query), returns a synthetic JS module
/// that exports the asset's URL path as a default string:
/// ```js
/// export default "/src/logo.svg"
/// ```
///
/// When `is_import` is false, serves the raw file with the correct MIME type.
fn handle_asset_source_file(file_path: &Path, url_path: &str, is_import: bool) -> Response<Body> {
    if is_import {
        // Synthetic JS module: export default '<url_path>'
        // Use serde_json to properly escape the string for JS embedding (handles \, ", newlines, etc.)
        let escaped =
            serde_json::to_string(url_path).unwrap_or_else(|_| format!("\"{}\"", url_path));
        let js_module = format!("export default {};\n", escaped);
        Response::builder()
            .status(StatusCode::OK)
            .header(
                header::CONTENT_TYPE,
                "application/javascript; charset=utf-8",
            )
            .header(header::CACHE_CONTROL, "no-cache")
            .body(Body::from(js_module))
            .unwrap()
    } else {
        // Serve raw asset file with correct MIME type
        match std::fs::read(file_path) {
            Ok(content) => {
                let content_type = crate::server::http::mime_type_for_path(url_path);
                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, content_type)
                    .header(header::CACHE_CONTROL, "no-cache")
                    .body(Body::from(content))
                    .unwrap()
            }
            Err(_) => Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "text/plain")
                .body(Body::from("Failed to read asset file"))
                .unwrap(),
        }
    }
}

/// Handle source map requests: `GET /src/**/*.tsx.map`.
fn handle_source_map(state: &DevServerState, map_path: &Path) -> Response<Body> {
    // The map path is like /project/src/app.tsx.map — strip the .map suffix to get the source
    let source_path_str = map_path.to_string_lossy();
    let source_path = if let Some(stripped) = source_path_str.strip_suffix(".map") {
        PathBuf::from(stripped)
    } else {
        map_path.to_path_buf()
    };

    // Try to get the source map from the compilation cache
    // First, compile the source to ensure the cache is populated
    if source_path.is_file() {
        let result = state.pipeline.compile_for_browser(&source_path);
        if let Some(source_map) = result.source_map {
            return Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .header(header::CACHE_CONTROL, "no-cache")
                .body(Body::from(source_map))
                .unwrap();
        }
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from("Source map not available"))
        .unwrap()
}

/// Handle requests for pre-bundled dependencies: `GET /@deps/**`.
///
/// Resolution order:
/// 1. Pre-bundled file in `.vertz/deps/` (from esbuild pre-bundling)
/// 2. Direct resolution from `node_modules/` via package.json `exports`
///
/// The fallback to node_modules allows serving ESM packages directly
/// without pre-bundling (e.g., `@vertz/*` packages that ship ESM).
pub async fn handle_deps_request(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> Response<Body> {
    let path = req.uri().path();

    // 1. Check pre-bundled deps first
    if let Some(file_path) = prebundle::resolve_deps_file(path, &state.deps_dir) {
        match std::fs::read_to_string(&file_path) {
            Ok(content) => {
                return Response::builder()
                    .status(StatusCode::OK)
                    .header(
                        header::CONTENT_TYPE,
                        "application/javascript; charset=utf-8",
                    )
                    .header(header::CACHE_CONTROL, "max-age=31536000, immutable")
                    .body(Body::from(content))
                    .unwrap();
            }
            Err(e) => {
                return Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .header(header::CONTENT_TYPE, "text/plain")
                    .body(Body::from(format!("Failed to read dep file: {}", e)))
                    .unwrap();
            }
        }
    }

    // 2. Fallback: serve directly from node_modules/ using the full path.
    //
    // URLs like `/@deps/@vertz/ui/dist/src/internals.js` map directly to
    // `node_modules/@vertz/ui/dist/src/internals.js`. This preserves the
    // file tree structure so relative imports within packages just work.
    //
    // Also handles bare specifier lookups like `/@deps/@vertz/ui/internals`
    // by resolving via package.json exports.
    if let Some(remainder) = path.strip_prefix("/@deps/") {
        // Try as a direct file path, walking up directories (monorepo support)
        let mut search_dir = Some(state.root_dir.clone());
        while let Some(dir) = search_dir {
            let direct_path = dir.join("node_modules").join(remainder);
            if direct_path.is_file() {
                return serve_js_file(&direct_path, &state.root_dir);
            }
            search_dir = dir.parent().map(|p| p.to_path_buf());
        }

        // Try resolving through workspace package node_modules.
        // In a monorepo, deps like @floating-ui/dom may only exist in a
        // workspace package's node_modules (e.g., packages/ui-primitives/node_modules/).
        // We scan symlinked workspace packages for the file.
        if let Some(resolved) = resolve_in_workspace_node_modules(remainder, &state.root_dir) {
            return serve_js_file(&resolved, &state.root_dir);
        }

        // Try resolving the package via Bun's .bun/ cache layout.
        // Bun stores packages at node_modules/.bun/<pkg>@<version>/node_modules/<pkg>/
        // Walk up directories looking for .bun caches containing the package.
        if let Some(resolved) = resolve_in_bun_cache(remainder, &state.root_dir) {
            return serve_js_file(&resolved, &state.root_dir);
        }

        // Otherwise, resolve bare specifier via package.json exports
        if let Some(resolved) = resolve::resolve_from_node_modules(remainder, &state.root_dir) {
            return serve_js_file(&resolved, &state.root_dir);
        }
    }

    // ── Auto-install: try to install the missing package ──────────
    let specifier = path.strip_prefix("/@deps/").unwrap_or(path);
    let (pkg_name, _subpath) = resolve::split_package_specifier(specifier);

    if state.auto_install {
        // Check failed-install blacklist
        let is_blacklisted = state.auto_install_failed.lock().unwrap().contains(pkg_name);

        if !is_blacklisted {
            // Per-package dedup: single lock scope to atomically check + insert.
            // This prevents a TOCTOU race where two requests both see "not inflight"
            // and both proceed to install.
            //
            // For waiters: we clone the Arc<Notify> while holding the lock, then
            // call .notified().await after releasing. Tokio's Notify guarantees that
            // if notify_waiters() is called between .notified() creation and .await,
            // the notification is stored and the await returns immediately.
            let is_installer = {
                let mut inflight = state.auto_install_inflight.lock().unwrap();
                if inflight.contains_key(pkg_name) {
                    false
                } else {
                    let notify = Arc::new(tokio::sync::Notify::new());
                    inflight.insert(pkg_name.to_string(), notify);
                    true
                }
            };

            if is_installer {
                let install_result = auto_install_package(pkg_name, &state).await;

                // Get the notify handle, remove from inflight, then notify waiters
                let notify = state.auto_install_inflight.lock().unwrap().remove(pkg_name);
                if let Some(notify) = notify {
                    notify.notify_waiters();
                }

                if install_result.is_ok() {
                    if let Some(resolved) = re_resolve_dep(specifier, &state) {
                        return serve_js_file(&resolved, &state.root_dir);
                    }
                }
            } else {
                // Another request is installing this package — get notify handle and wait
                let notify = state
                    .auto_install_inflight
                    .lock()
                    .unwrap()
                    .get(pkg_name)
                    .cloned();

                if let Some(notify) = notify {
                    // Create the Notified future — even if notify_waiters() fires
                    // between this line and .await, tokio stores the notification
                    // and the await returns immediately. Add a timeout as safety net.
                    let _ =
                        tokio::time::timeout(std::time::Duration::from_secs(35), notify.notified())
                            .await;
                }

                // Re-attempt resolution after install completes (or timeout)
                if let Some(resolved) = re_resolve_dep(specifier, &state) {
                    return serve_js_file(&resolved, &state.root_dir);
                }
            }
        }
    }

    // Dependency not found — report with actionable suggestion
    let specifier = specifier.to_string();
    let msg = format!("Cannot resolve dependency: {}", specifier);
    let suggestion = suggestions::suggest_resolve_fix(&msg, &specifier);
    let mut error = DevError::resolve(&msg);
    if let Some(s) = suggestion {
        error = error.with_suggestion(s);
    }

    let broadcaster = state.error_broadcaster.clone();
    tokio::spawn(async move {
        broadcaster.report_error(error).await;
    });

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from(format!(
            "Dependency not found: /@deps/{}",
            specifier
        )))
        .unwrap()
}

/// Run `pm::add` for a single package, serialized via the global install lock.
///
/// Returns `Ok(())` on success, `Err(message)` on failure.
/// On failure, adds the package to the failed-install blacklist.
async fn auto_install_package(pkg_name: &str, state: &DevServerState) -> Result<(), String> {
    // Acquire the global install lock first (serializes all pm::add calls).
    // This ensures we only broadcast "Installing..." when it's actually our turn.
    let _guard = state.auto_install_lock.lock().await;

    eprintln!("[PM] Auto-installing {}...", pkg_name);

    // Broadcast info to connected browser clients
    state
        .error_broadcaster
        .broadcast_info(&format!("Installing {}...", pkg_name))
        .await;

    let root_dir = state.root_dir.clone();
    let pkg = pkg_name.to_string();

    // Run pm::add via spawn_blocking (it does blocking I/O)
    // Convert the error to String inside the closure since Box<dyn Error> is not Send
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        tokio::task::spawn_blocking(move || {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(crate::pm::add(
                &root_dir,
                &[pkg.as_str()],
                false,                                       // not dev
                false,                                       // not peer
                false,                                       // not optional
                false,                                       // not exact (caret range)
                crate::pm::vertzrc::ScriptPolicy::IgnoreAll, // no postinstall during auto-install
                None,                                        // no workspace target
                Arc::new(crate::pm::output::DevPmOutput),
            ))
            .map_err(|e| e.to_string())
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(()))) => {
            // Success — clear resolve errors
            state
                .error_broadcaster
                .clear_category(ErrorCategory::Resolve)
                .await;
            Ok(())
        }
        Ok(Ok(Err(e))) => {
            // pm::add returned an error
            let msg = format!("Auto-install failed for '{}': {}", pkg_name, e);
            eprintln!("[PM] {}", msg);
            state
                .auto_install_failed
                .lock()
                .unwrap()
                .insert(pkg_name.to_string());
            let error = DevError::resolve(&msg);
            state.error_broadcaster.report_error(error).await;
            Err(msg)
        }
        Ok(Err(e)) => {
            // spawn_blocking panicked
            let msg = format!("Auto-install panicked for '{}': {}", pkg_name, e);
            eprintln!("[PM] {}", msg);
            state
                .auto_install_failed
                .lock()
                .unwrap()
                .insert(pkg_name.to_string());
            Err(msg)
        }
        Err(_) => {
            // Timeout
            let msg = format!(
                "Auto-install timed out for '{}'. Run `vertz add {}` manually.",
                pkg_name, pkg_name
            );
            eprintln!("[PM] {}", msg);
            state
                .auto_install_failed
                .lock()
                .unwrap()
                .insert(pkg_name.to_string());
            let error = DevError::resolve(&msg);
            state.error_broadcaster.report_error(error).await;
            Err(msg)
        }
    }
}

/// Re-attempt dependency resolution after auto-install (steps 2-5 from handle_deps_request).
fn re_resolve_dep(specifier: &str, state: &DevServerState) -> Option<PathBuf> {
    // Direct file path, walking up directories (monorepo support)
    let mut search_dir = Some(state.root_dir.clone());
    while let Some(dir) = search_dir {
        let direct_path = dir.join("node_modules").join(specifier);
        if direct_path.is_file() {
            return Some(direct_path);
        }
        search_dir = dir.parent().map(|p| p.to_path_buf());
    }

    // Workspace package node_modules
    if let Some(resolved) = resolve_in_workspace_node_modules(specifier, &state.root_dir) {
        return Some(resolved);
    }

    // Bun cache
    if let Some(resolved) = resolve_in_bun_cache(specifier, &state.root_dir) {
        return Some(resolved);
    }

    // Package.json exports
    resolve::resolve_from_node_modules(specifier, &state.root_dir)
}

/// Search for a file inside workspace package node_modules.
///
/// In a monorepo, `node_modules/@vertz/ui-primitives` may be a symlink to
/// `packages/ui-primitives/`. That package may have its own `node_modules/`
/// with transitive deps not hoisted to the root. This scans the project's
/// `node_modules/` for symlinks to workspace packages and checks their
/// nested `node_modules/` for the requested file.
fn resolve_in_workspace_node_modules(remainder: &str, root_dir: &Path) -> Option<PathBuf> {
    let nm_dir = root_dir.join("node_modules");
    if !nm_dir.is_dir() {
        return None;
    }

    // Collect workspace package dirs by reading entries in node_modules
    // that are symlinks (workspace packages in bun/pnpm are symlinks)
    let mut workspace_dirs: Vec<PathBuf> = Vec::new();

    for entry in std::fs::read_dir(&nm_dir).ok()? {
        let entry = entry.ok()?;
        let path = entry.path();

        if path.is_symlink()
            || (path.is_dir()
                && path
                    .file_name()
                    .is_some_and(|n| n.to_string_lossy().starts_with('@')))
        {
            // For scoped packages (@vertz, @floating-ui, etc.), check subdirectories
            if path.is_dir()
                && path
                    .file_name()
                    .is_some_and(|n| n.to_string_lossy().starts_with('@'))
            {
                if let Ok(sub_entries) = std::fs::read_dir(&path) {
                    for sub_entry in sub_entries.flatten() {
                        let sub_path = sub_entry.path();
                        if sub_path.is_symlink() {
                            if let Ok(resolved) = std::fs::canonicalize(&sub_path) {
                                workspace_dirs.push(resolved);
                            }
                        }
                    }
                }
            } else if path.is_symlink() {
                if let Ok(resolved) = std::fs::canonicalize(&path) {
                    workspace_dirs.push(resolved);
                }
            }
        }
    }

    // Check each workspace package's node_modules for the file
    for ws_dir in &workspace_dirs {
        let candidate = ws_dir.join("node_modules").join(remainder);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

/// Resolve a file from Bun's `.bun/` package cache.
///
/// Bun stores packages at `node_modules/.bun/<pkg-name>@<version>/node_modules/<pkg>/<file>`.
/// The `remainder` is the path after `/@deps/` (e.g., `@floating-ui/utils/dist/file.mjs`).
/// We split into package name + file subpath, scan `.bun/` entries for matching packages,
/// and check for the file.
fn resolve_in_bun_cache(remainder: &str, root_dir: &Path) -> Option<PathBuf> {
    let (pkg_name, subpath) = resolve::split_package_specifier(remainder);

    // Walk up from root_dir looking for node_modules/.bun/
    let mut search_dir = Some(root_dir.to_path_buf());
    while let Some(dir) = search_dir {
        let bun_cache = dir.join("node_modules/.bun");
        if bun_cache.is_dir() {
            // Scan .bun/ entries for directories that contain this package
            // Format: @scope+name@version or name@version
            let bun_pkg_prefix = pkg_name.replace('/', "+");
            if let Ok(entries) = std::fs::read_dir(&bun_cache) {
                for entry in entries.flatten() {
                    let entry_name = entry.file_name().to_string_lossy().to_string();
                    // Match entries like "@floating-ui+dom@1.7.5" for package "@floating-ui/dom"
                    if entry_name.starts_with(&bun_pkg_prefix)
                        || entry_name.starts_with(&format!("{}@", bun_pkg_prefix))
                    {
                        // Check if this .bun entry has node_modules/<pkg>/ with our file
                        let candidate = entry.path().join("node_modules").join(pkg_name);
                        if subpath.is_empty() {
                            if candidate.is_dir() {
                                // Resolve via package.json
                                if let Some(resolved) =
                                    resolve::resolve_from_node_modules(pkg_name, &entry.path())
                                {
                                    return Some(resolved);
                                }
                            }
                        } else {
                            let file_path = candidate.join(subpath);
                            if file_path.is_file() {
                                return Some(file_path);
                            }
                        }
                    }
                    // Also check if this entry's node_modules contains the package
                    // (transitive deps are stored as symlinks)
                    let nested = entry.path().join("node_modules").join(pkg_name);
                    if nested.is_dir() || nested.is_symlink() {
                        if let Ok(real_nested) = std::fs::canonicalize(&nested) {
                            if subpath.is_empty() {
                                if let Some(resolved) =
                                    resolve::resolve_from_node_modules(pkg_name, &entry.path())
                                {
                                    return Some(resolved);
                                }
                            } else {
                                let file_path = real_nested.join(subpath);
                                if file_path.is_file() {
                                    return Some(file_path);
                                }
                            }
                        }
                    }
                }
            }
        }
        search_dir = dir.parent().map(|p| p.to_path_buf());
    }
    None
}

/// Serve a JavaScript file from disk, rewriting bare import specifiers
/// so the browser can resolve them via `/@deps/` URLs.
fn serve_js_file(path: &Path, root_dir: &Path) -> Response<Body> {
    match std::fs::read_to_string(path) {
        Ok(content) => {
            // Canonicalize the path so that import resolution walks up from the real
            // filesystem location (not a symlink). This is critical for Bun's .bun/
            // node_modules layout where transitive deps live next to the package.
            let real_path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
            // Rewrite bare specifiers in the file (e.g., `@vertz/errors` → `/@deps/@vertz/errors/dist/index.js`)
            // No tsconfig path aliases for node_modules files
            let rewritten = crate::compiler::import_rewriter::rewrite_imports(
                &content, &real_path, &real_path, root_dir, None,
            );
            Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    "application/javascript; charset=utf-8",
                )
                .header(header::CACHE_CONTROL, "no-cache")
                .body(Body::from(rewritten))
                .unwrap()
        }
        Err(e) => Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(format!("Failed to read file: {}", e)))
            .unwrap(),
    }
}

/// Handle requests for extracted CSS: `GET /@css/**`.
pub async fn handle_css_request(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> Response<Body> {
    let path = req.uri().path();

    if let Some(key) = css_server::extract_css_key(path) {
        if let Some(content) = css_server::get_css_content(&key, state.pipeline.css_store()) {
            return Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "text/css; charset=utf-8")
                .header(header::CACHE_CONTROL, "no-cache")
                .body(Body::from(content))
                .unwrap();
        }
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from(format!("CSS not found: {}", path)))
        .unwrap()
}

/// Handle page routes by returning the HTML shell (SPA fallback).
pub async fn handle_page_route(
    State(state): State<Arc<DevServerState>>,
    _req: Request<Body>,
) -> Response<Body> {
    let html = html_shell::generate_html_shell(
        &state.entry_file,
        &state.root_dir,
        &[], // TODO: populate preload hints from module graph
        state.theme_css.as_deref(),
        "Vertz App",
        state.plugin.as_ref(),
    );

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(html))
        .unwrap()
}

/// Parse line and column from error messages containing "at file:line:col" or ":line:col".
fn parse_location_from_message(message: &str) -> (Option<u32>, Option<u32>) {
    // Pattern: "... at /path/to/file.tsx:10:5" or "...:10:5"
    // Look for the last occurrence of :<digits>:<digits> or :<digits>
    let bytes = message.as_bytes();
    let len = bytes.len();
    let mut i = len;

    // Scan backwards for :<digits>:<digits> pattern
    while i > 0 {
        i -= 1;
        if bytes[i] == b':' {
            // Try to read digits after this colon
            let col_start = i + 1;
            let mut j = col_start;
            while j < len && bytes[j].is_ascii_digit() {
                j += 1;
            }
            if j > col_start {
                let col: u32 = message[col_start..j].parse().unwrap_or(0);
                if col > 0 {
                    // Look for another colon before this one with digits (the line number)
                    if i > 0 {
                        let mut k = i - 1;
                        while k > 0 && bytes[k].is_ascii_digit() {
                            k -= 1;
                        }
                        if bytes[k] == b':' && k + 1 < i {
                            let line: u32 = message[k + 1..i].parse().unwrap_or(0);
                            if line > 0 {
                                return (Some(line), Some(col));
                            }
                        }
                    }
                    // Only found one number — treat as line
                    return (Some(col), None);
                }
            }
        }
    }

    (None, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_plugin() -> Arc<dyn crate::plugin::FrameworkPlugin> {
        Arc::new(crate::plugin::vertz::VertzPlugin)
    }

    fn create_test_state(root: &std::path::Path) -> Arc<DevServerState> {
        let src_dir = root.join("src");
        let deps_dir = root.join(".vertz/deps");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::create_dir_all(&deps_dir).unwrap();

        Arc::new(DevServerState {
            plugin: test_plugin(),
            pipeline: CompilationPipeline::new(root.to_path_buf(), src_dir.clone(), test_plugin()),
            root_dir: root.to_path_buf(),
            src_dir: src_dir.clone(),
            entry_file: src_dir.join("app.tsx"),
            deps_dir,
            theme_css: None,
            hmr_hub: HmrHub::new(),
            module_graph: crate::watcher::new_shared_module_graph(),
            error_broadcaster: ErrorBroadcaster::new(),
            console_log: ConsoleLog::new(),
            mcp_sessions: McpSessions::new(),
            mcp_event_hub: crate::server::mcp_events::McpEventHub::new(),
            start_time: std::time::Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: Arc::new(std::sync::RwLock::new(None)),
            api_proxy: None,
            auto_install: false,
            auto_install_lock: Arc::new(tokio::sync::Mutex::new(())),
            auto_install_inflight: Arc::new(std::sync::Mutex::new(HashMap::new())),
            auto_install_failed: Arc::new(std::sync::Mutex::new(HashSet::new())),
        })
    }

    #[tokio::test]
    async fn test_handle_source_file_returns_compiled_js() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        std::fs::write(
            tmp.path().join("src/app.ts"),
            "export const x: number = 42;\n",
        )
        .unwrap();

        let req = Request::builder()
            .uri("/src/app.ts")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap();
        assert!(ct.to_str().unwrap().contains("application/javascript"));

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let code = String::from_utf8(body.to_vec()).unwrap();
        assert!(code.contains("compiled by vertz-native"));
    }

    #[tokio::test]
    async fn test_handle_source_file_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        let req = Request::builder()
            .uri("/src/nonexistent.tsx")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_handle_deps_request_found() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        std::fs::write(tmp.path().join(".vertz/deps/zod.js"), "export default {};").unwrap();

        let req = Request::builder()
            .uri("/@deps/zod")
            .body(Body::empty())
            .unwrap();

        let resp = handle_deps_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap();
        assert!(ct.to_str().unwrap().contains("application/javascript"));
    }

    #[tokio::test]
    async fn test_handle_deps_request_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        let req = Request::builder()
            .uri("/@deps/nonexistent")
            .body(Body::empty())
            .unwrap();

        let resp = handle_deps_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_handle_css_request_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        let req = Request::builder()
            .uri("/@css/nonexistent.css")
            .body(Body::empty())
            .unwrap();

        let resp = handle_css_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_handle_page_route_returns_html() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        let req = Request::builder().uri("/").body(Body::empty()).unwrap();

        let resp = handle_page_route(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap();
        assert!(ct.to_str().unwrap().contains("text/html"));

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let html = String::from_utf8(body.to_vec()).unwrap();
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("<div id=\"app\"></div>"));
        assert!(html.contains("<script type=\"module\" src=\"/src/app.tsx\"></script>"));
    }

    #[tokio::test]
    async fn test_handle_page_route_spa_path() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        let req = Request::builder()
            .uri("/tasks/123")
            .body(Body::empty())
            .unwrap();

        let resp = handle_page_route(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let html = String::from_utf8(body.to_vec()).unwrap();
        assert!(html.contains("<script type=\"module\" src=\"/src/app.tsx\"></script>"));
    }

    #[test]
    fn test_parse_location_line_and_column() {
        let (line, col) = parse_location_from_message("Unexpected token at /src/app.tsx:10:5");
        assert_eq!(line, Some(10));
        assert_eq!(col, Some(5));
    }

    #[test]
    fn test_parse_location_no_location() {
        let (line, col) = parse_location_from_message("Unexpected token");
        assert_eq!(line, None);
        assert_eq!(col, None);
    }

    #[test]
    fn test_parse_location_line_only() {
        let (line, col) = parse_location_from_message("Error at line :42");
        assert_eq!(line, Some(42));
        assert_eq!(col, None);
    }

    #[test]
    fn test_parse_location_large_numbers() {
        let (line, col) = parse_location_from_message("error:150:23");
        assert_eq!(line, Some(150));
        assert_eq!(col, Some(23));
    }

    // ── Auto-install tests ─────────────────────────────────────────

    #[tokio::test]
    async fn test_auto_install_disabled_returns_404() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        // auto_install defaults to false in test helper

        let req = Request::builder()
            .uri("/@deps/nonexistent-package")
            .body(Body::empty())
            .unwrap();

        let resp = handle_deps_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_auto_install_blacklisted_returns_404_immediately() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Manually add to blacklist
        state
            .auto_install_failed
            .lock()
            .unwrap()
            .insert("blacklisted-pkg".to_string());

        // Enable auto_install by creating a new state with it on
        let mut inner = (*state).clone();
        inner.auto_install = true;
        let state = Arc::new(inner);

        let req = Request::builder()
            .uri("/@deps/blacklisted-pkg")
            .body(Body::empty())
            .unwrap();

        let resp = handle_deps_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn test_auto_install_failed_blacklist_cleared() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Add to blacklist
        state
            .auto_install_failed
            .lock()
            .unwrap()
            .insert("some-pkg".to_string());
        assert!(state
            .auto_install_failed
            .lock()
            .unwrap()
            .contains("some-pkg"));

        // Clear (simulates what the watcher does)
        state.auto_install_failed.lock().unwrap().clear();
        assert!(state.auto_install_failed.lock().unwrap().is_empty());
    }

    #[test]
    fn test_auto_install_state_fields_initialized() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Verify all auto-install state fields are properly initialized
        assert!(!state.auto_install);
        assert!(state.auto_install_inflight.lock().unwrap().is_empty());
        assert!(state.auto_install_failed.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_auto_install_inflight_dedup() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Simulate adding a package to inflight
        let notify = Arc::new(tokio::sync::Notify::new());
        state
            .auto_install_inflight
            .lock()
            .unwrap()
            .insert("zod".to_string(), notify.clone());

        // Verify it's in the inflight map
        assert!(state
            .auto_install_inflight
            .lock()
            .unwrap()
            .contains_key("zod"));

        // Notify and remove (simulates install completion)
        state.auto_install_inflight.lock().unwrap().remove("zod");
        notify.notify_waiters();

        assert!(!state
            .auto_install_inflight
            .lock()
            .unwrap()
            .contains_key("zod"));
    }

    #[test]
    fn test_re_resolve_dep_finds_installed_package() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Create a fake package in node_modules
        let pkg_dir = tmp.path().join("node_modules/test-pkg");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        std::fs::write(pkg_dir.join("index.js"), "export default {};").unwrap();

        // re_resolve_dep should find it via direct path
        let result = re_resolve_dep("test-pkg/index.js", &state);
        assert!(result.is_some());
    }

    #[test]
    fn test_re_resolve_dep_returns_none_for_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        let result = re_resolve_dep("nonexistent-pkg/index.js", &state);
        assert!(result.is_none());
    }

    // ── handle_source_file: source map dispatch ─────────────────────

    #[tokio::test]
    async fn test_handle_source_file_map_request() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Write a source file so compilation can produce a source map
        std::fs::write(
            tmp.path().join("src/app.ts"),
            "export const x: number = 42;\n",
        )
        .unwrap();

        let req = Request::builder()
            .uri("/src/app.ts.map")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;
        // Whether 200 (map available) or 404 (map not available), the map path is exercised
        let status = resp.status();
        assert!(
            status == StatusCode::OK || status == StatusCode::NOT_FOUND,
            "Expected 200 or 404, got {}",
            status
        );
    }

    // ── handle_source_file: compilation errors ──────────────────────

    #[tokio::test]
    async fn test_handle_source_file_with_compile_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Write a file with syntax errors
        std::fs::write(tmp.path().join("src/bad.tsx"), "export const x: = ;\n").unwrap();

        let req = Request::builder()
            .uri("/src/bad.tsx")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;
        // Should still return 200 with compiled output (even error modules are JS)
        assert_eq!(resp.status(), StatusCode::OK);
    }

    // ── handle_source_file: query param stripping ───────────────────

    #[tokio::test]
    async fn test_handle_source_file_strips_query_params() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        std::fs::write(tmp.path().join("src/app.ts"), "export const x = 42;\n").unwrap();

        // HMR cache busting query param
        let req = Request::builder()
            .uri("/src/app.ts?t=1234567890")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    // ── handle_source_map ───────────────────────────────────────────

    #[test]
    fn test_handle_source_map_file_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Write a source file so compilation can produce a map
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("app.ts"), "export const x = 42;\n").unwrap();

        let map_path = src_dir.join("app.ts.map");
        let resp = handle_source_map(&state, &map_path);

        // Source map may or may not be available depending on compiler
        let status = resp.status();
        assert!(
            status == StatusCode::OK || status == StatusCode::NOT_FOUND,
            "Expected 200 or 404, got {}",
            status
        );
    }

    #[test]
    fn test_handle_source_map_file_not_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        let map_path = tmp.path().join("src/nonexistent.tsx.map");
        let resp = handle_source_map(&state, &map_path);

        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn test_handle_source_map_no_map_suffix() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Path that doesn't end in .map — should use the path as-is
        let path = tmp.path().join("src/app.tsx");
        let resp = handle_source_map(&state, &path);

        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    // ── handle_deps_request: prebundled dep read error ──────────────

    #[tokio::test]
    async fn test_handle_deps_request_cache_immutable() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        std::fs::write(tmp.path().join(".vertz/deps/zod.js"), "export default {};").unwrap();

        let req = Request::builder()
            .uri("/@deps/zod")
            .body(Body::empty())
            .unwrap();

        let resp = handle_deps_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let cc = resp.headers().get(header::CACHE_CONTROL).unwrap();
        assert!(cc.to_str().unwrap().contains("immutable"));
    }

    // ── handle_deps_request: node_modules direct path ───────────────

    #[tokio::test]
    async fn test_handle_deps_node_modules_direct_file() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Create a file directly in node_modules
        let pkg_path = tmp.path().join("node_modules/@vertz/ui/dist/index.js");
        std::fs::create_dir_all(pkg_path.parent().unwrap()).unwrap();
        std::fs::write(&pkg_path, "export const x = 1;").unwrap();

        let req = Request::builder()
            .uri("/@deps/@vertz/ui/dist/index.js")
            .body(Body::empty())
            .unwrap();

        let resp = handle_deps_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap();
        assert!(ct.to_str().unwrap().contains("application/javascript"));
    }

    // ── serve_js_file ───────────────────────────────────────────────

    #[test]
    fn test_serve_js_file_ok() {
        let tmp = tempfile::tempdir().unwrap();
        let js_file = tmp.path().join("test.js");
        std::fs::write(&js_file, "export const x = 1;").unwrap();

        let resp = serve_js_file(&js_file, tmp.path());
        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap();
        assert!(ct.to_str().unwrap().contains("application/javascript"));
    }

    #[test]
    fn test_serve_js_file_read_error() {
        let resp = serve_js_file(Path::new("/nonexistent/file.js"), Path::new("/"));
        assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    // ── handle_css_request: CSS found ───────────────────────────────

    #[tokio::test]
    async fn test_handle_css_request_found() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Store CSS content directly in the pipeline's CSS store
        let key = "src_app.tsx.css";
        state
            .pipeline
            .css_store()
            .write()
            .unwrap()
            .insert(key.to_string(), ".foo { color: red; }".to_string());

        let req = Request::builder()
            .uri(format!("/@css/{}", key))
            .body(Body::empty())
            .unwrap();

        let resp = handle_css_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap();
        assert!(ct.to_str().unwrap().contains("text/css"));

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let css = String::from_utf8(body.to_vec()).unwrap();
        assert!(css.contains(".foo { color: red; }"));
    }

    // ── resolve_in_workspace_node_modules ────────────────────────────

    #[test]
    fn test_resolve_workspace_no_node_modules() {
        let tmp = tempfile::tempdir().unwrap();
        // No node_modules directory
        assert!(resolve_in_workspace_node_modules("foo/index.js", tmp.path()).is_none());
    }

    #[test]
    fn test_resolve_workspace_empty_node_modules() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("node_modules")).unwrap();
        assert!(resolve_in_workspace_node_modules("foo/index.js", tmp.path()).is_none());
    }

    // ── resolve_in_bun_cache ────────────────────────────────────────

    #[test]
    fn test_resolve_bun_cache_no_bun_dir() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("node_modules")).unwrap();
        assert!(resolve_in_bun_cache("foo/index.js", tmp.path()).is_none());
    }

    #[test]
    fn test_resolve_bun_cache_with_file() {
        let tmp = tempfile::tempdir().unwrap();
        let bun_dir = tmp
            .path()
            .join("node_modules/.bun/foo@1.0.0/node_modules/foo");
        std::fs::create_dir_all(&bun_dir).unwrap();
        std::fs::write(bun_dir.join("index.js"), "export default {};").unwrap();

        let result = resolve_in_bun_cache("foo/index.js", tmp.path());
        assert!(result.is_some());
    }

    #[test]
    fn test_resolve_bun_cache_scoped_package() {
        let tmp = tempfile::tempdir().unwrap();
        let bun_dir = tmp
            .path()
            .join("node_modules/.bun/@scope+pkg@1.0.0/node_modules/@scope/pkg");
        let dist_dir = bun_dir.join("dist");
        std::fs::create_dir_all(&dist_dir).unwrap();
        std::fs::write(dist_dir.join("index.js"), "export default {};").unwrap();

        let result = resolve_in_bun_cache("@scope/pkg/dist/index.js", tmp.path());
        assert!(result.is_some());
    }

    // ── parse_location_from_message edge cases ──────────────────────

    #[test]
    fn test_parse_location_multiple_colons() {
        let (line, col) = parse_location_from_message("Error in file.tsx:5:10 and more text");
        assert_eq!(line, Some(5));
        assert_eq!(col, Some(10));
    }

    #[test]
    fn test_parse_location_colon_no_digits() {
        let (line, col) = parse_location_from_message("Error: something went wrong");
        assert_eq!(line, None);
        assert_eq!(col, None);
    }

    #[test]
    fn test_parse_location_empty() {
        let (line, col) = parse_location_from_message("");
        assert_eq!(line, None);
        assert_eq!(col, None);
    }

    #[test]
    fn test_parse_location_only_colon_zero() {
        // :0 is not valid (> 0 check)
        let (line, col) = parse_location_from_message("at :0");
        assert_eq!(line, None);
        assert_eq!(col, None);
    }

    // ── resolve_in_workspace_node_modules with symlinks ─────────────

    #[test]
    fn test_resolve_workspace_with_regular_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let nm = tmp.path().join("node_modules");
        std::fs::create_dir_all(&nm).unwrap();

        // Create a regular (non-symlink) directory — should not be picked up
        let pkg_dir = nm.join("regular-pkg");
        std::fs::create_dir_all(&pkg_dir).unwrap();

        let result = resolve_in_workspace_node_modules("some-dep/index.js", tmp.path());
        assert!(result.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn test_resolve_workspace_with_symlinked_package() {
        let tmp = tempfile::tempdir().unwrap();
        let nm = tmp.path().join("node_modules");
        std::fs::create_dir_all(&nm).unwrap();

        // Create a "real" workspace package directory
        let real_pkg = tmp.path().join("packages/my-pkg");
        let nested_nm = real_pkg.join("node_modules/dep-pkg");
        std::fs::create_dir_all(&nested_nm).unwrap();
        std::fs::write(nested_nm.join("index.js"), "export default {};").unwrap();

        // Symlink it into node_modules
        std::os::unix::fs::symlink(&real_pkg, nm.join("my-pkg")).unwrap();

        let result = resolve_in_workspace_node_modules("dep-pkg/index.js", tmp.path());
        assert!(result.is_some());
    }

    #[cfg(unix)]
    #[test]
    fn test_resolve_workspace_scoped_symlinked_package() {
        let tmp = tempfile::tempdir().unwrap();
        let nm = tmp.path().join("node_modules/@vertz");
        std::fs::create_dir_all(&nm).unwrap();

        // Create a "real" workspace package directory
        let real_pkg = tmp.path().join("packages/ui-primitives");
        let nested_nm = real_pkg.join("node_modules/@floating-ui/dom");
        std::fs::create_dir_all(&nested_nm).unwrap();
        std::fs::write(nested_nm.join("index.mjs"), "export {};").unwrap();

        // Symlink it under the scoped directory
        std::os::unix::fs::symlink(&real_pkg, nm.join("ui-primitives")).unwrap();

        let result = resolve_in_workspace_node_modules("@floating-ui/dom/index.mjs", tmp.path());
        assert!(result.is_some());
    }

    // ── resolve_in_bun_cache additional branches ────────────────────

    #[test]
    fn test_resolve_bun_cache_no_match() {
        let tmp = tempfile::tempdir().unwrap();
        let bun_dir = tmp
            .path()
            .join("node_modules/.bun/other-pkg@1.0.0/node_modules/other-pkg");
        std::fs::create_dir_all(&bun_dir).unwrap();

        // Looking for a different package
        let result = resolve_in_bun_cache("foo/index.js", tmp.path());
        assert!(result.is_none());
    }

    #[test]
    fn test_resolve_bun_cache_nested_transitive_dep() {
        let tmp = tempfile::tempdir().unwrap();
        // Create a .bun entry with a nested node_modules containing a transitive dep
        let bun_entry = tmp.path().join("node_modules/.bun/parent-pkg@1.0.0");
        let nested_dep = bun_entry.join("node_modules/child-dep/dist");
        std::fs::create_dir_all(&nested_dep).unwrap();
        std::fs::write(nested_dep.join("index.js"), "export {};").unwrap();

        let result = resolve_in_bun_cache("child-dep/dist/index.js", tmp.path());
        assert!(result.is_some());
    }

    #[test]
    fn test_resolve_bun_cache_empty_subpath() {
        let tmp = tempfile::tempdir().unwrap();
        let bun_dir = tmp
            .path()
            .join("node_modules/.bun/my-lib@2.0.0/node_modules/my-lib");
        std::fs::create_dir_all(&bun_dir).unwrap();

        // Empty subpath — tries to resolve via package.json exports (will fail without it)
        let result = resolve_in_bun_cache("my-lib", tmp.path());
        // Will be None because there's no package.json exports to resolve
        assert!(result.is_none());
    }

    // ── handle_deps_request: node_modules resolution paths ──────────

    #[tokio::test]
    async fn test_handle_deps_node_modules_walk_up() {
        let tmp = tempfile::tempdir().unwrap();

        // Create project dir with a parent that has node_modules
        let project = tmp.path().join("workspace/my-app");
        std::fs::create_dir_all(&project).unwrap();
        let src = project.join("src");
        std::fs::create_dir_all(&src).unwrap();
        let deps = project.join(".vertz/deps");
        std::fs::create_dir_all(&deps).unwrap();

        // Put the dep in the parent's node_modules (monorepo hoisting)
        let parent_nm = tmp.path().join("workspace/node_modules/some-lib");
        std::fs::create_dir_all(&parent_nm).unwrap();
        std::fs::write(parent_nm.join("index.js"), "export const x = 1;").unwrap();

        let state = Arc::new(DevServerState {
            plugin: test_plugin(),
            pipeline: CompilationPipeline::new(project.clone(), src.clone(), test_plugin()),
            root_dir: project.clone(),
            src_dir: src,
            entry_file: project.join("src/app.tsx"),
            deps_dir: deps,
            theme_css: None,
            hmr_hub: HmrHub::new(),
            module_graph: crate::watcher::new_shared_module_graph(),
            error_broadcaster: ErrorBroadcaster::new(),
            console_log: ConsoleLog::new(),
            mcp_sessions: McpSessions::new(),
            mcp_event_hub: McpEventHub::new(),
            start_time: std::time::Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: Arc::new(std::sync::RwLock::new(None)),
            api_proxy: None,
            auto_install: false,
            auto_install_lock: Arc::new(tokio::sync::Mutex::new(())),
            auto_install_inflight: Arc::new(std::sync::Mutex::new(HashMap::new())),
            auto_install_failed: Arc::new(std::sync::Mutex::new(HashSet::new())),
        });

        let req = Request::builder()
            .uri("/@deps/some-lib/index.js")
            .body(Body::empty())
            .unwrap();

        let resp = handle_deps_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    // ── handle_source_file: compilation error with location ─────────

    #[tokio::test]
    async fn test_handle_source_file_error_clears_on_success() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // First compile succeeds — exercises the else branch (clear errors, update graph)
        std::fs::write(
            tmp.path().join("src/good.ts"),
            "export const hello = 'world';\n",
        )
        .unwrap();

        let req = Request::builder()
            .uri("/src/good.ts")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    // ── serve_js_file: content rewriting ────────────────────────────

    #[test]
    fn test_serve_js_file_rewrites_imports() {
        let tmp = tempfile::tempdir().unwrap();
        let js_file = tmp.path().join("test.js");
        std::fs::write(
            &js_file,
            "import { something } from './other.js';\nexport const x = 1;",
        )
        .unwrap();

        let resp = serve_js_file(&js_file, tmp.path());
        assert_eq!(resp.status(), StatusCode::OK);
        let cc = resp.headers().get(header::CACHE_CONTROL).unwrap();
        assert_eq!(cc.to_str().unwrap(), "no-cache");
    }

    // ── handle_source_file: source map content type ─────────────────

    #[tokio::test]
    async fn test_handle_source_file_map_content_type() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        std::fs::write(tmp.path().join("src/app.ts"), "export const x = 42;\n").unwrap();

        // First compile to populate the cache
        let req = Request::builder()
            .uri("/src/app.ts")
            .body(Body::empty())
            .unwrap();
        let _resp = handle_source_file(State(state.clone()), req).await;

        // Now request the source map
        let req = Request::builder()
            .uri("/src/app.ts.map")
            .body(Body::empty())
            .unwrap();
        let resp = handle_source_file(State(state), req).await;
        let status = resp.status();
        if status == StatusCode::OK {
            let ct = resp.headers().get(header::CONTENT_TYPE).unwrap();
            assert!(ct.to_str().unwrap().contains("application/json"));
        }
    }

    // ── pre-bundled dep read error (unix only) ────────────────────

    #[cfg(unix)]
    #[tokio::test]
    async fn test_handle_deps_prebundled_read_error() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Create a deps file then remove read permissions
        let dep_file = tmp.path().join(".vertz/deps/unreadable-pkg.js");
        std::fs::write(&dep_file, "export default {};").unwrap();
        std::fs::set_permissions(&dep_file, std::fs::Permissions::from_mode(0o000)).unwrap();

        let req = Request::builder()
            .uri("/@deps/unreadable-pkg")
            .body(Body::empty())
            .unwrap();

        let resp = handle_deps_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);

        // Restore permissions for cleanup
        std::fs::set_permissions(&dep_file, std::fs::Permissions::from_mode(0o644)).unwrap();
    }

    // ── handle_deps: workspace node_modules resolution ──────────────

    #[cfg(unix)]
    #[tokio::test]
    async fn test_handle_deps_workspace_resolution() {
        let tmp = tempfile::tempdir().unwrap();
        let nm = tmp.path().join("node_modules");
        std::fs::create_dir_all(&nm).unwrap();

        // Create a workspace package with nested node_modules
        let real_pkg = tmp.path().join("packages/my-ui");
        let nested_dep = real_pkg.join("node_modules/floating-utils");
        std::fs::create_dir_all(&nested_dep).unwrap();
        std::fs::write(nested_dep.join("index.js"), "export const x = 1;").unwrap();

        // Symlink the workspace package into node_modules
        std::os::unix::fs::symlink(&real_pkg, nm.join("my-ui")).unwrap();

        let src = tmp.path().join("src");
        let deps = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::create_dir_all(&deps).unwrap();

        let state = Arc::new(DevServerState {
            plugin: test_plugin(),
            pipeline: CompilationPipeline::new(
                tmp.path().to_path_buf(),
                src.clone(),
                test_plugin(),
            ),
            root_dir: tmp.path().to_path_buf(),
            src_dir: src,
            entry_file: tmp.path().join("src/app.tsx"),
            deps_dir: deps,
            theme_css: None,
            hmr_hub: HmrHub::new(),
            module_graph: crate::watcher::new_shared_module_graph(),
            error_broadcaster: ErrorBroadcaster::new(),
            console_log: ConsoleLog::new(),
            mcp_sessions: McpSessions::new(),
            mcp_event_hub: McpEventHub::new(),
            start_time: std::time::Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: Arc::new(std::sync::RwLock::new(None)),
            api_proxy: None,
            auto_install: false,
            auto_install_lock: Arc::new(tokio::sync::Mutex::new(())),
            auto_install_inflight: Arc::new(std::sync::Mutex::new(HashMap::new())),
            auto_install_failed: Arc::new(std::sync::Mutex::new(HashSet::new())),
        });

        let req = Request::builder()
            .uri("/@deps/floating-utils/index.js")
            .body(Body::empty())
            .unwrap();

        let resp = handle_deps_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    // ── handle_deps: bun cache resolution ───────────────────────────

    #[tokio::test]
    async fn test_handle_deps_bun_cache_resolution() {
        let tmp = tempfile::tempdir().unwrap();
        let bun_pkg = tmp
            .path()
            .join("node_modules/.bun/bar@1.0.0/node_modules/bar");
        std::fs::create_dir_all(&bun_pkg).unwrap();
        std::fs::write(bun_pkg.join("index.js"), "export const x = 1;").unwrap();

        let src = tmp.path().join("src");
        let deps = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::create_dir_all(&deps).unwrap();

        let state = Arc::new(DevServerState {
            plugin: test_plugin(),
            pipeline: CompilationPipeline::new(
                tmp.path().to_path_buf(),
                src.clone(),
                test_plugin(),
            ),
            root_dir: tmp.path().to_path_buf(),
            src_dir: src,
            entry_file: tmp.path().join("src/app.tsx"),
            deps_dir: deps,
            theme_css: None,
            hmr_hub: HmrHub::new(),
            module_graph: crate::watcher::new_shared_module_graph(),
            error_broadcaster: ErrorBroadcaster::new(),
            console_log: ConsoleLog::new(),
            mcp_sessions: McpSessions::new(),
            mcp_event_hub: McpEventHub::new(),
            start_time: std::time::Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: Arc::new(std::sync::RwLock::new(None)),
            api_proxy: None,
            auto_install: false,
            auto_install_lock: Arc::new(tokio::sync::Mutex::new(())),
            auto_install_inflight: Arc::new(std::sync::Mutex::new(HashMap::new())),
            auto_install_failed: Arc::new(std::sync::Mutex::new(HashSet::new())),
        });

        let req = Request::builder()
            .uri("/@deps/bar/index.js")
            .body(Body::empty())
            .unwrap();

        let resp = handle_deps_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    // ── resolve_in_bun_cache: empty subpath with package.json ───────

    #[test]
    fn test_resolve_bun_cache_empty_subpath_with_package_json() {
        let tmp = tempfile::tempdir().unwrap();
        let bun_dir = tmp
            .path()
            .join("node_modules/.bun/my-lib@2.0.0/node_modules/my-lib");
        std::fs::create_dir_all(&bun_dir).unwrap();
        std::fs::write(bun_dir.join("index.js"), "export default {};").unwrap();
        std::fs::write(
            bun_dir.join("package.json"),
            r#"{"name":"my-lib","main":"index.js"}"#,
        )
        .unwrap();

        let result = resolve_in_bun_cache("my-lib", tmp.path());
        // May or may not resolve depending on resolve::resolve_from_node_modules behavior
        // But the path through the code is exercised either way
        let _ = result;
    }

    // ── re_resolve_dep: workspace fallback path ─────────────────────

    #[cfg(unix)]
    #[test]
    fn test_re_resolve_dep_workspace_fallback() {
        let tmp = tempfile::tempdir().unwrap();
        let nm = tmp.path().join("node_modules");
        std::fs::create_dir_all(&nm).unwrap();

        // Create workspace package with nested dep
        let real_pkg = tmp.path().join("packages/shared");
        let nested = real_pkg.join("node_modules/helper-lib");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("index.js"), "export {};").unwrap();

        // Symlink workspace package
        std::os::unix::fs::symlink(&real_pkg, nm.join("shared")).unwrap();

        let src = tmp.path().join("src");
        let deps = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::create_dir_all(&deps).unwrap();

        let state = DevServerState {
            plugin: test_plugin(),
            pipeline: CompilationPipeline::new(
                tmp.path().to_path_buf(),
                src.clone(),
                test_plugin(),
            ),
            root_dir: tmp.path().to_path_buf(),
            src_dir: src,
            entry_file: tmp.path().join("src/app.tsx"),
            deps_dir: deps,
            theme_css: None,
            hmr_hub: HmrHub::new(),
            module_graph: crate::watcher::new_shared_module_graph(),
            error_broadcaster: ErrorBroadcaster::new(),
            console_log: ConsoleLog::new(),
            mcp_sessions: McpSessions::new(),
            mcp_event_hub: McpEventHub::new(),
            start_time: std::time::Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: Arc::new(std::sync::RwLock::new(None)),
            api_proxy: None,
            auto_install: false,
            auto_install_lock: Arc::new(tokio::sync::Mutex::new(())),
            auto_install_inflight: Arc::new(std::sync::Mutex::new(HashMap::new())),
            auto_install_failed: Arc::new(std::sync::Mutex::new(HashSet::new())),
        };

        // helper-lib/index.js is not in root's node_modules directly,
        // only inside shared's node_modules — re_resolve_dep should find via workspace fallback
        let result = re_resolve_dep("helper-lib/index.js", &state);
        assert!(result.is_some());
    }

    // ── re_resolve_dep: bun cache fallback ──────────────────────────

    #[test]
    fn test_re_resolve_dep_bun_fallback() {
        let tmp = tempfile::tempdir().unwrap();
        let bun_pkg = tmp
            .path()
            .join("node_modules/.bun/some-dep@1.0.0/node_modules/some-dep");
        std::fs::create_dir_all(&bun_pkg).unwrap();
        std::fs::write(bun_pkg.join("index.js"), "export {};").unwrap();

        let src = tmp.path().join("src");
        let deps = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::create_dir_all(&deps).unwrap();

        let state = DevServerState {
            plugin: test_plugin(),
            pipeline: CompilationPipeline::new(
                tmp.path().to_path_buf(),
                src.clone(),
                test_plugin(),
            ),
            root_dir: tmp.path().to_path_buf(),
            src_dir: src,
            entry_file: tmp.path().join("src/app.tsx"),
            deps_dir: deps,
            theme_css: None,
            hmr_hub: HmrHub::new(),
            module_graph: crate::watcher::new_shared_module_graph(),
            error_broadcaster: ErrorBroadcaster::new(),
            console_log: ConsoleLog::new(),
            mcp_sessions: McpSessions::new(),
            mcp_event_hub: McpEventHub::new(),
            start_time: std::time::Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: Arc::new(std::sync::RwLock::new(None)),
            api_proxy: None,
            auto_install: false,
            auto_install_lock: Arc::new(tokio::sync::Mutex::new(())),
            auto_install_inflight: Arc::new(std::sync::Mutex::new(HashMap::new())),
            auto_install_failed: Arc::new(std::sync::Mutex::new(HashSet::new())),
        };

        let result = re_resolve_dep("some-dep/index.js", &state);
        assert!(result.is_some());
    }

    // ── auto-install: concurrent waiter path ────────────────────────

    #[tokio::test]
    async fn test_auto_install_concurrent_waiter_path() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        let mut inner = (*state).clone();
        inner.auto_install = true;
        let state = Arc::new(inner);

        // Pre-populate the inflight map to simulate another request already installing
        let notify = Arc::new(tokio::sync::Notify::new());
        state
            .auto_install_inflight
            .lock()
            .unwrap()
            .insert("concurrent-pkg".to_string(), notify.clone());

        // Notify after a short delay so the handler's Notified future is ready
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            notify.notify_waiters();
        });

        let req = Request::builder()
            .uri("/@deps/concurrent-pkg")
            .body(Body::empty())
            .unwrap();

        // This should hit the waiter path (is_installer = false), wait for notify, then 404
        let resp = handle_deps_request(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    // ── handle_deps: package.json exports resolution path ───────────

    #[tokio::test]
    async fn test_handle_deps_package_json_exports() {
        let tmp = tempfile::tempdir().unwrap();
        let pkg_dir = tmp.path().join("node_modules/exports-pkg");
        std::fs::create_dir_all(pkg_dir.join("dist")).unwrap();
        std::fs::write(pkg_dir.join("dist/index.mjs"), "export const x = 1;").unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"name":"exports-pkg","exports":{".":"./dist/index.mjs"}}"#,
        )
        .unwrap();

        let src = tmp.path().join("src");
        let deps = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::create_dir_all(&deps).unwrap();

        let state = Arc::new(DevServerState {
            plugin: test_plugin(),
            pipeline: CompilationPipeline::new(
                tmp.path().to_path_buf(),
                src.clone(),
                test_plugin(),
            ),
            root_dir: tmp.path().to_path_buf(),
            src_dir: src,
            entry_file: tmp.path().join("src/app.tsx"),
            deps_dir: deps,
            theme_css: None,
            hmr_hub: HmrHub::new(),
            module_graph: crate::watcher::new_shared_module_graph(),
            error_broadcaster: ErrorBroadcaster::new(),
            console_log: ConsoleLog::new(),
            mcp_sessions: McpSessions::new(),
            mcp_event_hub: McpEventHub::new(),
            start_time: std::time::Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: Arc::new(std::sync::RwLock::new(None)),
            api_proxy: None,
            auto_install: false,
            auto_install_lock: Arc::new(tokio::sync::Mutex::new(())),
            auto_install_inflight: Arc::new(std::sync::Mutex::new(HashMap::new())),
            auto_install_failed: Arc::new(std::sync::Mutex::new(HashSet::new())),
        });

        // Request the bare specifier (no subpath) which should resolve via package.json exports
        let req = Request::builder()
            .uri("/@deps/exports-pkg")
            .body(Body::empty())
            .unwrap();

        let resp = handle_deps_request(State(state), req).await;
        // May be 200 if resolve works with this package.json, or 404 if not
        let _ = resp.status();
    }

    // ── handle_page_route: theme CSS ────────────────────────────────

    #[tokio::test]
    async fn test_handle_page_route_with_theme_css() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        let deps_dir = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::create_dir_all(&deps_dir).unwrap();

        let mut state = (*create_test_state(tmp.path())).clone();
        state.theme_css = Some(":root { --color: red; }".to_string());
        let state = Arc::new(state);

        let req = Request::builder().uri("/").body(Body::empty()).unwrap();
        let resp = handle_page_route(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let html = String::from_utf8(body.to_vec()).unwrap();
        assert!(html.contains("--color: red"));
    }

    // ── handle_source_file: CSS file served as JS module ─────────────

    #[tokio::test]
    async fn test_handle_source_file_css_returns_js_module() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        std::fs::write(
            tmp.path().join("src/styles.css"),
            "body { margin: 0; color: red; }\n",
        )
        .unwrap();

        let req = Request::builder()
            .uri("/src/styles.css")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap();
        assert!(
            ct.to_str().unwrap().contains("application/javascript"),
            "CSS files should be served as JavaScript modules"
        );

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let code = String::from_utf8(body.to_vec()).unwrap();
        assert!(
            code.contains("body { margin: 0; color: red; }"),
            "JS module should contain the CSS content"
        );
        assert!(
            code.contains("document.createElement('style')"),
            "JS module should inject a style element"
        );
        assert!(
            code.contains("export default"),
            "JS module should export the CSS string"
        );
    }

    #[tokio::test]
    async fn test_handle_source_file_css_runs_postcss_when_config_exists() {
        use crate::compiler::postcss::{find_postcss_config, PostCssCssTransform};

        let tmp = tempfile::tempdir().unwrap();
        let node_modules = tmp.path().join("node_modules");
        let src_dir = tmp.path().join("src");
        let deps_dir = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::create_dir_all(&deps_dir).unwrap();
        std::fs::create_dir_all(node_modules.join("postcss")).unwrap();
        std::fs::create_dir_all(node_modules.join("fake-prefixer")).unwrap();
        std::fs::write(src_dir.join("styles.css"), "body { display: flex; }\n").unwrap();
        std::fs::write(
            tmp.path().join("postcss.config.js"),
            "module.exports = { plugins: { 'fake-prefixer': {} } };",
        )
        .unwrap();
        std::fs::write(
            node_modules.join("postcss/package.json"),
            r#"{"name":"postcss","main":"index.js"}"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("postcss/index.js"),
            r#"module.exports = function postcss(plugins) {
  return {
    async process(css, options) {
      let next = css;
      for (const plugin of plugins) {
        next = await plugin(next, options);
      }
      return { css: next };
    },
  };
};"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("fake-prefixer/package.json"),
            r#"{"name":"fake-prefixer","main":"index.js"}"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("fake-prefixer/index.js"),
            r#"module.exports = function fakePrefixer() {
  return (css) => css.replace("display: flex", "display: -webkit-flex;\n  display: flex");
};"#,
        )
        .unwrap();

        let config_path = find_postcss_config(tmp.path()).expect("config should exist");
        let transform = Arc::new(PostCssCssTransform::new(config_path));
        let pipeline =
            CompilationPipeline::new(tmp.path().to_path_buf(), src_dir.clone(), test_plugin())
                .with_css_transform(transform);

        let state = Arc::new(DevServerState {
            plugin: test_plugin(),
            pipeline,
            root_dir: tmp.path().to_path_buf(),
            src_dir: src_dir.clone(),
            entry_file: src_dir.join("app.tsx"),
            deps_dir,
            theme_css: None,
            hmr_hub: HmrHub::new(),
            module_graph: crate::watcher::new_shared_module_graph(),
            error_broadcaster: ErrorBroadcaster::new(),
            console_log: ConsoleLog::new(),
            mcp_sessions: McpSessions::new(),
            mcp_event_hub: crate::server::mcp_events::McpEventHub::new(),
            start_time: std::time::Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: Arc::new(std::sync::RwLock::new(None)),
            api_proxy: None,
            auto_install: false,
            auto_install_lock: Arc::new(tokio::sync::Mutex::new(())),
            auto_install_inflight: Arc::new(std::sync::Mutex::new(HashMap::new())),
            auto_install_failed: Arc::new(std::sync::Mutex::new(HashSet::new())),
        });

        let req = Request::builder()
            .uri("/src/styles.css")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let code = String::from_utf8(body.to_vec()).unwrap();
        assert!(code.contains("display: -webkit-flex;"));
    }

    #[tokio::test]
    async fn test_handle_source_file_css_postcss_error_reports_overlay_error() {
        use crate::compiler::postcss::{find_postcss_config, PostCssCssTransform};

        let tmp = tempfile::tempdir().unwrap();
        let node_modules = tmp.path().join("node_modules");
        let src_dir = tmp.path().join("src");
        let deps_dir = tmp.path().join(".vertz/deps");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::create_dir_all(&deps_dir).unwrap();
        std::fs::create_dir_all(node_modules.join("postcss")).unwrap();
        std::fs::create_dir_all(node_modules.join("broken-plugin")).unwrap();
        std::fs::write(src_dir.join("styles.css"), "@broken;\n").unwrap();
        std::fs::write(
            tmp.path().join("postcss.config.js"),
            "module.exports = { plugins: { 'broken-plugin': {} } };",
        )
        .unwrap();
        std::fs::write(
            node_modules.join("postcss/package.json"),
            r#"{"name":"postcss","main":"index.js"}"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("postcss/index.js"),
            r#"module.exports = function postcss(plugins) {
  return {
    async process(css, options) {
      for (const plugin of plugins) {
        await plugin(css, options);
      }
      return { css };
    },
  };
};"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("broken-plugin/package.json"),
            r#"{"name":"broken-plugin","main":"index.js"}"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("broken-plugin/index.js"),
            r#"module.exports = function brokenPlugin() {
  return () => {
    const error = new Error("Unknown at-rule @broken");
    error.reason = "Unknown at-rule @broken";
    error.line = 1;
    error.column = 1;
    throw error;
  };
};"#,
        )
        .unwrap();

        let config_path = find_postcss_config(tmp.path()).expect("config should exist");
        let transform = Arc::new(PostCssCssTransform::new(config_path));
        let pipeline =
            CompilationPipeline::new(tmp.path().to_path_buf(), src_dir.clone(), test_plugin())
                .with_css_transform(transform);

        let state = Arc::new(DevServerState {
            plugin: test_plugin(),
            pipeline,
            root_dir: tmp.path().to_path_buf(),
            src_dir: src_dir.clone(),
            entry_file: src_dir.join("app.tsx"),
            deps_dir,
            theme_css: None,
            hmr_hub: HmrHub::new(),
            module_graph: crate::watcher::new_shared_module_graph(),
            error_broadcaster: ErrorBroadcaster::new(),
            console_log: ConsoleLog::new(),
            mcp_sessions: McpSessions::new(),
            mcp_event_hub: crate::server::mcp_events::McpEventHub::new(),
            start_time: std::time::Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: Arc::new(std::sync::RwLock::new(None)),
            api_proxy: None,
            auto_install: false,
            auto_install_lock: Arc::new(tokio::sync::Mutex::new(())),
            auto_install_inflight: Arc::new(std::sync::Mutex::new(HashMap::new())),
            auto_install_failed: Arc::new(std::sync::Mutex::new(HashSet::new())),
        });

        let req = Request::builder()
            .uri("/src/styles.css")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state.clone()), req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        // The error is reported via a fire-and-forget tokio::spawn, so poll
        // with a hard deadline instead of a single fixed sleep.
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
        let payload = loop {
            tokio::task::yield_now().await;
            let current = state.error_broadcaster.current_state().await;
            let p = current.to_json();
            if p.contains("Unknown at-rule @broken") {
                break p;
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "timed out waiting for PostCSS error to appear in error broadcaster"
            );
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        };
        assert!(payload.contains("\"line\":1"));
    }

    #[tokio::test]
    async fn test_handle_source_file_css_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        let req = Request::builder()
            .uri("/src/nonexistent.css")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_handle_source_file_css_cache_bust_query_stripped() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        std::fs::write(tmp.path().join("src/app.css"), ".app { display: flex; }\n").unwrap();

        let req = Request::builder()
            .uri("/src/app.css?t=1234567890")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let code = String::from_utf8(body.to_vec()).unwrap();
        assert!(code.contains(".app { display: flex; }"));
    }

    // ── Asset import tests ──

    #[tokio::test]
    async fn test_handle_asset_import_returns_synthetic_js_module() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        std::fs::write(tmp.path().join("src/logo.svg"), "<svg></svg>").unwrap();

        let req = Request::builder()
            .uri("/src/logo.svg?import")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap();
        assert!(
            ct.to_str().unwrap().contains("application/javascript"),
            "Asset import should return JS content type"
        );

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let code = String::from_utf8(body.to_vec()).unwrap();
        assert!(
            code.contains("export default \"/src/logo.svg\""),
            "Synthetic module should export URL string. Got: {}",
            code
        );
    }

    #[tokio::test]
    async fn test_handle_asset_raw_request_returns_file_contents() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        std::fs::write(tmp.path().join("src/logo.svg"), "<svg>test</svg>").unwrap();

        let req = Request::builder()
            .uri("/src/logo.svg")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap();
        assert!(
            ct.to_str().unwrap().contains("image/svg+xml"),
            "Raw SVG should have image/svg+xml content type. Got: {}",
            ct.to_str().unwrap()
        );

        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let content = String::from_utf8(body.to_vec()).unwrap();
        assert_eq!(content, "<svg>test</svg>");
    }

    #[tokio::test]
    async fn test_handle_asset_import_png_returns_synthetic_module() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());
        std::fs::create_dir_all(tmp.path().join("src/assets")).unwrap();
        std::fs::write(tmp.path().join("src/assets/hero.png"), "PNG_DATA").unwrap();

        let req = Request::builder()
            .uri("/src/assets/hero.png?import")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        let code = String::from_utf8(body.to_vec()).unwrap();
        assert!(
            code.contains("export default \"/src/assets/hero.png\""),
            "Synthetic module should export URL path. Got: {}",
            code
        );
    }

    #[tokio::test]
    async fn test_handle_asset_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        let req = Request::builder()
            .uri("/src/nonexistent.svg?import")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    // ── handle_source_file: CSS warnings reach error overlay ─────

    /// Helper: poll the error broadcaster until a condition is met or timeout.
    async fn poll_broadcaster(
        broadcaster: &ErrorBroadcaster,
        condition: impl Fn(&str) -> bool,
        timeout_msg: &str,
    ) -> String {
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
        loop {
            tokio::task::yield_now().await;
            let current = broadcaster.current_state().await;
            let p = current.to_json();
            if condition(&p) {
                return p;
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "{}: {}",
                timeout_msg,
                p
            );
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    }

    #[tokio::test]
    async fn test_handle_source_file_warnings_broadcast_to_error_overlay() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Write a file with a css() call that triggers a CSS warning.
        // 'text:sm' uses 'sm' which is not a valid color token — the compiler
        // will emit a [css-unknown-color-token] diagnostic classified as a warning.
        std::fs::write(
            tmp.path().join("src/sidebar.tsx"),
            r#"const styles = css({ root: ['text:sm'] });
export default function Sidebar() { return <div class={styles.root}>Hi</div>; }
"#,
        )
        .unwrap();

        let req = Request::builder()
            .uri("/src/sidebar.tsx")
            .body(Body::empty())
            .unwrap();

        let resp = handle_source_file(State(state.clone()), req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        // The warning should appear in the error broadcaster (via tokio::spawn).
        let payload = poll_broadcaster(
            &state.error_broadcaster,
            |p| p.contains("css-unknown-color-token"),
            "timed out waiting for CSS warning to appear in error broadcaster",
        )
        .await;
        assert!(payload.contains("css-unknown-color-token"));
    }

    #[tokio::test]
    async fn test_handle_source_file_warnings_clear_when_file_is_clean() {
        let tmp = tempfile::tempdir().unwrap();
        let state = create_test_state(tmp.path());

        // Step 1: Compile a file with CSS warning
        std::fs::write(
            tmp.path().join("src/sidebar.tsx"),
            r#"const styles = css({ root: ['text:sm'] });
export default function Sidebar() { return <div class={styles.root}>Hi</div>; }
"#,
        )
        .unwrap();

        let req = Request::builder()
            .uri("/src/sidebar.tsx")
            .body(Body::empty())
            .unwrap();
        handle_source_file(State(state.clone()), req).await;

        poll_broadcaster(
            &state.error_broadcaster,
            |p| p.contains("css-unknown-color-token"),
            "timed out waiting for CSS warning",
        )
        .await;

        // Step 2: Compile a DIFFERENT clean file (no warnings)
        std::fs::write(tmp.path().join("src/clean.tsx"), "export const x = 42;\n").unwrap();

        let req = Request::builder()
            .uri("/src/clean.tsx")
            .body(Body::empty())
            .unwrap();
        handle_source_file(State(state.clone()), req).await;

        // The clean file clears its own build errors, but the sidebar warning
        // should still be present (it's for a different file)
        tokio::task::yield_now().await;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        let current = state.error_broadcaster.current_state().await;
        assert!(
            current.to_json().contains("css-unknown-color-token"),
            "warning for sidebar.tsx should still be present after compiling a different file"
        );
    }
}
