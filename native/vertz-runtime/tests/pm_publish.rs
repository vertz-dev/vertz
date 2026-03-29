/// Integration tests for `vertz publish` command
///
/// Uses a local mock HTTP server (axum) to verify the full publish flow
/// without hitting the real npm registry.
///
///   cargo test --test pm_publish
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, Method, StatusCode};
use axum::Router;
use std::sync::Arc;
use tempfile::TempDir;
use tokio::sync::Mutex;
use vertz_runtime::pm::output::{JsonOutput, PmOutput, TextOutput};

/// Captured request from the mock registry
#[derive(Debug, Clone)]
struct CapturedRequest {
    path: String,
    auth_header: Option<String>,
    body: serde_json::Value,
}

/// Shared state for the mock registry server
struct MockRegistryState {
    requests: Vec<CapturedRequest>,
    response_status: u16,
}

type SharedState = Arc<Mutex<MockRegistryState>>;

/// Fallback handler that captures all requests
async fn handle_all(
    State(state): State<SharedState>,
    method: Method,
    headers: HeaderMap,
    axum::extract::OriginalUri(uri): axum::extract::OriginalUri,
    body: Bytes,
) -> StatusCode {
    // Only capture PUT requests (publish)
    if method != Method::PUT {
        return StatusCode::NOT_FOUND;
    }

    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let body_json: serde_json::Value = serde_json::from_slice(&body).unwrap_or_default();

    let mut guard = state.lock().await;
    guard.requests.push(CapturedRequest {
        path: uri.path().to_string(),
        auth_header,
        body: body_json,
    });

    StatusCode::from_u16(guard.response_status).unwrap_or(StatusCode::OK)
}

/// Start a mock registry server, returns (port, state handle)
async fn start_mock_registry(status: u16) -> (u16, SharedState) {
    let state = Arc::new(Mutex::new(MockRegistryState {
        requests: Vec::new(),
        response_status: status,
    }));

    let app = Router::new().fallback(handle_all).with_state(state.clone());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Give server a moment to start
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    (port, state)
}

/// Helper: create a temp project with dist/ for publishing
fn create_publishable_project(name: &str, version: &str, port: u16) -> TempDir {
    let dir = tempfile::tempdir().unwrap();

    let pkg_json = format!(
        r#"{{
  "name": "{}",
  "version": "{}",
  "files": ["dist/"],
  "description": "A test package"
}}"#,
        name, version
    );
    std::fs::write(dir.path().join("package.json"), pkg_json).unwrap();

    // .npmrc with auth token pointing to mock registry
    let npmrc = format!(
        "registry=http://127.0.0.1:{}\n//127.0.0.1:{}/:_authToken=test-token-abc123\n",
        port, port
    );
    std::fs::write(dir.path().join(".npmrc"), npmrc).unwrap();

    // dist/ files
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    std::fs::write(
        dir.path().join("dist/index.js"),
        "module.exports = { hello: 'world' };",
    )
    .unwrap();

    dir
}

fn test_output() -> Arc<dyn PmOutput> {
    Arc::new(TextOutput::new(false))
}

// ─── Full publish flow ───

#[tokio::test]
async fn test_publish_sends_put_with_correct_structure() {
    let (port, state) = start_mock_registry(200).await;
    let dir = create_publishable_project("test-pkg", "1.0.0", port);

    let result = vertz_runtime::pm::publish(dir.path(), "latest", None, false, test_output()).await;

    assert!(result.is_ok(), "publish should succeed: {:?}", result.err());

    let guard = state.lock().await;
    assert_eq!(guard.requests.len(), 1);

    let req = &guard.requests[0];
    assert_eq!(req.path, "/test-pkg");
    assert_eq!(
        req.auth_header,
        Some("Bearer test-token-abc123".to_string())
    );

    // Verify publish document structure
    assert_eq!(req.body["name"], "test-pkg");
    assert_eq!(req.body["_id"], "test-pkg");
    assert!(req.body["versions"]["1.0.0"].is_object());
    assert_eq!(req.body["dist-tags"]["latest"], "1.0.0");
    assert!(req.body["_attachments"]["test-pkg-1.0.0.tgz"].is_object());
}

