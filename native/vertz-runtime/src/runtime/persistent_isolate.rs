//! Persistent V8 isolate for API route delegation and SSR rendering.
//!
//! Unlike the per-request SSR model (which creates a fresh V8 runtime per render),
//! the persistent isolate loads modules once and caches them. Both API requests
//! and SSR renders are dispatched via a channel to a dedicated V8 thread.
//!
//! This matches Cloudflare Workers' execution model: one isolate, modules loaded
//! once, all requests go through the same runtime.

use std::path::PathBuf;
use std::sync::Arc;

use deno_core::error::AnyError;
use tokio::sync::{mpsc, oneshot};

/// Options for creating a persistent V8 isolate.
#[derive(Debug, Clone)]
pub struct PersistentIsolateOptions {
    /// Root directory of the project.
    pub root_dir: PathBuf,
    /// App entry file for SSR rendering (e.g., `src/app.tsx`).
    pub entry_file: PathBuf,
    /// Optional server entry file for API routes (e.g., `src/server.ts`).
    /// When `None`, the isolate only supports SSR rendering.
    pub server_entry: Option<PathBuf>,
    /// Bounded channel capacity for request queue.
    pub channel_capacity: usize,
}

impl Default for PersistentIsolateOptions {
    fn default() -> Self {
        Self {
            root_dir: PathBuf::from("."),
            entry_file: PathBuf::from("src/app.tsx"),
            server_entry: None,
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

/// An SSR render request dispatched to the V8 thread.
#[derive(Debug, Clone)]
pub struct SsrRequest {
    /// URL to render (e.g., `/tasks/123`).
    pub url: String,
    /// JSON-serialized session data.
    pub session_json: Option<String>,
}

/// An SSR render response from the V8 thread.
#[derive(Debug, Clone)]
pub struct SsrResponse {
    /// The rendered SSR content (inner HTML of #app).
    pub content: String,
    /// CSS collected during rendering.
    pub css_entries: Vec<(String, Option<String>)>,
    /// Hydration data JSON.
    pub hydration_json: String,
    /// Whether rendering succeeded.
    pub is_ssr: bool,
    /// Error message if SSR failed.
    pub error: Option<String>,
    /// Render time in milliseconds.
    pub render_time_ms: f64,
}

/// Messages dispatched to the persistent isolate's V8 thread.
enum IsolateMessage {
    /// API request: dispatch to the server handler.
    Api(
        IsolateRequest,
        oneshot::Sender<Result<IsolateResponse, String>>,
    ),
    /// SSR render request: reset DOM, render app, collect CSS/hydration.
    Ssr(SsrRequest, oneshot::Sender<Result<SsrResponse, String>>),
}

/// A persistent V8 isolate that handles API requests and SSR renders on a
/// dedicated thread.
///
/// The isolate owns a `VertzJsRuntime` on a dedicated OS thread. Axum handlers
/// send requests via a bounded channel, and the V8 thread processes them
/// sequentially.
pub struct PersistentIsolate {
    message_tx: mpsc::Sender<IsolateMessage>,
    _runtime_thread: std::thread::JoinHandle<()>,
    initialized: Arc<std::sync::atomic::AtomicBool>,
    has_api_handler: Arc<std::sync::atomic::AtomicBool>,
    options: PersistentIsolateOptions,
}

impl PersistentIsolate {
    /// Create a new persistent isolate.
    ///
    /// Spawns a dedicated OS thread that owns the V8 runtime. The runtime
    /// loads the DOM shim, app entry module, and optionally the server module.
    pub fn new(options: PersistentIsolateOptions) -> Result<Self, AnyError> {
        let (message_tx, message_rx) = mpsc::channel::<IsolateMessage>(options.channel_capacity);
        let initialized = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let has_api_handler = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let initialized_clone = Arc::clone(&initialized);
        let has_api_clone = Arc::clone(&has_api_handler);

        let root_dir = options.root_dir.clone();
        let entry_file = options.entry_file.clone();
        let server_entry = options.server_entry.clone();

        let runtime_thread = std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Failed to create tokio runtime for V8 thread");

            rt.block_on(async move {
                isolate_event_loop(
                    root_dir,
                    entry_file,
                    server_entry,
                    message_rx,
                    initialized_clone,
                    has_api_clone,
                )
                .await;
            });
        });

        Ok(Self {
            message_tx,
            _runtime_thread: runtime_thread,
            initialized,
            has_api_handler,
            options,
        })
    }

    /// Restart the persistent isolate with the same options.
    ///
    /// Drops the old channel sender (signals the V8 thread to shut down),
    /// then creates a fresh isolate. Returns the new isolate on success,
    /// or an error if the new isolate fails to create.
    ///
    /// The caller should swap this into wherever the `Arc<PersistentIsolate>`
    /// is stored. The old isolate's V8 thread will terminate when the channel
    /// closes and the last message is processed.
    pub fn restart(self) -> Result<Self, AnyError> {
        let start = std::time::Instant::now();
        let opts = self.options.clone();
        // Drop self — closes the channel sender, V8 thread will shut down
        drop(self);
        let new = Self::new(opts)?;
        let elapsed = start.elapsed();
        eprintln!(
            "[Server] Handler restarted in {:.1}ms",
            elapsed.as_secs_f64() * 1000.0
        );
        Ok(new)
    }

    /// Get the options this isolate was created with.
    pub fn options(&self) -> &PersistentIsolateOptions {
        &self.options
    }

    /// Check if the isolate has been initialized (modules loaded, ready for requests).
    pub fn is_initialized(&self) -> bool {
        self.initialized.load(std::sync::atomic::Ordering::Acquire)
    }

    /// Check if the isolate has an API handler loaded (server_entry was provided and loaded).
    pub fn has_api_handler(&self) -> bool {
        self.has_api_handler
            .load(std::sync::atomic::Ordering::Acquire)
    }

    /// Send an API request to the persistent isolate and await the response.
    pub async fn handle_request(
        &self,
        request: IsolateRequest,
    ) -> Result<IsolateResponse, AnyError> {
        let (response_tx, response_rx) = oneshot::channel();

        self.message_tx
            .send(IsolateMessage::Api(request, response_tx))
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

    /// Send an SSR render request to the persistent isolate and await the response.
    pub async fn handle_ssr(&self, request: SsrRequest) -> Result<SsrResponse, AnyError> {
        let (response_tx, response_rx) = oneshot::channel();

        self.message_tx
            .send(IsolateMessage::Ssr(request, response_tx))
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
/// 1. Creates a VertzJsRuntime
/// 2. Loads DOM shim (for SSR) and ALS polyfill
/// 3. Loads the app entry module (for SSR rendering)
/// 4. Optionally loads the server module and extracts handler (for API routes)
/// 5. Processes incoming messages (API or SSR)
async fn isolate_event_loop(
    root_dir: PathBuf,
    entry_file: PathBuf,
    server_entry: Option<PathBuf>,
    mut message_rx: mpsc::Receiver<IsolateMessage>,
    initialized: Arc<std::sync::atomic::AtomicBool>,
    has_api_handler: Arc<std::sync::atomic::AtomicBool>,
) {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    // 1. Create V8 runtime
    let mut runtime = match VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(root_dir.to_string_lossy().to_string()),
        capture_output: false,
        enable_inspector: false,
        compile_cache: false,
    }) {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("[Server] Failed to create persistent V8 runtime: {}", e);
            return;
        }
    };

    // 2. Load async context polyfill (must be before DOM shim to capture all promises)
    if let Err(e) = crate::runtime::async_context::load_async_context(&mut runtime) {
        eprintln!("[Server] Failed to load async context polyfill: {}", e);
        return;
    }
    if let Err(e) = crate::ssr::dom_shim::load_dom_shim(&mut runtime) {
        eprintln!("[Server] Failed to load DOM shim: {}", e);
        return;
    }

    // Initialize SSR tracking globals
    if let Err(e) = runtime.execute_script_void(
        "[vertz:ssr-init]",
        "globalThis.__vertz_ssr_queries = {}; globalThis.__vertz_ssr_mode = true;",
    ) {
        eprintln!("[Server] Failed to initialize SSR tracking: {}", e);
        return;
    }

    // 3. Load app entry module (for SSR rendering)
    if entry_file.exists() {
        let entry_specifier = match deno_core::ModuleSpecifier::from_file_path(&entry_file) {
            Ok(s) => s,
            Err(_) => {
                eprintln!("[Server] Invalid app entry path: {}", entry_file.display());
                // Continue without SSR — API routes may still work
                initialized.store(true, std::sync::atomic::Ordering::Release);
                process_messages(&mut runtime, &mut message_rx, false).await;
                return;
            }
        };

        if let Err(e) = runtime.load_main_module(&entry_specifier).await {
            eprintln!(
                "[Server] Failed to load app entry module ({}): {}",
                entry_file.display(),
                e
            );
            // Continue anyway — app entry failing doesn't prevent API routes
        } else {
            eprintln!(
                "[Server] App entry loaded for SSR: {}",
                entry_file.display()
            );
        }
    }

    // 4. Optionally load server module for API routes.
    //
    // Two-step process:
    // a) Load the server module directly (file:// URL the loader can handle)
    // b) If the module didn't set globalThis.__vertz_server_module directly
    //    (test fixtures do this), capture its exports via dynamic import
    //    (the module is already loaded, so import() returns the cached module)
    if let Some(ref server_entry_path) = server_entry {
        let entry_specifier = match deno_core::ModuleSpecifier::from_file_path(server_entry_path) {
            Ok(s) => s,
            Err(_) => {
                eprintln!(
                    "[Server] Invalid server entry path: {}",
                    server_entry_path.display()
                );
                initialized.store(true, std::sync::atomic::Ordering::Release);
                process_messages(&mut runtime, &mut message_rx, true).await;
                return;
            }
        };

        // Step a: Load the server module directly
        let load_result = if entry_file.exists() {
            runtime.load_side_module(&entry_specifier).await
        } else {
            runtime.load_main_module(&entry_specifier).await
        };

        match load_result {
            Ok(()) => {
                // Step b: Capture module exports if not set by the module itself.
                // Real server.ts files use `export default createServer(...)` — the
                // module doesn't set the global. We use dynamic import (cached, no
                // re-evaluation) to capture the exports.
                let safe_url = serde_json::to_string(entry_specifier.as_str())
                    .unwrap_or_else(|_| format!("\"{}\"", entry_specifier.as_str()));
                let capture_js = format!(
                    r#"(async function() {{
                        if (!globalThis.__vertz_server_module) {{
                            const mod = await import({});
                            globalThis.__vertz_server_module = mod;
                        }}
                    }})()"#,
                    safe_url
                );
                if let Err(e) = runtime.execute_script_void("<capture-server-exports>", &capture_js)
                {
                    eprintln!("[Server] Failed to capture server exports: {}", e);
                }
                if let Err(e) = runtime.run_event_loop().await {
                    eprintln!("[Server] Event loop error during export capture: {}", e);
                }

                // Extract the handler function from the module
                match extract_api_handler(&mut runtime) {
                    Ok(true) => {
                        has_api_handler.store(true, std::sync::atomic::Ordering::Release);
                        // Install fetch interceptor for SSR
                        if let Err(e) =
                            runtime.execute_script_void("<fetch-interceptor>", FETCH_INTERCEPTOR_JS)
                        {
                            eprintln!("[Server] Failed to install fetch interceptor: {}", e);
                        } else {
                            eprintln!("[Server] Fetch interceptor installed for /api/ paths");
                        }
                        eprintln!(
                            "[Server] API handler loaded (persistent isolate -- module state persists across requests)"
                        );
                    }
                    Ok(false) => {
                        eprintln!("[Server] Server module loaded but no handler found");
                    }
                    Err(e) => {
                        eprintln!("[Server] Failed to extract API handler: {}", e);
                    }
                }
            }
            Err(e) => {
                eprintln!("[Server] Failed to load server module: {}", e);
                // Continue with SSR-only mode
            }
        }
    }

    // Mark as initialized (even without API handler — SSR is still available)
    initialized.store(true, std::sync::atomic::Ordering::Release);

    // 5. Main message processing loop (SSR enabled — app entry loaded)
    process_messages(&mut runtime, &mut message_rx, true).await;
}

