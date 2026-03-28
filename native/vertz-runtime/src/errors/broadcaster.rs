use super::categories::{DevError, ErrorCategory, ErrorState};
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

/// Message sent over the error broadcast channel.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum ErrorBroadcast {
    /// One or more errors occurred.
    #[serde(rename = "error")]
    Error {
        /// Error category for the highest-priority errors.
        category: ErrorCategory,
        /// Active errors to display.
        errors: Vec<DevError>,
    },
    /// All errors have been cleared.
    #[serde(rename = "clear")]
    Clear,
}

impl ErrorBroadcast {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| r#"{"type":"clear"}"#.to_string())
    }
}

/// WebSocket error broadcast hub.
///
/// Manages the error state and broadcasts error/clear messages
/// to all connected error overlay clients at `/__vertz_errors`.
#[derive(Clone)]
pub struct ErrorBroadcaster {
    /// Broadcast channel for sending error messages to clients.
    broadcast_tx: broadcast::Sender<String>,
    /// Current error state (shared across the server).
    state: Arc<RwLock<ErrorState>>,
    /// Connected client count.
    client_count: Arc<RwLock<usize>>,
}

impl ErrorBroadcaster {
    pub fn new() -> Self {
        let (broadcast_tx, _) = broadcast::channel(64);
        Self {
            broadcast_tx,
            state: Arc::new(RwLock::new(ErrorState::new())),
            client_count: Arc::new(RwLock::new(0)),
        }
    }

    /// Report an error. Broadcasts to clients if the error should be surfaced.
    pub async fn report_error(&self, error: DevError) {
        let should_surface = {
            let mut state = self.state.write().await;
            state.add(error)
        };

        if should_surface {
            self.broadcast_current_state().await;
        }
    }

    /// Clear all errors of a specific category. Broadcasts update to clients.
    pub async fn clear_category(&self, category: ErrorCategory) {
        let has_lower_errors = {
            let mut state = self.state.write().await;
            state.clear(category)
        };

        // Broadcast either the lower-priority errors or a clear message
        if has_lower_errors {
            let state = self.state.read().await;
            if state.has_errors() {
                self.broadcast_current_state().await;
            } else {
                self.broadcast_clear().await;
            }
        } else {
            // Still have higher-priority errors, no broadcast needed
        }
    }

    /// Clear errors for a specific file in a category. Broadcasts update.
    pub async fn clear_file(&self, category: ErrorCategory, file: &str) {
        {
            let mut state = self.state.write().await;
            state.clear_file(category, file);
        }
        self.broadcast_current_state_or_clear().await;
    }

    /// Get the current error state snapshot.
    pub async fn current_state(&self) -> ErrorBroadcast {
        let state = self.state.read().await;
        let active = state.active_errors();
        if active.is_empty() {
            ErrorBroadcast::Clear
        } else {
            let category = active[0].category;
            ErrorBroadcast::Error {
                category,
                errors: active.into_iter().cloned().collect(),
            }
        }
    }

    /// Check if there are any active errors.
    pub async fn has_errors(&self) -> bool {
        self.state.read().await.has_errors()
    }

    /// Get the number of connected error clients.
    pub async fn client_count(&self) -> usize {
        *self.client_count.read().await
    }

    /// Subscribe to broadcast messages (for testing).
    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.broadcast_tx.subscribe()
    }

    /// Handle a new WebSocket connection for the error overlay.
    ///
    /// Sends the current error state immediately, then forwards broadcasts.
    pub async fn handle_connection(&self, socket: WebSocket) {
        let (mut ws_sender, mut ws_receiver) = socket.split();
        let mut broadcast_rx = self.broadcast_tx.subscribe();

        // Increment client count
        {
            let mut count = self.client_count.write().await;
            *count += 1;
        }

        let client_count = self.client_count.clone();

        // Send current error state on connect
        let current = self.current_state().await;
        let current_json = current.to_json();
        if ws_sender.send(Message::Text(current_json)).await.is_err() {
            let mut count = client_count.write().await;
            *count = count.saturating_sub(1);
            return;
        }

        // Spawn write task: forward broadcast messages to this client
        let write_task = tokio::spawn(async move {
            while let Ok(msg) = broadcast_rx.recv().await {
                if ws_sender.send(Message::Text(msg)).await.is_err() {
                    break;
                }
            }
        });

        // Read task: detect disconnection
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Close(_)) => break,
                Err(_) => break,
                _ => {}
            }
        }

        // Client disconnected
        write_task.abort();
        {
            let mut count = client_count.write().await;
            *count = count.saturating_sub(1);
        }
    }

    /// Broadcast the current error state to all clients.
    async fn broadcast_current_state(&self) {
        let state = self.state.read().await;
        let active = state.active_errors();
        if active.is_empty() {
            return;
        }
        let category = active[0].category;
        let msg = ErrorBroadcast::Error {
            category,
            errors: active.into_iter().cloned().collect(),
        };
        let _ = self.broadcast_tx.send(msg.to_json());
    }

    /// Broadcast either current errors or a clear message.
    async fn broadcast_current_state_or_clear(&self) {
        let state = self.state.read().await;
        if state.has_errors() {
            let active = state.active_errors();
            if !active.is_empty() {
                let category = active[0].category;
                let msg = ErrorBroadcast::Error {
                    category,
                    errors: active.into_iter().cloned().collect(),
                };
                let _ = self.broadcast_tx.send(msg.to_json());
            }
        } else {
            let _ = self.broadcast_tx.send(ErrorBroadcast::Clear.to_json());
        }
    }

    /// Broadcast a clear message to all clients.
    async fn broadcast_clear(&self) {
        let _ = self.broadcast_tx.send(ErrorBroadcast::Clear.to_json());
    }
}

