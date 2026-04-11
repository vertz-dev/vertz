//! IPC dispatcher — routes JSON requests from the webview to async handlers.
//!
//! The dispatcher receives raw JSON strings from wry's `ipc_handler` (main thread),
//! deserializes them, spawns async work on a tokio runtime, and sends responses
//! back via `UserEvent::EvalScript`.

use std::sync::Arc;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tao::event_loop::EventLoopProxy;
use tokio::runtime::Handle as TokioHandle;

use super::event_channel::EventChannel;
use super::ipc_handlers::app as app_handlers;
use super::ipc_handlers::clipboard as clipboard_handlers;
use super::ipc_handlers::dialog as dialog_handlers;
use super::ipc_handlers::fs as fs_handlers;
use super::ipc_handlers::shell as shell_handlers;
use super::ipc_handlers::window as window_handlers;
use super::ipc_method::IpcMethod;
use super::ipc_permissions::{suggest_capability, IpcPermissions};
use super::process_map::ProcessMap;
use super::{eval_script_event, UserEvent, WindowOp};

/// A request from the webview JS side.
#[derive(Debug, Deserialize)]
pub struct IpcRequest {
    pub id: u64,
    pub method: String,
    pub params: serde_json::Value,
}

/// A successful result to send back.
#[derive(Debug, Serialize)]
struct IpcOkResponse {
    id: u64,
    ok: bool,
    result: serde_json::Value,
}

/// An error result to send back.
#[derive(Debug, Serialize)]
struct IpcErrResponse {
    id: u64,
    ok: bool,
    error: IpcErrorPayload,
}

#[derive(Debug, Serialize)]
struct IpcErrorPayload {
    code: String,
    message: String,
}

/// Error codes matching the TypeScript `DesktopErrorCode` type.
#[derive(Debug, Clone, Copy)]
pub enum IpcErrorCode {
    NotFound,
    PermissionDenied,
    IoError,
    InvalidPath,
    MethodNotFound,
    ExecutionFailed,
}

impl IpcErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NotFound => "NOT_FOUND",
            Self::PermissionDenied => "PERMISSION_DENIED",
            Self::IoError => "IO_ERROR",
            Self::InvalidPath => "INVALID_PATH",
            Self::MethodNotFound => "METHOD_NOT_FOUND",
            Self::ExecutionFailed => "EXECUTION_FAILED",
        }
    }
}

/// An IPC error with code and message.
#[derive(Debug)]
pub struct IpcError {
    pub code: IpcErrorCode,
    pub message: String,
}

impl IpcError {
    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            code: IpcErrorCode::NotFound,
            message: message.into(),
        }
    }

    pub fn io_error(message: impl Into<String>) -> Self {
        Self {
            code: IpcErrorCode::IoError,
            message: message.into(),
        }
    }

    pub fn method_not_found(method: &str) -> Self {
        Self {
            code: IpcErrorCode::MethodNotFound,
            message: format!("Unknown IPC method: {}", method),
        }
    }
}

/// Dispatches IPC requests from the webview to async handlers.
///
/// Constructed before the event loop starts. Captures a tokio `Handle`
/// (for spawning async work), an `EventLoopProxy` (for sending
/// responses back to the main thread), and `IpcPermissions` (for
/// checking method allowlists before dispatch).
#[derive(Clone)]
pub struct IpcDispatcher {
    tokio_handle: TokioHandle,
    proxy: EventLoopProxy<UserEvent>,
    permissions: IpcPermissions,
    event_channel: EventChannel,
    process_map: Arc<ProcessMap>,
}

impl IpcDispatcher {
    /// Create a new dispatcher with the given permissions.
    ///
    /// For dev mode, pass `IpcPermissions::allow_all()`.
    /// For production, pass `IpcPermissions::from_capabilities(&caps)`.
    pub fn new(
        tokio_handle: TokioHandle,
        proxy: EventLoopProxy<UserEvent>,
        permissions: IpcPermissions,
    ) -> Self {
        let event_channel = EventChannel::new(proxy.clone());
        Self {
            tokio_handle,
            proxy,
            permissions,
            event_channel,
            process_map: Arc::new(ProcessMap::new()),
        }
    }