#[tokio::test]
async fn test_publish_includes_base64_tarball() {
    let (port, state) = start_mock_registry(200).await;
    let dir = create_publishable_project("test-pkg", "1.0.0", port);

    vertz_runtime::pm::publish(dir.path(), "latest", None, false, test_output())
        .await
        .unwrap();

    let guard = state.lock().await;
    let attachment = &guard.requests[0].body["_attachments"]["test-pkg-1.0.0.tgz"];
    assert_eq!(attachment["content_type"], "application/octet-stream");
    assert!(!attachment["data"].as_str().unwrap().is_empty());
    assert!(attachment["length"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn test_publish_with_custom_tag() {
    let (port, state) = start_mock_registry(200).await;
    let dir = create_publishable_project("test-pkg", "2.0.0-beta.1", port);

    vertz_runtime::pm::publish(dir.path(), "beta", None, false, test_output())
        .await
        .unwrap();

    let guard = state.lock().await;
    assert_eq!(guard.requests[0].body["dist-tags"]["beta"], "2.0.0-beta.1");
}

#[tokio::test]
async fn test_publish_with_access_public() {
    let (port, state) = start_mock_registry(200).await;
    let dir = create_publishable_project("@myorg/test-pkg", "1.0.0", port);

    vertz_runtime::pm::publish(dir.path(), "latest", Some("public"), false, test_output())
        .await
        .unwrap();

    let guard = state.lock().await;
    assert_eq!(guard.requests[0].body["access"], "public");
}

// ─── Dry run ───

#[tokio::test]
async fn test_dry_run_does_not_send_request() {
    let (port, state) = start_mock_registry(200).await;
    let dir = create_publishable_project("test-pkg", "1.0.0", port);

    let result = vertz_runtime::pm::publish(
        dir.path(),
        "latest",
        None,
        true, // dry_run
        test_output(),
    )
    .await;

    assert!(result.is_ok());

    let guard = state.lock().await;
    assert_eq!(
        guard.requests.len(),
        0,
        "dry run should NOT send any HTTP requests"
    );
}

// ─── Auth failure ───

#[tokio::test]
async fn test_publish_401_returns_auth_error() {
    let (port, _state) = start_mock_registry(401).await;
    let dir = create_publishable_project("test-pkg", "1.0.0", port);

    let result = vertz_runtime::pm::publish(dir.path(), "latest", None, false, test_output()).await;

    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("Authentication failed"),
        "error should mention auth: {}",
        err
    );
}

// ─── Version conflict ───

#[tokio::test]
async fn test_publish_409_returns_version_exists_error() {
    let (port, _state) = start_mock_registry(409).await;
    let dir = create_publishable_project("test-pkg", "1.0.0", port);

    let result = vertz_runtime::pm::publish(dir.path(), "latest", None, false, test_output()).await;

    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("version already exists"),
        "error should mention version exists: {}",
        err
    );
}

// ─── Validation errors ───

#[tokio::test]
async fn test_publish_missing_name_errors() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("package.json"), r#"{"version": "1.0.0"}"#).unwrap();

    let result = vertz_runtime::pm::publish(dir.path(), "latest", None, false, test_output()).await;

    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("missing required field 'name'"),
        "error: {}",
        err
    );
}

#[tokio::test]
async fn test_publish_missing_version_errors() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("package.json"), r#"{"name": "test-pkg"}"#).unwrap();

    let result = vertz_runtime::pm::publish(dir.path(), "latest", None, false, test_output()).await;

    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("missing required field 'version'"),
        "error: {}",
        err
    );
}

