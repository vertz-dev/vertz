//! MCP (Model Context Protocol) server for the Vertz dev server.
//!
//! Implements both SSE and Streamable HTTP transports so that LLM tools
//! like Claude Code can connect directly and use dev server capabilities
//! as MCP tools.
//!
//! ## Transports
//!
//! **SSE (legacy):**
//! - `GET /__vertz_mcp/sse` → SSE stream, sends endpoint URL
//! - `POST /__vertz_mcp/message?sessionId=<id>` → JSON-RPC messages
//!
//! **Streamable HTTP (preferred):**
//! - `POST /__vertz_mcp` → JSON-RPC request/response
//!
//! ## Tools
//!
//! - `vertz_get_errors` — Current compilation/runtime errors
//! - `vertz_render_page` — SSR "text screenshot" of a URL
//! - `vertz_get_console` — Server diagnostic log entries
//! - `vertz_navigate` — Navigate the browser via HMR WebSocket
//! - `vertz_get_diagnostics` — Server health snapshot
//! - `vertz_get_events_url` — WebSocket URL for real-time LLM event push

use crate::server::console_log::LogLevel;
use crate::server::module_server::DevServerState;
use axum::body::{Body, Bytes};
use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use futures_util::stream::unfold;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

const MCP_PROTOCOL_VERSION: &str = "2024-11-05";
const SERVER_NAME: &str = "vertz-dev-server";
const SERVER_VERSION: &str = "0.1.0";

// ── Session Management ──────────────────────────────────────────────

/// Shared MCP session store — maps session IDs to SSE event senders.
///
/// Used by the SSE transport to route JSON-RPC responses back to the
/// correct client SSE stream.
#[derive(Clone)]
pub struct McpSessions {
    inner: Arc<RwLock<HashMap<String, mpsc::Sender<String>>>>,
}

impl McpSessions {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn insert(&self, id: String, tx: mpsc::Sender<String>) {
        self.inner.write().await.insert(id, tx);
    }

    async fn remove(&self, id: &str) {
        self.inner.write().await.remove(id);
    }

    async fn send(&self, id: &str, msg: String) -> bool {
        if let Some(tx) = self.inner.read().await.get(id) {
            tx.send(msg).await.is_ok()
        } else {
            false
        }
    }

    #[cfg(test)]
    async fn len(&self) -> usize {
        self.inner.read().await.len()
    }
}

impl Default for McpSessions {
    fn default() -> Self {
        Self::new()
    }
}

// ── JSON-RPC Types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    id: Option<serde_json::Value>,
    method: String,
    #[serde(default)]
    params: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, PartialEq)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize, PartialEq)]
struct JsonRpcError {
    code: i64,
    message: String,
}

impl JsonRpcResponse {
    fn success(id: serde_json::Value, result: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    fn error(id: serde_json::Value, code: i64, message: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code,
                message: message.into(),
            }),
        }
    }
}

// ── Tool Definitions ────────────────────────────────────────────────

fn tool_definitions() -> serde_json::Value {
    serde_json::json!({
        "tools": [
            {
                "name": "vertz_get_errors",
                "description": "Get current compilation and runtime errors from the Vertz dev server. Returns structured error objects with file paths, line numbers, code snippets, and fix suggestions.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "vertz_render_page",
                "description": "Server-side render a page URL and return the HTML output. Provides a 'text screenshot' of the page without needing a browser. Includes render timing and SSR status in metadata.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "The URL path to render, e.g. '/' or '/tasks/123'"
                        }
                    },
                    "required": ["url"]
                }
            },
            {
                "name": "vertz_get_console",
                "description": "Get recent console log entries from the dev server, including compilation events, SSR render times, file watcher events, and diagnostic messages.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "last": {
                            "type": "number",
                            "description": "Number of recent entries to return (default: 50)"
                        }
                    },
                    "required": []
                }
            },
            {
                "name": "vertz_navigate",
                "description": "Navigate the browser to a URL path via HMR WebSocket. Triggers client-side routing without a full page reload.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "to": {
                            "type": "string",
                            "description": "The URL path to navigate to, e.g. '/tasks' or '/settings'"
                        }
                    },
                    "required": ["to"]
                }
            },
            {
                "name": "vertz_get_diagnostics",
                "description": "Get a health/status snapshot of the dev server including uptime, compilation cache stats, module graph size, connected HMR clients, and current errors.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "vertz_get_events_url",
                "description": "Get the WebSocket URL for real-time LLM event push notifications. Connect to the returned URL to receive file changes, error updates, HMR updates, and other server events in real-time instead of polling.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        ]
    })
}

