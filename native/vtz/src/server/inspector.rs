//! V8 Inspector Protocol server for Chrome DevTools / VS Code debugging.
//!
//! Runs on a separate port (default 9229) and bridges CDP (Chrome DevTools Protocol)
//! messages between a WebSocket client and the V8 inspector in the PersistentIsolate.

use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use deno_core::{InspectorMsg, InspectorSessionProxy};
use futures::channel::mpsc::UnboundedSender;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{watch, Mutex};
use uuid::Uuid;

/// Information about the inspector for banner display and metadata.
#[derive(Debug, Clone)]
pub struct InspectorInfo {
    /// WebSocket URL (e.g., "ws://127.0.0.1:9229/<uuid>")
    pub ws_url: String,
    /// Whether --inspect-brk was used.
    pub inspect_brk: bool,
}

/// Shared state for the inspector server's axum routes.
#[derive(Clone)]
struct InspectorState {
    /// Unique target ID for this inspector.
    target_id: Uuid,
    /// Inspector port.
    port: u16,
    /// Dev server port (for source map URLs in metadata).
    /// Used in source-map URL construction (Task 5).
    #[allow(dead_code)]
    dev_port: u16,
    /// Watch receiver for the current session sender from the V8 isolate.
    session_sender_rx: watch::Receiver<Option<UnboundedSender<InspectorSessionProxy>>>,
    /// Currently active WebSocket session (only one allowed at a time).
    active_session: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
}

impl InspectorState {
    fn ws_url(&self) -> String {
        format!("ws://127.0.0.1:{}/{}", self.port, self.target_id)
    }

    fn devtools_url(&self) -> String {
        format!(
            "chrome-devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=127.0.0.1:{}/{}",
            self.port, self.target_id
        )
    }
}

/// Start the inspector server on the given port.
///
/// Returns the `InspectorInfo` with the WebSocket URL, or an error if binding fails.
pub async fn start_inspector_server(
    port: u16,
    dev_port: u16,
    session_sender_rx: watch::Receiver<Option<UnboundedSender<InspectorSessionProxy>>>,
) -> Result<InspectorInfo, std::io::Error> {
    let target_id = Uuid::new_v4();

    let state = InspectorState {
        target_id,
        port,
        dev_port,
        session_sender_rx,
        active_session: Arc::new(Mutex::new(None)),
    };

    let ws_url = state.ws_url();
    let inspect_brk = false; // Caller sets this on the returned InspectorInfo

    let router = Router::new()
        .route("/json/version", get(version_handler))
        .route("/json", get(list_handler))
        .route("/json/list", get(list_handler))
        .route(&format!("/{}", target_id), get(ws_handler))
        .with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await?;
    let actual_port = listener.local_addr()?.port();

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("[Inspector] Server error: {}", e);
        }
    });

    let info = InspectorInfo {
        ws_url: if actual_port != port {
            format!("ws://127.0.0.1:{}/{}", actual_port, target_id)
        } else {
            ws_url
        },
        inspect_brk,
    };

    Ok(info)
}

/// `GET /json/version` — CDP metadata about the runtime.
async fn version_handler(State(state): State<InspectorState>) -> axum::response::Response<Body> {
    let json = serde_json::json!({
        "Browser": "Vertz/0.1.0-dev (deno_core/0.311.0)",
        "Protocol-Version": "1.3",
        "webSocketDebuggerUrl": state.ws_url(),
    });

    axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .body(Body::from(serde_json::to_string_pretty(&json).unwrap()))
        .unwrap()
}

/// `GET /json` or `GET /json/list` — CDP target list.
async fn list_handler(State(state): State<InspectorState>) -> axum::response::Response<Body> {
    let json = serde_json::json!([
        {
            "description": "Vertz dev server",
            "devtoolsFrontendUrl": state.devtools_url(),
            "id": state.target_id.to_string(),
            "title": "Vertz Inspector",
            "type": "node",
            "webSocketDebuggerUrl": state.ws_url(),
        }
    ]);

    axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .body(Body::from(serde_json::to_string_pretty(&json).unwrap()))
        .unwrap()
}

/// WebSocket upgrade handler for CDP connections.
async fn ws_handler(
    State(state): State<InspectorState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_connection(state, socket))
}

