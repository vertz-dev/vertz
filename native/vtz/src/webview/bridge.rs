//! WebviewBridge — async eval round-trip between V8 test isolate and WebKit.

use std::time::Duration;

use tao::event_loop::EventLoopProxy;
use tokio::sync::oneshot;

use super::{eval_script_event, UserEvent};

/// Sends JavaScript to the webview for evaluation and returns the result.
/// This is the core mechanism all e2e ops use.
#[derive(Clone)]
pub struct WebviewBridge {
    proxy: EventLoopProxy<UserEvent>,
}

impl WebviewBridge {
    pub fn new(proxy: EventLoopProxy<UserEvent>) -> Self {
        Self { proxy }
    }

    /// Evaluate JS in the webview and return the result string.
    /// Times out after `timeout_ms` milliseconds.
    pub async fn eval(&self, js: &str, timeout_ms: u64) -> Result<String, BridgeError> {
        let (tx, rx) = oneshot::channel();
        self.proxy
            .send_event(eval_script_event(js.to_string(), tx))
            .map_err(|_| BridgeError::EventLoopClosed)?;

        let result = tokio::time::timeout(Duration::from_millis(timeout_ms), rx)
            .await
            .map_err(|_| BridgeError::Timeout {
                js_snippet: truncate(js, 80),
                timeout_ms,
            })?
            .map_err(|_| BridgeError::EventLoopClosed)?;

        Ok(result)
    }
}

/// Errors from the webview bridge.
#[derive(Debug)]
pub enum BridgeError {
    /// The eval did not complete within the timeout.
    Timeout { js_snippet: String, timeout_ms: u64 },
    /// The event loop was closed (webview shut down).
    EventLoopClosed,
}

impl std::fmt::Display for BridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Timeout {
                js_snippet,
                timeout_ms,
            } => write!(
                f,
                "webview eval timed out after {}ms: {}",
                timeout_ms, js_snippet
            ),
            Self::EventLoopClosed => write!(f, "webview event loop closed"),
        }
    }
}

impl std::error::Error for BridgeError {}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_error_display_timeout() {
        let err = BridgeError::Timeout {
            js_snippet: "document.title".to_string(),
            timeout_ms: 5000,
        };
        let msg = err.to_string();
        assert!(msg.contains("5000ms"));
        assert!(msg.contains("document.title"));
    }

    #[test]
    fn bridge_error_display_closed() {
        let err = BridgeError::EventLoopClosed;
        assert_eq!(err.to_string(), "webview event loop closed");
    }

    #[test]
    fn truncate_short_string() {
        assert_eq!(truncate("hello", 10), "hello");
    }

    #[test]
    fn truncate_long_string() {
        let long = "a".repeat(100);
        let result = truncate(&long, 10);
        assert_eq!(result.len(), 13); // 10 + "..."
        assert!(result.ends_with("..."));
    }
}