/// Extract the API handler from the loaded server module.
fn extract_api_handler(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
) -> Result<bool, String> {
    let handler_check = runtime
        .execute_script(
            "<handler-check>",
            r#"
        (function() {
            const mod = globalThis.__vertz_server_module;
            if (!mod) return { ok: false, error: 'No server module found.' };
            const instance = mod.default || mod;
            const handler = instance.requestHandler || instance.handler;
            if (typeof handler !== 'function') return { ok: false, error: 'No handler function.' };
            globalThis.__vertz_api_handler = handler;
            return { ok: true };
        })()
        "#,
        )
        .map_err(|e| e.to_string())?;

    if handler_check.get("ok") == Some(&serde_json::Value::Bool(true)) {
        Ok(true)
    } else {
        let error = handler_check
            .get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("Unknown error");
        eprintln!("[Server] Handler extraction: {}", error);
        Ok(false)
    }
}

/// Process messages from the channel. When `ssr_enabled` is false, SSR requests
/// receive an error immediately (API-only mode after app entry failed to load).
async fn process_messages(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
    message_rx: &mut mpsc::Receiver<IsolateMessage>,
    ssr_enabled: bool,
) {
    while let Some(msg) = message_rx.recv().await {
        match msg {
            IsolateMessage::Api(request, response_tx) => {
                let result = dispatch_api_request(runtime, &request).await;
                let _ = response_tx.send(result);
            }
            IsolateMessage::Ssr(request, response_tx) => {
                if ssr_enabled {
                    let result = dispatch_ssr_request(runtime, &request);
                    let _ = response_tx.send(result);
                } else {
                    let _ = response_tx.send(Err(
                        "SSR not available: app entry module failed to load".to_string(),
                    ));
                }
            }
        }
    }
    eprintln!("[Server] Persistent isolate shutting down (channel closed)");
}

