//! AsyncContext implementation with V8 promise hooks for proper async propagation.
//!
//! Implements TC39 AsyncContext.Variable as the native primitive, with
//! Node.js AsyncLocalStorage as a thin compat wrapper.
//!
//! The stack-based polyfill in `ssr/async_local_storage.rs` is broken for async
//! callbacks: the `finally` block pops the context immediately when the Promise
//! is returned, before the first `await` suspends. This module replaces it with
//! a correct implementation using V8's `Context::set_promise_hooks()`.

/// JavaScript implementation of AsyncContext.Variable + AsyncLocalStorage.
///
/// Architecture:
/// - A global `__currentMapping` holds a Map<Variable, value> representing the
///   current async context.
/// - `Variable.run()` replaces the mapping, calls the function, and restores.
///   For sync functions, this is a simple save/restore in try/finally.
///   For async functions, V8 promise hooks ensure the correct mapping is
///   restored at each continuation.
/// - Promise hooks: `init` snapshots `__currentMapping` onto the promise,
///   `before` restores the snapshot, `after` restores the previous mapping.
pub const ASYNC_CONTEXT_JS: &str = r#"
(function() {
  'use strict';

  // --- Core state ---
  // The current context mapping. Each Variable stores its value here.
  // This is a Map<Variable, value> that gets snapshotted by promise hooks.
  let __currentMapping = new Map();

  // Stack for before/after hook pairs — when a promise continuation runs,
  // `before` pushes the previous mapping, `after` pops it.
  const __mappingStack = [];

  // --- AsyncContext.Variable (TC39 Stage 2) ---
  class Variable {
    #defaultValue;
    #name;

    constructor(options) {
      this.#defaultValue = options?.defaultValue;
      this.#name = options?.name;
    }

    get name() { return this.#name; }

    get() {
      if (__currentMapping.has(this)) {
        return __currentMapping.get(this);
      }
      return this.#defaultValue;
    }

    run(value, fn) {
      // Snapshot current mapping, create new one with this variable set
      const previousMapping = __currentMapping;
      const newMapping = new Map(previousMapping);
      newMapping.set(this, value);
      __currentMapping = newMapping;
      try {
        return fn();
      } finally {
        __currentMapping = previousMapping;
      }
    }
  }

  // --- Promise hooks ---
  // These are called by V8 internally at promise lifecycle points.

  // Called when a new promise is created (including implicit promises from await).
  // Snapshots the current mapping onto the promise.
  function __promiseInit(promise) {
    promise.__asyncContextMapping = __currentMapping;
  }

  // Called before a promise continuation (.then handler, await resumption) runs.
  // Restores the mapping that was active when the promise was created.
  function __promiseBefore(promise) {
    __mappingStack.push(__currentMapping);
    if (promise.__asyncContextMapping) {
      __currentMapping = promise.__asyncContextMapping;
    }
  }

  // Called after a promise continuation completes.
  // Restores the mapping from before the continuation ran.
  function __promiseAfter(_promise) {
    if (__mappingStack.length > 0) {
      __currentMapping = __mappingStack.pop();
    }
  }

  // Called when a promise is resolved (we don't need this for context propagation).
  function __promiseResolve(_promise) {}

  // --- Install promise hooks via the Rust-registered V8 function ---
  // __vertz_setPromiseHooks calls v8::HandleScope::set_promise_hooks
  // which wires these JS functions to V8's internal promise machinery.
  if (typeof __vertz_setPromiseHooks === 'function') {
    __vertz_setPromiseHooks(
      __promiseInit,
      __promiseBefore,
      __promiseAfter,
      __promiseResolve,
    );
  }

  // --- AsyncLocalStorage (Node.js compat wrapper) ---
  class AsyncLocalStorage {
    #variable;

    constructor() {
      this.#variable = new Variable();
    }

    run(store, fn, ...args) {
      return this.#variable.run(store, () => fn(...args));
    }

    getStore() {
      return this.#variable.get();
    }
  }

  // --- AsyncResource (stub for import compat) ---
  class AsyncResource {
    constructor(type, _opts) {
      this.type = type;
    }
    runInAsyncScope(fn, thisArg, ...args) {
      return fn.apply(thisArg, args);
    }
    emitDestroy() { return this; }
    asyncId() { return -1; }
    triggerAsyncId() { return -1; }
  }

  // --- AsyncContext.Snapshot (TC39 Stage 2) ---
  // Captures the current context mapping at construction time.
  // snapshot.run(fn) restores that mapping for the duration of fn.
  class Snapshot {
    #mapping;
    constructor() {
      this.#mapping = __currentMapping;
    }
    run(fn, ...args) {
      const prev = __currentMapping;
      __currentMapping = this.#mapping;
      try {
        return fn(...args);
      } finally {
        __currentMapping = prev;
      }
    }
  }

  // --- Install on globalThis ---
  globalThis.AsyncContext = { Variable, Snapshot };
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
  globalThis.__vertz_async_hooks = { AsyncLocalStorage, AsyncResource };
})();
"#;

/// Load the AsyncContext polyfill into a V8 runtime.
///
/// This must be called BEFORE any test harness or user code, because
/// it sets up V8 promise hooks that need to be active when promises
/// are created during module evaluation.
pub fn load_async_context(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
) -> Result<(), deno_core::error::AnyError> {
    runtime.execute_script_void("[vertz:async-context]", ASYNC_CONTEXT_JS)
}

#[cfg(test)]
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
    fn test_async_context_loads() {
        let mut rt = create_runtime();
        let result = load_async_context(&mut rt);
        assert!(result.is_ok(), "Should load: {:?}", result.err());
    }

    #[test]
    fn test_variable_get_returns_undefined_outside_run() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                v.get() === undefined
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_variable_default_value() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v = new AsyncContext.Variable({ defaultValue: 'fallback' });
                v.get()
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("fallback"));
    }

    #[test]
    fn test_variable_run_sets_and_restores() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                let inside = null;
                const before = v.get();
                v.run('hello', () => { inside = v.get(); });
                const after = v.get();
                ({ before: before === undefined, inside, after: after === undefined })
                "#,
            )
            .unwrap();
        assert_eq!(result["before"], serde_json::json!(true));
        assert_eq!(result["inside"], serde_json::json!("hello"));
        assert_eq!(result["after"], serde_json::json!(true));
    }

    #[test]
    fn test_variable_run_returns_value() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                const result = v.run('x', () => 42);
                result
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(42));
    }

    #[test]
    fn test_variable_nested_run() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                let outer = null;
                let inner = null;
                let after_inner = null;

                v.run('outer', () => {
                    outer = v.get();
                    v.run('inner', () => {
                        inner = v.get();
                    });
                    after_inner = v.get();
                });

                ({ outer, inner, after_inner })
                "#,
            )
            .unwrap();
        assert_eq!(result["outer"], serde_json::json!("outer"));
        assert_eq!(result["inner"], serde_json::json!("inner"));
        assert_eq!(result["after_inner"], serde_json::json!("outer"));
    }

    #[test]
    fn test_variable_run_cleans_up_on_throw() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                try {
                    v.run('bad', () => { throw new Error('boom'); });
                } catch (e) {}
                v.get() === undefined
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_multiple_variables_isolated() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v1 = new AsyncContext.Variable();
                const v2 = new AsyncContext.Variable();
                let r1 = null;
                let r2 = null;

                v1.run('one', () => {
                    v2.run('two', () => {
                        r1 = v1.get();
                        r2 = v2.get();
                    });
                });

                ({ r1, r2 })
                "#,
            )
            .unwrap();
        assert_eq!(result["r1"], serde_json::json!("one"));
        assert_eq!(result["r2"], serde_json::json!("two"));
    }

    #[test]
    fn test_escaped_closure_does_not_leak_context() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                let laterGet;
                v.run('inside', () => {
                    laterGet = () => v.get();
                });
                laterGet() === undefined
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    // --- AsyncLocalStorage wrapper tests ---

    #[test]
    fn test_als_run_and_get_store() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const als = new AsyncLocalStorage();
                let inside = null;
                als.run({ userId: '123' }, () => {
                    inside = als.getStore();
                });
                ({ inside: inside.userId, outside: als.getStore() === undefined })
                "#,
            )
            .unwrap();
        assert_eq!(result["inside"], serde_json::json!("123"));
        assert_eq!(result["outside"], serde_json::json!(true));
    }

    #[test]
    fn test_als_run_with_extra_args() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const als = new AsyncLocalStorage();
                const result = als.run('ctx', (a, b) => a + b, 10, 20);
                result
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(30));
    }

    #[test]
    fn test_als_run_returns_value() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const als = new AsyncLocalStorage();
                const result = als.run({}, () => 'hello');
                result
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("hello"));
    }

    // --- Async propagation tests (require event loop) ---

    #[test]
    fn test_variable_async_propagation_through_await() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();

        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                globalThis.__asyncResult = v.run('persisted', async () => {
                    await new Promise(r => setTimeout(r, 1));
                    return v.get();
                });
                "#,
            )
            .unwrap();

            rt.run_event_loop().await.unwrap();

            rt.execute_script(
                "<collect>",
                "globalThis.__asyncResult.then(r => globalThis.__finalResult = r)",
            )
            .unwrap();
            rt.run_event_loop().await.unwrap();

            rt.execute_script("<get>", "globalThis.__finalResult")
                .unwrap()
        });

        assert_eq!(result, serde_json::json!("persisted"));
    }

    #[test]
    fn test_variable_concurrent_isolation() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();

        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                globalThis.__concurrentResult = Promise.all([
                    v.run('ctx-1', async () => {
                        await new Promise(r => setTimeout(r, 10));
                        return v.get();
                    }),
                    v.run('ctx-2', async () => {
                        await new Promise(r => setTimeout(r, 10));
                        return v.get();
                    }),
                ]).then(results => {
                    globalThis.__results = results;
                });
                "#,
            )
            .unwrap();

            rt.run_event_loop().await.unwrap();
            rt.execute_script("<get>", "globalThis.__results").unwrap()
        });

        assert_eq!(result, serde_json::json!(["ctx-1", "ctx-2"]));
    }

    #[test]
    fn test_als_async_propagation() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();

        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test>",
                r#"
                const als = new AsyncLocalStorage();
                globalThis.__alsResult = als.run({ requestId: 'req-42' }, async () => {
                    await new Promise(r => setTimeout(r, 1));
                    return als.getStore();
                }).then(store => {
                    globalThis.__alsStore = store;
                });
                "#,
            )
            .unwrap();

            rt.run_event_loop().await.unwrap();
            rt.execute_script("<get>", "globalThis.__alsStore").unwrap()
        });

        assert_eq!(result["requestId"], serde_json::json!("req-42"));
    }

    #[test]
    fn test_variable_run_returns_promise() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();

        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                v.run('x', async () => 'async-value').then(val => {
                    globalThis.__promiseReturn = val;
                });
                "#,
            )
            .unwrap();

            rt.run_event_loop().await.unwrap();
            rt.execute_script("<get>", "globalThis.__promiseReturn")
                .unwrap()
        });

        assert_eq!(result, serde_json::json!("async-value"));
    }

    #[test]
    fn test_variable_async_propagation_after_rejection() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();

        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                globalThis.__rejectionResult = v.run('in-rejection', async () => {
                    await Promise.reject('err').catch(() => {});
                    return v.get();
                }).then(val => {
                    globalThis.__rejVal = val;
                });
                "#,
            )
            .unwrap();

            rt.run_event_loop().await.unwrap();
            rt.execute_script("<get>", "globalThis.__rejVal").unwrap()
        });

        assert_eq!(result, serde_json::json!("in-rejection"));
    }

    #[test]
    fn test_variable_multiple_sequential_awaits() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();

        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                globalThis.__multiAwait = v.run('multi', async () => {
                    const results = [];
                    await new Promise(r => setTimeout(r, 1));
                    results.push(v.get());
                    await new Promise(r => setTimeout(r, 1));
                    results.push(v.get());
                    await new Promise(r => setTimeout(r, 1));
                    results.push(v.get());
                    return results;
                }).then(val => {
                    globalThis.__multiVal = val;
                });
                "#,
            )
            .unwrap();

            rt.run_event_loop().await.unwrap();
            rt.execute_script("<get>", "globalThis.__multiVal").unwrap()
        });

        assert_eq!(result, serde_json::json!(["multi", "multi", "multi"]));
    }

    // --- AsyncResource stub tests ---

    #[test]
    fn test_async_resource_stub() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const { AsyncResource } = globalThis.__vertz_async_hooks;
                const res = new AsyncResource('test');
                const val = res.runInAsyncScope((a) => a * 2, null, 21);
                ({ type: res.type, val, asyncId: res.asyncId() })
                "#,
            )
            .unwrap();
        assert_eq!(result["type"], serde_json::json!("test"));
        assert_eq!(result["val"], serde_json::json!(42));
        assert_eq!(result["asyncId"], serde_json::json!(-1));
    }

    #[test]
    fn test_snapshot_captures_and_restores_context() {
        let mut rt = create_runtime();
        load_async_context(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                let snapshot;

                // Capture context inside a run() scope
                v.run('captured-value', () => {
                    snapshot = new AsyncContext.Snapshot();
                });

                // Outside the run scope, v.get() is undefined
                const outsideValue = v.get();

                // Restore via snapshot.run()
                const restoredValue = snapshot.run(() => v.get());

                ({ outsideValue, restoredValue })
                "#,
            )
            .unwrap();
        assert_eq!(result["outsideValue"], serde_json::json!(null));
        assert_eq!(result["restoredValue"], serde_json::json!("captured-value"));
    }
}
