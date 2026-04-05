//! Integration tests for the V8 Inspector Protocol server.
//!
//! These tests start a real inspector server on a random port and exercise
//! the CDP metadata endpoints and WebSocket upgrade path.

use deno_core::InspectorSessionProxy;
use futures::channel::mpsc::UnboundedSender;
use tokio::sync::watch;
use vertz_runtime::server::inspector::{start_inspector_server, InspectorInfo};

/// Helper: start an inspector server with no V8 session and return the info + port.
async fn start_test_server() -> (InspectorInfo, u16) {
    let (_tx, rx) = watch::channel::<Option<UnboundedSender<InspectorSessionProxy>>>(None);
    let info = start_inspector_server(0, 3000, rx).await.unwrap();
    let port = extract_port(&info.ws_url);
    (info, port)
}

/// Extract port from a ws:// URL like "ws://127.0.0.1:12345/<uuid>".
fn extract_port(ws_url: &str) -> u16 {
    let stripped = ws_url.replace("ws://127.0.0.1:", "");
    stripped.split('/').next().unwrap().parse().unwrap()
}

#[tokio::test]
async fn inspector_server_binds_to_random_port() {
    let (info, port) = start_test_server().await;
    assert!(port > 0, "Server should bind to a valid port");
    assert!(
        info.ws_url.starts_with("ws://127.0.0.1:"),
        "ws_url should start with ws://127.0.0.1:"
    );
}

#[tokio::test]
async fn inspector_server_inspect_brk_defaults_to_false() {
    let (info, _port) = start_test_server().await;
    assert!(
        !info.inspect_brk,
        "inspect_brk should default to false from start_inspector_server"
    );
}

#[tokio::test]
async fn version_endpoint_returns_valid_cdp_metadata() {
    let (_info, port) = start_test_server().await;

    let resp = reqwest::get(format!("http://127.0.0.1:{}/json/version", port))
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let json: serde_json::Value = resp.json().await.unwrap();

    // Browser field identifies the runtime
    let browser = json["Browser"].as_str().unwrap();
    assert!(browser.contains("Vertz"), "Browser should mention Vertz");

    // Protocol version must be 1.3 (current CDP)
    assert_eq!(json["Protocol-Version"], "1.3");

    // webSocketDebuggerUrl must be a valid ws:// URL
    let ws_url = json["webSocketDebuggerUrl"].as_str().unwrap();
    assert!(ws_url.starts_with("ws://127.0.0.1:"));
}

#[tokio::test]
async fn list_endpoint_returns_single_node_target() {
    let (_info, port) = start_test_server().await;

    let resp = reqwest::get(format!("http://127.0.0.1:{}/json", port))
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let json: serde_json::Value = resp.json().await.unwrap();
    let targets = json.as_array().unwrap();

    assert_eq!(targets.len(), 1, "Should list exactly one target");
    assert_eq!(targets[0]["type"], "node");
    assert_eq!(targets[0]["title"], "Vertz Inspector");
    assert!(targets[0]["webSocketDebuggerUrl"]
        .as_str()
        .unwrap()
        .starts_with("ws://"));
    assert!(targets[0]["devtoolsFrontendUrl"]
        .as_str()
        .unwrap()
        .contains("chrome-devtools://"));
}

#[tokio::test]
async fn list_and_json_list_return_same_data() {
    let (_info, port) = start_test_server().await;

    let json_resp: serde_json::Value = reqwest::get(format!("http://127.0.0.1:{}/json", port))
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let list_resp: serde_json::Value = reqwest::get(format!("http://127.0.0.1:{}/json/list", port))
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    assert_eq!(json_resp, list_resp, "/json and /json/list should match");
}

#[tokio::test]
async fn version_and_list_share_same_ws_url() {
    let (_info, port) = start_test_server().await;

    let version: serde_json::Value =
        reqwest::get(format!("http://127.0.0.1:{}/json/version", port))
            .await
            .unwrap()
            .json()
            .await
            .unwrap();

    let list: serde_json::Value = reqwest::get(format!("http://127.0.0.1:{}/json", port))
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let version_ws = version["webSocketDebuggerUrl"].as_str().unwrap();
    let list_ws = list[0]["webSocketDebuggerUrl"].as_str().unwrap();

    assert_eq!(
        version_ws, list_ws,
        "WebSocket URL must be consistent across endpoints"
    );
}

#[tokio::test]
async fn ws_url_contains_uuid_path() {
    let (info, _port) = start_test_server().await;

    // The path segment after the port should be a valid UUID
    let path = info.ws_url.split('/').next_back().unwrap();
    assert!(
        uuid::Uuid::parse_str(path).is_ok(),
        "WebSocket path should be a valid UUID, got: {}",
        path
    );
}
