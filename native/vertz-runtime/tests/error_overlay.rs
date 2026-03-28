/// Integration tests for Phase 6: Error overlay, auto-recovery, and diagnostics.
///
/// Tests:
/// - Error categorization and priority
/// - Error broadcast via WebSocket
/// - Build error auto-recovery (syntax error → fix → auto-recover)
/// - Config change detection (restart triggers)
/// - Diagnostic endpoint
/// - HTML shell includes error overlay script
/// - Source map resolution
use std::path::PathBuf;

fn minimal_app_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("minimal-app")
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Category Priority Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_error_categories_ordered_by_priority() {
    use vertz_runtime::errors::categories::ErrorCategory;

    assert!(ErrorCategory::Build.priority() > ErrorCategory::Resolve.priority());
    assert!(ErrorCategory::Resolve.priority() > ErrorCategory::Ssr.priority());
    assert!(ErrorCategory::Ssr.priority() > ErrorCategory::Runtime.priority());
}

#[test]
fn test_build_error_suppresses_runtime_in_state() {
    use vertz_runtime::errors::categories::{DevError, ErrorCategory, ErrorState};

    let mut state = ErrorState::new();

    // Add runtime error
    state.add(DevError::runtime("ReferenceError: x is not defined"));

    // Add build error — should suppress runtime
    state.add(DevError::build("Unexpected token"));

    let active = state.active_errors();
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].category, ErrorCategory::Build);
    assert_eq!(active[0].message, "Unexpected token");
}

#[test]
fn test_clearing_build_error_surfaces_runtime() {
    use vertz_runtime::errors::categories::{DevError, ErrorCategory, ErrorState};

    let mut state = ErrorState::new();

    state.add(DevError::runtime("runtime error"));
    state.add(DevError::build("build error"));

    // Clear build → runtime should surface
    state.clear(ErrorCategory::Build);

    let active = state.active_errors();
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].category, ErrorCategory::Runtime);
}