/// Handle a CDP WebSocket connection.
///
/// Creates an `InspectorSessionProxy` and bridges messages between the WebSocket
/// and the V8 inspector via unbounded channels.
async fn handle_ws_connection(state: InspectorState, socket: WebSocket) {
    // Disconnect any existing session (single-session enforcement).
    {
        let mut active = state.active_session.lock().await;
        if let Some(cancel_tx) = active.take() {
            let _ = cancel_tx.send(());
        }
    }

    // Get the current session sender from the watch channel.
    let sender = {
        let rx = state.session_sender_rx.borrow();
        rx.clone()
    };

    let Some(sender) = sender else {
        eprintln!("[Inspector] No V8 isolate available — closing WebSocket");
        return;
    };

    // Create the bidirectional channel pair for the InspectorSessionProxy.
    // V8 → client: outbound_tx/outbound_rx (InspectorMsg)
    // client → V8: inbound_tx/inbound_rx (String)
    let (outbound_tx, mut outbound_rx) = futures::channel::mpsc::unbounded::<InspectorMsg>();
    let (inbound_tx, inbound_rx) = futures::channel::mpsc::unbounded::<String>();

    let proxy = InspectorSessionProxy {
        tx: outbound_tx,
        rx: inbound_rx,
    };

    // Send the proxy to the V8 inspector.
    if sender.unbounded_send(proxy).is_err() {
        eprintln!("[Inspector] Failed to register session with V8 inspector");
        return;
    }

    eprintln!("[Inspector] Debugger connected");

    // Set up cancellation for this session.
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut active = state.active_session.lock().await;
        *active = Some(cancel_tx);
    }

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Forward loop: WebSocket → V8
    // Uses unbounded_send (non-async, takes &self) to avoid needing &mut / Mutex.
    let forward_tx = inbound_tx.clone();
    let mut forward_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if forward_tx.unbounded_send(text).is_err() {
                        break;
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Backward loop: V8 → WebSocket
    let mut backward_task = tokio::spawn(async move {
        while let Some(msg) = outbound_rx.next().await {
            if ws_sender.send(Message::Text(msg.content)).await.is_err() {
                break;
            }
        }
    });

    // Wait for either direction to close, or cancellation (new session replacing this one).
    tokio::select! {
        _ = &mut forward_task => {}
        _ = &mut backward_task => {}
        _ = &mut cancel_rx => {
            eprintln!("[Inspector] Session replaced by new connection");
        }
    }

    // Abort surviving tasks so their channels are dropped and V8 sees the session close.
    forward_task.abort();
    backward_task.abort();
    // Drop our reference to inbound_tx — combined with forward_task abort (which drops
    // forward_tx), this closes the channel so V8 sees the session disconnect.
    drop(inbound_tx);

    eprintln!("[Inspector] Debugger disconnected");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ws_url_format() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let state = InspectorState {
            target_id: id,
            port: 9229,
            dev_port: 3000,
            session_sender_rx: watch::channel(None).1,
            active_session: Arc::new(Mutex::new(None)),
        };
        assert_eq!(
            state.ws_url(),
            "ws://127.0.0.1:9229/550e8400-e29b-41d4-a716-446655440000"
        );
    }

    #[test]
    fn test_devtools_url_format() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let state = InspectorState {
            target_id: id,
            port: 9229,
            dev_port: 3000,
            session_sender_rx: watch::channel(None).1,
            active_session: Arc::new(Mutex::new(None)),
        };
        assert!(state.devtools_url().contains("chrome-devtools://"));
        assert!(state
            .devtools_url()
            .contains("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[tokio::test]
    async fn test_version_endpoint_returns_valid_json() {
        let (_tx, rx) = watch::channel(None);
        let info = start_inspector_server(0, 3000, rx).await.unwrap();

        // Extract port from ws_url
        let url = info.ws_url.replace("ws://127.0.0.1:", "");
        let port: u16 = url.split('/').next().unwrap().parse().unwrap();

        let resp = reqwest::get(format!("http://127.0.0.1:{}/json/version", port))
            .await
            .unwrap();
        assert_eq!(resp.status(), 200);

        let json: serde_json::Value = resp.json().await.unwrap();
        assert!(json["Browser"].as_str().unwrap().contains("Vertz"));
        assert_eq!(json["Protocol-Version"], "1.3");
        assert!(json["webSocketDebuggerUrl"]
            .as_str()
            .unwrap()
            .starts_with("ws://127.0.0.1:"));
    }

    #[tokio::test]
    async fn test_list_endpoint_returns_target() {
        let (_tx, rx) = watch::channel(None);
        let info = start_inspector_server(0, 3000, rx).await.unwrap();

        let url = info.ws_url.replace("ws://127.0.0.1:", "");
        let port: u16 = url.split('/').next().unwrap().parse().unwrap();

        let resp = reqwest::get(format!("http://127.0.0.1:{}/json", port))
            .await
            .unwrap();
        assert_eq!(resp.status(), 200);

        let json: serde_json::Value = resp.json().await.unwrap();
        let targets = json.as_array().unwrap();
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0]["type"], "node");
        assert_eq!(targets[0]["title"], "Vertz Inspector");
        assert!(targets[0]["webSocketDebuggerUrl"]
            .as_str()
            .unwrap()
            .starts_with("ws://"));
    }
}
