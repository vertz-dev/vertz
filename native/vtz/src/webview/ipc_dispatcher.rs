//! IPC dispatcher — routes JSON requests from the webview to async handlers.
//!
//! The dispatcher receives raw JSON strings from wry's `ipc_handler` (main thread),
//! deserializes them, spawns async work on a tokio runtime, and sends responses
//! back via `UserEvent::EvalScript`.

use std::time::Instant;

use serde::{Deserialize, Serialize};
use tao::event_loop::EventLoopProxy;
use tokio::runtime::Handle as TokioHandle;

use super::ipc_handlers::fs as fs_handlers;
use super::ipc_method::IpcMethod;
use super::{eval_script_event, UserEvent};

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
/// (for spawning async work) and an `EventLoopProxy` (for sending
/// responses back to the main thread).
#[derive(Clone)]
pub struct IpcDispatcher {
    tokio_handle: TokioHandle,
    proxy: EventLoopProxy<UserEvent>,
}

impl IpcDispatcher {
    /// Create a new dispatcher.
    pub fn new(tokio_handle: TokioHandle, proxy: EventLoopProxy<UserEvent>) -> Self {
        Self {
            tokio_handle,
            proxy,
        }
    }

    /// Handle a raw IPC request string from the webview.
    ///
    /// This runs on the main thread and must not block. It deserializes
    /// the request and spawns async work on the tokio runtime.
    pub fn dispatch(&self, body: &str) {
        let request: IpcRequest = match serde_json::from_str(body) {
            Ok(req) => req,
            Err(e) => {
                eprintln!("[ipc] Failed to parse request: {}", e);
                return;
            }
        };

        let proxy = self.proxy.clone();
        let start = Instant::now();

        self.tokio_handle.spawn(async move {
            let result = match IpcMethod::parse(&request.method, request.params) {
                Ok(method) => execute_method(method).await,
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
async fn execute_method(method: IpcMethod) -> Result<serde_json::Value, IpcError> {
    match method {
        IpcMethod::FsReadTextFile(p) => fs_handlers::read_text_file(p).await,
        IpcMethod::FsWriteTextFile(p) => fs_handlers::write_text_file(p).await,
        IpcMethod::FsExists(p) => fs_handlers::exists(p).await,
        IpcMethod::FsStat(p) => fs_handlers::stat(p).await,
        IpcMethod::FsReadDir(p) => fs_handlers::read_dir(p).await,
        IpcMethod::FsCreateDir(p) => fs_handlers::create_dir(p).await,
        IpcMethod::FsRemove(p) => fs_handlers::remove(p).await,
        IpcMethod::FsRename(p) => fs_handlers::rename(p).await,
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
  });
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
}
