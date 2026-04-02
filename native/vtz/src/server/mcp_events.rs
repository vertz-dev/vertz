use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, mpsc, watch, RwLock};

use crate::errors::categories::{DevError, ErrorCategory};

/// Event types pushed to LLM clients via `/__vertz_mcp/events`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event")]
pub enum McpEvent {
    /// Server status handshake (sent on connect + status changes).
    #[serde(rename = "server_status")]
    ServerStatus {
        timestamp: String,
        data: ServerStatusData,
    },

    /// Error state changed (new errors, cleared, category replaced).
    #[serde(rename = "error_update")]
    ErrorUpdate {
        timestamp: String,
        data: ErrorUpdateData,
    },

    /// File watcher detected a source file change.
    #[serde(rename = "file_change")]
    FileChange {
        timestamp: String,
        data: FileChangeData,
    },

    /// HMR sent an update to browser clients.
    #[serde(rename = "hmr_update")]
    HmrUpdate {
        timestamp: String,
        data: HmrUpdateData,
    },

    /// SSR module re-import completed.
    #[serde(rename = "ssr_refresh")]
    SsrRefresh {
        timestamp: String,
        data: SsrRefreshData,
    },

    /// Type checker diagnostics updated.
    #[serde(rename = "typecheck_update")]
    TypecheckUpdate {
        timestamp: String,
        data: TypecheckUpdateData,
    },

