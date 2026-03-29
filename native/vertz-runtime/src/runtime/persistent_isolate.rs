//! Persistent V8 isolate for API route delegation.
//!
//! Unlike the per-request SSR model (which creates a fresh V8 runtime per render),
//! the persistent isolate loads the server module once and caches the handler
//! function. Requests are dispatched via a channel to a dedicated V8 thread.
//!
//! This matches Cloudflare Workers' execution model: one isolate, handler loaded
//! once, all requests go through `handler(request) → Response`.

use std::path::PathBuf;
use std::sync::Arc;

use deno_core::error::AnyError;
use tokio::sync::{mpsc, oneshot};

/// Options for creating a persistent V8 isolate.
#[derive(Debug, Clone)]
pub struct PersistentIsolateOptions {
    /// Root directory of the project.
    pub root_dir: PathBuf,
    /// Path to the server entry file (e.g., `src/server.ts`).
    pub server_entry: PathBuf,
    /// Bounded channel capacity for request queue.
    pub channel_capacity: usize,
}

impl Default for PersistentIsolateOptions {
    fn default() -> Self {
        Self {
            root_dir: PathBuf::from("."),
            server_entry: PathBuf::from("src/server.ts"),
            channel_capacity: 256,
        }
    }
}

/// An HTTP request destined for the V8 handler, serializable across threads.
#[derive(Debug, Clone)]
pub struct IsolateRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
}

/// An HTTP response from the V8 handler, serializable across threads.
#[derive(Debug, Clone)]
pub struct IsolateResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

/// Message sent from Axum handlers to the V8 thread.
type RequestMessage = (
    IsolateRequest,
    oneshot::Sender<Result<IsolateResponse, String>>,
);

/// A persistent V8 isolate that handles API requests on a dedicated thread.
///
/// The isolate owns a `VertzJsRuntime` on a dedicated OS thread. Axum handlers
/// send requests via a bounded channel, and the V8 thread processes them through
/// the cached handler function.
pub struct PersistentIsolate {
    request_tx: mpsc::Sender<RequestMessage>,
    _runtime_thread: std::thread::JoinHandle<()>,
    initialized: Arc<std::sync::atomic::AtomicBool>,
}

impl PersistentIsolate {
    /// Create a new persistent isolate.
    ///
    /// Spawns a dedicated OS thread that owns the V8 runtime. The runtime is
    /// NOT initialized yet — call `initialize()` to load the server module.
    pub fn new(options: PersistentIsolateOptions) -> Result<Self, AnyError> {
        let (request_tx, request_rx) = mpsc::channel::<RequestMessage>(options.channel_capacity);
        let initialized = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let initialized_clone = Arc::clone(&initialized);
        let root_dir = options.root_dir.clone();
        let server_entry = options.server_entry.clone();

        let runtime_thread = std::thread::spawn(move || {
            // Create a new tokio runtime for this thread (V8/deno_core needs one)
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Failed to create tokio runtime for V8 thread");

            rt.block_on(async move {
                isolate_event_loop(root_dir, server_entry, request_rx, initialized_clone).await;
            });
        });

        Ok(Self {
            request_tx,
            _runtime_thread: runtime_thread,
            initialized,
        })
    }

    /// Check if the isolate has been initialized (server module loaded).
    pub fn is_initialized(&self) -> bool {
        self.initialized.load(std::sync::atomic::Ordering::Acquire)
    }

    /// Send a request to the persistent isolate and await the response.
    ///
    /// Returns an error if the channel is full (backpressure) or the isolate
    /// thread has panicked.
    pub async fn handle_request(
        &self,
        request: IsolateRequest,
    ) -> Result<IsolateResponse, AnyError> {
        let (response_tx, response_rx) = oneshot::channel();

        self.request_tx
            .send((request, response_tx))
            .await
            .map_err(|_| {
                deno_core::error::generic_error("Persistent isolate thread has stopped")
            })?;

        response_rx
            .await
            .map_err(|_| {
                deno_core::error::generic_error(
                    "Persistent isolate dropped response channel unexpectedly",
                )
            })?
            .map_err(deno_core::error::generic_error)
    }
}

