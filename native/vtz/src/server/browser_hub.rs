//! Browser Interaction Hub — targeted WebSocket communication with browser tabs.
//!
//! Unlike `HmrHub` (broadcast to all clients) or `ErrorBroadcaster` (broadcast + request/response),
//! `BrowserInteractionHub` maintains per-tab connections with targeted message delivery.
//! This enables MCP tools to interact with specific browser tabs: clicking elements,
//! typing text, filling forms, and collecting page snapshots.
//!
//! ## Architecture
//!
//! - Each browser tab connects via `/__vertz_interact` WebSocket
//! - Tabs identify themselves with a stable ID (stored in `sessionStorage`)
//! - Agents create "control sessions" that bind to a specific tab
//! - Interaction messages are routed to the specific tab, not broadcast
//! - Responses are matched by `requestId` via oneshot channels

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, RwLock};

// ── Types ──────────────────────────────────────────────────────────

/// Information about a connected browser tab.
#[derive(Debug, Clone, Serialize)]
pub struct TabInfo {
    /// Stable tab ID (client-generated, persisted in sessionStorage).
    pub id: String,
    /// Current URL path of the tab.
    pub url: String,
    /// Page title.
    pub title: String,
    /// Whether an agent control session is active on this tab.
    pub controlled: bool,
    /// Session ID if controlled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

/// Message sent from the browser to identify a tab.
#[derive(Debug, Deserialize)]
struct TabInfoMessage {
    #[serde(rename = "tabId")]
    tab_id: String,
    url: String,
    title: String,
}

/// Message sent from the browser as a response to an interaction request.
#[derive(Debug, Deserialize)]
struct InteractResultMessage {
    #[serde(rename = "requestId")]
    request_id: String,
    ok: bool,
    #[serde(default)]
    snapshot: Option<serde_json::Value>,
    #[serde(default)]
    error: Option<String>,
}

/// Incoming WebSocket message from the browser.
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum BrowserMessage {
    #[serde(rename = "tab-info")]
    TabInfo(TabInfoMessage),
    #[serde(rename = "interact-result")]
    InteractResult(InteractResultMessage),
}

// ── Hub ────────────────────────────────────────────────────────────

/// Hub for managing browser tab connections and routing interaction messages.
#[derive(Clone)]
pub struct BrowserInteractionHub {
    /// Connected tabs: tab_id -> TabInfo
    tabs: Arc<RwLock<HashMap<String, TabInfo>>>,
    /// WebSocket senders: tab_id -> mpsc::Sender (for sending messages to specific tabs)
    tab_senders: Arc<RwLock<HashMap<String, mpsc::Sender<String>>>>,
    /// Active sessions: session_id -> tab_id
    sessions: Arc<RwLock<HashMap<String, String>>>,
    /// Pending interaction requests: request_id -> oneshot::Sender
    pending_requests: Arc<RwLock<HashMap<String, oneshot::Sender<serde_json::Value>>>>,
}

impl BrowserInteractionHub {
    pub fn new() -> Self {
        Self {
            tabs: Arc::new(RwLock::new(HashMap::new())),
            tab_senders: Arc::new(RwLock::new(HashMap::new())),
            sessions: Arc::new(RwLock::new(HashMap::new())),
            pending_requests: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// List all connected browser tabs.
    pub async fn list_tabs(&self) -> Vec<TabInfo> {
        let tabs = self.tabs.read().await;
        tabs.values().cloned().collect()
    }

    /// Get the number of connected tabs.
    pub async fn tab_count(&self) -> usize {
        self.tabs.read().await.len()
    }

    /// Handle a new WebSocket connection from a browser tab.
    ///
    /// The browser must send a `tab-info` message as its first message to identify itself.
    /// After that, the connection is bidirectional:
    /// - Server → Browser: interaction commands (click, type, snapshot, etc.)
    /// - Browser → Server: interaction results and tab-info updates
    pub async fn handle_connection(&self, socket: WebSocket) {
        let (mut ws_sender, mut ws_receiver) = socket.split();

        // Wait for the first message to identify the tab.
        let tab_id = match ws_receiver.next().await {
            Some(Ok(Message::Text(text))) => {
                match serde_json::from_str::<BrowserMessage>(&text) {
                    Ok(BrowserMessage::TabInfo(info)) => {
                        let tab = TabInfo {
                            id: info.tab_id.clone(),
                            url: info.url,
                            title: info.title,
                            controlled: false,
                            session_id: None,
                        };
                        self.tabs.write().await.insert(info.tab_id.clone(), tab);
                        info.tab_id
                    }
                    _ => return, // Not a tab-info message, reject
                }
            }
            _ => return, // Connection closed or error before identification
        };

        // Create an mpsc channel for sending messages to this tab.
        let (tx, mut rx) = mpsc::channel::<String>(64);
        self.tab_senders
            .write()
            .await
            .insert(tab_id.clone(), tx.clone());

        let tabs = self.tabs.clone();
        let tab_senders = self.tab_senders.clone();
        let sessions = self.sessions.clone();
        let pending_requests = self.pending_requests.clone();
        let tab_id_write = tab_id.clone();
        let tab_id_read = tab_id.clone();

        // Spawn write task: forward messages from the mpsc channel to the WebSocket.
        let write_task = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_sender.send(Message::Text(msg)).await.is_err() {
                    break;
                }
            }
        });

