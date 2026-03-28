use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Request, Response, StatusCode};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::compiler::pipeline::CompilationPipeline;
use crate::deps::prebundle;
use crate::errors::broadcaster::ErrorBroadcaster;
use crate::hmr::websocket::HmrHub;
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
    /// Server start time for uptime tracking.
    pub start_time: std::time::Instant,
    /// Whether SSR is enabled for page routes.
    pub enable_ssr: bool,
}

/// Handle requests for source files: `GET /src/**/*.tsx` → compiled JavaScript.
pub async fn handle_source_file(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> Response<Body> {
    let path = req.uri().path();

    // Map URL path to file system path
    let file_path = state.root_dir.join(path.trim_start_matches('/'));

    // Check if the file exists
    if !file_path.is_file() {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(format!("File not found: {}", path)))
            .unwrap();
    }

    // Check if this is a source map request
    if path.ends_with(".map") {
        return handle_source_map(&state, &file_path);
    }

    // Compile the file for browser consumption
    let result = state.pipeline.compile_for_browser(&file_path);

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
pub async fn handle_deps_request(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> Response<Body> {
    let path = req.uri().path();

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

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from(format!("Dependency not found: {}", path)))
        .unwrap()
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
}
