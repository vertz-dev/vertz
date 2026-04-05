pub mod command;
pub mod events;
pub mod health;
pub mod tools;

use axum::http::{header, Method};
use axum::routing::{get, post};
use axum::Router;
use std::io;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::watch;
use tower_http::cors::{Any, CorsLayer};

use crate::server::module_server::DevServerState;

/// Configuration for the HTTP-to-WebSocket bridge.
pub struct BridgeConfig {
    /// Port to listen on for the bridge HTTP server.
    pub port: u16,
    /// Host to bind to (same as dev server host).
    pub host: String,
}

/// Build the bridge router with all endpoints.
pub fn build_bridge_router(state: Arc<DevServerState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE]);

    Router::new()
        .route("/health", get(health::health_handler))
        .route("/events", get(events::events_handler))
        .route("/command", post(command::command_handler))
        .route("/tools", get(tools::tools_handler))
        .layer(cors)
        .with_state(state)
}

/// Start the bridge HTTP server. Returns the JoinHandle for the server task.
///
/// The bridge shares `DevServerState` with the main dev server — no network
/// hops, no reconnection logic. It's an in-process axum server on a separate port.
///
/// The bridge participates in the same graceful shutdown as the main server
/// via `shutdown_rx`. When the watch channel fires, all SSE connections are
/// drained and the server stops accepting new connections.
pub async fn start_bridge(
    config: BridgeConfig,
    state: Arc<DevServerState>,
    mut shutdown_rx: watch::Receiver<()>,
) -> io::Result<tokio::task::JoinHandle<()>> {
    let addr = format!("{}:{}", config.host, config.port);
    let listener = TcpListener::bind(&addr).await?;
    let actual_port = listener.local_addr()?.port();

    let router = build_bridge_router(state);

    let handle = tokio::spawn(async move {
        let shutdown_future = async move {
            let _ = shutdown_rx.changed().await;
        };

        if let Err(e) = axum::serve(listener, router)
            .with_graceful_shutdown(shutdown_future)
            .await
        {
            eprintln!("[Bridge] Server error: {}", e);
        }
    });

    eprintln!("  Bridge \u{2192} http://{}:{}", config.host, actual_port);
    eprintln!("    GET  /events    SSE event stream");
    eprintln!("    GET  /tools     Available tool list");
    eprintln!("    GET  /health    Bridge health check");
    eprintln!("    POST /command   Tool invocation");

    Ok(handle)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::compiler::pipeline::CompilationPipeline;
    use crate::errors::broadcaster::ErrorBroadcaster;
    use crate::hmr::websocket::HmrHub;
    use crate::server::audit_log::AuditLog;
    use crate::server::mcp::McpSessions;
    use crate::server::mcp_events::McpEventHub;
    use crate::watcher;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    /// Create a test bridge router with minimal state.
    pub(crate) fn make_test_state() -> (Arc<DevServerState>, tempfile::TempDir) {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("src")).unwrap();
        std::fs::create_dir_all(tmp.path().join("public")).unwrap();

        let plugin: Arc<dyn crate::plugin::FrameworkPlugin> =
            Arc::new(crate::plugin::vertz::VertzPlugin);

        let pipeline = CompilationPipeline::new(
            tmp.path().to_path_buf(),
            tmp.path().join("src"),
            plugin.clone(),
        );

        let state = Arc::new(DevServerState {
            plugin,
            pipeline,
            root_dir: tmp.path().to_path_buf(),
            src_dir: tmp.path().join("src"),
            entry_file: tmp.path().join("src/entry-client.ts"),
            deps_dir: tmp.path().join(".vertz/deps"),
            theme_css: None,
            hmr_hub: HmrHub::new(),
            module_graph: watcher::new_shared_module_graph(),
            error_broadcaster: ErrorBroadcaster::new(),
            audit_log: AuditLog::default(),
            mcp_sessions: McpSessions::new(),
            mcp_event_hub: McpEventHub::new(),
            start_time: std::time::Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: Arc::new(std::sync::RwLock::new(None)),
            ssr_pool: None,
            api_proxy: None,
            auto_installer: None,
            last_file_change: Arc::new(std::sync::Mutex::new(None)),
        });

        (state, tmp)
    }

    async fn body_json(resp: axum::response::Response<Body>) -> serde_json::Value {
        let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
            .await
            .unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn test_health_returns_ok() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        let json = body_json(resp).await;
        assert_eq!(json["status"], "ok");
    }

    #[tokio::test]
    async fn test_health_includes_dev_server_port() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let json = body_json(resp).await;
        assert_eq!(json["dev_server_port"], 3000);
    }

    #[tokio::test]
    async fn test_health_includes_uptime() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let json = body_json(resp).await;
        assert!(json["uptime_secs"].is_number());
    }

    #[tokio::test]
    async fn test_health_includes_event_types() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let json = body_json(resp).await;
        let types = json["available_event_types"].as_array().unwrap();
        assert!(!types.is_empty());
        // Check that known event names are present
        let type_strings: Vec<&str> = types.iter().map(|v| v.as_str().unwrap()).collect();
        assert!(type_strings.contains(&"error_update"));
        assert!(type_strings.contains(&"file_change"));
        assert!(type_strings.contains(&"server_status"));
    }

    #[tokio::test]
    async fn test_cors_headers_present() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        let cors = resp
            .headers()
            .get("access-control-allow-origin")
            .unwrap()
            .to_str()
            .unwrap();
        assert_eq!(cors, "*");
    }

    #[tokio::test]
    async fn test_options_preflight() {
        let (state, _tmp) = make_test_state();
        let router = build_bridge_router(state);

        let resp = router
            .oneshot(
                Request::builder()
                    .method("OPTIONS")
                    .uri("/command")
                    .header("origin", "http://example.com")
                    .header("access-control-request-method", "POST")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        let allow_methods = resp
            .headers()
            .get("access-control-allow-methods")
            .unwrap()
            .to_str()
            .unwrap();
        assert!(
            allow_methods.contains("POST"),
            "expected POST in allow-methods: {}",
            allow_methods
        );
    }
}