    /// Subscription filter acknowledgment.
    #[serde(rename = "subscribed")]
    Subscribed {
        timestamp: String,
        data: SubscribedData,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerStatusData {
    pub protocol_version: u32,
    pub status: String,
    pub uptime_secs: u64,
    pub port: u16,
    pub ssr_enabled: bool,
    pub typecheck_enabled: bool,
    pub mcp_event_clients: usize,
    pub active_error_count: usize,
    pub active_error_category: Option<ErrorCategory>,
    pub typecheck_error_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorUpdateData {
    pub errors: Vec<DevError>,
    pub category: Option<ErrorCategory>,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileChangeData {
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct HmrUpdateData {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modules: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub css_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hmr_timestamp: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SsrRefreshData {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TypecheckUpdateData {
    pub count: usize,
    pub errors: Vec<TypecheckError>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TypecheckError {
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubscribedData {
    pub active_filter: Vec<String>,
    pub unknown_events: Vec<String>,
}

/// Known event names for subscription filter validation.
const KNOWN_EVENTS: &[&str] = &[
    "error_update",
    "file_change",
    "hmr_update",
    "ssr_refresh",
    "typecheck_update",
    "server_status",
];

/// Message sent from client to server on the MCP events WebSocket.
#[derive(Debug, Deserialize)]
struct ClientMessage {
    subscribe: Vec<String>,
}

impl McpEvent {
    /// Get the event name string for subscription filtering.
    pub fn event_name(&self) -> &str {
        match self {
            McpEvent::ServerStatus { .. } => "server_status",
            McpEvent::ErrorUpdate { .. } => "error_update",
            McpEvent::FileChange { .. } => "file_change",
            McpEvent::HmrUpdate { .. } => "hmr_update",
            McpEvent::SsrRefresh { .. } => "ssr_refresh",
            McpEvent::TypecheckUpdate { .. } => "typecheck_update",
            McpEvent::Subscribed { .. } => "subscribed",
        }
    }

    /// Serialize the event to a JSON string.
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| r#"{"event":"error","data":{}}"#.to_string())
    }
}

/// Generate an ISO 8601 timestamp string.
pub fn iso_timestamp() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let millis = duration.subsec_millis();

    // Convert to date/time components
    // Simple implementation: days since epoch → year/month/day
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Compute year/month/day from days since 1970-01-01
    let (year, month, day) = days_to_ymd(days);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hours, minutes, seconds, millis
    )
}

/// Convert days since Unix epoch to (year, month, day).
fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    // Algorithm from http://howardhinnant.github.io/date_algorithms.html
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// Hub for broadcasting events to connected LLM WebSocket clients.
#[derive(Clone)]
pub struct McpEventHub {
    /// Broadcast channel for events (capacity: 128).
    broadcast_tx: broadcast::Sender<McpEvent>,
    /// Connected client count.
    client_count: Arc<RwLock<usize>>,
}

impl McpEventHub {
    pub fn new() -> Self {
        let (broadcast_tx, _) = broadcast::channel(128);
        Self {
            broadcast_tx,
            client_count: Arc::new(RwLock::new(0)),
        }
    }

    /// Broadcast an event to all connected LLM clients.
    pub fn broadcast(&self, event: McpEvent) {
        // Ignore send errors (no subscribers is fine)
        let _ = self.broadcast_tx.send(event);
    }

    /// Get the number of currently connected clients.
    pub async fn client_count(&self) -> usize {
        *self.client_count.read().await
    }

    /// Subscribe to broadcast events (for relays and testing).
    pub fn subscribe(&self) -> broadcast::Receiver<McpEvent> {
        self.broadcast_tx.subscribe()
    }

    /// Handle a new WebSocket connection for LLM event push.
    ///
    /// Sends `server_status` handshake, then forwards filtered events.
    /// Reads client messages for subscription filter updates.
    ///
    /// Architecture:
    /// - `watch` channel for filter state (read-task → write-task, lock-free)
    /// - `mpsc` channel for direct messages (read-task → write-task, e.g. subscription acks)
    /// - `broadcast` receiver for hub events (relay tasks → write-task)
    pub async fn handle_connection(
        &self,
        socket: WebSocket,
        server_status: McpEvent,
        error_snapshot: McpEvent,
    ) {
        let (mut ws_sender, mut ws_receiver) = socket.split();
        let mut broadcast_rx = self.broadcast_tx.subscribe();

        // Increment client count
        {
            let mut count = self.client_count.write().await;
            *count += 1;
        }

        let client_count = self.client_count.clone();

        // Send server_status handshake
        let status_json = server_status.to_json();
        if ws_sender.send(Message::Text(status_json)).await.is_err() {
            let mut count = client_count.write().await;
            *count = count.saturating_sub(1);
            return;
        }

        // Send current error state snapshot
        let error_json = error_snapshot.to_json();
        if ws_sender.send(Message::Text(error_json)).await.is_err() {
            let mut count = client_count.write().await;
            *count = count.saturating_sub(1);
            return;
        }

        // Filter state: watch channel (lock-free reads in write task)
        let (filter_tx, filter_rx) = watch::channel::<Option<HashSet<String>>>(None);

        // Direct message channel: for subscription acks sent only to this client
        let (direct_tx, mut direct_rx) = mpsc::channel::<McpEvent>(16);

        // Spawn write task: forward filtered broadcast events + direct messages
        let write_task = tokio::spawn(async move {
            let filter_rx = filter_rx;
            loop {
                tokio::select! {
                    result = broadcast_rx.recv() => {
                        match result {
                            Ok(event) => {
                                // Check subscription filter (lock-free borrow)
                                let should_send = {
                                    let f = filter_rx.borrow();
                                    match &*f {
                                        None => true,
                                        Some(set) => set.contains(event.event_name()),
                                    }
                                };

                                if should_send {
                                    let json = event.to_json();
                                    if ws_sender.send(Message::Text(json)).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            Err(broadcast::error::RecvError::Lagged(n)) => {
                                eprintln!("[MCP Events] Client lagged, {} messages dropped", n);
                                continue;
                            }
                            Err(broadcast::error::RecvError::Closed) => break,
                        }
                    }
                    Some(event) = direct_rx.recv() => {
                        // Direct message to this client only (e.g. subscription ack)
                        let json = event.to_json();
                        if ws_sender.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                    }
                }
            }
        });

        // Read task: handle subscription filters + detect disconnection
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                        let (active_filter, unknown_events) =
                            validate_subscription(&client_msg.subscribe);

                        // Update filter via watch channel (lock-free)
                        let filter_set: HashSet<String> = active_filter.iter().cloned().collect();
                        let _ = filter_tx.send(Some(filter_set));

                        // Send ack directly to this client only
                        let ack = McpEvent::Subscribed {
                            timestamp: iso_timestamp(),
                            data: SubscribedData {
                                active_filter,
                                unknown_events,
                            },
                        };
                        let _ = direct_tx.send(ack).await;
                    }
                }
                Ok(Message::Close(_)) => break,
                Err(_) => break,
                _ => {}
            }
        }

        // Client disconnected — clean up
        write_task.abort();
        {
            let mut count = client_count.write().await;
            *count = count.saturating_sub(1);
        }
    }
}

impl Default for McpEventHub {
    fn default() -> Self {
        Self::new()
    }
}

/// Build a `server_status` event from the current server state.
pub async fn build_server_status(state: &crate::server::module_server::DevServerState) -> McpEvent {
    let uptime = state.start_time.elapsed().as_secs();
    let current = state.error_broadcaster.current_state().await;
    let (active_error_count, active_error_category) = match &current {
        crate::errors::broadcaster::ErrorBroadcast::Error { category, errors } => {
            (errors.len(), Some(*category))
        }
        crate::errors::broadcaster::ErrorBroadcast::Clear => (0, None),
        crate::errors::broadcaster::ErrorBroadcast::Info { .. } => (0, None),
    };
    McpEvent::ServerStatus {
        timestamp: iso_timestamp(),
        data: ServerStatusData {
            protocol_version: 1,
            status: "ready".to_string(),
            uptime_secs: uptime,
            port: state.port,
            ssr_enabled: state.enable_ssr,
            typecheck_enabled: state.typecheck_enabled,
            mcp_event_clients: 0, // Will be incremented after connect
            active_error_count,
            active_error_category,
            typecheck_error_count: 0,
        },
    }
}

/// Build an `error_update` event from the current error broadcaster state.
pub async fn build_error_snapshot(
    broadcaster: &crate::errors::broadcaster::ErrorBroadcaster,
) -> McpEvent {
    let current = broadcaster.current_state().await;
    match current {
        crate::errors::broadcaster::ErrorBroadcast::Error { category, errors } => {
            let count = errors.len();
            McpEvent::ErrorUpdate {
                timestamp: iso_timestamp(),
                data: ErrorUpdateData {
                    errors,
                    category: Some(category),
                    count,
                },
            }
        }
        crate::errors::broadcaster::ErrorBroadcast::Clear
        | crate::errors::broadcaster::ErrorBroadcast::Info { .. } => McpEvent::ErrorUpdate {
            timestamp: iso_timestamp(),
            data: ErrorUpdateData {
                errors: vec![],
                category: None,
                count: 0,
            },
        },
    }
}

/// Convert an `ErrorBroadcast` JSON string to an `McpEvent::ErrorUpdate`.
pub fn error_broadcast_to_event(json: &str) -> Option<McpEvent> {
    let parsed: serde_json::Value = serde_json::from_str(json).ok()?;

    match parsed.get("type")?.as_str()? {
        "error" => {
            let category_str = parsed.get("category")?.as_str()?;
            let category = match category_str {
                "build" => Some(ErrorCategory::Build),
                "resolve" => Some(ErrorCategory::Resolve),
                "typecheck" => Some(ErrorCategory::TypeCheck),
                "ssr" => Some(ErrorCategory::Ssr),
                "runtime" => Some(ErrorCategory::Runtime),
                _ => None,
            };

            let errors: Vec<DevError> =
                serde_json::from_value(parsed.get("errors")?.clone()).ok()?;
            let count = errors.len();

            Some(McpEvent::ErrorUpdate {
                timestamp: iso_timestamp(),
                data: ErrorUpdateData {
                    errors,
                    category,
                    count,
                },
            })
        }
        "clear" => Some(McpEvent::ErrorUpdate {
            timestamp: iso_timestamp(),
            data: ErrorUpdateData {
                errors: vec![],
                category: None,
                count: 0,
            },
        }),
        _ => None,
    }
}

/// Convert an HMR message JSON string to an `McpEvent::HmrUpdate`.
///
/// Filters out `Connected` and `Navigate` messages (internal to browser clients).
pub fn hmr_message_to_event(json: &str) -> Option<McpEvent> {
    let parsed: serde_json::Value = serde_json::from_str(json).ok()?;

    match parsed.get("type")?.as_str()? {
        "update" => {
            let modules: Vec<String> = parsed
                .get("modules")?
                .as_array()?
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
            let timestamp = parsed.get("timestamp").and_then(|t| t.as_u64());

            Some(McpEvent::HmrUpdate {
                timestamp: iso_timestamp(),
                data: HmrUpdateData {
                    kind: "update".to_string(),
                    modules: Some(modules),
                    css_only: Some(false),
                    file: None,
                    reason: None,
                    hmr_timestamp: timestamp,
                },
            })
        }
        "full-reload" => {
            let reason = parsed
                .get("reason")
                .and_then(|r| r.as_str())
                .unwrap_or("unknown")
                .to_string();

            Some(McpEvent::HmrUpdate {
                timestamp: iso_timestamp(),
                data: HmrUpdateData {
                    kind: "full-reload".to_string(),
                    modules: None,
                    css_only: None,
                    file: None,
                    reason: Some(reason),
                    hmr_timestamp: None,
                },
            })
        }
        "css-update" => {
            let file = parsed.get("file")?.as_str()?.to_string();
            let timestamp = parsed.get("timestamp").and_then(|t| t.as_u64());

            Some(McpEvent::HmrUpdate {
                timestamp: iso_timestamp(),
                data: HmrUpdateData {
                    kind: "css-update".to_string(),
                    modules: None,
                    css_only: None,
                    file: Some(file),
                    reason: None,
                    hmr_timestamp: timestamp,
                },
            })
        }
        // Filter out "connected" and "navigate" — internal to browser clients
        _ => None,
    }
}

/// Start relay tasks that subscribe to existing broadcast channels
/// and forward events to the MCP event hub.
pub fn start_relay_tasks(
    hub: &McpEventHub,
    error_rx: &crate::errors::broadcaster::ErrorBroadcaster,
    hmr_rx: &crate::hmr::websocket::HmrHub,
) {
    // Error broadcaster relay
    let mut error_sub = error_rx.subscribe();
    let hub_clone = hub.clone();
    tokio::spawn(async move {
        loop {
            match error_sub.recv().await {
                Ok(json) => {
                    if let Some(event) = error_broadcast_to_event(&json) {
                        hub_clone.broadcast(event);
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    eprintln!("[MCP Events] Error relay lagged, {} messages dropped", n);
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // HMR hub relay
    let mut hmr_sub = hmr_rx.subscribe();
    let hub_clone = hub.clone();
    tokio::spawn(async move {
        loop {
            match hmr_sub.recv().await {
                Ok(json) => {
                    if let Some(event) = hmr_message_to_event(&json) {
                        hub_clone.broadcast(event);
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    eprintln!("[MCP Events] HMR relay lagged, {} messages dropped", n);
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });
}

/// Validate subscription filter event names.
/// Returns (known_events, unknown_events).
fn validate_subscription(requested: &[String]) -> (Vec<String>, Vec<String>) {
    let mut known = Vec::new();
    let mut unknown = Vec::new();

    for name in requested {
        if KNOWN_EVENTS.contains(&name.as_str()) {
            known.push(name.clone());
        } else {
            unknown.push(name.clone());
        }
    }

    (known, unknown)
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- McpEvent serialization tests ---

    #[test]
    fn test_server_status_serialization() {
        let event = McpEvent::ServerStatus {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: ServerStatusData {
                protocol_version: 1,
                status: "ready".to_string(),
                uptime_secs: 42,
                port: 3000,
                ssr_enabled: true,
                typecheck_enabled: false,
                mcp_event_clients: 1,
                active_error_count: 0,
                active_error_category: None,
                typecheck_error_count: 0,
            },
        };

        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["event"], "server_status");
        assert_eq!(parsed["data"]["protocol_version"], 1);
        assert_eq!(parsed["data"]["status"], "ready");
        assert_eq!(parsed["data"]["port"], 3000);
        assert_eq!(parsed["data"]["active_error_count"], 0);
        assert!(parsed["data"]["active_error_category"].is_null());
    }

    #[test]
    fn test_error_update_serialization() {
        let event = McpEvent::ErrorUpdate {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: ErrorUpdateData {
                errors: vec![DevError::build("Unexpected token").with_file("src/app.tsx")],
                category: Some(ErrorCategory::Build),
                count: 1,
            },
        };

        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["event"], "error_update");
        assert_eq!(parsed["data"]["category"], "build");
        assert_eq!(parsed["data"]["count"], 1);
        assert_eq!(parsed["data"]["errors"][0]["message"], "Unexpected token");
    }

    #[test]
    fn test_error_update_clear_serialization() {
        let event = McpEvent::ErrorUpdate {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: ErrorUpdateData {
                errors: vec![],
                category: None,
                count: 0,
            },
        };

        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["event"], "error_update");
        assert!(parsed["data"]["category"].is_null());
        assert_eq!(parsed["data"]["count"], 0);
        assert_eq!(parsed["data"]["errors"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn test_file_change_serialization() {
        let event = McpEvent::FileChange {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: FileChangeData {
                path: "src/app.tsx".to_string(),
                kind: "modify".to_string(),
            },
        };

        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["event"], "file_change");
        assert_eq!(parsed["data"]["path"], "src/app.tsx");
        assert_eq!(parsed["data"]["kind"], "modify");
    }

    #[test]
    fn test_hmr_update_module_serialization() {
        let event = McpEvent::HmrUpdate {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: HmrUpdateData {
                kind: "update".to_string(),
                modules: Some(vec!["src/app.tsx".to_string()]),
                css_only: Some(false),
                file: None,
                reason: None,
                hmr_timestamp: Some(1711612496789),
            },
        };

        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["event"], "hmr_update");
        assert_eq!(parsed["data"]["kind"], "update");
        assert_eq!(parsed["data"]["modules"][0], "src/app.tsx");
        assert_eq!(parsed["data"]["hmr_timestamp"], 1711612496789u64);
        // file and reason should be absent (skip_serializing_if)
        assert!(parsed["data"].get("file").is_none());
        assert!(parsed["data"].get("reason").is_none());
    }

    #[test]
    fn test_hmr_update_full_reload_serialization() {
        let event = McpEvent::HmrUpdate {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: HmrUpdateData {
                kind: "full-reload".to_string(),
                modules: None,
                css_only: None,
                file: None,
                reason: Some("Entry file changed".to_string()),
                hmr_timestamp: None,
            },
        };

        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["event"], "hmr_update");
        assert_eq!(parsed["data"]["kind"], "full-reload");
        assert_eq!(parsed["data"]["reason"], "Entry file changed");
        assert!(parsed["data"].get("modules").is_none());
    }

    #[test]
    fn test_hmr_update_css_serialization() {
        let event = McpEvent::HmrUpdate {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: HmrUpdateData {
                kind: "css-update".to_string(),
                modules: None,
                css_only: None,
                file: Some("src/styles.css".to_string()),
                reason: None,
                hmr_timestamp: Some(9999),
            },
        };

        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["event"], "hmr_update");
        assert_eq!(parsed["data"]["kind"], "css-update");
        assert_eq!(parsed["data"]["file"], "src/styles.css");
    }

    #[test]
    fn test_ssr_refresh_success_serialization() {
        let event = McpEvent::SsrRefresh {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: SsrRefreshData {
                success: true,
                duration_ms: Some(45.0),
                error: None,
            },
        };

        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["event"], "ssr_refresh");
        assert_eq!(parsed["data"]["success"], true);
        assert_eq!(parsed["data"]["duration_ms"], 45.0);
        assert!(parsed["data"].get("error").is_none());
    }

    #[test]
    fn test_ssr_refresh_failure_serialization() {
        let event = McpEvent::SsrRefresh {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: SsrRefreshData {
                success: false,
                duration_ms: None,
                error: Some("SyntaxError at line 42".to_string()),
            },
        };

        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["event"], "ssr_refresh");
        assert_eq!(parsed["data"]["success"], false);
        assert_eq!(parsed["data"]["error"], "SyntaxError at line 42");
    }

    #[test]
    fn test_typecheck_update_serialization() {
        let event = McpEvent::TypecheckUpdate {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: TypecheckUpdateData {
                count: 1,
                errors: vec![TypecheckError {
                    file: "src/app.tsx".to_string(),
                    line: 10,
                    column: 5,
                    message: "Type 'string' is not assignable to type 'number'".to_string(),
                }],
            },
        };

        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["event"], "typecheck_update");
        assert_eq!(parsed["data"]["count"], 1);
        assert_eq!(parsed["data"]["errors"][0]["line"], 10);
    }

    #[test]
    fn test_subscribed_serialization() {
        let event = McpEvent::Subscribed {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: SubscribedData {
                active_filter: vec!["error_update".to_string(), "file_change".to_string()],
                unknown_events: vec!["typo_event".to_string()],
            },
        };

        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["event"], "subscribed");
        assert_eq!(parsed["data"]["active_filter"][0], "error_update");
        assert_eq!(parsed["data"]["unknown_events"][0], "typo_event");
    }

    // --- event_name tests ---

    #[test]
    fn test_event_name_returns_correct_discriminant() {
        let status = McpEvent::ServerStatus {
            timestamp: String::new(),
            data: ServerStatusData {
                protocol_version: 1,
                status: "ready".to_string(),
                uptime_secs: 0,
                port: 3000,
                ssr_enabled: false,
                typecheck_enabled: false,
                mcp_event_clients: 0,
                active_error_count: 0,
                active_error_category: None,
                typecheck_error_count: 0,
            },
        };
        assert_eq!(status.event_name(), "server_status");

        let error = McpEvent::ErrorUpdate {
            timestamp: String::new(),
            data: ErrorUpdateData {
                errors: vec![],
                category: None,
                count: 0,
            },
        };
        assert_eq!(error.event_name(), "error_update");

        let file = McpEvent::FileChange {
            timestamp: String::new(),
            data: FileChangeData {
                path: String::new(),
                kind: String::new(),
            },
        };
        assert_eq!(file.event_name(), "file_change");

        let hmr = McpEvent::HmrUpdate {
            timestamp: String::new(),
            data: HmrUpdateData {
                kind: String::new(),
                modules: None,
                css_only: None,
                file: None,
                reason: None,
                hmr_timestamp: None,
            },
        };
        assert_eq!(hmr.event_name(), "hmr_update");

        let ssr = McpEvent::SsrRefresh {
            timestamp: String::new(),
            data: SsrRefreshData {
                success: true,
                duration_ms: None,
                error: None,
            },
        };
        assert_eq!(ssr.event_name(), "ssr_refresh");

        let tc = McpEvent::TypecheckUpdate {
            timestamp: String::new(),
            data: TypecheckUpdateData {
                count: 0,
                errors: vec![],
            },
        };
        assert_eq!(tc.event_name(), "typecheck_update");

        let sub = McpEvent::Subscribed {
            timestamp: String::new(),
            data: SubscribedData {
                active_filter: vec![],
                unknown_events: vec![],
            },
        };
        assert_eq!(sub.event_name(), "subscribed");
    }

    // --- iso_timestamp tests ---

    #[test]
    fn test_iso_timestamp_format() {
        let ts = iso_timestamp();
        // Format: YYYY-MM-DDThh:mm:ss.mmmZ
        assert!(ts.ends_with('Z'));
        assert_eq!(ts.len(), 24);
        assert_eq!(&ts[4..5], "-");
        assert_eq!(&ts[7..8], "-");
        assert_eq!(&ts[10..11], "T");
        assert_eq!(&ts[13..14], ":");
        assert_eq!(&ts[16..17], ":");
        assert_eq!(&ts[19..20], ".");
    }

    // --- validate_subscription tests ---

    #[test]
    fn test_validate_subscription_all_known() {
        let (known, unknown) =
            validate_subscription(&["error_update".to_string(), "file_change".to_string()]);
        assert_eq!(known, vec!["error_update", "file_change"]);
        assert!(unknown.is_empty());
    }

    #[test]
    fn test_validate_subscription_with_unknown() {
        let (known, unknown) =
            validate_subscription(&["error_update".to_string(), "typo_event".to_string()]);
        assert_eq!(known, vec!["error_update"]);
        assert_eq!(unknown, vec!["typo_event"]);
    }

    #[test]
    fn test_validate_subscription_empty() {
        let (known, unknown) = validate_subscription(&[]);
        assert!(known.is_empty());
        assert!(unknown.is_empty());
    }

    #[test]
    fn test_validate_subscription_all_unknown() {
        let (known, unknown) = validate_subscription(&["foo".to_string(), "bar".to_string()]);
        assert!(known.is_empty());
        assert_eq!(unknown, vec!["foo", "bar"]);
    }

    // --- McpEventHub tests ---

    #[tokio::test]
    async fn test_hub_creation() {
        let hub = McpEventHub::new();
        assert_eq!(hub.client_count().await, 0);
    }

    #[tokio::test]
    async fn test_hub_default() {
        let hub = McpEventHub::default();
        assert_eq!(hub.client_count().await, 0);
    }

    #[tokio::test]
    async fn test_hub_broadcast_with_no_clients() {
        let hub = McpEventHub::new();
        // Broadcasting with no clients should not panic
        hub.broadcast(McpEvent::FileChange {
            timestamp: iso_timestamp(),
            data: FileChangeData {
                path: "src/app.tsx".to_string(),
                kind: "modify".to_string(),
            },
        });
    }

    #[tokio::test]
    async fn test_hub_broadcast_received_by_subscriber() {
        let hub = McpEventHub::new();
        let mut rx = hub.subscribe();

        hub.broadcast(McpEvent::FileChange {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: FileChangeData {
                path: "src/app.tsx".to_string(),
                kind: "modify".to_string(),
            },
        });

        let event = rx.recv().await.unwrap();
        assert_eq!(event.event_name(), "file_change");
        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["data"]["path"], "src/app.tsx");
    }

    #[tokio::test]
    async fn test_hub_multiple_subscribers_receive_event() {
        let hub = McpEventHub::new();
        let mut rx1 = hub.subscribe();
        let mut rx2 = hub.subscribe();

        hub.broadcast(McpEvent::FileChange {
            timestamp: "2026-03-28T12:00:00.000Z".to_string(),
            data: FileChangeData {
                path: "src/app.tsx".to_string(),
                kind: "modify".to_string(),
            },
        });

        let e1 = rx1.recv().await.unwrap();
        let e2 = rx2.recv().await.unwrap();
        assert_eq!(e1.event_name(), "file_change");
        assert_eq!(e2.event_name(), "file_change");
    }

    #[tokio::test]
    async fn test_hub_broadcast_lag_handling() {
        // Create hub with default capacity (128)
        let hub = McpEventHub::new();
        let mut rx = hub.subscribe();

        // Send more than 128 messages to cause lag
        for i in 0..200 {
            hub.broadcast(McpEvent::FileChange {
                timestamp: iso_timestamp(),
                data: FileChangeData {
                    path: format!("src/file_{}.tsx", i),
                    kind: "modify".to_string(),
                },
            });
        }

        // The receiver should get a Lagged error for the first recv
        // then continue receiving
        let result = rx.recv().await;
        match result {
            Err(broadcast::error::RecvError::Lagged(n)) => {
                assert!(n > 0, "Should have lagged messages");
                // Can still receive after lag
                let next = rx.recv().await;
                assert!(next.is_ok(), "Should receive after lag");
            }
            Ok(_) => {
                // If we got a message, that's also fine — timing dependent
            }
            Err(broadcast::error::RecvError::Closed) => {
                panic!("Channel should not be closed");
            }
        }
    }

    // --- error_broadcast_to_event tests ---

    #[test]
    fn test_error_broadcast_to_event_error() {
        let json = r#"{"type":"error","category":"build","errors":[{"category":"build","message":"Unexpected token","file":"src/app.tsx","line":42,"column":10,"code_snippet":null,"suggestion":null}]}"#;
        let event = error_broadcast_to_event(json).unwrap();
        assert_eq!(event.event_name(), "error_update");
        let out = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["data"]["category"], "build");
        assert_eq!(parsed["data"]["count"], 1);
    }

    #[test]
    fn test_error_broadcast_to_event_clear() {
        let json = r#"{"type":"clear"}"#;
        let event = error_broadcast_to_event(json).unwrap();
        assert_eq!(event.event_name(), "error_update");
        let out = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(parsed["data"]["category"].is_null());
        assert_eq!(parsed["data"]["count"], 0);
    }

    #[test]
    fn test_error_broadcast_to_event_invalid_json() {
        assert!(error_broadcast_to_event("not json").is_none());
    }

    #[test]
    fn test_error_broadcast_to_event_unknown_type() {
        let json = r#"{"type":"unknown"}"#;
        assert!(error_broadcast_to_event(json).is_none());
    }

    // --- hmr_message_to_event tests ---

    #[test]
    fn test_hmr_message_to_event_update() {
        let json = r#"{"type":"update","modules":["/src/app.tsx"],"timestamp":12345}"#;
        let event = hmr_message_to_event(json).unwrap();
        assert_eq!(event.event_name(), "hmr_update");
        let out = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["data"]["kind"], "update");
        assert_eq!(parsed["data"]["modules"][0], "/src/app.tsx");
        assert_eq!(parsed["data"]["hmr_timestamp"], 12345);
    }

    #[test]
    fn test_hmr_message_to_event_full_reload() {
        let json = r#"{"type":"full-reload","reason":"entry file changed"}"#;
        let event = hmr_message_to_event(json).unwrap();
        let out = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["data"]["kind"], "full-reload");
        assert_eq!(parsed["data"]["reason"], "entry file changed");
    }

    #[test]
    fn test_hmr_message_to_event_css_update() {
        let json = r#"{"type":"css-update","file":"/src/styles.css","timestamp":9999}"#;
        let event = hmr_message_to_event(json).unwrap();
        let out = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["data"]["kind"], "css-update");
        assert_eq!(parsed["data"]["file"], "/src/styles.css");
        assert_eq!(parsed["data"]["hmr_timestamp"], 9999);
    }

    #[test]
    fn test_hmr_message_to_event_connected_filtered() {
        let json = r#"{"type":"connected"}"#;
        assert!(hmr_message_to_event(json).is_none());
    }

    #[test]
    fn test_hmr_message_to_event_navigate_filtered() {
        let json = r#"{"type":"navigate","to":"/tasks"}"#;
        assert!(hmr_message_to_event(json).is_none());
    }

    #[test]
    fn test_hmr_message_to_event_invalid_json() {
        assert!(hmr_message_to_event("not json").is_none());
    }

    // --- build_error_snapshot tests ---

    #[tokio::test]
    async fn test_build_error_snapshot_empty() {
        let broadcaster = crate::errors::broadcaster::ErrorBroadcaster::new();
        let event = build_error_snapshot(&broadcaster).await;
        assert_eq!(event.event_name(), "error_update");
        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed["data"]["category"].is_null());
        assert_eq!(parsed["data"]["count"], 0);
    }