    /// Get a reference to the process map for cleanup on shutdown.
    pub fn process_map(&self) -> &Arc<ProcessMap> {
        &self.process_map
    }

    /// Handle a raw IPC request string from the webview.
    ///
    /// This runs on the main thread and must not block. It deserializes
    /// the request, checks permissions, and spawns async work on the tokio runtime.
    pub fn dispatch(&self, body: &str) {
        let request: IpcRequest = match serde_json::from_str(body) {
            Ok(req) => req,
            Err(e) => {
                eprintln!("[ipc] Failed to parse request: {}", e);
                return;
            }
        };

        // Permission check — synchronous, before spawning async work
        if !self.permissions.is_allowed(&request.method) {
            let suggestion = suggest_capability(&request.method);
            let message = match suggestion {
                Some(group) => format!(
                    "IPC method '{}' is not allowed. \
                     Add \"{}\" (or \"{}\" for fine-grained) to desktop.permissions in .vertzrc",
                    request.method, group, request.method
                ),
                None => format!(
                    "IPC method '{}' is not allowed. \
                     Add it to desktop.permissions in .vertzrc",
                    request.method
                ),
            };
            let response = IpcErrResponse {
                id: request.id,
                ok: false,
                error: IpcErrorPayload {
                    code: IpcErrorCode::PermissionDenied.as_str().to_string(),
                    message,
                },
            };
            if let Ok(json) = serde_json::to_string(&response) {
                let js = format!("window.__vtz_ipc_resolve({}, {})", request.id, json);
                let (tx, _rx) = tokio::sync::oneshot::channel();
                let _ = self.proxy.send_event(eval_script_event(js, tx));
            }
            return;
        }

        let proxy = self.proxy.clone();
        let proxy_for_handler = self.proxy.clone();
        let start = Instant::now();
        let event_channel = self.event_channel.clone();
        let process_map = self.process_map.clone();

        self.tokio_handle.spawn(async move {
            let result = match IpcMethod::parse(&request.method, request.params) {
                Ok(method) => {
                    execute_method(method, proxy_for_handler, event_channel, process_map).await
                }
                Err(e) => Err(e),
            };
            let elapsed = start.elapsed();

            let response_json = match &result {
                Ok(value) => serde_json::to_string(&IpcOkResponse {
                    id: request.id,
                    ok: true,
                    result: value.clone(),
                }),
                Err(err) => serde_json::to_string(&IpcErrResponse {
                    id: request.id,
                    ok: false,
                    error: IpcErrorPayload {
                        code: err.code.as_str().to_string(),
                        message: err.message.clone(),
                    },
                }),
            };

            match response_json {
                Ok(json) => {
                    let js = format!("window.__vtz_ipc_resolve({}, {})", request.id, json);
                    eprintln!(
                        "[ipc] {} completed in {:.2}ms",
                        request.method,
                        elapsed.as_secs_f64() * 1000.0
                    );
                    let (tx, _rx) = tokio::sync::oneshot::channel();
                    let _ = proxy.send_event(eval_script_event(js, tx));
                }
                Err(e) => {
                    eprintln!("[ipc] Failed to serialize response: {}", e);
                }
            }
        });
    }
}