// ── Tool Execution ──────────────────────────────────────────────────

async fn execute_tool(
    state: &Arc<DevServerState>,
    name: &str,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    match name {
        "vertz_get_errors" => {
            let errors = state.error_broadcaster.all_errors_cloned().await;
            let text = serde_json::to_string_pretty(&serde_json::json!({
                "errors": errors,
                "count": errors.len(),
            }))
            .unwrap_or_default();

            Ok(serde_json::json!({
                "content": [{ "type": "text", "text": text }]
            }))
        }

        "vertz_render_page" => {
            let url = args
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("/")
                .to_string();

            if !state.enable_ssr {
                return Ok(serde_json::json!({
                    "content": [{
                        "type": "text",
                        "text": "SSR is not enabled on this dev server."
                    }],
                    "isError": true
                }));
            }

            let ssr_options = crate::ssr::render::SsrOptions {
                root_dir: state.root_dir.clone(),
                entry_file: state.entry_file.clone(),
                url: url.clone(),
                title: "Vertz App".to_string(),
                theme_css: state.theme_css.clone(),
                session: crate::ssr::session::SsrSession::default(),
                preload_hints: vec![],
                enable_hmr: false,
            };

            let result = crate::ssr::render::render_to_html(&ssr_options).await;

            state.console_log.push(
                LogLevel::Info,
                format!(
                    "MCP render: {} ({:.1}ms, {})",
                    url,
                    result.render_time_ms,
                    if result.is_ssr { "ssr" } else { "client-only" }
                ),
                Some("mcp"),
            );

            Ok(serde_json::json!({
                "content": [{ "type": "text", "text": result.html }],
                "_meta": {
                    "url": url,
                    "renderTimeMs": result.render_time_ms,
                    "isSsr": result.is_ssr,
                    "error": result.error,
                }
            }))
        }

        "vertz_get_console" => {
            let last_n = args.get("last").and_then(|v| v.as_u64()).unwrap_or(50) as usize;

            let entries = state.console_log.last_n(last_n);
            let text = serde_json::to_string_pretty(&serde_json::json!({
                "entries": entries,
                "count": entries.len(),
                "total": state.console_log.len(),
            }))
            .unwrap_or_default();

            Ok(serde_json::json!({
                "content": [{ "type": "text", "text": text }]
            }))
        }

        "vertz_navigate" => {
            let to = args
                .get("to")
                .and_then(|v| v.as_str())
                .ok_or("Missing required parameter 'to'")?
                .to_string();

            state
                .hmr_hub
                .broadcast(crate::hmr::protocol::HmrMessage::Navigate { to: to.clone() })
                .await;

            state
                .console_log
                .push(LogLevel::Info, format!("MCP navigate: {}", to), Some("mcp"));

            Ok(serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": format!("Navigated browser to {}", to)
                }]
            }))
        }

        "vertz_get_diagnostics" => {
            let snap = crate::server::diagnostics::collect_diagnostics(
                state.start_time,
                state.pipeline.cache().len(),
                &state.module_graph,
                &state.hmr_hub,
                &state.error_broadcaster,
            )
            .await;

            let text = serde_json::to_string_pretty(&snap).unwrap_or_default();

            Ok(serde_json::json!({
                "content": [{ "type": "text", "text": text }]
            }))
        }

        "vertz_get_events_url" => {
            let url = format!("ws://localhost:{}/__vertz_mcp/events", state.port);
            let events = vec![
                "error_update",
                "file_change",
                "hmr_update",
                "ssr_refresh",
                "typecheck_update",
                "server_status",
            ];
            let text = serde_json::to_string_pretty(&serde_json::json!({
                "url": url,
                "events": events,
            }))
            .unwrap_or_default();

            Ok(serde_json::json!({
                "content": [{ "type": "text", "text": text }]
            }))
        }

        _ => Err(format!("Unknown tool: {}", name)),
    }
}