    #[tokio::test]
    async fn test_build_error_snapshot_with_errors() {
        let broadcaster = crate::errors::broadcaster::ErrorBroadcaster::new();
        broadcaster
            .report_error(DevError::build("syntax error"))
            .await;
        let event = build_error_snapshot(&broadcaster).await;
        let json = event.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["data"]["category"], "build");
        assert_eq!(parsed["data"]["count"], 1);
    }

    // --- Relay integration test ---

    #[tokio::test]
    async fn test_error_relay_forwards_events() {
        let hub = McpEventHub::new();
        let broadcaster = crate::errors::broadcaster::ErrorBroadcaster::new();

        // Start relay
        start_relay_tasks(&hub, &broadcaster, &crate::hmr::websocket::HmrHub::new());

        // Subscribe to hub to receive relayed events
        let mut rx = hub.subscribe();

        // Report an error through the broadcaster
        broadcaster
            .report_error(DevError::build("test error"))
            .await;

        // The relay should forward it to the hub
        let result = tokio::time::timeout(std::time::Duration::from_millis(100), rx.recv()).await;
        assert!(result.is_ok(), "Should receive relayed error event");
        let event = result.unwrap().unwrap();
        assert_eq!(event.event_name(), "error_update");
    }

    #[tokio::test]
    async fn test_hmr_relay_forwards_events() {
        let hub = McpEventHub::new();
        let hmr_hub = crate::hmr::websocket::HmrHub::new();

        // Start relay
        start_relay_tasks(
            &hub,
            &crate::errors::broadcaster::ErrorBroadcaster::new(),
            &hmr_hub,
        );

        // Subscribe to MCP event hub
        let mut rx = hub.subscribe();

        // Broadcast HMR update
        hmr_hub
            .broadcast(crate::hmr::protocol::HmrMessage::Update {
                modules: vec!["/src/app.tsx".to_string()],
                timestamp: 12345,
            })
            .await;

        // The relay should forward it
        let result = tokio::time::timeout(std::time::Duration::from_millis(100), rx.recv()).await;
        assert!(result.is_ok(), "Should receive relayed HMR event");
        let event = result.unwrap().unwrap();
        assert_eq!(event.event_name(), "hmr_update");
    }

    #[tokio::test]
    async fn test_hmr_relay_filters_connected_messages() {
        let hub = McpEventHub::new();
        let hmr_hub = crate::hmr::websocket::HmrHub::new();

        start_relay_tasks(
            &hub,
            &crate::errors::broadcaster::ErrorBroadcaster::new(),
            &hmr_hub,
        );

        let mut rx = hub.subscribe();

        // Broadcast "connected" — should be filtered out
        hmr_hub
            .broadcast(crate::hmr::protocol::HmrMessage::Connected)
            .await;

        // Should NOT receive this
        let result = tokio::time::timeout(std::time::Duration::from_millis(100), rx.recv()).await;
        assert!(
            result.is_err(),
            "Should NOT receive 'connected' message (filtered)"
        );
    }
}