/// Execute a typed IPC method. Exhaustive match ensures compile-time
/// coverage — adding a new `IpcMethod` variant without a handler arm
/// is a compile error.
///
/// The `proxy` is needed for window operations that must run on the main thread.
async fn execute_method(
    method: IpcMethod,
    proxy: EventLoopProxy<UserEvent>,
    event_channel: EventChannel,
    process_map: Arc<ProcessMap>,
) -> Result<serde_json::Value, IpcError> {
    match method {
        // ── Filesystem ──
        IpcMethod::FsReadTextFile(p) => fs_handlers::read_text_file(p).await,
        IpcMethod::FsWriteTextFile(p) => fs_handlers::write_text_file(p).await,
        IpcMethod::FsExists(p) => fs_handlers::exists(p).await,
        IpcMethod::FsStat(p) => fs_handlers::stat(p).await,
        IpcMethod::FsReadDir(p) => fs_handlers::read_dir(p).await,
        IpcMethod::FsCreateDir(p) => fs_handlers::create_dir(p).await,
        IpcMethod::FsRemove(p) => fs_handlers::remove(p).await,
        IpcMethod::FsRename(p) => fs_handlers::rename(p).await,
        // ── Shell ──
        IpcMethod::ShellExecute(p) => shell_handlers::execute(p).await,
        IpcMethod::ShellSpawn(p) => shell_handlers::spawn(p, event_channel, process_map).await,
        IpcMethod::ProcessKill(p) => shell_handlers::kill(p, process_map).await,
        // ── Clipboard ──
        IpcMethod::ClipboardReadText => clipboard_handlers::read_text().await,
        IpcMethod::ClipboardWriteText(p) => clipboard_handlers::write_text(p).await,
        // ── Dialog ──
        IpcMethod::DialogOpen(p) => dialog_handlers::open(p).await,
        IpcMethod::DialogSave(p) => dialog_handlers::save(p).await,
        IpcMethod::DialogConfirm(p) => dialog_handlers::confirm(p).await,
        IpcMethod::DialogMessage(p) => dialog_handlers::message(p).await,
        // ── Window (dispatched to main thread) ──
        IpcMethod::AppWindowSetTitle(p) => {
            window_handlers::dispatch_window_op(&proxy, WindowOp::SetTitle(p.title)).await
        }
        IpcMethod::AppWindowSetSize(p) => {
            window_handlers::dispatch_window_op(
                &proxy,
                WindowOp::SetSize {
                    width: p.width,
                    height: p.height,
                },
            )
            .await
        }
        IpcMethod::AppWindowSetFullscreen(p) => {
            window_handlers::dispatch_window_op(&proxy, WindowOp::SetFullscreen(p.fullscreen)).await
        }
        IpcMethod::AppWindowInnerSize => {
            window_handlers::dispatch_window_op(&proxy, WindowOp::InnerSize).await
        }
        IpcMethod::AppWindowMinimize => {
            window_handlers::dispatch_window_op(&proxy, WindowOp::Minimize).await
        }
        IpcMethod::AppWindowClose => {
            window_handlers::dispatch_window_op(&proxy, WindowOp::Close).await
        }
        // ── App ──
        IpcMethod::AppDataDir => app_handlers::data_dir().await,
        IpcMethod::AppCacheDir => app_handlers::cache_dir().await,
        IpcMethod::AppVersion => app_handlers::version().await,
    }
}