/// JavaScript for dispatching API requests. Reads request data from
/// `globalThis.__vertz_dispatch_req` (set from Rust via JSON) instead of
/// string interpolation — preventing injection via URL, method, or headers.
const API_DISPATCH_JS: &str = r#"
(async function() {
    const handler = globalThis.__vertz_api_handler;
    const reqData = globalThis.__vertz_dispatch_req;
    delete globalThis.__vertz_dispatch_req;
    delete globalThis.__vertz_last_response;

    if (!handler) {
        globalThis.__vertz_last_response = JSON.stringify({ error: 'No handler' });
        return;
    }

    const headers = new Headers();
    for (const [k, v] of (reqData.headers || [])) headers.set(k, v);

    const init = { method: reqData.method, headers: headers };
    if (reqData.bodyB64 && reqData.method !== 'GET' && reqData.method !== 'HEAD') {
        init.body = Uint8Array.from(atob(reqData.bodyB64), c => c.charCodeAt(0));
    }
    const request = new Request(reqData.url, init);

    try {
        const response = await handler(request);
        const buf = await response.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bodyB64 = '';
        if (bytes.length > 0) {
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            bodyB64 = btoa(bin);
        }
        const responseHeaders = [];
        response.headers.forEach((v, k) => responseHeaders.push([k, v]));
        globalThis.__vertz_last_response = JSON.stringify({
            status: response.status,
            headers: responseHeaders,
            bodyB64: bodyB64,
        });
    } catch (e) {
        globalThis.__vertz_last_response = JSON.stringify({
            error: e.message || String(e),
            stack: e.stack || '',
        });
    }
})()
"#;

