use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use axum::body::Body;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpDecl;
use deno_core::OpState;
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot, Mutex as TokioMutex};

/// Global counter for server IDs.
static NEXT_SERVER_ID: AtomicU32 = AtomicU32::new(1);
/// Global counter for request IDs.
static NEXT_REQUEST_ID: AtomicU32 = AtomicU32::new(1);

/// An incoming HTTP request serialized for JS consumption.
#[derive(serde::Serialize)]
struct IncomingRequest {
    id: u32,
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    #[serde(with = "serde_bytes_option")]
    body: Option<Vec<u8>>,
}

/// A response from JS to send back to the HTTP client.
struct HttpResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

/// Pending response senders, shared between Axum handlers and the respond op.
type PendingResponses = Arc<TokioMutex<HashMap<u32, oneshot::Sender<HttpResponse>>>>;

/// Per-server state stored in OpState.
struct ServerInstance {
    /// Receives incoming requests from the Axum handler.
    request_rx: Arc<TokioMutex<mpsc::Receiver<IncomingRequest>>>,
    /// Shared map of request_id → response sender.
    pending_responses: PendingResponses,
    /// Handle to abort the server task on close.
    abort_handle: tokio::task::AbortHandle,
}

/// Shared state for all HTTP servers, stored in OpState.
#[derive(Default)]
pub struct HttpServeState {
    servers: HashMap<u32, ServerInstance>,
}

/// Custom serde helper for Option<Vec<u8>> — serialize as base64 string or null.
mod serde_bytes_option {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use serde::Serializer;

    pub fn serialize<S>(value: &Option<Vec<u8>>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(bytes) => serializer.serialize_str(&STANDARD.encode(bytes)),
            None => serializer.serialize_none(),
        }
    }
}

/// Start an HTTP server on the given port.
///
/// Returns `{ id, port, hostname }` where `port` is the actual bound port
/// (important when the requested port is 0 for OS-assigned).
///
/// The socket is bound synchronously so that `Bun.serve()` can return the
/// actual port immediately (Bun's API is synchronous).  The async accept
/// loop is spawned in the background.
#[op2]
#[serde]
pub fn op_http_serve(
    state: &mut OpState,
    #[smi] port: u16,
    #[string] hostname: String,
) -> Result<serde_json::Value, AnyError> {
    let addr = format!("{}:{}", hostname, port);

    // Bind synchronously so the port is known before returning to JS.
    let std_listener = std::net::TcpListener::bind(&addr)
        .map_err(|e| deno_core::anyhow::anyhow!("Failed to bind {}: {}", addr, e))?;
    std_listener.set_nonblocking(true)?;
    let listener = TcpListener::from_std(std_listener)?;

    let actual_port = listener.local_addr()?.port();
    let actual_hostname = hostname.clone();

    let server_id = NEXT_SERVER_ID.fetch_add(1, Ordering::SeqCst);

    // Channel: Axum handler → JS accept loop
    let (request_tx, request_rx) = mpsc::channel::<IncomingRequest>(64);

    // Shared pending response map
    let pending: PendingResponses = Arc::new(TokioMutex::new(HashMap::new()));
    let pending_for_axum = Arc::clone(&pending);

    // Start the Axum server in a background task
    let join_handle = tokio::spawn(async move {
        let app = axum::Router::new().fallback(move |req: axum::extract::Request| {
            let tx = request_tx.clone();
            let pending = Arc::clone(&pending_for_axum);
            async move {
                let request_id = NEXT_REQUEST_ID.fetch_add(1, Ordering::SeqCst);

                // Extract request data
                let method = req.method().to_string();
                let url = req.uri().to_string();
                let headers: Vec<(String, String)> = req
                    .headers()
                    .iter()
                    .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                    .collect();
                let body_bytes = axum::body::to_bytes(req.into_body(), 10 * 1024 * 1024)
                    .await
                    .ok()
                    .filter(|b| !b.is_empty())
                    .map(|b| b.to_vec());

                // Create oneshot for the response
                let (response_tx, response_rx) = oneshot::channel();
                pending.lock().await.insert(request_id, response_tx);

                // Send request to JS
                let incoming = IncomingRequest {
                    id: request_id,
                    method,
                    url,
                    headers,
                    body: body_bytes,
                };

                if tx.send(incoming).await.is_err() {
                    // Server was closed, JS isn't listening
                    return StatusCode::SERVICE_UNAVAILABLE.into_response();
                }

                // Wait for JS to respond
                match response_rx.await {
                    Ok(resp) => {
                        let mut builder = axum::response::Response::builder().status(resp.status);
                        for (k, v) in &resp.headers {
                            builder = builder.header(k.as_str(), v.as_str());
                        }
                        builder
                            .body(Body::from(resp.body))
                            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
                    }
                    Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
                }
            }
        });

        // Ignore the error when the server is aborted
        let _ = axum::serve(listener, app).await;
    });

    let abort_handle = join_handle.abort_handle();

    // Store server state
    {
        let http_state = state.borrow_mut::<HttpServeState>();
        http_state.servers.insert(
            server_id,
            ServerInstance {
                request_rx: Arc::new(TokioMutex::new(request_rx)),
                pending_responses: pending,
                abort_handle,
            },
        );
    }

    Ok(serde_json::json!({
        "id": server_id,
        "port": actual_port,
        "hostname": actual_hostname,
    }))
}