/// The JS client code injected into the webview via `with_initialization_script()`.
pub const IPC_CLIENT_JS: &str = r#"
(() => {
  'use strict';
  let nextId = 1;
  const pending = new Map();

  // Default timeouts per method category (ms).
  // dialog.* has no timeout (user interaction).
  const categoryTimeouts = {
    'fs.': 10000,
    'shell.': 120000,
    'clipboard.': 5000,
    'appWindow.': 5000,
    'app.': 5000,
  };

  function defaultTimeout(method) {
    for (const prefix in categoryTimeouts) {
      if (method.startsWith(prefix)) return categoryTimeouts[prefix];
    }
    // dialog.* — no automatic timeout
    if (method.startsWith('dialog.')) return 0;
    return 30000;
  }

  window.__vtz_ipc = {
    invoke(method, params, options) {
      return new Promise((resolve) => {
        const id = nextId++;
        const timeoutMs = (options && options.timeout != null)
          ? options.timeout
          : defaultTimeout(method);

        let timer = null;
        if (timeoutMs > 0) {
          timer = setTimeout(() => {
            pending.delete(id);
            resolve({ ok: false, error: { code: 'TIMEOUT', message: `IPC timeout after ${timeoutMs}ms: ${method}` } });
          }, timeoutMs);
        }

        pending.set(id, { resolve, timer });

        window.ipc.postMessage(JSON.stringify({ id, method, params: params || {} }));
      });
    },
  };

  window.__vtz_ipc_resolve = (id, response) => {
    const entry = pending.get(id);
    if (!entry) return; // timed out or already resolved
    if (entry.timer) clearTimeout(entry.timer);
    pending.delete(id);
    entry.resolve(response);
  };

  window.addEventListener('beforeunload', () => {
    for (const [, entry] of pending) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: { code: 'WINDOW_CLOSED', message: 'Window closed' } });
    }
    pending.clear();
    // Clear all event subscriptions
    __vtz_event_subs.clear();
  });

  // ── Event Channel (Rust → JS push) ──
  // Generic push mechanism for streaming events (shell.spawn stdout/stderr,
  // future file watchers, etc.). Subscriptions are pre-allocated before the
  // IPC call to avoid race conditions with fast-exiting processes.

  const __vtz_event_subs = new Map();

  // Pre-allocate a subscription slot (buffer mode — events queued until listeners added)
  window.__vtz_event_alloc = (subId) => {
    __vtz_event_subs.set(subId, { listeners: {}, buffer: [], ready: false });
  };

  // Register a listener for a specific event type on a subscription.
  // Returns a disposer function. On first call, flushes buffered events.
  window.__vtz_event_on = (subId, eventType, callback) => {
    const sub = __vtz_event_subs.get(subId);
    if (!sub) return () => {};
    if (!sub.listeners[eventType]) sub.listeners[eventType] = [];
    sub.listeners[eventType].push(callback);
    // Flush buffer on first listener registration
    if (!sub.ready) {
      sub.ready = true;
      for (const [type, data] of sub.buffer) {
        const cbs = sub.listeners[type];
        if (cbs) for (const cb of cbs) cb(data);
      }
      sub.buffer.length = 0;
    }
    return () => {
      const arr = sub.listeners[eventType];
      if (arr) {
        const idx = arr.indexOf(callback);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  };

  // Remove a subscription entirely
  window.__vtz_event_unsub = (subId) => {
    __vtz_event_subs.delete(subId);
  };

  // Called by Rust via evaluate_script — single event dispatch
  window.__vtz_event = (subId, eventType, data) => {
    const sub = __vtz_event_subs.get(subId);
    if (!sub) return;
    if (!sub.ready) {
      sub.buffer.push([eventType, data]);
      return;
    }
    const cbs = sub.listeners[eventType];
    if (cbs) for (const cb of cbs) cb(data);
  };

  // Called by Rust via evaluate_script — batched event dispatch
  window.__vtz_event_batch = (events) => {
    for (const [subId, eventType, data] of events) {
      window.__vtz_event(subId, eventType, data);
    }
  };
})();
"#;

#[cfg(test)]
mod tests {
    use super::*;

    // ── IpcRequest deserialization ──

