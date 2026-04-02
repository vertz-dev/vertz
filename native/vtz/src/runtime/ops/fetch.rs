use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpDecl;

/// Perform an HTTP fetch request and return the response as a JSON object.
#[op2(async)]
#[serde]
pub async fn op_fetch(
    #[string] url: String,
    #[serde] options: serde_json::Value,
) -> Result<serde_json::Value, AnyError> {
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
}

/// Get the op declarations for fetch ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_fetch()]
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

    // --- op_decls ---

    #[test]
    fn test_op_decls_returns_fetch_op() {
        let decls = op_decls();
        assert_eq!(decls.len(), 1);
    }

    // --- FETCH_BOOTSTRAP_JS ---

    #[test]
    fn test_fetch_bootstrap_js_is_non_empty() {
        assert!(!FETCH_BOOTSTRAP_JS.is_empty());
        assert!(FETCH_BOOTSTRAP_JS.contains("globalThis"));
    }
}