/// The main event loop running on the dedicated V8 thread.
///
/// This function:
/// 1. Creates a VertzJsRuntime
/// 2. Loads the server module and extracts the handler
/// 3. Polls for incoming requests and dispatches them to the handler
/// 4. Runs the V8 event loop for pending async ops (DB queries, fetch)
async fn isolate_event_loop(
    root_dir: PathBuf,
    server_entry: PathBuf,
    mut request_rx: mpsc::Receiver<RequestMessage>,
    initialized: Arc<std::sync::atomic::AtomicBool>,
) {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    // 1. Create V8 runtime
    let mut runtime = match VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(root_dir.to_string_lossy().to_string()),
        capture_output: false,
        enable_inspector: false,
    }) {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("[Server] Failed to create persistent V8 runtime: {}", e);
            return;
        }
    };

    // 2. Load server module
    let entry_specifier = match deno_core::ModuleSpecifier::from_file_path(&server_entry) {
        Ok(s) => s,
        Err(_) => {
            eprintln!(
                "[Server] Invalid server entry path: {}",
                server_entry.display()
            );
            return;
        }
    };

    // Load the server module and extract handler
    if let Err(e) = runtime.load_main_module(&entry_specifier).await {
        eprintln!("[Server] Failed to load server module: {}", e);
        return;
    }

    // Extract the handler function by evaluating JS that reads the default export
    let handler_check = runtime.execute_script(
        "<handler-check>",
        r#"
        (function() {
            const mod = globalThis.__vertz_server_module;
            if (!mod) return { ok: false, error: 'No server module found. Ensure server.ts has a default export.' };
            const instance = mod.default || mod;
            const handler = instance.requestHandler || instance.handler;
            if (typeof handler !== 'function') return { ok: false, error: 'Server module does not export a handler function.' };
            globalThis.__vertz_api_handler = handler;
            return { ok: true };
        })()
        "#,
    );

    match handler_check {
        Ok(val) => {
            if val.get("ok") == Some(&serde_json::Value::Bool(true)) {
                initialized.store(true, std::sync::atomic::Ordering::Release);
                eprintln!("[Server] API handler loaded (persistent isolate ��� module state persists across requests)");
            } else {
                let error = val
                    .get("error")
                    .and_then(|e| e.as_str())
                    .unwrap_or("Unknown error");
                eprintln!("[Server] Failed to extract API handler: {}", error);
                return;
            }
        }
        Err(e) => {
            eprintln!("[Server] Failed to extract API handler: {}", e);
            return;
        }
    }

    // 3. Main request processing loop
    loop {
        tokio::select! {
            msg = request_rx.recv() => {
                match msg {
                    Some((request, response_tx)) => {
                        let result = dispatch_request(&mut runtime, &request).await;
                        let _ = response_tx.send(result);
                    }
                    None => {
                        // Channel closed — shut down
                        eprintln!("[Server] Persistent isolate shutting down (channel closed)");
                        break;
                    }
                }
            }
        }
    }
}

