//! Native webview integration for desktop mode and E2E testing.
//!
//! Uses `wry` (WebKit on macOS) to embed a native webview window.
//! The webview loads the app from VTZ's axum dev server on localhost.

pub mod bridge;

use std::sync::Mutex;

use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop, EventLoopBuilder, EventLoopProxy};
use tao::window::{Window, WindowBuilder};
use tokio::sync::oneshot;
use wry::WebViewBuilder;

/// Events sent from background threads to the main-thread event loop.
#[derive(Debug)]
pub enum UserEvent {
    /// Dev server is ready — load the app URL.
    ServerReady { port: u16 },
    /// Navigate the webview to a URL.
    Navigate(String),
    /// Execute JavaScript in the webview and return the result.
    EvalScript {
        js: String,
        tx: Mutex<Option<oneshot::Sender<String>>>,
    },
    /// Close the window and exit the process.
    Quit,
}

/// Configuration for creating a webview window.
pub struct WebviewOptions {
    /// Window title.
    pub title: String,
    /// Initial window width in pixels.
    pub width: u32,
    /// Initial window height in pixels.
    pub height: u32,
    /// Whether to hide the window (for E2E testing).
    pub hidden: bool,
    /// Whether to enable devtools.
    pub devtools: bool,
}

impl Default for WebviewOptions {
    fn default() -> Self {
        Self {
            title: "VTZ".to_string(),
            width: 1024,
            height: 768,
            hidden: false,
            devtools: cfg!(debug_assertions),
        }
    }
}

/// Native webview application.
///
/// Must be created and run on the main thread (macOS AppKit requirement).
pub struct WebviewApp {
    event_loop: EventLoop<UserEvent>,
    window: Window,
    opts: WebviewOptions,
    /// Fires when the window is closed (signals background threads to shut down).
    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl WebviewApp {
    /// Create a new webview app. Must be called on the main thread.
    ///
    /// Returns the app and a receiver that fires when the window is closed.
    /// Use this receiver to trigger graceful shutdown of background services.
    pub fn new(opts: WebviewOptions) -> Result<(Self, oneshot::Receiver<()>), WebviewError> {
        let event_loop: EventLoop<UserEvent> = EventLoopBuilder::with_user_event().build();

        let window = WindowBuilder::new()
            .with_title(&opts.title)
            .with_inner_size(tao::dpi::LogicalSize::new(opts.width, opts.height))
            .with_visible(!opts.hidden)
            .build(&event_loop)
            .map_err(|e| WebviewError::WindowCreation(e.to_string()))?;

        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        Ok((
            Self {
                event_loop,
                window,
                opts,
                shutdown_tx: Mutex::new(Some(shutdown_tx)),
            },
            shutdown_rx,
        ))
    }

    /// Get a cloneable, Send-able proxy for sending events from background threads.
    pub fn proxy(&self) -> EventLoopProxy<UserEvent> {
        self.event_loop.create_proxy()
    }

    /// Run the event loop. This blocks forever and never returns.
    /// Must be called on the main thread.
    pub fn run(self) -> ! {
        let webview = WebViewBuilder::new()
            .with_url("about:blank")
            .with_devtools(self.opts.devtools)
            .with_ipc_handler(|req| {
                let body = req.body();
                eprintln!("[vtz webview ipc] {}", body);
            })
            .build(&self.window)
            .expect("failed to build webview");

        let shutdown_tx = self.shutdown_tx;

        self.event_loop
            .run(move |event, _event_loop, control_flow| {
                *control_flow = ControlFlow::Wait;

                match event {
                    Event::WindowEvent {
                        event: WindowEvent::CloseRequested,
                        ..
                    } => {
                        // Signal background threads to shut down
                        if let Some(tx) = shutdown_tx.lock().unwrap().take() {
                            let _ = tx.send(());
                        }
                        *control_flow = ControlFlow::Exit;
                    }

                    Event::UserEvent(user_event) => match user_event {
                        UserEvent::ServerReady { port } => {
                            let url = format!("http://localhost:{}", port);
                            if let Err(e) = webview.load_url(&url) {
                                eprintln!("[vtz webview] failed to load URL: {}", e);
                            }
                        }
                        UserEvent::Navigate(url) => {
                            if let Err(e) = webview.load_url(&url) {
                                eprintln!("[vtz webview] failed to navigate: {}", e);
                            }
                        }
                        UserEvent::EvalScript { js, tx } => {
                            // Take the sender out of the Mutex<Option<>> so we can
                            // consume it inside the Fn closure. The Fn may be called
                            // once by wry; if called again, the Option is None and
                            // we silently ignore.
                            let tx = tx.lock().unwrap().take();
                            if let Some(sender) = tx {
                                let sender = Mutex::new(Some(sender));
                                let _ = webview.evaluate_script_with_callback(&js, move |result| {
                                    if let Some(s) = sender.lock().unwrap().take() {
                                        let _ = s.send(result);
                                    }
                                });
                            }
                        }
                        UserEvent::Quit => {
                            // Signal background threads to shut down
                            if let Some(tx) = shutdown_tx.lock().unwrap().take() {
                                let _ = tx.send(());
                            }
                            *control_flow = ControlFlow::Exit;
                        }
                    },

                    _ => {}
                }
            });
    }
}

/// Errors that can occur during webview operations.
#[derive(Debug)]
pub enum WebviewError {
    WindowCreation(String),
}

impl std::fmt::Display for WebviewError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WindowCreation(msg) => write!(f, "failed to create window: {}", msg),
        }
    }
}