// ── MCP Protocol Handler ────────────────────────────────────────────

async fn handle_mcp_message(
    state: &Arc<DevServerState>,
    req: JsonRpcRequest,
) -> Option<JsonRpcResponse> {
    let id = req.id.clone().unwrap_or(serde_json::Value::Null);
    let is_notification = req.id.is_none();

    let response = match req.method.as_str() {
        "initialize" => JsonRpcResponse::success(
            id,
            serde_json::json!({
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": SERVER_NAME,
                    "version": SERVER_VERSION,
                }
            }),
        ),

        "notifications/initialized" => return None,

        "ping" => JsonRpcResponse::success(id, serde_json::json!({})),

        "tools/list" => JsonRpcResponse::success(id, tool_definitions()),

        "tools/call" => {
            let params = req.params.unwrap_or(serde_json::json!({}));
            let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let args = params
                .get("arguments")
                .cloned()
                .unwrap_or(serde_json::json!({}));

            match execute_tool(state, tool_name, &args).await {
                Ok(result) => JsonRpcResponse::success(id, result),
                Err(e) => JsonRpcResponse::error(id, -32603, e),
            }
        }

        "resources/list" => JsonRpcResponse::success(id, serde_json::json!({ "resources": [] })),

        "prompts/list" => JsonRpcResponse::success(id, serde_json::json!({ "prompts": [] })),

        _ => JsonRpcResponse::error(id, -32601, format!("Method not found: {}", req.method)),
    };

    if is_notification {
        None
    } else {
        Some(response)
    }
}

// ── HTTP Handlers ───────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SessionQuery {
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
}

/// SSE stream state for `unfold`.
struct SseState {
    /// The endpoint URL to send as the first event (None after sent).
    endpoint_url: Option<String>,
    /// Channel receiver for JSON-RPC responses.
    rx: mpsc::Receiver<String>,
    /// Session ID for cleanup on stream end.
    session_id: String,
    /// Session store reference for cleanup.
    sessions: McpSessions,
}

/// SSE endpoint: `GET /__vertz_mcp/sse`
///
/// Opens an SSE stream for the MCP SSE transport. Sends the message
/// endpoint URL as the first event, then forwards JSON-RPC responses.
pub async fn mcp_sse_handler(
    State(state): State<Arc<DevServerState>>,
) -> Sse<impl futures_util::stream::Stream<Item = Result<Event, Infallible>>> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::channel::<String>(64);

    state.mcp_sessions.insert(session_id.clone(), tx).await;

    let endpoint_url = format!("/__vertz_mcp/message?sessionId={}", session_id);

    eprintln!("[MCP] SSE client connected (session: {})", &session_id[..8]);

    let stream = unfold(
        SseState {
            endpoint_url: Some(endpoint_url),
            rx,
            session_id,
            sessions: state.mcp_sessions.clone(),
        },
        |mut s| async move {
            if let Some(url) = s.endpoint_url.take() {
                let event = Event::default().event("endpoint").data(url);
                Some((Ok::<Event, Infallible>(event), s))
            } else {
                match s.rx.recv().await {
                    Some(msg) => {
                        let event = Event::default().event("message").data(msg);
                        Some((Ok(event), s))
                    }
                    None => {
                        // Channel closed — clean up session
                        s.sessions.remove(&s.session_id).await;
                        eprintln!(
                            "[MCP] SSE client disconnected (session: {})",
                            &s.session_id[..8]
                        );
                        None
                    }
                }
            }
        },
    );

    Sse::new(stream).keep_alive(KeepAlive::new().interval(std::time::Duration::from_secs(15)))
}