        // Read loop: parse incoming messages and route them.
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(browser_msg) = serde_json::from_str::<BrowserMessage>(&text) {
                        match browser_msg {
                            BrowserMessage::TabInfo(info) => {
                                // URL/title update
                                if let Some(tab) = tabs.write().await.get_mut(&tab_id_read) {
                                    tab.url = info.url;
                                    tab.title = info.title;
                                }
                            }
                            BrowserMessage::InteractResult(result) => {
                                // Route response to the pending request
                                if let Some(sender) =
                                    pending_requests.write().await.remove(&result.request_id)
                                {
                                    let response = if result.ok {
                                        serde_json::json!({
                                            "ok": true,
                                            "snapshot": result.snapshot,
                                        })
                                    } else {
                                        serde_json::json!({
                                            "ok": false,
                                            "error": result.error.unwrap_or_else(|| "Unknown error".to_string()),
                                        })
                                    };
                                    let _ = sender.send(response);
                                }
                            }
                        }
                    }
                }
                Ok(Message::Close(_)) => break,
                Err(_) => break,
                _ => {} // Ignore binary, ping, pong
            }
        }

        // Client disconnected — clean up.
        write_task.abort();
        tab_senders.write().await.remove(&tab_id_write);

        // Check if this tab had an active session.
        let session_to_remove = {
            let tabs_guard = tabs.read().await;
            tabs_guard
                .get(&tab_id_write)
                .and_then(|t| t.session_id.clone())
        };
        if let Some(sid) = session_to_remove {
            sessions.write().await.remove(&sid);
        }
        tabs.write().await.remove(&tab_id_write);
    }

    /// Send a message to a specific tab by tab ID.
    pub async fn send_to_tab(
        &self,
        tab_id: &str,
        message: serde_json::Value,
    ) -> Result<(), String> {
        let senders = self.tab_senders.read().await;
        let sender = senders
            .get(tab_id)
            .ok_or_else(|| format!("Tab '{}' is not connected.", tab_id))?;
        sender
            .send(serde_json::to_string(&message).unwrap_or_default())
            .await
            .map_err(|_| format!("Failed to send message to tab '{}'.", tab_id))
    }

    /// Register a pending request and wait for the browser's response.
    ///
    /// Returns the response JSON or a timeout error.
    pub async fn wait_for_response(
        &self,
        request_id: &str,
        timeout: Duration,
    ) -> Result<serde_json::Value, String> {
        let (tx, rx) = oneshot::channel();
        self.pending_requests
            .write()
            .await
            .insert(request_id.to_string(), tx);

        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(_)) => {
                // Sender dropped (tab disconnected)
                self.pending_requests.write().await.remove(request_id);
                Err("Browser tab disconnected before responding.".to_string())
            }
            Err(_) => {
                // Timeout
                self.pending_requests.write().await.remove(request_id);
                Err(format!(
                    "Browser did not respond within {}s. The tab may be frozen or disconnected.",
                    timeout.as_secs()
                ))
            }
        }
    }

    /// Create a control session for a specific tab.
    ///
    /// If `tab_id` is `None`, auto-connects to the only connected tab.
    pub async fn connect_session(&self, tab_id: Option<&str>) -> Result<(String, TabInfo), String> {
        let resolved_tab_id = match tab_id {
            Some(id) => id.to_string(),
            None => {
                let tabs = self.tabs.read().await;
                match tabs.len() {
                    0 => {
                        return Err(
                            "No browser tabs connected. Open the app in a browser first."
                                .to_string(),
                        )
                    }
                    1 => tabs.keys().next().unwrap().clone(),
                    n => {
                        return Err(format!(
                            "{} tabs connected. Specify tabId. Call vertz_browser_list_tabs to see them.",
                            n
                        ))
                    }
                }
            }
        };

        let mut tabs = self.tabs.write().await;
        let tab = tabs.get_mut(&resolved_tab_id).ok_or_else(|| {
            format!(
                "No browser tab with ID '{}'. Call vertz_browser_list_tabs to see connected tabs.",
                resolved_tab_id
            )
        })?;

        if tab.controlled {
            return Err(format!(
                "Tab '{}' is already controlled by session '{}'.",
                resolved_tab_id,
                tab.session_id.as_deref().unwrap_or("unknown")
            ));
        }

        // Generate session ID
        let session_id = format!("sess-{}", &uuid::Uuid::new_v4().to_string()[..8]);
        tab.controlled = true;
        tab.session_id = Some(session_id.clone());

        let tab_info = tab.clone();

        // Register session
        self.sessions
            .write()
            .await
            .insert(session_id.clone(), resolved_tab_id.clone());

        // Send control:connect to the tab
        let _ = self
            .send_to_tab(
                &resolved_tab_id,
                serde_json::json!({
                    "type": "control",
                    "action": "connect",
                    "sessionId": session_id,
                }),
            )
            .await;

        Ok((session_id, tab_info))
    }

    /// Release a control session.
    pub async fn disconnect_session(&self, session_id: &str) -> Result<bool, String> {
        let tab_id = self
            .sessions
            .write()
            .await
            .remove(session_id)
            .ok_or_else(|| {
                format!(
                    "Session '{}' not found. Call vertz_browser_connect first.",
                    session_id
                )
            })?;

        // Update tab info
        if let Some(tab) = self.tabs.write().await.get_mut(&tab_id) {
            tab.controlled = false;
            tab.session_id = None;
        }

        // Send control:disconnect to the tab
        let _ = self
            .send_to_tab(
                &tab_id,
                serde_json::json!({
                    "type": "control",
                    "action": "disconnect",
                }),
            )
            .await;

        Ok(true)
    }

    /// Resolve a session ID to a tab ID.
    ///
    /// If `session_id` is `None`, auto-resolves when exactly one session exists.
    pub async fn resolve_session(&self, session_id: Option<&str>) -> Result<String, String> {
        match session_id {
            Some(id) => {
                let sessions = self.sessions.read().await;
                sessions.get(id).cloned().ok_or_else(|| {
                    format!(
                        "Session '{}' not found. Call vertz_browser_connect first.",
                        id
                    )
                })
            }
            None => {
                let sessions = self.sessions.read().await;
                match sessions.len() {
                    0 => Err("No active sessions. Call vertz_browser_connect first.".to_string()),
                    1 => Ok(sessions.values().next().unwrap().clone()),
                    n => Err(format!("{} active sessions. Specify sessionId.", n)),
                }
            }
        }
    }
}

