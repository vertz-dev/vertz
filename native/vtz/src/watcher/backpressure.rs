use std::time::{Duration, Instant};

/// A rate-limited warner for channel backpressure events.
///
/// When a `try_send` fails due to a full channel, `on_drop()` logs a warning
/// via an injectable callback. Warnings are rate-limited: only one warning per
/// `cooldown` period per channel. Suppressed drops are counted and reported
/// in the next warning after the cooldown expires.
///
/// The first drop includes the event detail and an actionability hint.
/// Subsequent drops (after cooldown) include a count of suppressed events.
pub struct BackpressureWarner<F: FnMut(&str)> {
    channel_name: String,
    last_warn: Option<Instant>,
    cooldown: Duration,
    suppressed_count: u32,
    warn_fn: F,
}

impl<F: FnMut(&str)> BackpressureWarner<F> {
    /// Create a new warner for the given channel.
    ///
    /// - `channel_name`: human-readable name (e.g., "File watcher")
    /// - `cooldown`: minimum interval between warnings
    /// - `warn_fn`: callback invoked with the formatted warning message
    pub fn new(channel_name: &str, cooldown: Duration, warn_fn: F) -> Self {
        Self {
            channel_name: channel_name.to_string(),
            last_warn: None,
            cooldown,
            suppressed_count: 0,
            warn_fn,
        }
    }

    /// Called when `try_send` fails. Rate-limits warnings via the cooldown.
    ///
    /// - First drop: logs with detail and actionability hint
    /// - Subsequent drops within cooldown: silently counted
    /// - First drop after cooldown expires: logs summary with suppressed count
    pub fn on_drop(&mut self, detail: &str) {
        if let Some(last) = self.last_warn {
            if last.elapsed() < self.cooldown {
                self.suppressed_count += 1;
                return;
            }
            // Cooldown expired — log summary with suppressed count
            let count = self.suppressed_count;
            let elapsed = last.elapsed();
            let msg = format!(
                "[Server] {} channel full — dropped {} events in the last {:.1}s",
                self.channel_name,
                count + 1, // include this drop
                elapsed.as_secs_f64(),
            );
            (self.warn_fn)(&msg);
            self.suppressed_count = 0;
            self.last_warn = Some(Instant::now());
        } else {
            // First drop ever — log with detail and hint
            let msg = format!(
                "[Server] {} channel full — dropped event for {}. Save again or refresh the browser.",
                self.channel_name, detail,
            );
            (self.warn_fn)(&msg);
            self.suppressed_count = 0;
            self.last_warn = Some(Instant::now());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    type Messages = Rc<RefCell<Vec<String>>>;

    fn make_warner(cooldown_ms: u64) -> (BackpressureWarner<impl FnMut(&str)>, Messages) {
        let messages: Messages = Rc::new(RefCell::new(Vec::new()));
        let msgs = messages.clone();
        let warner = BackpressureWarner::new(
            "Test watcher",
            Duration::from_millis(cooldown_ms),
            move |msg: &str| {
                msgs.borrow_mut().push(msg.to_string());
            },
        );
        (warner, messages)
    }

    #[test]
    fn test_first_drop_logs_with_detail_and_hint() {
        let (mut warner, messages) = make_warner(1000);

        warner.on_drop("src/Button.tsx (Modify)");

        let msgs = messages.borrow();
        assert_eq!(msgs.len(), 1);
        assert!(
            msgs[0].contains("channel full"),
            "Should contain 'channel full': {}",
            msgs[0]
        );
        assert!(
            msgs[0].contains("src/Button.tsx (Modify)"),
            "Should contain file detail: {}",
            msgs[0]
        );
        assert!(
            msgs[0].contains("Save again or refresh"),
            "Should contain actionability hint: {}",
            msgs[0]
        );
        assert!(
            msgs[0].contains("Test watcher"),
            "Should contain channel name: {}",
            msgs[0]
        );
    }

    #[test]
    fn test_suppresses_within_cooldown() {
        let (mut warner, messages) = make_warner(1000); // 1 second cooldown

        warner.on_drop("first.tsx (Modify)");
        warner.on_drop("second.tsx (Modify)");
        warner.on_drop("third.tsx (Modify)");

        let msgs = messages.borrow();
        assert_eq!(
            msgs.len(),
            1,
            "Should only log 1 warning within cooldown, got: {:?}",
            *msgs
        );
    }

    #[test]
    fn test_logs_summary_after_cooldown_with_count() {
        // Use a very short cooldown so the test doesn't take long
        let (mut warner, messages) = make_warner(10); // 10ms cooldown

        warner.on_drop("first.tsx (Modify)");
        warner.on_drop("second.tsx (Modify)");
        warner.on_drop("third.tsx (Modify)");

        // Wait for cooldown to expire
        std::thread::sleep(Duration::from_millis(15));

        warner.on_drop("fourth.tsx (Modify)");

        let msgs = messages.borrow();
        assert_eq!(msgs.len(), 2, "Should have 2 warnings: {:?}", *msgs);

        // Second message should be a summary with the count
        assert!(
            msgs[1].contains("dropped"),
            "Summary should contain 'dropped': {}",
            msgs[1]
        );
        assert!(
            msgs[1].contains("3 events"),
            "Should report 3 suppressed events (2 suppressed + this drop): {}",
            msgs[1]
        );
    }

    #[test]
    fn test_zero_drops_zero_callbacks() {
        let (_warner, messages) = make_warner(1000);

        // No on_drop calls — simulates try_send always succeeding
        let msgs = messages.borrow();
        assert_eq!(
            msgs.len(),
            0,
            "No drops should produce zero callbacks: {:?}",
            *msgs
        );
    }

    #[test]
    fn test_cooldown_resets_after_summary() {
        let (mut warner, messages) = make_warner(10); // 10ms cooldown

        // First burst
        warner.on_drop("a.tsx (Modify)");
        std::thread::sleep(Duration::from_millis(15));

        // Second burst (triggers summary for first burst)
        warner.on_drop("b.tsx (Modify)");
        warner.on_drop("c.tsx (Modify)");
        std::thread::sleep(Duration::from_millis(15));

        // Third drop (triggers summary for second burst)
        warner.on_drop("d.tsx (Modify)");

        let msgs = messages.borrow();
        assert_eq!(msgs.len(), 3, "Should have 3 warnings: {:?}", *msgs);
    }
}