/// Dispatch a single API request to the V8 handler and collect the response.
///
/// Request data is passed through `globalThis.__vertz_dispatch_req` as JSON
/// to avoid JavaScript injection via URL, method, or header values.
async fn dispatch_api_request(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
    request: &IsolateRequest,
) -> Result<IsolateResponse, String> {
    // Serialize request data as JSON and pass through a global (safe from injection)
    let body_b64 = request
        .body
        .as_ref()
        .map(|b| base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b));

    let req_data = serde_json::json!({
        "method": request.method,
        "url": request.url,
        "headers": request.headers,
        "bodyB64": body_b64,
    });

    let setup_js = format!(
        "globalThis.__vertz_dispatch_req = {};",
        serde_json::to_string(&req_data).map_err(|e| format!("Serialize request: {}", e))?
    );

    runtime
        .execute_script_void("<api-setup>", &setup_js)
        .map_err(|e| format!("Request setup error: {}", e))?;

    runtime
        .execute_script_void("<api-dispatch>", API_DISPATCH_JS)
        .map_err(|e| format!("JS execution error: {}", e))?;

    runtime
        .run_event_loop()
        .await
        .map_err(|e| format!("Event loop error: {}", e))?;

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
    let body = match parsed.get("bodyB64").and_then(|b| b.as_str()) {
        Some(b64) if !b64.is_empty() => {
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64)
                .map_err(|e| format!("Decode response body: {}", e))?
        }
        _ => Vec::new(),
    };

    Ok(IsolateResponse {
        status,
        headers,
        body,
    })
}

/// JavaScript to install fetch interception for SSR.
///
/// Wraps `globalThis.fetch` with a proxy that intercepts requests matching
/// configured path prefixes (e.g., `/api/`). Intercepted requests are routed
/// directly to the in-memory API handler — no HTTP self-fetch.
///
/// External requests (different origin or non-matching paths) pass through
/// to the original fetch implementation.
const FETCH_INTERCEPTOR_JS: &str = r#"
(function() {
    const handler = globalThis.__vertz_api_handler;
    const prefixes = globalThis.__vertz_intercept_prefixes || ['/api/'];
    const originalFetch = globalThis.fetch;
    const selfOrigin = globalThis.location ? globalThis.location.origin : '';

    globalThis.__vertz_original_fetch = originalFetch;
    globalThis.__vertz_fetch_intercept_count = 0;

    globalThis.fetch = async function(input, init) {
        const req = input instanceof Request ? input : new Request(input, init);
        const url = new URL(req.url, selfOrigin || 'http://localhost');

        // Only intercept same-origin requests matching the configured prefixes
        const isSameOrigin = !selfOrigin || url.origin === selfOrigin
            || url.origin === 'http://localhost';
        const matchesPrefix = prefixes.some(p => url.pathname.startsWith(p));

        if (handler && isSameOrigin && matchesPrefix) {
            globalThis.__vertz_fetch_intercept_count++;
            return handler(req);
        }

        return originalFetch(input, init);
    };
})()
"#;

/// Reset DOM state between SSR requests.
///
/// Clears document body, head, CSS collector, and SSR tracking. This ensures
/// each SSR render starts with a clean slate (no leaked state from previous renders).
const SSR_RESET_JS: &str = r#"
(function() {
    // Reset document body — recreate empty #app container
    document.body.childNodes = [];
    const app = document.createElement('div');
    app.setAttribute('id', 'app');
    document.body.appendChild(app);

    // Reset document head
    document.head.childNodes = [];

    // Clear collected CSS
    if (typeof __vertz_clear_collected_css === 'function') {
        __vertz_clear_collected_css();
    }

    // Reset SSR query tracking
    globalThis.__vertz_ssr_queries = {};
    globalThis.__vertz_ssr_mode = true;

    // Clear any previous render result
    delete globalThis.__vertz_last_ssr_result;
})()
"#;

/// JavaScript to execute the SSR render and collect results.
const SSR_RENDER_JS: &str = r#"
(function() {
    // Attempt to render via SSR render function or DOM content
    let content = '';

    if (typeof globalThis.__vertz_ssr_render === 'function') {
        const result = globalThis.__vertz_ssr_render(globalThis.location.pathname);
        if (typeof result === 'string') content = result;
        else if (result && typeof result.outerHTML === 'string') content = result.outerHTML;
        else if (result && typeof result.innerHTML === 'string') content = result.innerHTML;
    } else {
        const appEl = document.getElementById('app') || document.body.querySelector('#app');
        if (appEl && appEl.childNodes.length > 0) {
            content = appEl.innerHTML;
        } else {
            const bodyChildren = Array.from(document.body.childNodes).filter(
                n => !(n.nodeType === 1 && n.getAttribute && n.getAttribute('id') === 'app' && n.childNodes.length === 0)
            );
            if (bodyChildren.length > 0) {
                content = bodyChildren.map(n => n.outerHTML || n.textContent || '').join('');
            }
        }
    }

    // Collect CSS entries
    let cssEntries = [];
    if (typeof __vertz_get_collected_css === 'function') {
        cssEntries = __vertz_get_collected_css().map(e => ({ css: e.css, id: e.id || null }));
    }

    // Collect hydration data
    const hydrationData = {
        url: globalThis.location.pathname,
        queries: globalThis.__vertz_ssr_queries || {},
    };

    return JSON.stringify({
        content: content,
        cssEntries: cssEntries,
        hydrationJson: JSON.stringify(hydrationData),
        isSsr: content.length > 0,
    });
})()
"#;