impl Default for BrowserInteractionHub {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_new_hub_has_no_tabs() {
        let hub = BrowserInteractionHub::new();
        assert_eq!(hub.tab_count().await, 0);
        assert!(hub.list_tabs().await.is_empty());
    }

    #[tokio::test]
    async fn test_connect_session_errors_when_no_tabs() {
        let hub = BrowserInteractionHub::new();
        let result = hub.connect_session(None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No browser tabs connected"));
    }

    #[tokio::test]
    async fn test_connect_session_errors_for_nonexistent_tab() {
        let hub = BrowserInteractionHub::new();
        let result = hub.connect_session(Some("nonexistent")).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No browser tab with ID"));
    }

    #[tokio::test]
    async fn test_disconnect_session_errors_for_unknown_session() {
        let hub = BrowserInteractionHub::new();
        let result = hub.disconnect_session("sess-unknown").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[tokio::test]
    async fn test_resolve_session_errors_when_no_sessions() {
        let hub = BrowserInteractionHub::new();
        let result = hub.resolve_session(None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No active sessions"));
    }

    #[tokio::test]
    async fn test_resolve_session_errors_for_unknown_session() {
        let hub = BrowserInteractionHub::new();
        let result = hub.resolve_session(Some("sess-unknown")).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[tokio::test]
    async fn test_send_to_tab_errors_for_unknown_tab() {
        let hub = BrowserInteractionHub::new();
        let result = hub
            .send_to_tab("unknown", serde_json::json!({"test": true}))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not connected"));
    }

    #[tokio::test]
    async fn test_wait_for_response_timeout() {
        let hub = BrowserInteractionHub::new();
        let result = hub
            .wait_for_response("req-1", Duration::from_millis(50))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("did not respond"));
    }

    #[tokio::test]
    async fn test_wait_for_response_receives_value() {
        let hub = BrowserInteractionHub::new();
        let request_id = "req-test-1";

        // Register request and spawn a task to send the response
        let pending = hub.pending_requests.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(10)).await;
            let sender = pending.write().await.remove(request_id);
            if let Some(tx) = sender {
                let _ = tx.send(serde_json::json!({"ok": true, "data": "hello"}));
            }
        });

        let result = hub
            .wait_for_response(request_id, Duration::from_secs(1))
            .await;
        assert!(result.is_ok());
        let val = result.unwrap();
        assert_eq!(val["ok"], true);
        assert_eq!(val["data"], "hello");
    }

