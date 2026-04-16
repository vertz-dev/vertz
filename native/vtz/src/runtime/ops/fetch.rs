use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpDecl;
use tokio::sync::oneshot;

/// Global counter for cancel IDs.
static NEXT_CANCEL_ID: AtomicU32 = AtomicU32::new(1);

/// Map of cancel ID → oneshot sender. When the sender is dropped,
/// the corresponding `op_fetch` future is cancelled.
static PENDING_FETCHES: Mutex<Option<HashMap<u32, oneshot::Sender<()>>>> = Mutex::new(None);

fn pending_fetches_insert(id: u32, tx: oneshot::Sender<()>) {
    let mut map = PENDING_FETCHES.lock().unwrap();
    map.get_or_insert_with(HashMap::new).insert(id, tx);
}

fn pending_fetches_remove(id: u32) -> Option<oneshot::Sender<()>> {
    let mut map = PENDING_FETCHES.lock().unwrap();
    map.as_mut().and_then(|m| m.remove(&id))
}

/// Perform an HTTP fetch request and return the response as a JSON object.
/// If `_cancelId` is present in options, the request can be cancelled via `op_fetch_cancel`.
#[op2(async)]
#[serde]
pub async fn op_fetch(
    #[string] url: String,
    #[serde] options: serde_json::Value,
) -> Result<serde_json::Value, AnyError> {
    let cancel_id = options
        .get("_cancelId")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32);

    let client = reqwest::Client::new();

    let method_str = options
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET");

    let method: reqwest::Method = method_str
        .parse()
        .map_err(|_| deno_core::anyhow::anyhow!("Invalid HTTP method: {}", method_str))?;

    let mut request = client.request(method, &url);

    // Set headers
    if let Some(headers) = options.get("headers").and_then(|v| v.as_object()) {
        for (key, value) in headers {
            if let Some(val_str) = value.as_str() {
                request = request.header(key.as_str(), val_str);
            }
        }
    }

    // Set body
    if let Some(body) = options.get("body") {
        if let Some(body_str) = body.as_str() {
            request = request.body(body_str.to_string());
        } else {
            request = request.json(body);
        }
    }

    let do_fetch = async {
        let response = request
            .send()
            .await
            .map_err(|e| deno_core::anyhow::anyhow!("Fetch failed: {}", e))?;

        let status = response.status().as_u16();
        let status_text = response
            .status()
            .canonical_reason()
            .unwrap_or("")
            .to_string();

        let headers: serde_json::Map<String, serde_json::Value> = response
            .headers()
            .iter()
            .map(|(k, v)| {
                (
                    k.as_str().to_string(),
                    serde_json::Value::String(v.to_str().unwrap_or("").to_string()),
                )
            })
            .collect();

        let body = response
            .text()
            .await
            .map_err(|e| deno_core::anyhow::anyhow!("Failed to read response body: {}", e))?;

        Ok(serde_json::json!({
            "status": status,
            "statusText": status_text,
            "headers": headers,
            "body": body,
        }))
    };

    if let Some(id) = cancel_id {
        let (tx, rx) = oneshot::channel::<()>();
        pending_fetches_insert(id, tx);

        tokio::select! {
            result = do_fetch => {
                pending_fetches_remove(id);
                result
            }
            _ = rx => {
                Err(deno_core::anyhow::anyhow!("Fetch aborted"))
            }
        }
    } else {
        do_fetch.await
    }
}

/// Cancel a pending fetch by its cancel ID.
#[op2(fast)]
pub fn op_fetch_cancel(cancel_id: u32) {
    // Removing the sender from the map drops it, which causes the
    // oneshot receiver to resolve with an error — triggering the
    // `tokio::select!` cancel branch in `op_fetch`.
    pending_fetches_remove(cancel_id);
}

/// Allocate a unique cancel ID for a fetch request.
#[op2(fast)]
#[smi]
pub fn op_fetch_next_cancel_id() -> u32 {
    NEXT_CANCEL_ID.fetch_add(1, Ordering::Relaxed)
}

/// Get the op declarations for fetch ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_fetch(), op_fetch_cancel(), op_fetch_next_cancel_id()]
}