/// Dispatch a single request to the V8 handler and collect the response.
async fn dispatch_request(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
    request: &IsolateRequest,
) -> Result<IsolateResponse, String> {
    // Serialize request data into JS
    let headers_json =
        serde_json::to_string(&request.headers).map_err(|e| format!("Header serialize: {}", e))?;
    let body_b64 = request
        .body
        .as_ref()
        .map(|b| base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b));

    let body_arg = match &body_b64 {
        Some(b) => format!("Uint8Array.from(atob('{}'), c => c.charCodeAt(0))", b),
        None => "null".to_string(),
    };

    // Store result in a global and read it back after the event loop resolves.
    // We can't use execute_script's return value for async code (it returns the
    // Promise object, not the resolved value).
    let js_code_v2 = format!(
        r#"
        (async function() {{
            const handler = globalThis.__vertz_api_handler;
            if (!handler) {{
                globalThis.__vertz_last_response = JSON.stringify({{ error: 'No handler' }});
                return;
            }}

            const headers = new Headers();
            const headerPairs = {headers_json};
            for (const [k, v] of headerPairs) headers.set(k, v);

            const body = {body_arg};
            const init = {{ method: '{method}', headers: headers }};
            if (body && '{method}' !== 'GET' && '{method}' !== 'HEAD') {{
                init.body = body;
            }}
            const request = new Request('{url}', init);

            try {{
                const response = await handler(request);
                const responseBody = await response.text();
                const responseHeaders = [];
                response.headers.forEach((v, k) => responseHeaders.push([k, v]));
                globalThis.__vertz_last_response = JSON.stringify({{
                    status: response.status,
                    headers: responseHeaders,
                    body: responseBody,
                }});
            }} catch (e) {{
                globalThis.__vertz_last_response = JSON.stringify({{
                    error: e.message || String(e),
                    stack: e.stack || '',
                }});
            }}
        }})()
        "#,
        headers_json = headers_json,
        body_arg = body_arg,
        url = request.url,
        method = request.method,
    );

    runtime
        .execute_script_void("<api-dispatch>", &js_code_v2)
        .map_err(|e| format!("JS execution error: {}", e))?;

    runtime
        .run_event_loop()
        .await
        .map_err(|e| format!("Event loop error: {}", e))?;

    // Read the result from the global
    let result = runtime
        .execute_script(
            "<read-response>",
            "globalThis.__vertz_last_response || '{\"error\": \"No response\"}'",
        )
        .map_err(|e| format!("Read response error: {}", e))?;

    let result_str = result.as_str().unwrap_or("{}");
    let parsed: serde_json::Value =
        serde_json::from_str(result_str).map_err(|e| format!("Parse response: {}", e))?;

    if let Some(error) = parsed.get("error").and_then(|e| e.as_str()) {
        return Err(format!("Handler error: {}", error));
    }

    let status = parsed.get("status").and_then(|s| s.as_u64()).unwrap_or(200) as u16;
    let headers: Vec<(String, String)> = parsed
        .get("headers")
        .and_then(|h| serde_json::from_value(h.clone()).ok())
        .unwrap_or_default();
    let body = parsed
        .get("body")
        .and_then(|b| b.as_str())
        .unwrap_or("")
        .as_bytes()
        .to_vec();

    Ok(IsolateResponse {
        status,
        headers,
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_options() {
        let opts = PersistentIsolateOptions::default();
        assert_eq!(opts.channel_capacity, 256);
        assert_eq!(opts.server_entry, PathBuf::from("src/server.ts"));
    }

    #[test]
    fn test_isolate_request_debug() {
        let req = IsolateRequest {
            method: "GET".to_string(),
            url: "http://localhost:4200/api/tasks".to_string(),
            headers: vec![("content-type".to_string(), "application/json".to_string())],
            body: None,
        };
        let debug = format!("{:?}", req);
        assert!(debug.contains("GET"));
        assert!(debug.contains("/api/tasks"));
    }

    #[test]
    fn test_isolate_response_debug() {
        let res = IsolateResponse {
            status: 200,
            headers: vec![("content-type".to_string(), "application/json".to_string())],
            body: b"{}".to_vec(),
        };
        assert_eq!(res.status, 200);
        assert_eq!(res.body, b"{}");
    }

    #[tokio::test]
    async fn test_create_persistent_isolate() {
        // This test verifies we can create a persistent isolate and it starts
        // its V8 thread. It won't have a handler since there's no real server.ts.
        let opts = PersistentIsolateOptions {
            root_dir: PathBuf::from(env!("CARGO_MANIFEST_DIR")),
            server_entry: PathBuf::from("/nonexistent/server.ts"),
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts);
        assert!(isolate.is_ok());

        let isolate = isolate.unwrap();
        // Give the thread a moment to start and fail gracefully
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        // The isolate should NOT be initialized since server.ts doesn't exist
        assert!(!isolate.is_initialized());
    }

    #[tokio::test]
    async fn test_handle_request_without_initialization() {
        let opts = PersistentIsolateOptions {
            root_dir: PathBuf::from(env!("CARGO_MANIFEST_DIR")),
            server_entry: PathBuf::from("/nonexistent/server.ts"),
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        let request = IsolateRequest {
            method: "GET".to_string(),
            url: "http://localhost:4200/api/tasks".to_string(),
            headers: vec![],
            body: None,
        };

        // Should fail because the isolate thread stopped (no valid server module)
        let result = isolate.handle_request(request).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_isolate_with_inline_handler() {
        // Create a minimal JS server module that returns a fixed response.
        // We'll write it to a temp file and load it.
        let temp_dir = tempfile::tempdir().unwrap();
        let server_path = temp_dir.path().join("server.js");
        std::fs::write(
            &server_path,
            r#"
            const handler = async (request) => {
                const url = new URL(request.url);
                if (url.pathname === '/api/health') {
                    return new Response(JSON.stringify({ status: 'ok' }), {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    });
                }
                return new Response('Not Found', { status: 404 });
            };
            globalThis.__vertz_server_module = { default: { handler } };
            "#,
        )
        .unwrap();

        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            server_entry: server_path,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();

        // Wait for initialization
        for _ in 0..50 {
            if isolate.is_initialized() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        assert!(isolate.is_initialized(), "Isolate should be initialized");

        // Send a request
        let request = IsolateRequest {
            method: "GET".to_string(),
            url: "http://localhost:4200/api/health".to_string(),
            headers: vec![],
            body: None,
        };

        let response = isolate.handle_request(request).await;
        assert!(response.is_ok(), "Request should succeed: {:?}", response);

        let response = response.unwrap();
        assert_eq!(response.status, 200);

        let body_str = String::from_utf8(response.body).unwrap();
        assert!(
            body_str.contains("ok"),
            "Body should contain 'ok': {}",
            body_str
        );
    }

    #[tokio::test]
    async fn test_isolate_handles_multiple_requests() {
        let temp_dir = tempfile::tempdir().unwrap();
        let server_path = temp_dir.path().join("server.js");
        std::fs::write(
            &server_path,
            r#"
            let requestCount = 0;
            const handler = async (request) => {
                requestCount++;
                return new Response(JSON.stringify({ count: requestCount }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            };
            globalThis.__vertz_server_module = { default: { handler } };
            "#,
        )
        .unwrap();

        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            server_entry: server_path,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        for _ in 0..50 {
            if isolate.is_initialized() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        assert!(isolate.is_initialized());

        // Send three requests — state should persist across them
        for expected_count in 1..=3 {
            let request = IsolateRequest {
                method: "GET".to_string(),
                url: "http://localhost:4200/api/counter".to_string(),
                headers: vec![],
                body: None,
            };

            let response = isolate.handle_request(request).await.unwrap();
            assert_eq!(response.status, 200);

            let body: serde_json::Value = serde_json::from_slice(&response.body).unwrap();
            assert_eq!(
                body["count"], expected_count,
                "Request {} should have count {}",
                expected_count, expected_count
            );
        }
    }

    #[tokio::test]
    async fn test_isolate_handler_error_does_not_crash() {
        let temp_dir = tempfile::tempdir().unwrap();
        let server_path = temp_dir.path().join("server.js");
        std::fs::write(
            &server_path,
            r#"
            const handler = async (request) => {
                const url = new URL(request.url);
                if (url.pathname === '/api/error') {
                    throw new Error('Intentional test error');
                }
                return new Response('ok', { status: 200 });
            };
            globalThis.__vertz_server_module = { default: { handler } };
            "#,
        )
        .unwrap();

        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            server_entry: server_path,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        for _ in 0..50 {
            if isolate.is_initialized() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        assert!(isolate.is_initialized());

        // Request that throws
        let error_req = IsolateRequest {
            method: "GET".to_string(),
            url: "http://localhost:4200/api/error".to_string(),
            headers: vec![],
            body: None,
        };
        let result = isolate.handle_request(error_req).await;
        assert!(result.is_err(), "Should return error for throwing handler");

        // Next request should still work (isolate didn't crash)
        let ok_req = IsolateRequest {
            method: "GET".to_string(),
            url: "http://localhost:4200/api/ok".to_string(),
            headers: vec![],
            body: None,
        };
        let result = isolate.handle_request(ok_req).await;
        assert!(
            result.is_ok(),
            "Isolate should still work after error: {:?}",
            result
        );
        assert_eq!(result.unwrap().status, 200);
    }

    #[tokio::test]
    async fn test_isolate_404_for_unknown_route() {
        let temp_dir = tempfile::tempdir().unwrap();
        let server_path = temp_dir.path().join("server.js");
        std::fs::write(
            &server_path,
            r#"
            const handler = async (request) => {
                return new Response('Not Found', { status: 404 });
            };
            globalThis.__vertz_server_module = { default: { handler } };
            "#,
        )
        .unwrap();

        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            server_entry: server_path,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        for _ in 0..50 {
            if isolate.is_initialized() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        let request = IsolateRequest {
            method: "GET".to_string(),
            url: "http://localhost:4200/api/nonexistent".to_string(),
            headers: vec![],
            body: None,
        };

        let response = isolate.handle_request(request).await.unwrap();
        assert_eq!(response.status, 404);
    }
}