    #[tokio::test]
    async fn test_connect_session_errors_multiple_tabs_no_id() {
        let hub = BrowserInteractionHub::new();

        // Manually insert two tabs
        {
            let mut tabs = hub.tabs.write().await;
            tabs.insert(
                "tab-1".to_string(),
                TabInfo {
                    id: "tab-1".to_string(),
                    url: "/".to_string(),
                    title: "Tab 1".to_string(),
                    controlled: false,
                    session_id: None,
                },
            );
            tabs.insert(
                "tab-2".to_string(),
                TabInfo {
                    id: "tab-2".to_string(),
                    url: "/about".to_string(),
                    title: "Tab 2".to_string(),
                    controlled: false,
                    session_id: None,
                },
            );
        }

        let result = hub.connect_session(None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("2 tabs connected"));
    }

    #[tokio::test]
    async fn test_connect_and_disconnect_session() {
        let hub = BrowserInteractionHub::new();

        // Manually insert a tab (simulating a WebSocket connection)
        {
            let mut tabs = hub.tabs.write().await;
            tabs.insert(
                "tab-1".to_string(),
                TabInfo {
                    id: "tab-1".to_string(),
                    url: "/tasks".to_string(),
                    title: "Tasks".to_string(),
                    controlled: false,
                    session_id: None,
                },
            );
            // Also need a sender for the tab to accept control messages
            let (tx, _rx) = mpsc::channel(64);
            hub.tab_senders
                .write()
                .await
                .insert("tab-1".to_string(), tx);
        }

        // Connect
        let (session_id, tab_info) = hub.connect_session(None).await.unwrap();
        assert!(session_id.starts_with("sess-"));
        assert_eq!(tab_info.id, "tab-1");
        assert!(tab_info.controlled);

        // Tab should now be marked as controlled
        let tabs = hub.list_tabs().await;
        assert!(tabs[0].controlled);
        assert_eq!(tabs[0].session_id.as_deref(), Some(session_id.as_str()));

        // Resolve session should work
        let resolved = hub.resolve_session(None).await.unwrap();
        assert_eq!(resolved, "tab-1");

        // Can't connect again
        let result = hub.connect_session(Some("tab-1")).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already controlled"));

        // Disconnect
        let released = hub.disconnect_session(&session_id).await.unwrap();
        assert!(released);

        // Tab should no longer be controlled
        let tabs = hub.list_tabs().await;
        assert!(!tabs[0].controlled);
        assert!(tabs[0].session_id.is_none());

        // No active sessions
        let result = hub.resolve_session(None).await;
        assert!(result.is_err());
    }
}
