use crate::errors::broadcaster::ErrorBroadcaster;
use crate::errors::categories::DevError;
use crate::hmr::websocket::HmrHub;
use crate::server::audit_log::{AuditLog, AuditSummary};
use crate::watcher::SharedModuleGraph;
use serde::Serialize;
use std::time::Instant;

/// Diagnostic snapshot of the dev server state.
#[derive(Debug, Serialize)]
pub struct DiagnosticsSnapshot {
    /// Server uptime in seconds.
    pub uptime_secs: u64,
    /// Compilation cache statistics.
    pub cache: CacheStats,
    /// Module graph statistics.
    pub module_graph: GraphStats,
    /// WebSocket client counts.
    pub websocket: WebSocketStats,
    /// Current active errors.
    pub errors: Vec<DevError>,
    /// Server version.
    pub version: String,
    /// Audit log summary statistics.
    pub audit_log: AuditSummary,
    /// SSR pool metrics (present when pool is active).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssr_pool: Option<SsrPoolDiagnostics>,
    /// Screenshot browser pool status (present once the pool has been
    /// lazy-initialized by a `vertz_browser_screenshot` call).
    #[serde(skip_serializing_if = "Option::is_none", rename = "screenshotPool")]
    pub screenshot_pool: Option<crate::server::screenshot::pool::PoolStatus>,
}

/// SSR pool diagnostics snapshot.
#[derive(Debug, Clone, Serialize)]
pub struct SsrPoolDiagnostics {
    pub status: String,
    pub pool_size: usize,
    pub native_signals: bool,
    pub active_requests: u64,
    pub queued_requests: u64,
    pub completed_requests: u64,
    pub avg_render_time_ms: f64,
    pub p99_render_time_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub isolate_memory_mb: Option<Vec<f64>>,
}

/// Compilation cache statistics.
#[derive(Debug, Clone, Serialize)]
pub struct CacheStats {
    /// Number of cached entries.
    pub entries: usize,
}

/// Module graph statistics.
#[derive(Debug, Clone, Serialize)]
pub struct GraphStats {
    /// Number of nodes (modules) in the graph.
    pub node_count: usize,
}

/// WebSocket connection statistics.
#[derive(Debug, Clone, Serialize)]
pub struct WebSocketStats {
    /// Number of connected HMR clients.
    pub hmr_clients: usize,
    /// Number of connected error overlay clients.
    pub error_clients: usize,
}

