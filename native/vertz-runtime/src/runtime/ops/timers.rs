use deno_core::op2;
use deno_core::OpDecl;

/// Sleep for the given number of milliseconds.
#[op2(async)]
pub async fn op_timer_sleep(#[bigint] millis: u64) {
    tokio::time::sleep(std::time::Duration::from_millis(millis)).await;
}

/// Get the op declarations for timer ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_timer_sleep()]
}

/// JavaScript bootstrap code for timer globals.
///
/// Cancelled timers are handled by breaking long sleeps into short chunks
/// (max 100ms each) and checking the `cancelled` flag between chunks.
/// This ensures that `clearTimeout`/`clearInterval` causes the underlying
/// `op_timer_sleep` ops to drain quickly instead of keeping the event loop
/// alive for the full original duration.
///
/// Without this, a cancelled 1-hour timer would block `run_event_loop()`
/// for up to 1 hour — causing test file timeouts in `vertz test`.
pub const TIMERS_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  let nextId = 1;
  const activeTimers = new Map();

  // Maximum sleep chunk in ms. Cancelled timers drain within this interval.
  const CANCEL_CHECK_MS = 100;

  async function sleepCancellable(state, delay) {
    let remaining = Math.max(0, delay);
    if (remaining <= CANCEL_CHECK_MS) {
      // Short delay — sleep in one go (common fast path)
      await Deno.core.ops.op_timer_sleep(BigInt(remaining));
      return;
    }
    // Long delay — chunk into CANCEL_CHECK_MS slices, bail on cancellation
    while (remaining > 0 && !state.cancelled) {
      const chunk = Math.min(remaining, CANCEL_CHECK_MS);
      await Deno.core.ops.op_timer_sleep(BigInt(chunk));
      remaining -= chunk;
    }
  }

  globalThis.setTimeout = function(callback, delay = 0) {
    const id = nextId++;
    const state = { cancelled: false };
    activeTimers.set(id, state);

    (async () => {
      try {
        await sleepCancellable(state, delay);
        if (!state.cancelled) {
          activeTimers.delete(id);
          callback();
        }
      } catch {
        // Timer was cancelled or runtime is shutting down
      }
    })();

    return id;
  };

  globalThis.clearTimeout = function(id) {
    const state = activeTimers.get(id);
    if (state) {
      state.cancelled = true;
      activeTimers.delete(id);
    }
  };

  globalThis.setInterval = function(callback, delay = 0) {
    const id = nextId++;
    const state = { cancelled: false };
    activeTimers.set(id, state);

    (async () => {
      try {
        while (!state.cancelled) {
          await sleepCancellable(state, delay);
          if (!state.cancelled) {
            callback();
          }
        }
      } catch {
        // Timer was cancelled or runtime is shutting down
      }
    })();

    return id;
  };

  globalThis.clearInterval = function(id) {
    const state = activeTimers.get(id);
    if (state) {
      state.cancelled = true;
      activeTimers.delete(id);
    }
  };
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_capturing_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap()
    }

    #[tokio::test]
    async fn test_set_timeout_fires() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            setTimeout(() => console.log('fired'), 10);
        "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["fired"]);
    }

    #[tokio::test]
    async fn test_clear_timeout_prevents_firing() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            const id = setTimeout(() => console.log('should not fire'), 100);
            clearTimeout(id);
            setTimeout(() => console.log('done'), 10);
        "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["done"]);
    }

    #[tokio::test]
    async fn test_set_interval_fires_repeatedly() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            let counter = 0;
            const id = setInterval(() => {
                counter++;
                console.log('tick ' + counter);
                if (counter >= 3) {
                    clearInterval(id);
                }
            }, 10);
        "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["tick 1", "tick 2", "tick 3"]);
    }

    #[tokio::test]
    async fn test_clear_interval_stops_repeating() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            let counter = 0;
            const id = setInterval(() => {
                counter++;
                console.log('tick');
            }, 10);
            setTimeout(() => {
                clearInterval(id);
                console.log('stopped at ' + counter);
            }, 50);
        "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let output = rt.captured_output();
        let last = output.stdout.last().unwrap();
        assert!(last.starts_with("stopped at"));
    }

    #[tokio::test]
    async fn test_set_timeout_zero_delay() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            setTimeout(() => console.log('zero delay'), 0);
        "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["zero delay"]);
    }

    /// Cancelled long-lived timers must not keep the event loop alive.
    /// Before the fix, a cancelled 10-second timer would block run_event_loop()
    /// for 10 seconds (or hit the file-level timeout).
    #[tokio::test]
    async fn test_cancelled_timer_frees_event_loop() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            // Schedule a long timer and immediately cancel it
            const id = setTimeout(() => console.log('should not fire'), 60000);
            clearTimeout(id);
            // Schedule a short timer to prove the event loop completes quickly
            setTimeout(() => console.log('done'), 5);
        "#,
        )
        .unwrap();

        let start = std::time::Instant::now();
        rt.run_event_loop().await.unwrap();
        let elapsed = start.elapsed();

        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["done"]);
        // Event loop must complete in well under 1 second (not 60s).
        // The chunked sleep drains cancelled timers in <= 100ms.
        assert!(
            elapsed.as_millis() < 1000,
            "Event loop took {}ms — cancelled timer kept it alive",
            elapsed.as_millis()
        );
    }

    /// Cancelled interval must not keep the event loop alive.
    #[tokio::test]
    async fn test_cancelled_interval_frees_event_loop() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            const id = setInterval(() => {}, 60000);
            clearInterval(id);
            setTimeout(() => console.log('done'), 5);
        "#,
        )
        .unwrap();

        let start = std::time::Instant::now();
        rt.run_event_loop().await.unwrap();
        let elapsed = start.elapsed();

        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["done"]);
        assert!(
            elapsed.as_millis() < 1000,
            "Event loop took {}ms — cancelled interval kept it alive",
            elapsed.as_millis()
        );
    }

    /// Self-rescheduling setTimeout chain (like RelativeTime component) must
    /// clean up properly when clearTimeout cancels the pending timer.
    #[tokio::test]
    async fn test_self_rescheduling_timer_cleanup() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            let timerId;
            let count = 0;
            function tick() {
                count++;
                console.log('tick ' + count);
                timerId = setTimeout(tick, 10);
            }
            timerId = setTimeout(tick, 10);

            // After 50ms, cancel the chain
            setTimeout(() => {
                clearTimeout(timerId);
                console.log('stopped');
            }, 55);
        "#,
        )
        .unwrap();

        let start = std::time::Instant::now();
        rt.run_event_loop().await.unwrap();
        let elapsed = start.elapsed();

        let output = rt.captured_output();
        assert!(output.stdout.last().unwrap() == "stopped");
        // Must complete quickly after cancellation, not hang
        assert!(
            elapsed.as_millis() < 1000,
            "Event loop took {}ms",
            elapsed.as_millis()
        );
    }
}
