//! Generic push channel from Rust to JavaScript.
//!
//! Sends events to the webview via `EvalScriptFireAndForget` on the main
//! thread event loop. Used by `shell.spawn()` for streaming stdout/stderr,
//! and reusable for future features like file watchers and system events.

use std::sync::atomic::{AtomicU64, Ordering};

use tao::event_loop::EventLoopProxy;

use super::UserEvent;

/// Global subscription ID counter. Each subscription gets a unique ID.
static NEXT_SUBSCRIPTION_ID: AtomicU64 = AtomicU64::new(1);

/// Allocate a globally unique subscription ID.
pub fn next_subscription_id() -> u64 {
    NEXT_SUBSCRIPTION_ID.fetch_add(1, Ordering::Relaxed)
}

/// Generic push channel from Rust → JS.
///
/// Uses `EvalScriptFireAndForget` to avoid oneshot overhead on every push event.
/// Cloneable — background tasks (stdout reader, stderr reader) each get a clone.
#[derive(Clone)]
pub struct EventChannel {
    proxy: EventLoopProxy<UserEvent>,
}

impl EventChannel {
    /// Create a new event channel targeting the given event loop.
    pub fn new(proxy: EventLoopProxy<UserEvent>) -> Self {
        Self { proxy }
    }

    /// Push a single event to the JS subscription identified by `sub_id`.
    pub fn emit(&self, sub_id: u64, event_type: &str, data: &serde_json::Value) {
        let js = format!(
            "window.__vtz_event({},{},{})",
            sub_id,
            serde_json::to_string(event_type).unwrap(),
            data,
        );
        let _ = self
            .proxy
            .send_event(UserEvent::EvalScriptFireAndForget { js });
    }

    /// Push a batch of events in a single `evaluate_script` call.
    ///
    /// Used by output reader tasks to reduce event loop pressure under
    /// high-frequency output.
    pub fn emit_batch(&self, events: &[(u64, &str, &serde_json::Value)]) {
        if events.is_empty() {
            return;
        }
        let entries: Vec<String> = events
            .iter()
            .map(|(id, typ, data)| {
                format!("[{},{},{}]", id, serde_json::to_string(typ).unwrap(), data)
            })
            .collect();
        let js = format!("window.__vtz_event_batch([{}])", entries.join(","));
        let _ = self
            .proxy
            .send_event(UserEvent::EvalScriptFireAndForget { js });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── next_subscription_id ──

    #[test]
    fn next_subscription_id_returns_unique_ids() {
        let id1 = next_subscription_id();
        let id2 = next_subscription_id();
        let id3 = next_subscription_id();
        assert_ne!(id1, id2);
        assert_ne!(id2, id3);
        assert!(id2 > id1);
        assert!(id3 > id2);
    }

    #[test]
    fn next_subscription_id_is_never_zero() {
        // The counter starts at 1, so IDs are always positive.
        // (We can't test the very first call since other tests may have advanced it,
        // but we can verify the returned value is > 0.)
        let id = next_subscription_id();
        assert!(id > 0);
    }
}