/// Dispatch a single SSR render request in the V8 isolate.
///
/// 1. Resets DOM state (clean slate)
/// 2. Sets location to the requested URL
/// 3. Installs session data
/// 4. Renders app content
/// 5. Collects CSS and hydration data
fn dispatch_ssr_request(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
    request: &SsrRequest,
) -> Result<SsrResponse, String> {
    let start = std::time::Instant::now();

    // 1. Reset DOM state
    runtime
        .execute_script_void("<ssr-reset>", SSR_RESET_JS)
        .map_err(|e| format!("DOM reset error: {}", e))?;

    // 2. Set location
    crate::ssr::dom_shim::set_ssr_location(runtime, &request.url)
        .map_err(|e| format!("Set location error: {}", e))?;

    // 3. Install session data if provided.
    // Defense-in-depth: validate input is valid JSON, then re-serialize through
    // serde_json to guarantee the output is safe for JS interpolation.
    if let Some(ref session_json) = request.session_json {
        let validated: serde_json::Value = serde_json::from_str(session_json)
            .map_err(|e| format!("Invalid session JSON: {}", e))?;
        let safe_json =
            serde_json::to_string(&validated).map_err(|e| format!("Session serialize: {}", e))?;
        let js = format!("globalThis.__vertz_session = {};", safe_json);
        runtime
            .execute_script_void("<ssr-session>", &js)
            .map_err(|e| format!("Session install error: {}", e))?;
    }

    // 4. Render and collect results
    let result = runtime
        .execute_script("<ssr-render>", SSR_RENDER_JS)
        .map_err(|e| format!("SSR render error: {}", e))?;

    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    let result_str = result.as_str().unwrap_or("{}");
    let parsed: serde_json::Value =
        serde_json::from_str(result_str).map_err(|e| format!("Parse SSR result: {}", e))?;

    let content = parsed
        .get("content")
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    let css_entries: Vec<(String, Option<String>)> = parsed
        .get("cssEntries")
        .and_then(|arr| arr.as_array())
        .map(|arr| {
            arr.iter()
                .map(|e| {
                    let css = e["css"].as_str().unwrap_or("").to_string();
                    let id = e["id"].as_str().map(|s| s.to_string());
                    (css, id)
                })
                .collect()
        })
        .unwrap_or_default();

    let hydration_json = parsed
        .get("hydrationJson")
        .and_then(|h| h.as_str())
        .unwrap_or("{}")
        .to_string();

    let is_ssr = parsed
        .get("isSsr")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    Ok(SsrResponse {
        content,
        css_entries,
        hydration_json,
        is_ssr,
        error: None,
        render_time_ms: elapsed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_options() {
        let opts = PersistentIsolateOptions::default();
        assert_eq!(opts.channel_capacity, 256);
        assert_eq!(opts.entry_file, PathBuf::from("src/app.tsx"));
        assert!(opts.server_entry.is_none());
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

    /// Helper: create an isolate with only a server entry (API-only mode).
    fn api_only_opts(temp_dir: &tempfile::TempDir, server_js: &str) -> PersistentIsolateOptions {
        let server_path = temp_dir.path().join("server.js");
        std::fs::write(&server_path, server_js).unwrap();
        PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            entry_file: temp_dir.path().join("nonexistent-app.tsx"),
            server_entry: Some(server_path),
            channel_capacity: 16,
        }
    }

    /// Helper: wait for isolate initialization.
    async fn wait_for_init(isolate: &PersistentIsolate) {
        for _ in 0..100 {
            if isolate.is_initialized() {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        panic!("Isolate did not initialize within timeout");
    }

    #[tokio::test]
    async fn test_create_persistent_isolate() {
        let opts = PersistentIsolateOptions {
            root_dir: PathBuf::from(env!("CARGO_MANIFEST_DIR")),
            entry_file: PathBuf::from("/nonexistent/app.tsx"),
            server_entry: None,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts);
        assert!(isolate.is_ok());

        let isolate = isolate.unwrap();
        // Even without a valid entry file, the isolate initializes (SSR will fail gracefully)
        wait_for_init(&isolate).await;
        assert!(isolate.is_initialized());
        assert!(!isolate.has_api_handler());
    }

    #[tokio::test]
    async fn test_handle_request_without_api_handler() {
        let opts = PersistentIsolateOptions {
            root_dir: PathBuf::from(env!("CARGO_MANIFEST_DIR")),
            entry_file: PathBuf::from("/nonexistent/app.tsx"),
            server_entry: None,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;

        let request = IsolateRequest {
            method: "GET".to_string(),
            url: "http://localhost:4200/api/tasks".to_string(),
            headers: vec![],
            body: None,
        };

        // Should fail because there's no API handler
        let result = isolate.handle_request(request).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_isolate_with_inline_handler() {
        let temp_dir = tempfile::tempdir().unwrap();
        let opts = api_only_opts(
            &temp_dir,
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
        );

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;
        assert!(isolate.has_api_handler());

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
        let opts = api_only_opts(
            &temp_dir,
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
        );

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;

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
        let opts = api_only_opts(
            &temp_dir,
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
        );

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;

        let error_req = IsolateRequest {
            method: "GET".to_string(),
            url: "http://localhost:4200/api/error".to_string(),
            headers: vec![],
            body: None,
        };
        let result = isolate.handle_request(error_req).await;
        assert!(result.is_err(), "Should return error for throwing handler");

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
        let opts = api_only_opts(
            &temp_dir,
            r#"
            const handler = async (request) => {
                return new Response('Not Found', { status: 404 });
            };
            globalThis.__vertz_server_module = { default: { handler } };
            "#,
        );

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;

        let request = IsolateRequest {
            method: "GET".to_string(),
            url: "http://localhost:4200/api/nonexistent".to_string(),
            headers: vec![],
            body: None,
        };

        let response = isolate.handle_request(request).await.unwrap();
        assert_eq!(response.status, 404);
    }

    // ── Phase 2: SSR tests ──────────────────────────────────────────────

    #[tokio::test]
    async fn test_ssr_render_simple_content() {
        let temp_dir = tempfile::tempdir().unwrap();
        // Create an app entry that sets up SSR render function
        let app_path = temp_dir.path().join("app.js");
        std::fs::write(
            &app_path,
            r#"
            globalThis.__vertz_ssr_render = function(url) {
                return '<h1>Hello SSR</h1><p>Path: ' + url + '</p>';
            };
            "#,
        )
        .unwrap();

        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            entry_file: app_path,
            server_entry: None,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;

        let ssr_req = SsrRequest {
            url: "/tasks".to_string(),
            session_json: None,
        };

        let result = isolate.handle_ssr(ssr_req).await;
        assert!(result.is_ok(), "SSR should succeed: {:?}", result);

        let response = result.unwrap();
        assert!(response.is_ssr);
        assert!(
            response.content.contains("Hello SSR"),
            "Content: {}",
            response.content
        );
        assert!(
            response.content.contains("/tasks"),
            "Should include path: {}",
            response.content
        );
        assert!(response.render_time_ms > 0.0);
    }

    #[tokio::test]
    async fn test_ssr_dom_reset_between_requests() {
        let temp_dir = tempfile::tempdir().unwrap();
        let app_path = temp_dir.path().join("app.js");
        std::fs::write(
            &app_path,
            r#"
            globalThis.__vertz_ssr_render = function(url) {
                return '<div>' + url + '</div>';
            };
            "#,
        )
        .unwrap();

        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            entry_file: app_path,
            server_entry: None,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;

        // First request
        let resp1 = isolate
            .handle_ssr(SsrRequest {
                url: "/page-1".to_string(),
                session_json: None,
            })
            .await
            .unwrap();
        assert!(resp1.content.contains("/page-1"));

        // Second request — should have clean DOM, no leaked content from first request
        let resp2 = isolate
            .handle_ssr(SsrRequest {
                url: "/page-2".to_string(),
                session_json: None,
            })
            .await
            .unwrap();
        assert!(resp2.content.contains("/page-2"));
        assert!(
            !resp2.content.contains("/page-1"),
            "Second request should not contain first request's content: {}",
            resp2.content
        );
    }

    #[tokio::test]
    async fn test_ssr_css_collected_per_request() {
        let temp_dir = tempfile::tempdir().unwrap();
        let app_path = temp_dir.path().join("app.js");
        std::fs::write(
            &app_path,
            r#"
            globalThis.__vertz_ssr_render = function(url) {
                __vertz_inject_css('.page { color: blue; }', 'page-' + url);
                return '<div class="page">' + url + '</div>';
            };
            "#,
        )
        .unwrap();

        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            entry_file: app_path,
            server_entry: None,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;

        // First request
        let resp1 = isolate
            .handle_ssr(SsrRequest {
                url: "/a".to_string(),
                session_json: None,
            })
            .await
            .unwrap();
        assert_eq!(resp1.css_entries.len(), 1);
        assert_eq!(resp1.css_entries[0].0, ".page { color: blue; }");

        // Second request — CSS should be fresh (not accumulated from first request)
        let resp2 = isolate
            .handle_ssr(SsrRequest {
                url: "/b".to_string(),
                session_json: None,
            })
            .await
            .unwrap();
        assert_eq!(
            resp2.css_entries.len(),
            1,
            "Should have exactly 1 CSS entry (not accumulated): {:?}",
            resp2.css_entries
        );
    }

    #[tokio::test]
    async fn test_ssr_error_does_not_crash_isolate() {
        let temp_dir = tempfile::tempdir().unwrap();
        let app_path = temp_dir.path().join("app.js");
        std::fs::write(
            &app_path,
            r#"
            globalThis.__vertz_ssr_render = function(url) {
                if (url === '/error') throw new Error('SSR boom');
                return '<div>' + url + '</div>';
            };
            "#,
        )
        .unwrap();

        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            entry_file: app_path,
            server_entry: None,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;

        // Request that throws
        let err_result = isolate
            .handle_ssr(SsrRequest {
                url: "/error".to_string(),
                session_json: None,
            })
            .await;
        assert!(err_result.is_err(), "Error route should fail");

        // Next SSR request should still work
        let ok_result = isolate
            .handle_ssr(SsrRequest {
                url: "/ok".to_string(),
                session_json: None,
            })
            .await;
        assert!(
            ok_result.is_ok(),
            "Isolate should still work after error: {:?}",
            ok_result
        );
        assert!(ok_result.unwrap().content.contains("/ok"));
    }

    #[tokio::test]
    async fn test_both_api_and_ssr_in_same_isolate() {
        let temp_dir = tempfile::tempdir().unwrap();

        // App entry for SSR
        let app_path = temp_dir.path().join("app.js");
        std::fs::write(
            &app_path,
            r#"
            globalThis.__vertz_ssr_render = function(url) {
                return '<div>Page: ' + url + '</div>';
            };
            "#,
        )
        .unwrap();

        // Server entry for API
        let server_path = temp_dir.path().join("server.js");
        std::fs::write(
            &server_path,
            r#"
            const handler = async (request) => {
                return new Response(JSON.stringify({ api: true }), {
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
            entry_file: app_path,
            server_entry: Some(server_path),
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;
        assert!(isolate.has_api_handler());

        // Test API request
        let api_resp = isolate
            .handle_request(IsolateRequest {
                method: "GET".to_string(),
                url: "http://localhost:4200/api/test".to_string(),
                headers: vec![],
                body: None,
            })
            .await
            .unwrap();
        assert_eq!(api_resp.status, 200);
        let api_body: serde_json::Value = serde_json::from_slice(&api_resp.body).unwrap();
        assert_eq!(api_body["api"], true);

        // Test SSR request
        let ssr_resp = isolate
            .handle_ssr(SsrRequest {
                url: "/home".to_string(),
                session_json: None,
            })
            .await
            .unwrap();
        assert!(ssr_resp.is_ssr);
        assert!(ssr_resp.content.contains("Page: /home"));

        // Another API request — should still work after SSR
        let api_resp2 = isolate
            .handle_request(IsolateRequest {
                method: "GET".to_string(),
                url: "http://localhost:4200/api/test2".to_string(),
                headers: vec![],
                body: None,
            })
            .await
            .unwrap();
        assert_eq!(api_resp2.status, 200);
    }

    #[tokio::test]
    async fn test_ssr_with_session_data() {
        let temp_dir = tempfile::tempdir().unwrap();
        let app_path = temp_dir.path().join("app.js");
        std::fs::write(
            &app_path,
            r#"
            globalThis.__vertz_ssr_render = function(url) {
                const session = globalThis.__vertz_session || {};
                const user = session.userId || 'anonymous';
                return '<div>User: ' + user + '</div>';
            };
            "#,
        )
        .unwrap();

        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            entry_file: app_path,
            server_entry: None,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;

        let resp = isolate
            .handle_ssr(SsrRequest {
                url: "/profile".to_string(),
                session_json: Some(r#"{"userId":"user-123"}"#.to_string()),
            })
            .await
            .unwrap();
        assert!(resp.content.contains("User: user-123"));
    }

    // ── Phase 3: Fetch interception tests ──────────────────────────────

    #[tokio::test]
    async fn test_fetch_interceptor_installed_with_api_handler() {
        let temp_dir = tempfile::tempdir().unwrap();
        let app_path = temp_dir.path().join("app.js");
        std::fs::write(
            &app_path,
            r#"
            globalThis.__vertz_ssr_render = function(url) {
                // Verify interceptor globals exist
                const hasOriginal = typeof globalThis.__vertz_original_fetch === 'function';
                const hasCounter = typeof globalThis.__vertz_fetch_intercept_count === 'number';
                return '<div>original=' + hasOriginal + ' counter=' + hasCounter + '</div>';
            };
            "#,
        )
        .unwrap();

        let server_path = temp_dir.path().join("server.js");
        std::fs::write(
            &server_path,
            r#"
            const handler = async (request) => {
                return new Response('ok', { status: 200 });
            };
            globalThis.__vertz_server_module = { default: { handler } };
            "#,
        )
        .unwrap();

        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            entry_file: app_path,
            server_entry: Some(server_path),
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;
        assert!(isolate.has_api_handler());

        // Verify via SSR render that interceptor globals are present
        let resp = isolate
            .handle_ssr(SsrRequest {
                url: "/check".to_string(),
                session_json: None,
            })
            .await
            .unwrap();
        assert!(
            resp.content.contains("original=true"),
            "Should have __vertz_original_fetch: {}",
            resp.content
        );
        assert!(
            resp.content.contains("counter=true"),
            "Should have __vertz_fetch_intercept_count: {}",
            resp.content
        );
    }

    #[tokio::test]
    async fn test_fetch_interception_in_handler() {
        let temp_dir = tempfile::tempdir().unwrap();
        let app_path = temp_dir.path().join("app.js");
        std::fs::write(&app_path, "// empty app").unwrap();

        // Handler that calls fetch('/api/nested') — should be intercepted
        let server_path = temp_dir.path().join("server.js");
        std::fs::write(
            &server_path,
            r#"
            const handler = async (request) => {
                const url = new URL(request.url);
                if (url.pathname === '/api/nested') {
                    return new Response(JSON.stringify({ nested: true }), {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    });
                }
                if (url.pathname === '/api/caller') {
                    // This fetch should be intercepted by the fetch proxy
                    const resp = await fetch('http://localhost/api/nested');
                    const data = await resp.json();
                    const interceptCount = globalThis.__vertz_fetch_intercept_count || 0;
                    return new Response(JSON.stringify({
                        callerGot: data,
                        interceptCount: interceptCount,
                    }), {
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
            entry_file: app_path,
            server_entry: Some(server_path),
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;
        assert!(isolate.has_api_handler());

        // Call /api/caller which internally fetches /api/nested
        let resp = isolate
            .handle_request(IsolateRequest {
                method: "GET".to_string(),
                url: "http://localhost:4200/api/caller".to_string(),
                headers: vec![],
                body: None,
            })
            .await
            .unwrap();
        assert_eq!(resp.status, 200);

        let body: serde_json::Value = serde_json::from_slice(&resp.body).unwrap();
        assert_eq!(
            body["callerGot"]["nested"], true,
            "Nested fetch should be intercepted and return data: {}",
            body
        );
        assert!(
            body["interceptCount"].as_u64().unwrap_or(0) > 0,
            "Intercept count should be > 0: {}",
            body
        );
    }

    #[tokio::test]
    async fn test_fetch_interceptor_not_installed_without_api_handler() {
        let temp_dir = tempfile::tempdir().unwrap();
        let app_path = temp_dir.path().join("app.js");
        std::fs::write(
            &app_path,
            r#"
            globalThis.__vertz_ssr_render = function(url) {
                return '<div>No API</div>';
            };
            "#,
        )
        .unwrap();

        // No server entry — SSR only
        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            entry_file: app_path,
            server_entry: None,
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;
        assert!(!isolate.has_api_handler());
    }

    #[tokio::test]
    async fn test_fetch_interceptor_routes_to_handler_directly() {
        let temp_dir = tempfile::tempdir().unwrap();

        // App entry that does a fetch and records the result
        let app_path = temp_dir.path().join("app.js");
        std::fs::write(
            &app_path,
            r#"
            // Will be called during SSR via __vertz_ssr_render
            globalThis.__vertz_ssr_render = function(url) {
                // Synchronous render — can't await fetch here
                // But we can verify the interceptor is installed
                const isWrapped = typeof globalThis.__vertz_original_fetch === 'function';
                return '<div>Interceptor: ' + isWrapped + '</div>';
            };
            "#,
        )
        .unwrap();

        let server_path = temp_dir.path().join("server.js");
        std::fs::write(
            &server_path,
            r#"
            const handler = async (request) => {
                return new Response(JSON.stringify({ intercepted: true }), {
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
            entry_file: app_path,
            server_entry: Some(server_path),
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;
        assert!(isolate.has_api_handler());

        // SSR render verifies interceptor is installed
        let resp = isolate
            .handle_ssr(SsrRequest {
                url: "/test".to_string(),
                session_json: None,
            })
            .await
            .unwrap();
        assert!(
            resp.content.contains("Interceptor: true"),
            "Fetch interceptor should be installed: {}",
            resp.content
        );
    }

    // ── Phase 4a: Server module hot-swap tests ─────────────────────────

    #[tokio::test]
    async fn test_restart_reloads_handler() {
        let temp_dir = tempfile::tempdir().unwrap();
        let server_path = temp_dir.path().join("server.js");

        // First version: returns "v1"
        std::fs::write(
            &server_path,
            r#"
            const handler = async (request) => {
                return new Response(JSON.stringify({ version: 'v1' }), {
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
            entry_file: temp_dir.path().join("nonexistent-app.tsx"),
            server_entry: Some(server_path.clone()),
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;
        assert!(isolate.has_api_handler());

        // Verify v1
        let resp = isolate
            .handle_request(IsolateRequest {
                method: "GET".to_string(),
                url: "http://localhost:4200/api/version".to_string(),
                headers: vec![],
                body: None,
            })
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&resp.body).unwrap();
        assert_eq!(body["version"], "v1");

        // Update server file to v2
        std::fs::write(
            &server_path,
            r#"
            const handler = async (request) => {
                return new Response(JSON.stringify({ version: 'v2' }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            };
            globalThis.__vertz_server_module = { default: { handler } };
            "#,
        )
        .unwrap();

        // Restart the isolate
        let new_isolate = isolate.restart().unwrap();
        wait_for_init(&new_isolate).await;
        assert!(new_isolate.has_api_handler());

        // Verify v2
        let resp2 = new_isolate
            .handle_request(IsolateRequest {
                method: "GET".to_string(),
                url: "http://localhost:4200/api/version".to_string(),
                headers: vec![],
                body: None,
            })
            .await
            .unwrap();
        let body2: serde_json::Value = serde_json::from_slice(&resp2.body).unwrap();
        assert_eq!(body2["version"], "v2");
    }

    #[tokio::test]
    async fn test_restart_preserves_options() {
        let temp_dir = tempfile::tempdir().unwrap();
        let opts = api_only_opts(
            &temp_dir,
            r#"
            const handler = async (r) => new Response('ok', { status: 200 });
            globalThis.__vertz_server_module = { default: { handler } };
            "#,
        );

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;

        let original_capacity = isolate.options().channel_capacity;
        let original_root = isolate.options().root_dir.clone();

        let new_isolate = isolate.restart().unwrap();
        assert_eq!(new_isolate.options().channel_capacity, original_capacity);
        assert_eq!(new_isolate.options().root_dir, original_root);
    }

    #[tokio::test]
    async fn test_restart_with_syntax_error_fails_gracefully() {
        let temp_dir = tempfile::tempdir().unwrap();
        let server_path = temp_dir.path().join("server.js");

        // First version: valid handler
        std::fs::write(
            &server_path,
            r#"
            const handler = async (r) => new Response('ok', { status: 200 });
            globalThis.__vertz_server_module = { default: { handler } };
            "#,
        )
        .unwrap();

        let opts = PersistentIsolateOptions {
            root_dir: temp_dir.path().to_path_buf(),
            entry_file: temp_dir.path().join("nonexistent-app.tsx"),
            server_entry: Some(server_path.clone()),
            channel_capacity: 16,
        };

        let isolate = PersistentIsolate::new(opts).unwrap();
        wait_for_init(&isolate).await;
        assert!(isolate.has_api_handler());

        // Write syntax error
        std::fs::write(&server_path, "const handler = function( { broken").unwrap();

        // Restart should still succeed (isolate creates, but handler won't load)
        let new_isolate = isolate.restart().unwrap();
        wait_for_init(&new_isolate).await;
        // Handler extraction should fail due to syntax error
        assert!(
            !new_isolate.has_api_handler(),
            "Handler should not load with syntax error"
        );
    }
}
