//! DEPRECATED: Stack-based AsyncLocalStorage polyfill.
//!
//! This polyfill is broken for async callbacks: the `finally` block pops
//! the context immediately when the Promise is returned, before the first
//! `await` suspends. Use `runtime::async_context::load_async_context()` instead,
//! which uses V8 promise hooks for correct async propagation.
//!
//! Kept for backward compatibility but no longer called by any production code.

/// JavaScript implementation of the AsyncLocalStorage polyfill.
///
/// This provides:
/// - `AsyncLocalStorage` class with `run(store, callback)` and `getStore()`
/// - Stack-based context for nested `run()` calls
/// - Works for synchronous SSR render (which is the primary use case)
/// - Also works across simple `await` by tracking the store globally
///   (single-threaded V8 means no true concurrency)
pub const ASYNC_LOCAL_STORAGE_JS: &str = r#"
(function() {
  'use strict';

  class AsyncLocalStorage {
    constructor() {
      this._id = Symbol('als');
    }

    run(store, callback, ...args) {
      const stack = AsyncLocalStorage._stacks.get(this._id) || [];
      stack.push(store);
      AsyncLocalStorage._stacks.set(this._id, stack);
      try {
        return callback(...args);
      } finally {
        stack.pop();
        if (stack.length === 0) {
          AsyncLocalStorage._stacks.delete(this._id);
        }
      }
    }

    getStore() {
      const stack = AsyncLocalStorage._stacks.get(this._id);
      if (!stack || stack.length === 0) return undefined;
      return stack[stack.length - 1];
    }

    enterWith(store) {
      const stack = AsyncLocalStorage._stacks.get(this._id) || [];
      stack.push(store);
      AsyncLocalStorage._stacks.set(this._id, stack);
    }

    disable() {
      AsyncLocalStorage._stacks.delete(this._id);
    }
  }

  // Shared store stacks across all instances
  AsyncLocalStorage._stacks = new Map();

  // Install globally
  globalThis.AsyncLocalStorage = AsyncLocalStorage;

  // Also provide as a "module" at the well-known path
  globalThis.__vertz_async_hooks = {
    AsyncLocalStorage,
  };
})();
"#;

/// Load the AsyncLocalStorage polyfill into a V8 runtime.
///
/// DEPRECATED: Use `crate::runtime::async_context::load_async_context()` instead.
/// This stack-based polyfill is broken for async callbacks.
#[deprecated(note = "Use runtime::async_context::load_async_context() instead")]
pub fn load_async_local_storage(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
) -> Result<(), deno_core::error::AnyError> {
    runtime.execute_script_void("[vertz:async-local-storage]", ASYNC_LOCAL_STORAGE_JS)
}

#[cfg(test)]
#[allow(deprecated)]
mod tests {
    use super::*;
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap()
    }

    #[test]
    fn test_async_local_storage_loads() {
        let mut rt = create_runtime();
        let result = load_async_local_storage(&mut rt);
        assert!(result.is_ok(), "Should load: {:?}", result.err());
    }

    #[test]
    fn test_run_sets_and_clears_store() {
        let mut rt = create_runtime();
        load_async_local_storage(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const als = new AsyncLocalStorage();
                let inside = null;
                let outside_before = als.getStore();
                als.run({ userId: '123' }, () => {
                    inside = als.getStore();
                });
                let outside_after = als.getStore();
                ({ outside_before, inside, outside_after })
                "#,
            )
            .unwrap();
        assert_eq!(result["outside_before"], serde_json::Value::Null);
        assert_eq!(result["inside"]["userId"], serde_json::json!("123"));
        assert_eq!(result["outside_after"], serde_json::Value::Null);
    }

    #[test]
    fn test_nested_run_calls() {
        let mut rt = create_runtime();
        load_async_local_storage(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const als = new AsyncLocalStorage();
                let outer = null;
                let inner = null;
                let after_inner = null;

                als.run({ level: 1 }, () => {
                    outer = als.getStore();
                    als.run({ level: 2 }, () => {
                        inner = als.getStore();
                    });
                    after_inner = als.getStore();
                });

                ({ outer: outer.level, inner: inner.level, after_inner: after_inner.level })
                "#,
            )
            .unwrap();
        assert_eq!(result["outer"], serde_json::json!(1));
        assert_eq!(result["inner"], serde_json::json!(2));
        assert_eq!(result["after_inner"], serde_json::json!(1));
    }

    #[test]
    fn test_isolated_instances() {
        let mut rt = create_runtime();
        load_async_local_storage(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const als1 = new AsyncLocalStorage();
                const als2 = new AsyncLocalStorage();
                let store1 = null;
                let store2 = null;

                als1.run({ name: 'one' }, () => {
                    als2.run({ name: 'two' }, () => {
                        store1 = als1.getStore();
                        store2 = als2.getStore();
                    });
                });

                ({ store1: store1.name, store2: store2.name })
                "#,
            )
            .unwrap();
        assert_eq!(result["store1"], serde_json::json!("one"));
        assert_eq!(result["store2"], serde_json::json!("two"));
    }

    #[test]
    fn test_run_returns_callback_value() {
        let mut rt = create_runtime();
        load_async_local_storage(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const als = new AsyncLocalStorage();
                const result = als.run({}, () => {
                    return 42;
                });
                result
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(42));
    }

    #[test]
    fn test_run_cleans_up_on_throw() {
        let mut rt = create_runtime();
        load_async_local_storage(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const als = new AsyncLocalStorage();
                try {
                    als.run({ x: 1 }, () => {
                        throw new Error('boom');
                    });
                } catch (e) {
                    // Expected
                }
                als.getStore() === undefined
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_get_store_returns_undefined_when_not_in_run() {
        let mut rt = create_runtime();
        load_async_local_storage(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const als = new AsyncLocalStorage();
                als.getStore() === undefined
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_enter_with() {
        let mut rt = create_runtime();
        load_async_local_storage(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const als = new AsyncLocalStorage();
                als.enterWith({ userId: 'abc' });
                const store = als.getStore();
                als.disable();
                ({ userId: store.userId, after: als.getStore() === undefined })
                "#,
            )
            .unwrap();
        assert_eq!(result["userId"], serde_json::json!("abc"));
        assert_eq!(result["after"], serde_json::json!(true));
    }
}
