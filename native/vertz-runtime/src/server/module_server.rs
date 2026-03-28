use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Request, Response, StatusCode};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::compiler::pipeline::CompilationPipeline;
use crate::deps::prebundle;
use crate::deps::resolve;
use crate::errors::broadcaster::ErrorBroadcaster;
use crate::errors::categories::{extract_snippet, DevError, ErrorCategory};
use crate::errors::suggestions;
use crate::hmr::websocket::HmrHub;
use crate::server::console_log::ConsoleLog;
use crate::server::css_server;
use crate::server::html_shell;
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
    /// Server start time for uptime tracking.
    pub start_time: std::time::Instant,
    /// Whether SSR is enabled for page routes.
    pub enable_ssr: bool,
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
            let deps =
                crate::deps::scanner::scan_local_dependencies(&source, &file_path);
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

    // Dependency not found — report with actionable suggestion
    let specifier = path.strip_prefix("/@deps/").unwrap_or(path).to_string();
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
        .body(Body::from(format!("Dependency not found: {}", path)))
        .unwrap()
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

        if path.is_symlink() || (path.is_dir() && path.file_name().map_or(false, |n| n.to_string_lossy().starts_with('@'))) {
            // For scoped packages (@vertz, @floating-ui, etc.), check subdirectories
            if path.is_dir() && path.file_name().map_or(false, |n| n.to_string_lossy().starts_with('@')) {
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
                    if entry_name.starts_with(&bun_pkg_prefix) || entry_name.starts_with(&format!("{}@", bun_pkg_prefix)) {
                        // Check if this .bun entry has node_modules/<pkg>/ with our file
                        let candidate = entry.path().join("node_modules").join(pkg_name);
                        if subpath.is_empty() {
                            if candidate.is_dir() {
                                // Resolve via package.json
                                if let Some(resolved) = resolve::resolve_from_node_modules(pkg_name, &entry.path()) {
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
                                if let Some(resolved) = resolve::resolve_from_node_modules(pkg_name, &entry.path()) {
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
            start_time: std::time::Instant::now(),
            enable_ssr: false,
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
}
