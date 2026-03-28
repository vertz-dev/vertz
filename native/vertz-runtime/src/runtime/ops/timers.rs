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
/// Uses a simple cancelled flag instead of AbortController (not available in bare V8).
pub const TIMERS_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  let nextId = 1;
  const activeTimers = new Map();

  globalThis.setTimeout = function(callback, delay = 0) {
    const id = nextId++;
    const state = { cancelled: false };
    activeTimers.set(id, state);

    (async () => {
      try {
        await Deno.core.ops.op_timer_sleep(BigInt(Math.max(0, delay)));
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
          await Deno.core.ops.op_timer_sleep(BigInt(Math.max(0, delay)));
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
}