/// JavaScript bootstrap code for the fetch API.
/// This uses the Headers, Request, and Response classes from web_api bootstrap
/// (which must be loaded first).
pub const FETCH_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  // Overwrite the fetch from web_api bootstrap (which already references op_fetch)
  // This is now a no-op because web_api bootstrap defines the full fetch().
  // We keep this file's bootstrap empty since web_api handles everything.
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};
    use axum::{
        body::Body,
        extract::Request,
        http::StatusCode,
        response::IntoResponse,
        routing::{get, post},
        Router,
    };
    use tokio::net::TcpListener;

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    /// Helper: run async JS, store result in globalThis.__result, return it.
    async fn run_async(rt: &mut VertzJsRuntime, code: &str) -> serde_json::Value {
        let wrapped = format!(
            r#"(async () => {{ {} }})().then(v => {{ globalThis.__result = v; }}).catch(e => {{ globalThis.__result = 'ERROR: ' + e.message; }})"#,
            code
        );
        rt.execute_script_void("<test>", &wrapped).unwrap();
        rt.run_event_loop().await.unwrap();
        rt.execute_script("<read>", "globalThis.__result").unwrap()
    }

    /// Start a test HTTP server on a random port and return its base URL.
    async fn start_test_server(app: Router) -> (String, tokio::task::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (format!("http://{}", addr), handle)
    }

    fn simple_app() -> Router {
        Router::new()
            .route("/hello", get(|| async { "Hello, World!" }))
            .route(
                "/json",
                get(|| async {
                    (
                        StatusCode::OK,
                        [("content-type", "application/json")],
                        r#"{"key":"value"}"#,
                    )
                }),
            )
            .route(
                "/echo",
                post(|req: Request<Body>| async move {
                    let headers = req.headers().clone();
                    let body_bytes = axum::body::to_bytes(req.into_body(), usize::MAX)
                        .await
                        .unwrap();
                    let body_str = String::from_utf8_lossy(&body_bytes).to_string();
                    let ct = headers
                        .get("content-type")
                        .map(|v| v.to_str().unwrap_or(""))
                        .unwrap_or("");
                    let custom = headers
                        .get("x-custom")
                        .map(|v| v.to_str().unwrap_or(""))
                        .unwrap_or("");
                    (
                        StatusCode::OK,
                        [
                            ("x-echo-content-type", ct.to_string()),
                            ("x-echo-custom", custom.to_string()),
                        ],
                        body_str,
                    )
                        .into_response()
                }),
            )
            .route(
                "/not-found",
                get(|| async { (StatusCode::NOT_FOUND, "Not Found") }),
            )
            .route(
                "/server-error",
                get(|| async { (StatusCode::INTERNAL_SERVER_ERROR, "Internal Error") }),
            )
    }

    // --- GET request: body, status, statusText ---

    #[tokio::test]
    async fn test_fetch_get_returns_body_and_status() {
        let (base_url, _handle) = start_test_server(simple_app()).await;
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}/hello');
                return [resp.status, resp.statusText, await resp.text()];
            "#,
                base_url
            ),
        )
        .await;
        let arr = result.as_array().unwrap();
        assert_eq!(arr[0].as_u64().unwrap(), 200);
        assert_eq!(arr[1].as_str().unwrap(), "OK");
        assert_eq!(arr[2].as_str().unwrap(), "Hello, World!");
    }

    // --- GET returns response headers ---

    #[tokio::test]
    async fn test_fetch_get_returns_headers() {
        let (base_url, _handle) = start_test_server(simple_app()).await;
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}/json');
                return resp.headers.get('content-type');
            "#,
                base_url
            ),
        )
        .await;
        assert_eq!(result.as_str().unwrap(), "application/json");
    }

    // --- POST with string body ---

    #[tokio::test]
    async fn test_fetch_post_string_body() {
        let (base_url, _handle) = start_test_server(simple_app()).await;
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}/echo', {{
                    method: 'POST',
                    body: 'hello from test'
                }});
                return await resp.text();
            "#,
                base_url
            ),
        )
        .await;
        assert_eq!(result.as_str().unwrap(), "hello from test");
    }

    // --- POST with JSON body ---

    #[tokio::test]
    async fn test_fetch_post_json_body() {
        let (base_url, _handle) = start_test_server(simple_app()).await;
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}/echo', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{ foo: 'bar' }})
                }});
                const text = await resp.text();
                const parsed = JSON.parse(text);
                return parsed.foo;
            "#,
                base_url
            ),
        )
        .await;
        assert_eq!(result.as_str().unwrap(), "bar");
    }

    // --- Custom headers ---

    #[tokio::test]
    async fn test_fetch_custom_headers() {
        let (base_url, _handle) = start_test_server(simple_app()).await;
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}/echo', {{
                    method: 'POST',
                    headers: {{ 'x-custom': 'my-value' }},
                    body: 'test'
                }});
                return resp.headers.get('x-echo-custom');
            "#,
                base_url
            ),
        )
        .await;
        assert_eq!(result.as_str().unwrap(), "my-value");
    }

    // --- Non-200 status codes ---

    #[tokio::test]
    async fn test_fetch_404_status() {
        let (base_url, _handle) = start_test_server(simple_app()).await;
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}/not-found');
                return [resp.status, resp.statusText];
            "#,
                base_url
            ),
        )
        .await;
        let arr = result.as_array().unwrap();
        assert_eq!(arr[0].as_u64().unwrap(), 404);
        assert_eq!(arr[1].as_str().unwrap(), "Not Found");
    }

    #[tokio::test]
    async fn test_fetch_500_status() {
        let (base_url, _handle) = start_test_server(simple_app()).await;
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}/server-error');
                return [resp.status, resp.statusText, await resp.text()];
            "#,
                base_url
            ),
        )
        .await;
        let arr = result.as_array().unwrap();
        assert_eq!(arr[0].as_u64().unwrap(), 500);
        assert_eq!(arr[1].as_str().unwrap(), "Internal Server Error");
        assert_eq!(arr[2].as_str().unwrap(), "Internal Error");
    }

    // --- Error: network failure ---

    #[tokio::test]
    async fn test_fetch_network_failure() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            try {
                await fetch('http://127.0.0.1:1/unreachable');
                return 'no-throw';
            } catch (e) {
                return e.message.includes('Fetch failed') ? 'correct-error' : e.message;
            }
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!("correct-error"));
    }

    // --- file:// URL support ---

    #[tokio::test]
    async fn test_fetch_file_url_returns_text_content() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("hello.txt");
        std::fs::write(&file_path, "file content here").unwrap();
        let file_url = url::Url::from_file_path(&file_path).unwrap();

        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}');
                return [resp.status, await resp.text()];
            "#,
                file_url
            ),
        )
        .await;
        let arr = result.as_array().unwrap();
        assert_eq!(arr[0].as_u64().unwrap(), 200);
        assert_eq!(arr[1].as_str().unwrap(), "file content here");
    }

    #[tokio::test]
    async fn test_fetch_file_url_returns_binary_via_array_buffer() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("data.bin");
        // Write known binary bytes (including non-UTF-8)
        std::fs::write(&file_path, [0x00, 0x61, 0x73, 0x6D, 0x01, 0xFF]).unwrap();
        let file_url = url::Url::from_file_path(&file_path).unwrap();

        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}');
                const buf = await resp.arrayBuffer();
                const bytes = new Uint8Array(buf);
                return Array.from(bytes);
            "#,
                file_url
            ),
        )
        .await;
        let arr = result.as_array().unwrap();
        let bytes: Vec<u8> = arr.iter().map(|v| v.as_u64().unwrap() as u8).collect();
        assert_eq!(bytes, vec![0x00, 0x61, 0x73, 0x6D, 0x01, 0xFF]);
    }

    #[tokio::test]
    async fn test_fetch_file_url_response_ok_and_url() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        std::fs::write(&file_path, "ok").unwrap();
        let file_url = url::Url::from_file_path(&file_path).unwrap();

        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}');
                return [resp.ok, resp.status, resp.statusText, resp.url];
            "#,
                file_url
            ),
        )
        .await;
        let arr = result.as_array().unwrap();
        assert_eq!(arr[0], serde_json::json!(true));
        assert_eq!(arr[1].as_u64().unwrap(), 200);
        assert_eq!(arr[2].as_str().unwrap(), "OK");
        assert!(arr[3].as_str().unwrap().starts_with("file://"));
    }

    #[tokio::test]
    async fn test_fetch_file_url_sets_content_type_for_wasm() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("module.wasm");
        std::fs::write(&file_path, [0x00, 0x61, 0x73, 0x6D]).unwrap();
        let file_url = url::Url::from_file_path(&file_path).unwrap();

        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}');
                return resp.headers.get('content-type');
            "#,
                file_url
            ),
        )
        .await;
        assert_eq!(result.as_str().unwrap(), "application/wasm");
    }

    #[tokio::test]
    async fn test_fetch_file_url_sets_content_type_for_json() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("data.json");
        std::fs::write(&file_path, r#"{"key":"value"}"#).unwrap();
        let file_url = url::Url::from_file_path(&file_path).unwrap();

        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const resp = await fetch('{}');
                return resp.headers.get('content-type');
            "#,
                file_url
            ),
        )
        .await;
        assert_eq!(result.as_str().unwrap(), "application/json");
    }

    // --- file:// URL: nonexistent file throws ---

    #[tokio::test]
    async fn test_fetch_file_url_nonexistent_throws() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            try {
                await fetch('file:///nonexistent/path/does-not-exist.txt');
                return 'no-throw';
            } catch (e) {
                return 'threw';
            }
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!("threw"));
    }

    // --- Error: invalid HTTP method ---

    #[tokio::test]
    async fn test_fetch_invalid_method() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            try {
                await fetch('http://127.0.0.1:1', { method: 'INVALID METHOD' });
                return 'no-throw';
            } catch (e) {
                return e.message.includes('Invalid HTTP method') ? 'correct-error' : e.message;
            }
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!("correct-error"));
    }

    // --- AbortSignal.timeout() cancellation ---

    #[tokio::test]
    async fn test_fetch_abort_signal_timeout_rejects_and_settles() {
        let app = Router::new().route(
            "/slow",
            get(|| async {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                "done"
            }),
        );
        let (base_url, _handle) = start_test_server(app).await;
        let mut rt = create_runtime();

        // The whole operation (JS fetch + event loop) must settle within 5s.
        // Without the fix, op_fetch keeps the event loop alive forever.
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            run_async(
                &mut rt,
                &format!(
                    r#"
                try {{
                    await fetch('{}/slow', {{ signal: AbortSignal.timeout(100) }});
                    return 'no-throw';
                }} catch (e) {{
                    return e.name + ': ' + e.message;
                }}
            "#,
                    base_url
                ),
            ),
        )
        .await
        .expect("event loop should settle after abort, not hang");

        let msg = result.as_str().unwrap();
        assert!(
            msg.contains("TimeoutError"),
            "expected TimeoutError, got: {}",
            msg
        );
    }

    // --- AbortController.abort() cancellation ---

    #[tokio::test]
    async fn test_fetch_abort_controller_rejects_and_settles() {
        let app = Router::new().route(
            "/slow",
            get(|| async {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                "done"
            }),
        );
        let (base_url, _handle) = start_test_server(app).await;
        let mut rt = create_runtime();

        let result = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            run_async(
                &mut rt,
                &format!(
                    r#"
                const ac = new AbortController();
                setTimeout(() => ac.abort(), 100);
                try {{
                    await fetch('{}/slow', {{ signal: ac.signal }});
                    return 'no-throw';
                }} catch (e) {{
                    return e.name + ': ' + e.message;
                }}
            "#,
                    base_url
                ),
            ),
        )
        .await
        .expect("event loop should settle after abort, not hang");

        let msg = result.as_str().unwrap();
        assert!(
            msg.contains("AbortError"),
            "expected AbortError, got: {}",
            msg
        );
    }

    // --- Successful fetch with signal that never fires (map cleanup) ---

    #[tokio::test]
    async fn test_fetch_with_signal_completes_normally() {
        let (base_url, _handle) = start_test_server(simple_app()).await;
        let mut rt = create_runtime();

        let result = run_async(
            &mut rt,
            &format!(
                r#"
                const ac = new AbortController();
                const resp = await fetch('{}/hello', {{ signal: ac.signal }});
                return await resp.text();
            "#,
                base_url
            ),
        )
        .await;
        assert_eq!(result.as_str().unwrap(), "Hello, World!");
    }

    // --- op_decls ---

    #[test]
    fn test_op_decls_returns_fetch_ops() {
        let decls = op_decls();
        assert_eq!(decls.len(), 3);
    }

    // --- FETCH_BOOTSTRAP_JS ---

    #[test]
    fn test_fetch_bootstrap_js_is_non_empty() {
        assert!(!FETCH_BOOTSTRAP_JS.is_empty());
        assert!(FETCH_BOOTSTRAP_JS.contains("globalThis"));
    }
}
