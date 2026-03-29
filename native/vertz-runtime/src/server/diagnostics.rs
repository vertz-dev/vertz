use crate::errors::broadcaster::ErrorBroadcaster;
use crate::errors::categories::DevError;
use crate::hmr::websocket::HmrHub;
use crate::watcher::SharedModuleGraph;
use serde::Serialize;
use std::time::Instant;

/// Diagnostic snapshot of the dev server state.
#[derive(Debug, Clone, Serialize)]
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
pub async fn collect_diagnostics(
    start_time: Instant,
    cache_size: usize,
    module_graph: &SharedModuleGraph,
    hmr_hub: &HmrHub,
    error_broadcaster: &ErrorBroadcaster,
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

        let snap = collect_diagnostics(start, 0, &graph, &hmr_hub, &error_broadcaster).await;

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

        let snap = collect_diagnostics(start, 5, &graph, &hmr_hub, &error_broadcaster).await;

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

        let snap = collect_diagnostics(start, 0, &graph, &hmr_hub, &error_broadcaster).await;

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
        };

        let json = serde_json::to_string(&snap).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["uptime_secs"], 42);
        assert_eq!(parsed["cache"]["entries"], 10);
        assert_eq!(parsed["module_graph"]["node_count"], 5);
        assert_eq!(parsed["websocket"]["hmr_clients"], 2);
        assert_eq!(parsed["version"], "0.1.0");
    }
}