/// Collect a diagnostics snapshot from the server state.
// Legitimately 8 loosely-coupled inputs — grouping them into a struct
// would churn every caller (tests, MCP handler, HTTP handler) for no
// clarity win. The allow stays local to this one function.
#[allow(clippy::too_many_arguments)]
pub async fn collect_diagnostics(
    start_time: Instant,
    cache_size: usize,
    module_graph: &SharedModuleGraph,
    hmr_hub: &HmrHub,
    error_broadcaster: &ErrorBroadcaster,
    audit_log: &AuditLog,
    ssr_pool: Option<&crate::ssr::pool::SsrPool>,
    screenshot_pool: Option<crate::server::screenshot::pool::PoolStatus>,
) -> DiagnosticsSnapshot {
    let uptime = start_time.elapsed().as_secs();

    let graph_size = {
        let graph = module_graph.read().unwrap();
        graph.len()
    };

    let hmr_clients = hmr_hub.client_count().await;
    let error_clients = error_broadcaster.client_count().await;

    let errors: Vec<DevError> = {
        let state = error_broadcaster.current_state().await;
        match state {
            crate::errors::broadcaster::ErrorBroadcast::Error { errors, .. } => errors,
            crate::errors::broadcaster::ErrorBroadcast::Clear
            | crate::errors::broadcaster::ErrorBroadcast::Info { .. } => vec![],
        }
    };

    let pool_diag = ssr_pool.map(|pool| {
        use std::sync::atomic::Ordering;
        let metrics = pool.metrics();
        let pool_size = pool.pool_size() as u64;
        let max_concurrent = pool.config().max_concurrent_requests as u64;
        SsrPoolDiagnostics {
            status: metrics
                .status(pool_size, max_concurrent)
                .as_str()
                .to_string(),
            pool_size: pool.pool_size(),
            native_signals: false, // Phase 4.2 will set this to true
            active_requests: metrics.active_requests.load(Ordering::Relaxed),
            queued_requests: metrics.queued_requests.load(Ordering::Relaxed),
            completed_requests: metrics.completed_requests.load(Ordering::Relaxed),
            avg_render_time_ms: metrics.avg_render_time_ms(),
            p99_render_time_ms: metrics.p99_render_time_ms(),
            isolate_memory_mb: pool.isolate_memory_mb(),
        }
    });

    DiagnosticsSnapshot {
        uptime_secs: uptime,
        cache: CacheStats {
            entries: cache_size,
        },
        module_graph: GraphStats {
            node_count: graph_size,
        },
        websocket: WebSocketStats {
            hmr_clients,
            error_clients,
        },
        errors,
        version: env!("CARGO_PKG_VERSION").to_string(),
        audit_log: audit_log.summary(),
        ssr_pool: pool_diag,
        screenshot_pool,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::broadcaster::ErrorBroadcaster;
    use crate::hmr::websocket::HmrHub;
    use crate::watcher;

    #[tokio::test]
    async fn test_collect_diagnostics_empty_state() {
        let start = Instant::now();
        let graph = watcher::new_shared_module_graph();
        let hmr_hub = HmrHub::new();
        let error_broadcaster = ErrorBroadcaster::new();

        let snap = collect_diagnostics(
            start,
            0,
            &graph,
            &hmr_hub,
            &error_broadcaster,
            &AuditLog::default(),
            None,
            None,
        )
        .await;

        assert_eq!(snap.cache.entries, 0);
        assert_eq!(snap.module_graph.node_count, 0);
        assert_eq!(snap.websocket.hmr_clients, 0);
        assert_eq!(snap.websocket.error_clients, 0);
        assert!(snap.errors.is_empty());
        assert!(!snap.version.is_empty());
    }

    #[tokio::test]
    async fn test_collect_diagnostics_with_graph() {
        let start = Instant::now();
        let graph = watcher::new_shared_module_graph();

        // Add some modules
        {
            let mut g = graph.write().unwrap();
            g.update_module(
                std::path::Path::new("/src/app.tsx"),
                vec![std::path::PathBuf::from("/src/Button.tsx")],
            );
        }

        let hmr_hub = HmrHub::new();
        let error_broadcaster = ErrorBroadcaster::new();

        let snap = collect_diagnostics(
            start,
            5,
            &graph,
            &hmr_hub,
            &error_broadcaster,
            &AuditLog::default(),
            None,
            None,
        )
        .await;

        assert_eq!(snap.cache.entries, 5);
        assert_eq!(snap.module_graph.node_count, 2);
    }

    #[tokio::test]
    async fn test_collect_diagnostics_with_errors() {
        let start = Instant::now();
        let graph = watcher::new_shared_module_graph();
        let hmr_hub = HmrHub::new();
        let error_broadcaster = ErrorBroadcaster::new();

        error_broadcaster
            .report_error(crate::errors::categories::DevError::build("test error"))
            .await;

        let snap = collect_diagnostics(
            start,
            0,
            &graph,
            &hmr_hub,
            &error_broadcaster,
            &AuditLog::default(),
            None,
            None,
        )
        .await;

        assert_eq!(snap.errors.len(), 1);
        assert_eq!(snap.errors[0].message, "test error");
    }

    #[test]
    fn test_diagnostics_snapshot_serialization() {
        let snap = DiagnosticsSnapshot {
            uptime_secs: 42,
            cache: CacheStats { entries: 10 },
            module_graph: GraphStats { node_count: 5 },
            websocket: WebSocketStats {
                hmr_clients: 2,
                error_clients: 1,
            },
            errors: vec![],
            version: "0.1.0".to_string(),
            audit_log: AuditLog::default().summary(),
            ssr_pool: None,
            screenshot_pool: None,
        };

        let json = serde_json::to_string(&snap).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["uptime_secs"], 42);
        assert_eq!(parsed["cache"]["entries"], 10);
        assert_eq!(parsed["module_graph"]["node_count"], 5);
        assert_eq!(parsed["websocket"]["hmr_clients"], 2);
        assert_eq!(parsed["version"], "0.1.0");
        assert_eq!(parsed["audit_log"]["total_events"], 0);
        assert_eq!(parsed["audit_log"]["capacity"], 1000);
    }
}