/// Message endpoint: `POST /__vertz_mcp/message?sessionId=<id>`
///
/// Receives JSON-RPC requests for the SSE transport and sends
/// responses via the corresponding SSE stream.
pub async fn mcp_message_handler(
    State(state): State<Arc<DevServerState>>,
    Query(query): Query<SessionQuery>,
    body: Bytes,
) -> axum::response::Response<Body> {
    let session_id = match query.session_id {
        Some(id) => id,
        None => {
            return axum::response::Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    r#"{"error":"Missing sessionId query parameter"}"#,
                ))
                .unwrap();
        }
    };

    let req: JsonRpcRequest = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => {
            let error_response = JsonRpcResponse::error(
                serde_json::Value::Null,
                -32700,
                format!("Parse error: {}", e),
            );
            let msg = serde_json::to_string(&error_response).unwrap_or_default();
            // Try to send error via SSE; if session is gone, ignore
            state.mcp_sessions.send(&session_id, msg).await;
            return axum::response::Response::builder()
                .status(StatusCode::ACCEPTED)
                .body(Body::empty())
                .unwrap();
        }
    };

    if let Some(response) = handle_mcp_message(&state, req).await {
        let msg = serde_json::to_string(&response).unwrap_or_default();
        let sent = state.mcp_sessions.send(&session_id, msg).await;
        if !sent {
            // Session no longer active — clean it up
            state.mcp_sessions.remove(&session_id).await;
        }
    }

    axum::response::Response::builder()
        .status(StatusCode::ACCEPTED)
        .body(Body::empty())
        .unwrap()
}

