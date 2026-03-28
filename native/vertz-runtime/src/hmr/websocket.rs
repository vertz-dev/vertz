use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

use super::protocol::HmrMessage;

/// HMR WebSocket hub that manages connected clients and broadcasts messages.
#[derive(Clone)]
pub struct HmrHub {
    /// Broadcast channel for sending messages to all clients.
    broadcast_tx: broadcast::Sender<String>,
    /// Track connected client count for diagnostics.
    client_count: Arc<RwLock<usize>>,
}

impl HmrHub {
    pub fn new() -> Self {
        let (broadcast_tx, _) = broadcast::channel(256);
        Self {
            broadcast_tx,
            client_count: Arc::new(RwLock::new(0)),
        }
    }

    /// Broadcast an HMR message to all connected clients.
    pub async fn broadcast(&self, message: HmrMessage) {
        let json = message.to_json();
        // Ignore send errors (no subscribers is fine)
        let _ = self.broadcast_tx.send(json);
    }

    /// Get the number of currently connected clients.
    pub async fn client_count(&self) -> usize {
        *self.client_count.read().await
    }

    /// Subscribe to broadcast messages (for testing and diagnostics).
    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.broadcast_tx.subscribe()
    }

    /// Handle a new WebSocket connection.
    ///
    /// Sends the "connected" message, then forwards broadcast messages
    /// to the client. Cleans up when the client disconnects.
    pub async fn handle_connection(&self, socket: WebSocket) {
        let (mut ws_sender, mut ws_receiver) = socket.split();
        let mut broadcast_rx = self.broadcast_tx.subscribe();

        // Increment client count
        {
            let mut count = self.client_count.write().await;
            *count += 1;
        }

        let client_count = self.client_count.clone();

        // Send connected message
        let connected_msg = HmrMessage::Connected.to_json();
        if ws_sender.send(Message::Text(connected_msg)).await.is_err() {
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

        // Read task: consume incoming messages (we don't expect any, but
        // we need to read to detect disconnection)
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Close(_)) => break,
                Err(_) => break,
                _ => {} // Ignore other messages
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

impl Default for HmrHub {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_hmr_hub_creation() {
        let hub = HmrHub::new();
        assert_eq!(hub.client_count().await, 0);
    }

    #[tokio::test]
    async fn test_broadcast_with_no_clients() {
        let hub = HmrHub::new();
        // Broadcasting with no clients should not panic
        hub.broadcast(HmrMessage::Connected).await;
    }

    #[tokio::test]
    async fn test_broadcast_message_serialization() {
        let hub = HmrHub::new();
        let mut rx = hub.subscribe();

        hub.broadcast(HmrMessage::Update {
            modules: vec!["/src/app.tsx".to_string()],
            timestamp: 123,
        })
        .await;

        let msg = rx.recv().await.unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["type"], "update");
        assert_eq!(parsed["modules"][0], "/src/app.tsx");
    }

    #[tokio::test]
    async fn test_hub_default() {
        let hub = HmrHub::default();
        assert_eq!(hub.client_count().await, 0);
    }
}