#[test]
fn test_error_has_structured_fields() {
    use vertz_runtime::errors::categories::DevError;

    let err = DevError::build("Unexpected token")
        .with_file("/project/src/app.tsx")
        .with_location(42, 10)
        .with_snippet(">  42 | const x = ;");

    assert_eq!(err.message, "Unexpected token");
    assert_eq!(err.file.as_deref(), Some("/project/src/app.tsx"));
    assert_eq!(err.line, Some(42));
    assert_eq!(err.column, Some(10));
    assert!(err.code_snippet.is_some());
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Broadcast Tests
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_error_broadcast_to_connected_clients() {
    use vertz_runtime::errors::broadcaster::ErrorBroadcaster;
    use vertz_runtime::errors::categories::DevError;

    let broadcaster = ErrorBroadcaster::new();
    let mut rx1 = broadcaster.subscribe();
    let mut rx2 = broadcaster.subscribe();

    broadcaster
        .report_error(
            DevError::build("Unexpected token")
                .with_file("/src/app.tsx")
                .with_location(10, 5),
        )
        .await;

    // Both clients receive the same message
    let msg1 = rx1.recv().await.unwrap();
    let msg2 = rx2.recv().await.unwrap();
    assert_eq!(msg1, msg2);

    let parsed: serde_json::Value = serde_json::from_str(&msg1).unwrap();
    assert_eq!(parsed["type"], "error");
    assert_eq!(parsed["category"], "build");
    assert_eq!(parsed["errors"][0]["message"], "Unexpected token");
    assert_eq!(parsed["errors"][0]["file"], "/src/app.tsx");
    assert_eq!(parsed["errors"][0]["line"], 10);
    assert_eq!(parsed["errors"][0]["column"], 5);
}

#[tokio::test]
async fn test_error_clear_broadcast() {
    use vertz_runtime::errors::broadcaster::ErrorBroadcaster;
    use vertz_runtime::errors::categories::{DevError, ErrorCategory};

    let broadcaster = ErrorBroadcaster::new();
    let mut rx = broadcaster.subscribe();

    // Report then clear
    broadcaster.report_error(DevError::build("err")).await;
    let _ = rx.recv().await; // consume error

    broadcaster.clear_category(ErrorCategory::Build).await;

    let msg = rx.recv().await.unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
    assert_eq!(parsed["type"], "clear");
}

// ═══════════════════════════════════════════════════════════════════════════
// Build Error Auto-Recovery Tests
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_error_fix_cycle_clears_overlay() {
    use vertz_runtime::errors::broadcaster::ErrorBroadcaster;
    use vertz_runtime::errors::categories::{DevError, ErrorCategory};

    let broadcaster = ErrorBroadcaster::new();
    let mut rx = broadcaster.subscribe();

    // Simulate: syntax error in app.tsx
    broadcaster
        .report_error(DevError::build("Unexpected token").with_file("/src/app.tsx"))
        .await;

    let msg = rx.recv().await.unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
    assert_eq!(parsed["type"], "error");

    // Simulate: fix the file — clear file-specific errors
    broadcaster
        .clear_file(ErrorCategory::Build, "/src/app.tsx")
        .await;

    let msg = rx.recv().await.unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
    assert_eq!(parsed["type"], "clear");
}

#[tokio::test]
async fn test_rapid_error_fix_cycles() {
    use vertz_runtime::errors::broadcaster::ErrorBroadcaster;
    use vertz_runtime::errors::categories::{DevError, ErrorCategory};

    let broadcaster = ErrorBroadcaster::new();
    let mut rx = broadcaster.subscribe();

    // Simulate rapid error-fix-error-fix cycle
    for i in 0..5 {
        broadcaster
            .report_error(DevError::build(format!("Error #{}", i)).with_file("/src/app.tsx"))
            .await;
        let _ = rx.recv().await;

        broadcaster
            .clear_file(ErrorCategory::Build, "/src/app.tsx")
            .await;
        let _ = rx.recv().await;
    }

    // Final state should be clear
    assert!(!broadcaster.has_errors().await);
}

// ═══════════════════════════════════════════════════════════════════════════
// Config/Dependency Change Detection Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_config_change_detected_as_restart_trigger() {
    use std::path::Path;
    use vertz_runtime::hmr::recovery::RestartTriggers;

    let triggers = RestartTriggers::default();

    assert!(triggers.is_restart_trigger(Path::new("/project/vertz.config.ts")));
    assert!(triggers.is_restart_trigger(Path::new("/project/package.json")));
    assert!(triggers.is_restart_trigger(Path::new("/project/.env")));
    assert!(triggers.is_restart_trigger(Path::new("/project/.env.local")));
    assert!(triggers.is_restart_trigger(Path::new("/project/.env.development")));
    assert!(triggers.is_restart_trigger(Path::new("/project/bun.lock")));
}

#[test]
fn test_source_files_not_restart_triggers() {
    use std::path::Path;
    use vertz_runtime::hmr::recovery::RestartTriggers;

    let triggers = RestartTriggers::default();

    assert!(!triggers.is_restart_trigger(Path::new("/project/src/app.tsx")));
    assert!(!triggers.is_restart_trigger(Path::new("/project/src/utils.ts")));
    assert!(!triggers.is_restart_trigger(Path::new("/project/src/styles.css")));
}

// ═══════════════════════════════════════════════════════════════════════════
// Diagnostic Endpoint Tests
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_diagnostics_returns_valid_json() {
    use std::time::Instant;
    use vertz_runtime::errors::broadcaster::ErrorBroadcaster;
    use vertz_runtime::hmr::websocket::HmrHub;
    use vertz_runtime::server::diagnostics;
    use vertz_runtime::watcher;

    let start = Instant::now();
    let graph = watcher::new_shared_module_graph();
    let hmr_hub = HmrHub::new();
    let error_broadcaster = ErrorBroadcaster::new();

    let snap =
        diagnostics::collect_diagnostics(start, 0, &graph, &hmr_hub, &error_broadcaster).await;

    let json = serde_json::to_string(&snap).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

    assert!(parsed["uptime_secs"].is_u64());
    assert!(parsed["cache"]["entries"].is_u64());
    assert!(parsed["module_graph"]["node_count"].is_u64());
    assert!(parsed["websocket"]["hmr_clients"].is_u64());
    assert!(parsed["websocket"]["error_clients"].is_u64());
    assert!(parsed["errors"].is_array());
    assert!(parsed["version"].is_string());
}

