use crate::common::*;
use futures_util::StreamExt;
use std::time::Duration;
use tokio::time::timeout;
use vertz_runtime::server::console_log::LogLevel;

/// Parity #50: Console log ring buffer endpoint returns stored entries.
#[tokio::test]
async fn console_log_endpoint_returns_log_entries() {
    let (base_url, handle) = start_dev_server("minimal-app").await;
    let client = http_client();

    // Push a log entry via the ConsoleLog on state
    handle
        .state
        .console_log
        .push(LogLevel::Log, "parity test log entry", None);

    // Fetch console log
    let resp = timeout(
        Duration::from_secs(5),
        client
            .get(format!("{}/__vertz_ai/console", base_url))
            .send(),
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(resp.status(), 200);
    let body = resp.text().await.unwrap();
    let json: serde_json::Value = serde_json::from_str(&body).unwrap();

    assert!(
        json["entries"].is_array(),
        "Response should have entries array. Body: {}",
        body
    );
    let entries = json["entries"].as_array().unwrap();
    let has_test_entry = entries.iter().any(|e| {
        e["message"]
            .as_str()
            .unwrap_or("")
            .contains("parity test log entry")
    });
    assert!(
        has_test_entry,
        "Console log should contain our test entry. Entries: {:?}",
        entries
    );
}

/// Parity #51: MCP Streamable HTTP server responds to tools/list.
#[tokio::test]
async fn mcp_streamable_http_responds_to_tools_list() {
    let (base_url, _handle) = start_dev_server("minimal-app").await;
    let client = http_client();

    let resp = timeout(
        Duration::from_secs(5),
        client
            .post(format!("{}/__vertz_mcp", base_url))
            .header("content-type", "application/json")
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": {}
            }))
            .send(),
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(resp.status(), 200);
    let json: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(json["jsonrpc"], "2.0");
    assert_eq!(json["id"], 1);

    // Result should contain a tools array with known tools
    let tools = json["result"]["tools"]
        .as_array()
        .expect("tools/list should return a tools array");
    assert!(!tools.is_empty(), "Tools array should not be empty");

    let tool_names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
    assert!(
        tool_names.contains(&"vertz_get_errors"),
        "Should have vertz_get_errors tool. Got: {:?}",
        tool_names
    );
    assert!(
        tool_names.contains(&"vertz_get_diagnostics"),
        "Should have vertz_get_diagnostics tool. Got: {:?}",
        tool_names
    );
    assert!(
        tool_names.contains(&"vertz_get_console"),
        "Should have vertz_get_console tool. Got: {:?}",
        tool_names
    );
}

/// Parity #52: MCP tool invocation returns a result.
#[tokio::test]
async fn mcp_tool_call_returns_diagnostics() {
    let (base_url, _handle) = start_dev_server("minimal-app").await;
    let client = http_client();

    let resp = timeout(
        Duration::from_secs(5),
        client
            .post(format!("{}/__vertz_mcp", base_url))
            .header("content-type", "application/json")
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "vertz_get_diagnostics",
                    "arguments": {}
                }
            }))
            .send(),
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(resp.status(), 200);
    let json: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(json["jsonrpc"], "2.0");
    assert_eq!(json["id"], 2);

    // Result should contain content array with diagnostics
    let content = &json["result"]["content"];
    assert!(
        content.is_array(),
        "tools/call result should have content array. Response: {}",
        json
    );
}

/// Parity #53: MCP events WebSocket delivers initial server status on connect.
#[tokio::test]
async fn mcp_events_websocket_receives_server_events() {
    let (base_url, _handle) = start_dev_server("minimal-app").await;
    let ws_url = base_url.replace("http://", "ws://") + "/__vertz_mcp/events";
    let (mut ws, _) = tokio_tungstenite::connect_async(&ws_url).await.unwrap();

    // The MCP events handler sends two initial messages on connect:
    // 1. server_status event
    // 2. error_snapshot event
    let msg = timeout(Duration::from_secs(3), ws.next())
        .await
        .expect("no MCP event within 3s")
        .unwrap()
        .unwrap();

    let text = msg.to_text().unwrap();
    let json: serde_json::Value = serde_json::from_str(text).unwrap();

    // First message should be server_status with event type and data
    assert!(
        json.get("event").is_some() || json.get("type").is_some(),
        "Initial MCP event should have event or type field. Got: {}",
        json
    );
}