impl std::error::Error for WebviewError {}

/// Helper to create an `EvalScript` event.
pub fn eval_script_event(js: String, tx: oneshot::Sender<String>) -> UserEvent {
    UserEvent::EvalScript {
        js,
        tx: Mutex::new(Some(tx)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_event_debug_format() {
        let evt = UserEvent::ServerReady { port: 3000 };
        let debug = format!("{:?}", evt);
        assert!(debug.contains("ServerReady"));
        assert!(debug.contains("3000"));
    }

    #[test]
    fn user_event_navigate_debug() {
        let evt = UserEvent::Navigate("http://localhost:3000".to_string());
        let debug = format!("{:?}", evt);
        assert!(debug.contains("Navigate"));
    }

    #[test]
    fn user_event_quit_debug() {
        let evt = UserEvent::Quit;
        let debug = format!("{:?}", evt);
        assert!(debug.contains("Quit"));
    }

    #[test]
    fn webview_options_default() {
        let opts = WebviewOptions::default();
        assert_eq!(opts.title, "VTZ");
        assert_eq!(opts.width, 1024);
        assert_eq!(opts.height, 768);
        assert!(!opts.hidden);
    }

    #[test]
    fn webview_error_display() {
        let err = WebviewError::WindowCreation("test error".to_string());
        assert_eq!(err.to_string(), "failed to create window: test error");
    }

    #[test]
    fn eval_script_event_helper_creates_valid_event() {
        let (tx, _rx) = oneshot::channel();
        let evt = eval_script_event("document.title".to_string(), tx);
        match &evt {
            UserEvent::EvalScript { js, tx } => {
                assert_eq!(js, "document.title");
                assert!(tx.lock().unwrap().is_some());
            }
            _ => panic!("expected EvalScript variant"),
        }
    }

    #[test]
    fn eval_script_event_sender_can_be_taken() {
        let (tx, rx) = oneshot::channel();
        let evt = eval_script_event("test".to_string(), tx);
        if let UserEvent::EvalScript { tx, .. } = evt {
            let sender = tx.lock().unwrap().take();
            assert!(sender.is_some());
            assert!(tx.lock().unwrap().is_none());
            sender.unwrap().send("result".to_string()).unwrap();
            assert_eq!(rx.blocking_recv().unwrap(), "result");
        }
    }
}
