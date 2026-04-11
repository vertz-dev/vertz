//! Window IPC handlers.
//!
//! Window operations must execute on the main thread (macOS AppKit requirement).
//! The handler sends a `WindowOp` event to the main-thread event loop via
//! `EventLoopProxy` and awaits the result through a oneshot channel.

use std::sync::Mutex;

use tao::event_loop::EventLoopProxy;
use tokio::sync::oneshot;

use crate::webview::ipc_dispatcher::IpcError;
use crate::webview::{UserEvent, WindowOp};

/// Dispatch a window operation to the main thread and await the result.
pub async fn dispatch_window_op(
    proxy: &EventLoopProxy<UserEvent>,
    op: WindowOp,
) -> Result<serde_json::Value, IpcError> {
    let (tx, rx) = oneshot::channel();
    proxy
        .send_event(UserEvent::WindowOp {
            op,
            tx: Mutex::new(Some(tx)),
        })
        .map_err(|_| IpcError::io_error("Event loop closed"))?;
    rx.await
        .map_err(|_| IpcError::io_error("Window operation cancelled"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    // Window handler tests are limited because they require a running event loop
    // with a real tao::Window. On macOS, EventLoop must be created on the main
    // thread, which isn't available in `#[tokio::test]`. The dispatch pattern is
    // validated via:
    // 1. The exhaustive match in ipc_dispatcher.rs (compile-time)
    // 2. The WindowOp handling in mod.rs event loop (runtime, tested via E2E)

    #[test]
    fn window_op_variants_are_constructible() {
        let _set_title = WindowOp::SetTitle("test".to_string());
        let _set_size = WindowOp::SetSize {
            width: 800,
            height: 600,
        };
        let _set_fullscreen = WindowOp::SetFullscreen(true);
        let _inner_size = WindowOp::InnerSize;
        let _minimize = WindowOp::Minimize;
        let _close = WindowOp::Close;
    }
}
