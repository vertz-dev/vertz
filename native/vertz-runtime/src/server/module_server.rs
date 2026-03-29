use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Request, Response, StatusCode};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

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

        // Clear any previous errors for this file
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
            let rewritten = crate::compiler::import_rewriter::rewrite_imports(
                &content, &real_path, &real_path, root_dir,
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

    fn create_test_state(root: &std::path::Path) -> Arc<DevServerState> {
        let src_dir = root.join("src");
        let deps_dir = root.join(".vertz/deps");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::create_dir_all(&deps_dir).unwrap();

        Arc::new(DevServerState {
            pipeline: CompilationPipeline::new(root.to_path_buf(), src_dir.clone()),
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
}