/// Streamable HTTP endpoint: `POST /__vertz_mcp`
///
/// Simpler transport — JSON-RPC request in, JSON-RPC response out.
/// No SSE session management needed.
pub async fn mcp_streamable_handler(
    State(state): State<Arc<DevServerState>>,
    body: Bytes,
) -> axum::response::Response<Body> {
    let req: JsonRpcRequest = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => {
            let error_response = JsonRpcResponse::error(
                serde_json::Value::Null,
                -32700,
                format!("Parse error: {}", e),
            );
            let json = serde_json::to_string(&error_response).unwrap_or_default();
            return axum::response::Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(json))
                .unwrap();
        }
    };

    match handle_mcp_message(&state, req).await {
        Some(response) => {
            let json = serde_json::to_string(&response).unwrap_or_default();
            axum::response::Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(json))
                .unwrap()
        }
        None => {
            // Notification — no response body
            axum::response::Response::builder()
                .status(StatusCode::ACCEPTED)
                .body(Body::empty())
                .unwrap()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compiler::pipeline::CompilationPipeline;
    use crate::errors::broadcaster::ErrorBroadcaster;
    use crate::hmr::websocket::HmrHub;
    use crate::server::console_log::ConsoleLog;
    use crate::watcher;
    use std::time::Instant;

    fn create_test_state() -> Arc<DevServerState> {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_path_buf();
        let src = root.join("src");
        std::fs::create_dir_all(&src).unwrap();

        Arc::new(DevServerState {
            pipeline: CompilationPipeline::new(root.clone(), src.clone()),
            root_dir: root.clone(),
            src_dir: src,
            entry_file: root.join("src/main.tsx"),
            deps_dir: root.join("node_modules/.vertz/deps"),
            theme_css: None,
            hmr_hub: HmrHub::new(),
            module_graph: watcher::new_shared_module_graph(),
            error_broadcaster: ErrorBroadcaster::new(),
            console_log: ConsoleLog::new(),
            mcp_sessions: McpSessions::new(),
            mcp_event_hub: crate::server::mcp_events::McpEventHub::new(),
            start_time: Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: std::sync::Arc::new(std::sync::RwLock::new(None)),
            auto_install: false,
            auto_install_lock: std::sync::Arc::new(tokio::sync::Mutex::new(())),
            auto_install_inflight: std::sync::Arc::new(std::sync::Mutex::new(
                std::collections::HashMap::new(),
            )),
            auto_install_failed: std::sync::Arc::new(std::sync::Mutex::new(
                std::collections::HashSet::new(),
            )),
        })
    }

    // ── McpSessions tests ───────────────────────────────────────────

    #[tokio::test]
    async fn test_sessions_insert_and_send() {
        let sessions = McpSessions::new();
        let (tx, mut rx) = mpsc::channel::<String>(8);

        sessions.insert("s1".to_string(), tx).await;

        let sent = sessions.send("s1", "hello".to_string()).await;
        assert!(sent);

        let msg = rx.recv().await.unwrap();
        assert_eq!(msg, "hello");
    }

    #[tokio::test]
    async fn test_sessions_send_to_missing_session() {
        let sessions = McpSessions::new();
        let sent = sessions.send("nonexistent", "msg".to_string()).await;
        assert!(!sent);
    }

    #[tokio::test]
    async fn test_sessions_remove() {
        let sessions = McpSessions::new();
        let (tx, _rx) = mpsc::channel::<String>(8);

        sessions.insert("s1".to_string(), tx).await;
        assert_eq!(sessions.len().await, 1);

        sessions.remove("s1").await;
        assert_eq!(sessions.len().await, 0);
    }

    #[tokio::test]
    async fn test_sessions_send_after_receiver_dropped() {
        let sessions = McpSessions::new();
        let (tx, rx) = mpsc::channel::<String>(8);

        sessions.insert("s1".to_string(), tx).await;
        drop(rx); // Simulate SSE disconnect

        let sent = sessions.send("s1", "msg".to_string()).await;
        assert!(!sent);
    }

    // ── JSON-RPC types tests ────────────────────────────────────────

    #[test]
    fn test_jsonrpc_success_response() {
        let resp = JsonRpcResponse::success(serde_json::json!(1), serde_json::json!({"ok": true}));
        let json = serde_json::to_string(&resp).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["jsonrpc"], "2.0");
        assert_eq!(parsed["id"], 1);
        assert_eq!(parsed["result"]["ok"], true);
        assert!(parsed.get("error").is_none());
    }

    #[test]
    fn test_jsonrpc_error_response() {
        let resp = JsonRpcResponse::error(serde_json::json!(2), -32601, "Method not found");
        let json = serde_json::to_string(&resp).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["jsonrpc"], "2.0");
        assert_eq!(parsed["id"], 2);
        assert_eq!(parsed["error"]["code"], -32601);
        assert_eq!(parsed["error"]["message"], "Method not found");
        assert!(parsed.get("result").is_none());
    }

    // ── Tool definitions tests ──────────────────────────────────────

    #[test]
    fn test_tool_definitions_structure() {
        let defs = tool_definitions();
        let tools = defs["tools"].as_array().unwrap();

        assert_eq!(tools.len(), 6);

        let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"vertz_get_errors"));
        assert!(names.contains(&"vertz_render_page"));
        assert!(names.contains(&"vertz_get_console"));
        assert!(names.contains(&"vertz_navigate"));
        assert!(names.contains(&"vertz_get_diagnostics"));
        assert!(names.contains(&"vertz_get_events_url"));
    }

    #[test]
    fn test_tool_definitions_have_schemas() {
        let defs = tool_definitions();
        let tools = defs["tools"].as_array().unwrap();

        for tool in tools {
            assert!(tool.get("name").is_some(), "tool missing name");
            assert!(
                tool.get("description").is_some(),
                "tool missing description"
            );
            assert!(
                tool.get("inputSchema").is_some(),
                "tool {} missing inputSchema",
                tool["name"]
            );
        }
    }

    #[test]
    fn test_render_page_requires_url() {
        let defs = tool_definitions();
        let tools = defs["tools"].as_array().unwrap();
        let render = tools
            .iter()
            .find(|t| t["name"] == "vertz_render_page")
            .unwrap();
        let required = render["inputSchema"]["required"].as_array().unwrap();
        assert!(required.contains(&serde_json::json!("url")));
    }

    #[test]
    fn test_navigate_requires_to() {
        let defs = tool_definitions();
        let tools = defs["tools"].as_array().unwrap();
        let nav = tools
            .iter()
            .find(|t| t["name"] == "vertz_navigate")
            .unwrap();
        let required = nav["inputSchema"]["required"].as_array().unwrap();
        assert!(required.contains(&serde_json::json!("to")));
    }

    // ── MCP protocol handler tests ──────────────────────────────────

    #[tokio::test]
    async fn test_initialize_response() {
        let state = create_test_state();
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::json!(1)),
            method: "initialize".to_string(),
            params: None,
        };

        let resp = handle_mcp_message(&state, req).await.unwrap();
        let result = resp.result.unwrap();

        assert_eq!(result["protocolVersion"], MCP_PROTOCOL_VERSION);
        assert_eq!(result["serverInfo"]["name"], SERVER_NAME);
        assert!(result["capabilities"]["tools"].is_object());
    }

    #[tokio::test]
    async fn test_ping_response() {
        let state = create_test_state();
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::json!(2)),
            method: "ping".to_string(),
            params: None,
        };

        let resp = handle_mcp_message(&state, req).await.unwrap();
        assert!(resp.result.is_some());
        assert!(resp.error.is_none());
    }

    #[tokio::test]
    async fn test_tools_list_response() {
        let state = create_test_state();
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::json!(3)),
            method: "tools/list".to_string(),
            params: None,
        };

        let resp = handle_mcp_message(&state, req).await.unwrap();
        let result = resp.result.unwrap();
        let tools = result["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 6);
    }

    #[tokio::test]
    async fn test_unknown_method() {
        let state = create_test_state();
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::json!(4)),
            method: "unknown/method".to_string(),
            params: None,
        };

        let resp = handle_mcp_message(&state, req).await.unwrap();
        assert!(resp.error.is_some());
        assert_eq!(resp.error.unwrap().code, -32601);
    }

    #[tokio::test]
    async fn test_notification_returns_none() {
        let state = create_test_state();
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: None, // No id = notification
            method: "notifications/initialized".to_string(),
            params: None,
        };

        let resp = handle_mcp_message(&state, req).await;
        assert!(resp.is_none());
    }

    #[tokio::test]
    async fn test_resources_list_empty() {
        let state = create_test_state();
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::json!(5)),
            method: "resources/list".to_string(),
            params: None,
        };

        let resp = handle_mcp_message(&state, req).await.unwrap();
        let result = resp.result.unwrap();
        assert_eq!(result["resources"].as_array().unwrap().len(), 0);
    }

    // ── Tool execution tests ────────────────────────────────────────

    #[tokio::test]
    async fn test_execute_get_errors_empty() {
        let state = create_test_state();
        let result = execute_tool(&state, "vertz_get_errors", &serde_json::json!({}))
            .await
            .unwrap();

        let content = result["content"].as_array().unwrap();
        assert_eq!(content.len(), 1);
        assert_eq!(content[0]["type"], "text");

        let text: serde_json::Value =
            serde_json::from_str(content[0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(text["count"], 0);
        assert_eq!(text["errors"].as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_execute_get_errors_with_errors() {
        let state = create_test_state();
        state
            .error_broadcaster
            .report_error(crate::errors::categories::DevError::build("test error"))
            .await;

        let result = execute_tool(&state, "vertz_get_errors", &serde_json::json!({}))
            .await
            .unwrap();

        let content = result["content"].as_array().unwrap();
        let text: serde_json::Value =
            serde_json::from_str(content[0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(text["count"], 1);
    }

    #[tokio::test]
    async fn test_execute_render_page_ssr_disabled() {
        let state = create_test_state();
        let result = execute_tool(
            &state,
            "vertz_render_page",
            &serde_json::json!({"url": "/"}),
        )
        .await
        .unwrap();

        assert_eq!(result["isError"], true);
        let content = result["content"].as_array().unwrap();
        assert!(content[0]["text"]
            .as_str()
            .unwrap()
            .contains("SSR is not enabled"));
    }

    #[tokio::test]
    async fn test_execute_get_console_empty() {
        let state = create_test_state();
        let result = execute_tool(&state, "vertz_get_console", &serde_json::json!({}))
            .await
            .unwrap();

        let content = result["content"].as_array().unwrap();
        let text: serde_json::Value =
            serde_json::from_str(content[0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(text["count"], 0);
    }

    #[tokio::test]
    async fn test_execute_get_console_with_entries() {
        let state = create_test_state();
        state
            .console_log
            .push(LogLevel::Info, "test message", Some("test"));

        let result = execute_tool(
            &state,
            "vertz_get_console",
            &serde_json::json!({"last": 10}),
        )
        .await
        .unwrap();

        let content = result["content"].as_array().unwrap();
        let text: serde_json::Value =
            serde_json::from_str(content[0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(text["count"], 1);
    }

    #[tokio::test]
    async fn test_execute_navigate() {
        let state = create_test_state();
        let result = execute_tool(
            &state,
            "vertz_navigate",
            &serde_json::json!({"to": "/tasks"}),
        )
        .await
        .unwrap();

        let content = result["content"].as_array().unwrap();
        assert!(content[0]["text"].as_str().unwrap().contains("/tasks"));

        // Verify console log was created
        let entries = state.console_log.all();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].message.contains("/tasks"));
    }

    #[tokio::test]
    async fn test_execute_navigate_missing_param() {
        let state = create_test_state();
        let result = execute_tool(&state, "vertz_navigate", &serde_json::json!({})).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing"));
    }

    #[tokio::test]
    async fn test_execute_get_diagnostics() {
        let state = create_test_state();
        let result = execute_tool(&state, "vertz_get_diagnostics", &serde_json::json!({}))
            .await
            .unwrap();

        let content = result["content"].as_array().unwrap();
        let text: serde_json::Value =
            serde_json::from_str(content[0]["text"].as_str().unwrap()).unwrap();
        assert!(text.get("uptime_secs").is_some());
        assert!(text.get("cache").is_some());
        assert!(text.get("module_graph").is_some());
    }

    #[tokio::test]
    async fn test_execute_get_events_url() {
        let state = create_test_state();
        let result = execute_tool(&state, "vertz_get_events_url", &serde_json::json!({}))
            .await
            .unwrap();

        let content = result["content"].as_array().unwrap();
        let text: serde_json::Value =
            serde_json::from_str(content[0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(text["url"], "ws://localhost:3000/__vertz_mcp/events");
        let events = text["events"].as_array().unwrap();
        assert!(events.len() >= 6);
        assert!(events.contains(&serde_json::json!("error_update")));
        assert!(events.contains(&serde_json::json!("file_change")));
        assert!(events.contains(&serde_json::json!("hmr_update")));
    }

    #[tokio::test]
    async fn test_execute_unknown_tool() {
        let state = create_test_state();
        let result = execute_tool(&state, "nonexistent_tool", &serde_json::json!({})).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown tool"));
    }

    // ── tools/call integration test ─────────────────────────────────

    #[tokio::test]
    async fn test_tools_call_get_errors() {
        let state = create_test_state();
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::json!(10)),
            method: "tools/call".to_string(),
            params: Some(serde_json::json!({
                "name": "vertz_get_errors",
                "arguments": {}
            })),
        };

        let resp = handle_mcp_message(&state, req).await.unwrap();
        assert!(resp.error.is_none());

        let result = resp.result.unwrap();
        let content = result["content"].as_array().unwrap();
        assert_eq!(content[0]["type"], "text");
    }

    #[tokio::test]
    async fn test_tools_call_unknown_tool() {
        let state = create_test_state();
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::json!(11)),
            method: "tools/call".to_string(),
            params: Some(serde_json::json!({
                "name": "nonexistent",
                "arguments": {}
            })),
        };

        let resp = handle_mcp_message(&state, req).await.unwrap();
        assert!(resp.error.is_some());
        assert_eq!(resp.error.unwrap().code, -32603);
    }
}