#[tokio::test]
async fn test_publish_invalid_access_errors() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("package.json"),
        r#"{"name": "test-pkg", "version": "1.0.0"}"#,
    )
    .unwrap();

    let result =
        vertz_runtime::pm::publish(dir.path(), "latest", Some("foobar"), false, test_output())
            .await;

    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("Must be \"public\" or \"restricted\""),
        "error: {}",
        err
    );
}

// ─── Lifecycle scripts ───

#[tokio::test]
async fn test_publish_runs_prepublish_script() {
    let (port, _state) = start_mock_registry(200).await;
    let dir = tempfile::tempdir().unwrap();

    let marker_path = dir.path().join("prepublish-ran");
    let pkg_json = format!(
        r#"{{
  "name": "test-pkg",
  "version": "1.0.0",
  "files": ["dist/"],
  "scripts": {{
    "prepublish": "touch {}"
  }}
}}"#,
        marker_path.display()
    );
    std::fs::write(dir.path().join("package.json"), pkg_json).unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    std::fs::write(dir.path().join("dist/index.js"), "hello").unwrap();

    let npmrc = format!(
        "registry=http://127.0.0.1:{}\n//127.0.0.1:{}/:_authToken=test-token\n",
        port, port
    );
    std::fs::write(dir.path().join(".npmrc"), npmrc).unwrap();

    vertz_runtime::pm::publish(dir.path(), "latest", None, false, test_output())
        .await
        .unwrap();

    assert!(marker_path.exists(), "prepublish script should have run");
}

// ─── prepublishOnly lifecycle script ───

#[tokio::test]
async fn test_publish_runs_prepublish_only_script() {
    let (port, _state) = start_mock_registry(200).await;
    let dir = tempfile::tempdir().unwrap();

    let marker_path = dir.path().join("prepublishOnly-ran");
    let pkg_json = format!(
        r#"{{
  "name": "test-pkg",
  "version": "1.0.0",
  "files": ["dist/"],
  "scripts": {{
    "prepublishOnly": "touch {}"
  }}
}}"#,
        marker_path.display()
    );
    std::fs::write(dir.path().join("package.json"), pkg_json).unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    std::fs::write(dir.path().join("dist/index.js"), "hello").unwrap();

    let npmrc = format!(
        "registry=http://127.0.0.1:{}\n//127.0.0.1:{}/:_authToken=test-token\n",
        port, port
    );
    std::fs::write(dir.path().join(".npmrc"), npmrc).unwrap();

    vertz_runtime::pm::publish(dir.path(), "latest", None, false, test_output())
        .await
        .unwrap();

    assert!(
        marker_path.exists(),
        "prepublishOnly script should have run"
    );
}

// ─── JSON output mode ───

#[tokio::test]
async fn test_publish_with_json_output() {
    let (port, state) = start_mock_registry(200).await;
    let dir = create_publishable_project("test-pkg", "1.0.0", port);
    let json_output: Arc<dyn PmOutput> = Arc::new(JsonOutput::new());

    let result = vertz_runtime::pm::publish(dir.path(), "latest", None, false, json_output).await;

    assert!(
        result.is_ok(),
        "publish with JSON output should succeed: {:?}",
        result.err()
    );

    let guard = state.lock().await;
    assert_eq!(guard.requests.len(), 1);
    assert_eq!(guard.requests[0].path, "/test-pkg");
}

// ─── Missing auth ───

#[tokio::test]
async fn test_publish_no_auth_token_errors() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("package.json"),
        r#"{"name": "test-pkg", "version": "1.0.0"}"#,
    )
    .unwrap();

    // .npmrc that sets a registry but NO auth token for it
    std::fs::write(
        dir.path().join(".npmrc"),
        "registry=http://no-such-host.invalid\n",
    )
    .unwrap();

    let result = vertz_runtime::pm::publish(dir.path(), "latest", None, false, test_output()).await;

    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(err.contains("Authentication required"), "error: {}", err);
}