    #[test]
    fn deserialize_ipc_request() {
        let json = r#"{"id": 1, "method": "fs.readTextFile", "params": {"path": "/tmp/test.txt"}}"#;
        let req: IpcRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.id, 1);
        assert_eq!(req.method, "fs.readTextFile");
        assert_eq!(req.params["path"], "/tmp/test.txt");
    }

    #[test]
    fn deserialize_ipc_request_missing_params() {
        let json = r#"{"id": 2, "method": "fs.exists", "params": {}}"#;
        let req: IpcRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.id, 2);
        assert_eq!(req.method, "fs.exists");
        assert!(req.params.is_object());
    }

    #[test]
    fn deserialize_ipc_request_invalid_json() {
        let result = serde_json::from_str::<IpcRequest>("not json");
        assert!(result.is_err());
    }

    // ── IpcOkResponse serialization ──

    #[test]
    fn serialize_ok_response() {
        let resp = IpcOkResponse {
            id: 1,
            ok: true,
            result: serde_json::Value::String("hello".to_string()),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains(r#""id":1"#));
        assert!(json.contains(r#""ok":true"#));
        assert!(json.contains(r#""result":"hello""#));
    }

    // ── IpcErrResponse serialization ──

    #[test]
    fn serialize_err_response() {
        let resp = IpcErrResponse {
            id: 42,
            ok: false,
            error: IpcErrorPayload {
                code: "NOT_FOUND".to_string(),
                message: "No such file".to_string(),
            },
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains(r#""id":42"#));
        assert!(json.contains(r#""ok":false"#));
        assert!(json.contains(r#""code":"NOT_FOUND""#));
        assert!(json.contains(r#""message":"No such file""#));
    }

    // ── IpcErrorCode ──

    #[test]
    fn error_code_as_str() {
        assert_eq!(IpcErrorCode::NotFound.as_str(), "NOT_FOUND");
        assert_eq!(IpcErrorCode::PermissionDenied.as_str(), "PERMISSION_DENIED");
        assert_eq!(IpcErrorCode::IoError.as_str(), "IO_ERROR");
        assert_eq!(IpcErrorCode::InvalidPath.as_str(), "INVALID_PATH");
        assert_eq!(IpcErrorCode::MethodNotFound.as_str(), "METHOD_NOT_FOUND");
        assert_eq!(IpcErrorCode::ExecutionFailed.as_str(), "EXECUTION_FAILED");
    }

    // ── IpcError constructors ──

    #[test]
    fn ipc_error_not_found() {
        let err = IpcError::not_found("file missing");
        assert!(matches!(err.code, IpcErrorCode::NotFound));
        assert_eq!(err.message, "file missing");
    }

    #[test]
    fn ipc_error_io_error() {
        let err = IpcError::io_error("disk full");
        assert!(matches!(err.code, IpcErrorCode::IoError));
        assert_eq!(err.message, "disk full");
    }

    #[test]
    fn ipc_error_method_not_found() {
        let err = IpcError::method_not_found("foo.bar");
        assert!(matches!(err.code, IpcErrorCode::MethodNotFound));
        assert!(err.message.contains("foo.bar"));
    }

    // ── IPC client JS ──

    #[test]
    fn ipc_client_js_contains_required_globals() {
        assert!(IPC_CLIENT_JS.contains("window.__vtz_ipc"));
        assert!(IPC_CLIENT_JS.contains("__vtz_ipc_resolve"));
        assert!(IPC_CLIENT_JS.contains("window.ipc.postMessage"));
        assert!(IPC_CLIENT_JS.contains("beforeunload"));
        assert!(IPC_CLIENT_JS.contains("TIMEOUT"));
        assert!(IPC_CLIENT_JS.contains("WINDOW_CLOSED"));
    }

    #[test]
    fn ipc_client_js_has_category_timeouts() {
        assert!(IPC_CLIENT_JS.contains("categoryTimeouts"));
        assert!(IPC_CLIENT_JS.contains("'fs.': 10000"));
        assert!(IPC_CLIENT_JS.contains("'shell.': 120000"));
        assert!(IPC_CLIENT_JS.contains("'clipboard.': 5000"));
        assert!(IPC_CLIENT_JS.contains("'appWindow.': 5000"));
        assert!(IPC_CLIENT_JS.contains("'app.': 5000"));
        assert!(IPC_CLIENT_JS.contains("dialog."));
    }

    #[test]
    fn ipc_client_js_supports_custom_timeout_override() {
        assert!(IPC_CLIENT_JS.contains("options.timeout"));
    }

    // ── Event channel JS ──

    #[test]
    fn ipc_client_js_contains_event_channel_globals() {
        assert!(IPC_CLIENT_JS.contains("window.__vtz_event"));
        assert!(IPC_CLIENT_JS.contains("window.__vtz_event_batch"));
        assert!(IPC_CLIENT_JS.contains("window.__vtz_event_alloc"));
        assert!(IPC_CLIENT_JS.contains("window.__vtz_event_on"));
        assert!(IPC_CLIENT_JS.contains("window.__vtz_event_unsub"));
        assert!(IPC_CLIENT_JS.contains("__vtz_event_subs"));
    }

    #[test]
    fn ipc_client_js_event_channel_buffers_before_ready() {
        assert!(IPC_CLIENT_JS.contains("buffer"));
        assert!(IPC_CLIENT_JS.contains("ready"));
    }

    #[test]
    fn ipc_client_js_event_channel_cleans_up_on_unload() {
        assert!(IPC_CLIENT_JS.contains("__vtz_event_subs.clear()"));
    }
}