/// Wait for the next incoming request on a server.
///
/// Returns `{ id, method, url, headers, body }` or null if the server is closing.
#[op2(async)]
#[serde]
pub async fn op_http_serve_accept(
    state: Rc<RefCell<OpState>>,
    #[smi] server_id: u32,
) -> Result<serde_json::Value, AnyError> {
    let request_rx = {
        let op_state = state.borrow();
        let http_state = op_state.borrow::<HttpServeState>();
        let server = http_state
            .servers
            .get(&server_id)
            .ok_or_else(|| deno_core::anyhow::anyhow!("Unknown server id: {}", server_id))?;
        Arc::clone(&server.request_rx)
    };

    let mut rx = request_rx.lock().await;
    match rx.recv().await {
        Some(req) => Ok(serde_json::to_value(req)?),
        None => Ok(serde_json::Value::Null),
    }
}

/// Send a response for a pending request.
#[op2]
pub fn op_http_serve_respond(
    state: &mut OpState,
    #[smi] server_id: u32,
    #[smi] request_id: u32,
    #[smi] status: u16,
    #[serde] headers: Vec<(String, String)>,
    #[buffer] body: &[u8],
) -> Result<(), AnyError> {
    let http_state = state.borrow_mut::<HttpServeState>();
    let server = http_state
        .servers
        .get(&server_id)
        .ok_or_else(|| deno_core::anyhow::anyhow!("Unknown server id: {}", server_id))?;

    // We need to get the oneshot sender from the pending map.
    // Since we're in a sync op but pending_responses uses TokioMutex,
    // we use try_lock which should succeed since no other holder exists.
    let mut pending = server
        .pending_responses
        .try_lock()
        .map_err(|_| deno_core::anyhow::anyhow!("Pending responses lock contention"))?;

    if let Some(tx) = pending.remove(&request_id) {
        let _ = tx.send(HttpResponse {
            status,
            headers,
            body: body.to_vec(),
        });
    }

    Ok(())
}

/// Close an HTTP server.
#[op2(fast)]
pub fn op_http_serve_close(state: &mut OpState, #[smi] server_id: u32) -> Result<(), AnyError> {
    let http_state = state.borrow_mut::<HttpServeState>();
    if let Some(server) = http_state.servers.remove(&server_id) {
        server.abort_handle.abort();
    }
    Ok(())
}

/// Get the op declarations for HTTP serve ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_http_serve(),
        op_http_serve_accept(),
        op_http_serve_respond(),
        op_http_serve_close(),
    ]
}