impl Default for ErrorBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_broadcast_serialization() {
        let msg = ErrorBroadcast::Error {
            category: ErrorCategory::Build,
            errors: vec![DevError::build("Unexpected token").with_file("/src/app.tsx")],
        };
        let json = msg.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["type"], "error");
        assert_eq!(parsed["category"], "build");
        assert_eq!(parsed["errors"][0]["message"], "Unexpected token");
    }

    #[test]
    fn test_clear_broadcast_serialization() {
        let msg = ErrorBroadcast::Clear;
        let json = msg.to_json();
        assert_eq!(json, r#"{"type":"clear"}"#);
    }

    #[tokio::test]
    async fn test_broadcaster_creation() {
        let broadcaster = ErrorBroadcaster::new();
        assert!(!broadcaster.has_errors().await);
        assert_eq!(broadcaster.client_count().await, 0);
    }

    #[tokio::test]
    async fn test_report_error_broadcasts() {
        let broadcaster = ErrorBroadcaster::new();
        let mut rx = broadcaster.subscribe();

        broadcaster
            .report_error(DevError::build("syntax error"))
            .await;

        let msg = rx.recv().await.unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["type"], "error");
        assert_eq!(parsed["category"], "build");
    }

    #[tokio::test]
    async fn test_clear_category_broadcasts_clear() {
        let broadcaster = ErrorBroadcaster::new();
        let mut rx = broadcaster.subscribe();

        broadcaster
            .report_error(DevError::build("syntax error"))
            .await;
        let _ = rx.recv().await; // consume the error broadcast

        broadcaster.clear_category(ErrorCategory::Build).await;

        let msg = rx.recv().await.unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["type"], "clear");
    }

    #[tokio::test]
    async fn test_suppressed_runtime_error_not_broadcast() {
        let broadcaster = ErrorBroadcaster::new();
        let mut rx = broadcaster.subscribe();

        // Add a build error first
        broadcaster
            .report_error(DevError::build("syntax error"))
            .await;
        let _ = rx.recv().await; // consume

        // Add a runtime error — should be suppressed, no broadcast
        broadcaster
            .report_error(DevError::runtime("runtime oops"))
            .await;

        // No new message should arrive
        let result = tokio::time::timeout(std::time::Duration::from_millis(50), rx.recv()).await;
        assert!(result.is_err(), "Runtime error should be suppressed");
    }

    #[tokio::test]
    async fn test_clear_build_surfaces_runtime() {
        let broadcaster = ErrorBroadcaster::new();
        let mut rx = broadcaster.subscribe();

        broadcaster
            .report_error(DevError::runtime("runtime oops"))
            .await;
        let _ = rx.recv().await; // consume runtime broadcast

        broadcaster
            .report_error(DevError::build("syntax error"))
            .await;
        let _ = rx.recv().await; // consume build broadcast

        // Clear build errors — runtime should now surface
        broadcaster.clear_category(ErrorCategory::Build).await;

        let msg = rx.recv().await.unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["type"], "error");
        assert_eq!(parsed["category"], "runtime");
    }

    #[tokio::test]
    async fn test_clear_file_specific() {
        let broadcaster = ErrorBroadcaster::new();
        let mut rx = broadcaster.subscribe();

        broadcaster
            .report_error(DevError::build("err a").with_file("/src/a.tsx"))
            .await;
        let _ = rx.recv().await;

        broadcaster
            .report_error(DevError::build("err b").with_file("/src/b.tsx"))
            .await;
        let _ = rx.recv().await;

        // Clear only file a
        broadcaster
            .clear_file(ErrorCategory::Build, "/src/a.tsx")
            .await;

        let msg = rx.recv().await.unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["errors"].as_array().unwrap().len(), 1);
        assert_eq!(parsed["errors"][0]["file"], "/src/b.tsx");
    }

    #[tokio::test]
    async fn test_current_state_with_no_errors() {
        let broadcaster = ErrorBroadcaster::new();
        let state = broadcaster.current_state().await;
        let json = state.to_json();
        assert_eq!(json, r#"{"type":"clear"}"#);
    }

    #[tokio::test]
    async fn test_current_state_with_errors() {
        let broadcaster = ErrorBroadcaster::new();
        broadcaster.report_error(DevError::build("err")).await;

        let state = broadcaster.current_state().await;
        match state {
            ErrorBroadcast::Error { category, errors } => {
                assert_eq!(category, ErrorCategory::Build);
                assert_eq!(errors.len(), 1);
            }
            ErrorBroadcast::Clear => panic!("Expected error state"),
        }
    }

    #[tokio::test]
    async fn test_multiple_clients_receive_broadcast() {
        let broadcaster = ErrorBroadcaster::new();
        let mut rx1 = broadcaster.subscribe();
        let mut rx2 = broadcaster.subscribe();

        broadcaster.report_error(DevError::build("err")).await;

        let msg1 = rx1.recv().await.unwrap();
        let msg2 = rx2.recv().await.unwrap();

        assert_eq!(msg1, msg2);
    }

    #[tokio::test]
    async fn test_broadcaster_default() {
        let broadcaster = ErrorBroadcaster::default();
        assert!(!broadcaster.has_errors().await);
    }
}
