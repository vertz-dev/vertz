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
    /// Signals the axum server to stop accepting new connections. Existing
    /// connections are allowed to complete (graceful shutdown) before the
    /// task exits.
    shutdown_tx: Option<oneshot::Sender<()>>,
}

/// Shared state for all HTTP servers, stored in OpState.
///
/// `pending_responses` is keyed globally by `request_id` (not scoped per
/// server) so that `op_http_serve_respond` can still dispatch replies after
/// the parent server has been closed but before in-flight requests drain.
#[derive(Default)]
pub struct HttpServeState {
    servers: HashMap<u32, ServerInstance>,
    pending_responses: PendingResponses,
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

    // Reuse the global (per-HttpServeState) pending-responses map keyed by
    // request_id. This lets `op_http_serve_respond` dispatch replies even
    // after the parent server has been closed but before in-flight requests
    // complete (graceful shutdown path).
    let pending_for_axum = Arc::clone(&state.borrow::<HttpServeState>().pending_responses);

    // Create a shutdown signal for graceful axum shutdown. When we want to
    // close the server, sending on `shutdown_tx` causes axum::serve to stop
    // accepting new connections and wait for in-flight responses to finish.
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    // Start the Axum server in a background task
    tokio::spawn(async move {
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

        // Run with graceful shutdown — axum waits for in-flight connections
        // to drain before returning.
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            })
            .await;
    });

    // Store server state
    {
        let http_state = state.borrow_mut::<HttpServeState>();
        http_state.servers.insert(
            server_id,
            ServerInstance {
                request_rx: Arc::new(TokioMutex::new(request_rx)),
                shutdown_tx: Some(shutdown_tx),
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
    // If the server was already closed between two accept iterations, return
    // null to let the JS accept loop terminate cleanly instead of throwing an
    // "Unknown server id" error (which would bubble into user code and fail
    // unrelated tests by poisoning the event loop).
    let request_rx = {
        let op_state = state.borrow();
        let http_state = op_state.borrow::<HttpServeState>();
        match http_state.servers.get(&server_id) {
            Some(server) => Arc::clone(&server.request_rx),
            None => return Ok(serde_json::Value::Null),
        }
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
    #[smi] _server_id: u32,
    #[smi] request_id: u32,
    #[smi] status: u16,
    #[serde] headers: Vec<(String, String)>,
    #[buffer] body: &[u8],
) -> Result<(), AnyError> {
    // Look up the pending response sender by global request_id. This works
    // even after the parent server has been removed from state, so in-flight
    // replies can still complete during graceful shutdown.
    //
    // Sync op but TokioMutex — try_lock should always succeed because the
    // axum handler only holds the lock briefly (to insert on request intake).
    let http_state = state.borrow_mut::<HttpServeState>();
    let mut pending = http_state
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
///
/// Signals graceful shutdown — axum stops accepting new connections and waits
/// for in-flight responses to finish before the task exits. In-flight replies
/// still resolve because `op_http_serve_respond` looks up its oneshot sender
/// in a global per-state map keyed by `request_id` (not per-server), so
/// removing the `ServerInstance` here is safe.
#[op2(fast)]
pub fn op_http_serve_close(state: &mut OpState, #[smi] server_id: u32) -> Result<(), AnyError> {
    let http_state = state.borrow_mut::<HttpServeState>();
    if let Some(mut server) = http_state.servers.remove(&server_id) {
        if let Some(tx) = server.shutdown_tx.take() {
            // Ignore error — rx can already be dropped if the task is gone.
            let _ = tx.send(());
        }
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

    /// Graceful shutdown: an in-flight request started before close() must
    /// still receive its response. This covers the regression fixed for #2718
    /// where close() used to abort the axum task mid-response.
    #[tokio::test]
    async fn test_http_serve_graceful_shutdown_preserves_in_flight_response() {
        let mut rt = create_runtime();

        let result = run_async(
            &mut rt,
            r#"
            let release;
            const gate = new Promise((r) => { release = r; });

            const server = globalThis.__vtz_http.serve(0, '127.0.0.1', async (_req) => {
                await gate;
                return new Response('survived', { status: 200 });
            });

            const fetchPromise = fetch('http://127.0.0.1:' + server.port + '/');
            // Wait for the handler to be running.
            await new Promise((r) => setTimeout(r, 20));
            server.close();
            // Now release the handler — it should still be able to respond.
            release();
            const resp = await fetchPromise;
            return await resp.text();
            "#,
        )
        .await;

        assert_eq!(result.as_str().unwrap(), "survived");
    }

    /// After close() completes, the accept loop must exit cleanly (no spurious
    /// "Unknown server id" errors) even if the outer event loop re-polls the
    /// accept op after the ServerInstance has been removed from state.
    #[tokio::test]
    async fn test_http_serve_close_does_not_throw_unknown_server_id() {
        let mut rt = create_runtime();

        let result = run_async(
            &mut rt,
            r#"
            const server = globalThis.__vtz_http.serve(0, '127.0.0.1', async () => {
                return new Response('ok');
            });
            server.close();
            // Give the accept loop a tick to run past the now-removed server.
            await new Promise((r) => setTimeout(r, 10));
            return 'done';
            "#,
        )
        .await;

        assert_eq!(result.as_str().unwrap(), "done");
    }
}
