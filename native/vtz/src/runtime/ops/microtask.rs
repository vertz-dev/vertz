use deno_core::OpDecl;

/// No native ops — queueMicrotask is pure JS.
pub fn op_decls() -> Vec<OpDecl> {
    vec![]
}

/// JavaScript bootstrap code for queueMicrotask.
/// Uses Promise.resolve() to schedule a microtask on the V8 microtask queue.
pub const MICROTASK_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  if (!globalThis.queueMicrotask) {
    globalThis.queueMicrotask = (callback) => {
      if (typeof callback !== 'function') {
        throw new TypeError('queueMicrotask requires a function argument');
      }
      Promise.resolve().then(callback);
    };
  }
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    #[tokio::test]
    async fn test_queue_microtask_executes() {
        let mut rt = create_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            globalThis.__microtaskResult = [];
            queueMicrotask(() => {
                globalThis.__microtaskResult.push('microtask');
            });
            globalThis.__microtaskResult.push('sync');
        "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let result = rt
            .execute_script("<test>", "globalThis.__microtaskResult")
            .unwrap();
        // 'sync' runs first, then 'microtask'
        assert_eq!(result, serde_json::json!(["sync", "microtask"]));
    }

    #[tokio::test]
    async fn test_queue_microtask_runs_before_timers() {
        let mut rt = create_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            globalThis.__order = [];
            setTimeout(() => globalThis.__order.push('timeout'), 0);
            queueMicrotask(() => globalThis.__order.push('microtask'));
            globalThis.__order.push('sync');
        "#,
        )
        .unwrap();
        rt.run_event_loop().await.unwrap();
        let result = rt.execute_script("<test>", "globalThis.__order").unwrap();
        // Microtasks run before timers
        assert_eq!(result, serde_json::json!(["sync", "microtask", "timeout"]));
    }

    #[test]
    fn test_queue_microtask_rejects_non_function() {
        let mut rt = create_runtime();
        let result = rt.execute_script(
            "<test>",
            r#"
            try {
                queueMicrotask('not a function');
                'no error';
            } catch (e) {
                e instanceof TypeError ? 'TypeError' : e.constructor.name;
            }
        "#,
        );
        assert_eq!(result.unwrap(), serde_json::json!("TypeError"));
    }

    #[test]
    fn test_queue_microtask_exists_as_global() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "typeof queueMicrotask")
            .unwrap();
        assert_eq!(result, serde_json::json!("function"));
    }
}