/// JavaScript bootstrap code for the HTTP serve API.
pub const HTTP_SERVE_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  const ops = Deno.core.ops;

  globalThis.__vtz_http = {
    serve(port, hostname, handler) {
      // op_http_serve is synchronous — the socket is already bound when it
      // returns, so the port is immediately available (matching Bun.serve).
      const server = ops.op_http_serve(port, hostname);
      let stopped = false;

      // Accept loop: runs in the background, dispatching requests to the handler
      (async () => {
        while (!stopped) {
          const req = await ops.op_http_serve_accept(server.id);
          if (req === null) break; // Server closing

          // Process request without blocking the accept loop
          (async () => {
            try {
              // Build full URL for Request constructor.
              // Prefer the Host header so the URL hostname matches what the
              // client used (e.g. "localhost"), not the bind address (e.g. "0.0.0.0").
              const hostHeader = req.headers.find(([k]) => k.toLowerCase() === 'host');
              const authority = hostHeader ? hostHeader[1] : `${hostname}:${server.port}`;
              const fullUrl = req.url.startsWith('http')
                ? req.url
                : `http://${authority}${req.url}`;

              // Decode base64 body if present
              let body = undefined;
              if (req.body) {
                const binaryStr = atob(req.body);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  bytes[i] = binaryStr.charCodeAt(i);
                }
                body = bytes;
              }

              const request = new Request(fullUrl, {
                method: req.method,
                headers: new Headers(req.headers),
                body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
              });

              const response = await handler(request);

              // Serialize response back
              const respHeaders = [];
              response.headers.forEach((v, k) => { respHeaders.push([k, v]); });
              const respBody = new Uint8Array(await response.arrayBuffer());

              ops.op_http_serve_respond(
                server.id,
                req.id,
                response.status,
                respHeaders,
                respBody,
              );
            } catch (err) {
              // Send 500 on handler error
              const errBody = new TextEncoder().encode(err.message || 'Internal Server Error');
              ops.op_http_serve_respond(
                server.id,
                req.id,
                500,
                [['content-type', 'text/plain']],
                errBody,
              );
            }
          })();
        }
      })();

      return {
        id: server.id,
        port: server.port,
        hostname: server.hostname,
        close() {
          stopped = true;
          ops.op_http_serve_close(server.id);
        },
      };
    },
  };
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap()
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

    #[tokio::test]
    async fn test_http_serve_starts_and_responds() {
        let mut rt = create_runtime();

        // Start server, fetch from it, close server — all in one async block
        // so run_event_loop can resolve after close() cancels the accept loop.
        let result = run_async(
            &mut rt,
            r#"
            const server = await globalThis.__vtz_http.serve(0, '127.0.0.1', async (req) => {
                return new Response('hello from vtz', {
                    status: 200,
                    headers: { 'content-type': 'text/plain' },
                });
            });

            const resp = await fetch('http://127.0.0.1:' + server.port + '/test');
            const body = await resp.text();
            server.close();
            return body;
            "#,
        )
        .await;

        assert_eq!(result.as_str().unwrap(), "hello from vtz");
    }

    #[tokio::test]
    async fn test_http_serve_port_zero() {
        let mut rt = create_runtime();

        let result = run_async(
            &mut rt,
            r#"
            const server = await globalThis.__vtz_http.serve(0, '127.0.0.1', async (req) => {
                return new Response('ok');
            });
            const port = server.port;
            server.close();
            return port;
            "#,
        )
        .await;

        let port = result.as_u64().unwrap();
        assert!(port > 0, "OS should assign a port > 0");
    }

    #[tokio::test]
    async fn test_http_serve_echoes_request_method() {
        let mut rt = create_runtime();

        let result = run_async(
            &mut rt,
            r#"
            const server = await globalThis.__vtz_http.serve(0, '127.0.0.1', async (req) => {
                return new Response(req.method, { status: 200 });
            });

            const resp = await fetch(
                'http://127.0.0.1:' + server.port + '/test',
                { method: 'POST' },
            );
            const body = await resp.text();
            server.close();
            return body;
            "#,
        )
        .await;

        assert_eq!(result.as_str().unwrap(), "POST");
    }

    /// req.url should use the Host header for the hostname component
    /// so that `new URL(req.url).origin` matches the client's perspective.
    #[tokio::test]
    async fn test_http_serve_uses_host_header_for_url() {
        let mut rt = create_runtime();

        let result = run_async(
            &mut rt,
            r#"
            const server = await globalThis.__vtz_http.serve(0, '0.0.0.0', async (req) => {
                const url = new URL(req.url);
                return new Response(url.hostname, { status: 200 });
            });

            // Fetch with Host header set to localhost
            const resp = await fetch(
                'http://localhost:' + server.port + '/test',
                { headers: { 'Host': 'localhost:' + server.port } },
            );
            const body = await resp.text();
            server.close();
            return body;
            "#,
        )
        .await;

        assert_eq!(
            result.as_str().unwrap(),
            "localhost",
            "req.url hostname should come from the Host header"
        );
    }
}