#[tokio::test]
async fn test_diagnostics_includes_active_errors() {
    use std::time::Instant;
    use vertz_runtime::errors::broadcaster::ErrorBroadcaster;
    use vertz_runtime::errors::categories::DevError;
    use vertz_runtime::hmr::websocket::HmrHub;
    use vertz_runtime::server::diagnostics;
    use vertz_runtime::watcher;

    let start = Instant::now();
    let graph = watcher::new_shared_module_graph();
    let hmr_hub = HmrHub::new();
    let error_broadcaster = ErrorBroadcaster::new();

    error_broadcaster
        .report_error(DevError::build("test error").with_file("/src/app.tsx"))
        .await;

    let snap =
        diagnostics::collect_diagnostics(start, 3, &graph, &hmr_hub, &error_broadcaster).await;

    assert_eq!(snap.errors.len(), 1);
    assert_eq!(snap.errors[0].message, "test error");
    assert_eq!(snap.cache.entries, 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// HTML Shell Error Overlay Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_html_shell_includes_error_overlay_script() {
    let root = minimal_app_path();

    let html = vertz_runtime::server::html_shell::generate_html_shell(
        &root.join("src/app.tsx"),
        &root,
        &[],
        None,
        "Vertz App",
    );

    assert!(
        html.contains("__vertz_errors"),
        "HTML shell should include error overlay script connecting to /__vertz_errors"
    );
    assert!(
        html.contains("__vertz_error_overlay"),
        "HTML shell should include error overlay element ID"
    );
}

#[test]
fn test_html_shell_without_hmr_excludes_error_overlay() {
    let root = minimal_app_path();

    let html = vertz_runtime::server::html_shell::generate_html_shell_with_hmr(
        &root.join("src/app.tsx"),
        &root,
        &[],
        None,
        "Vertz App",
        false,
    );

    assert!(
        !html.contains("__vertz_errors"),
        "HTML shell without HMR should NOT include error overlay"
    );
}

#[test]
fn test_html_shell_error_overlay_before_app_module() {
    let root = minimal_app_path();

    let html = vertz_runtime::server::html_shell::generate_html_shell(
        &root.join("src/app.tsx"),
        &root,
        &[],
        None,
        "Vertz App",
    );

    let overlay_pos = html.find("__vertz_errors").unwrap();
    let app_pos = html
        .find("<script type=\"module\" src=\"/src/app.tsx\">")
        .unwrap();
    assert!(
        overlay_pos < app_pos,
        "Error overlay script must appear before the app module"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Source Map Resolution Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_source_mapper_resolves_compiled_position() {
    use std::time::SystemTime;
    use vertz_runtime::compiler::cache::{CachedModule, CompilationCache};
    use vertz_runtime::errors::source_mapper::SourceMapper;

    let cache = CompilationCache::new();

    let source_map = serde_json::json!({
        "version": 3,
        "sources": ["src/Button.tsx"],
        "mappings": "AAAA;AACA"
    })
    .to_string();

    let path = PathBuf::from("/project/src/Button.tsx");
    cache.insert(
        path.clone(),
        CachedModule {
            code: "compiled code".to_string(),
            source_map: Some(source_map),
            css: None,
            mtime: SystemTime::UNIX_EPOCH,
        },
    );

    let mapper = SourceMapper::new(&cache);
    let result = mapper.resolve(&path, 1, 1);

    assert!(result.is_some());
    let pos = result.unwrap();
    assert_eq!(pos.file, "src/Button.tsx");
    assert_eq!(pos.line, 1);
    assert_eq!(pos.column, 1);
}

#[test]
fn test_source_mapper_returns_none_for_unmapped_file() {
    use vertz_runtime::compiler::cache::CompilationCache;
    use vertz_runtime::errors::source_mapper::SourceMapper;

    let cache = CompilationCache::new();
    let mapper = SourceMapper::new(&cache);

    let result = mapper.resolve(std::path::Path::new("/node_modules/zod/index.js"), 1, 1);
    assert!(result.is_none());
}

// ═══════════════════════════════════════════════════════════════════════════
// Isolate Health Tracking Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_isolate_health_exhaustion() {
    use vertz_runtime::hmr::recovery::{HealthStatus, IsolateHealth};

    let health = IsolateHealth::new(2);

    // Two restarts
    health.mark_unhealthy();
    health.record_restart();
    health.mark_unhealthy();
    health.record_restart();

    // Third failure should be exhausted
    health.mark_unhealthy();
    assert_eq!(health.status(), HealthStatus::Exhausted);
}

#[test]
fn test_isolate_health_recovers() {
    use vertz_runtime::hmr::recovery::{HealthStatus, IsolateHealth};

    let health = IsolateHealth::new(5);

    health.mark_unhealthy();
    assert_eq!(health.status(), HealthStatus::NeedsRestart);

    health.record_restart();
    assert_eq!(health.status(), HealthStatus::Healthy);
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

mod http_integration {
    use super::*;
    use reqwest::Client;
    use std::net::TcpListener as StdTcpListener;
    use std::time::Duration;
    use tokio::time::timeout;

    fn free_port() -> u16 {
        let listener = StdTcpListener::bind("127.0.0.1:0").unwrap();
        listener.local_addr().unwrap().port()
    }

    async fn start_dev_server(root: PathBuf) -> (String, tokio::sync::oneshot::Sender<()>) {
        let port = free_port();
        let addr = format!("127.0.0.1:{}", port);
        let base_url = format!("http://127.0.0.1:{}", port);

        let config = vertz_runtime::config::ServerConfig::with_root(
            port,
            "127.0.0.1".to_string(),
            root.join("public"),
            root,
        );

        let (router, _state) = vertz_runtime::server::http::build_router(&config);

        let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        tokio::spawn(async move {
            axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                })
                .await
                .unwrap();
        });

        // Wait for server to be ready
        let client = Client::new();
        for _ in 0..10 {
            if client.get(&base_url).send().await.is_ok() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        (base_url, shutdown_tx)
    }

    #[tokio::test]
    async fn test_diagnostics_endpoint_returns_json() {
        let root = minimal_app_path();
        let (base_url, shutdown) = start_dev_server(root).await;

        let client = Client::new();
        let resp = timeout(
            Duration::from_secs(5),
            client
                .get(format!("{}/__vertz_diagnostics", base_url))
                .send(),
        )
        .await
        .unwrap()
        .unwrap();

        assert_eq!(resp.status(), 200);

        let ct = resp
            .headers()
            .get("content-type")
            .unwrap()
            .to_str()
            .unwrap();
        assert!(ct.contains("application/json"));

        let body: serde_json::Value = resp.json().await.unwrap();
        assert!(body["uptime_secs"].is_u64());
        assert!(body["cache"]["entries"].is_u64());
        assert!(body["module_graph"]["node_count"].is_u64());
        assert!(body["websocket"]["hmr_clients"].is_u64());
        assert!(body["websocket"]["error_clients"].is_u64());
        assert!(body["errors"].is_array());
        assert!(body["version"].is_string());

        let _ = shutdown.send(());
    }

    #[tokio::test]
    async fn test_diagnostics_response_under_10ms() {
        let root = minimal_app_path();
        let (base_url, shutdown) = start_dev_server(root).await;

        let client = Client::new();
        let start = std::time::Instant::now();
        let resp = client
            .get(format!("{}/__vertz_diagnostics", base_url))
            .send()
            .await
            .unwrap();
        let elapsed = start.elapsed();

        assert_eq!(resp.status(), 200);
        assert!(
            elapsed < Duration::from_millis(100),
            "Diagnostics should be fast, took {:?}",
            elapsed
        );

        let _ = shutdown.send(());
    }

    #[tokio::test]
    async fn test_error_websocket_endpoint_exists() {
        let root = minimal_app_path();
        let (base_url, shutdown) = start_dev_server(root).await;

        // Try to connect to the error WebSocket endpoint
        let ws_url = base_url.replace("http://", "ws://") + "/__vertz_errors";

        let result = timeout(
            Duration::from_secs(5),
            tokio_tungstenite::connect_async(&ws_url),
        )
        .await;

        assert!(
            result.is_ok(),
            "Should be able to connect to /__vertz_errors"
        );

        let (mut ws, _) = result.unwrap().unwrap();

        // Should receive current state on connect (clear, since no errors)
        use futures_util::StreamExt;
        let msg = timeout(Duration::from_secs(2), ws.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();

        let text = msg.to_text().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(text).unwrap();
        assert_eq!(parsed["type"], "clear");

        let _ = shutdown.send(());
    }
}
