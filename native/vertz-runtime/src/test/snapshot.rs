//! V8 startup snapshot for the test runner.
//!
//! Pre-bakes bootstrap JS, async context polyfill, and test harness into a V8
//! snapshot. Restoring from snapshot skips ~5-8ms of JS parsing/execution per
//! test file, giving a significant reduction in per-file overhead.
//!
//! The snapshot is created lazily on first use and cached for the process
//! lifetime via `LazyLock`.

use std::sync::Arc;
use std::sync::LazyLock;
use std::sync::Mutex;
use std::time::Instant;

use deno_core::Extension;
use deno_core::JsRuntimeForSnapshot;
use deno_core::RuntimeOptions;

use crate::runtime::js_runtime::{CapturedOutput, VertzJsRuntime};
use crate::runtime::ops::{console, crypto_subtle, performance, sqlite};

use super::dom_shim::TEST_DOM_SHIM_JS;
use super::globals::TEST_HARNESS_JS;

/// Lazily-initialized test snapshot, created once and shared across all test files.
static TEST_SNAPSHOT: LazyLock<&'static [u8]> = LazyLock::new(|| {
    let snapshot = create_test_snapshot();
    Box::leak(snapshot)
});

/// Get the test runner V8 snapshot.
///
/// On first call, creates the snapshot (includes bootstrap JS, async context,
/// test harness). Subsequent calls return the cached snapshot immediately.
pub fn get_test_snapshot() -> &'static [u8] {
    &TEST_SNAPSHOT
}

/// Modified async context polyfill that stores hook functions on globalThis
/// for re-registration after snapshot restore.
///
/// Changes from the original `ASYNC_CONTEXT_JS`:
/// 1. Stores hook functions on `globalThis.__vertz_promiseHookFns`
/// 2. Still calls `__vertz_setPromiseHooks` if available (for non-snapshot path)
pub const ASYNC_CONTEXT_SNAPSHOT_JS: &str = r#"
(function() {
  'use strict';

  let __currentMapping = new Map();
  const __mappingStack = [];

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

  function __promiseInit(promise) {
    promise.__asyncContextMapping = __currentMapping;
  }

  function __promiseBefore(promise) {
    __mappingStack.push(__currentMapping);
    if (promise.__asyncContextMapping) {
      __currentMapping = promise.__asyncContextMapping;
    }
  }

  function __promiseAfter(_promise) {
    if (__mappingStack.length > 0) {
      __currentMapping = __mappingStack.pop();
    }
  }

  function __promiseResolve(_promise) {}

  // Store hook functions on globalThis for post-snapshot-restore re-registration.
  globalThis.__vertz_promiseHookFns = {
    init: __promiseInit,
    before: __promiseBefore,
    after: __promiseAfter,
    resolve: __promiseResolve,
  };

  // Install hooks if the native function is available (non-snapshot path).
  if (typeof __vertz_setPromiseHooks === 'function') {
    __vertz_setPromiseHooks(__promiseInit, __promiseBefore, __promiseAfter, __promiseResolve);
  }

  class AsyncLocalStorage {
    #variable;
    constructor() { this.#variable = new Variable(); }
    run(store, fn, ...args) { return this.#variable.run(store, () => fn(...args)); }
    getStore() { return this.#variable.get(); }
  }

  class AsyncResource {
    constructor(type, _opts) { this.type = type; }
    runInAsyncScope(fn, thisArg, ...args) { return fn.apply(thisArg, args); }
    emitDestroy() { return this; }
    asyncId() { return -1; }
    triggerAsyncId() { return -1; }
  }

  globalThis.AsyncContext = { Variable };
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
  globalThis.__vertz_async_hooks = { AsyncLocalStorage, AsyncResource };
})();
"#;

/// Post-restore script: re-installs promise hooks using the stored functions.
pub const ASYNC_CONTEXT_REHOOK_JS: &str = r#"
if (typeof __vertz_setPromiseHooks === 'function' && globalThis.__vertz_promiseHookFns) {
  const h = globalThis.__vertz_promiseHookFns;
  __vertz_setPromiseHooks(h.init, h.before, h.after, h.resolve);
}
"#;

/// Create a V8 snapshot with bootstrap JS + async context + DOM shim + test harness pre-baked.
fn create_test_snapshot() -> Box<[u8]> {
    let start_time = Instant::now();
    let captured = Arc::new(Mutex::new(CapturedOutput::default()));
    let captured_clone = Arc::clone(&captured);

    let ext = Extension {
        name: "vertz",
        ops: std::borrow::Cow::Owned(VertzJsRuntime::all_op_decls()),
        op_state_fn: Some(Box::new(move |state| {
            state.put(console::ConsoleState {
                capture: false,
                captured: Arc::clone(&captured_clone),
            });
            state.put(performance::PerformanceState { start_time });
            state.put(crypto_subtle::CryptoKeyStore::default());
            state.put(sqlite::SqliteStore::default());
        })),
        ..Default::default()
    };

    let mut runtime = JsRuntimeForSnapshot::new(RuntimeOptions {
        extensions: vec![ext],
        ..Default::default()
    });

    // Execute bootstrap JS (same modules as VertzJsRuntime::new())
    runtime
        .execute_script(
            "[vertz:bootstrap]",
            deno_core::FastString::from(VertzJsRuntime::bootstrap_js()),
        )
        .expect("snapshot: bootstrap JS failed");

    // Execute async context polyfill (without hook installation —
    // __vertz_setPromiseHooks doesn't exist during snapshot creation,
    // so the guard skips it; hook functions are stored on globalThis
    // for post-restore re-registration)
    runtime
        .execute_script(
            "[vertz:async-context]",
            deno_core::FastString::from(ASYNC_CONTEXT_SNAPSHOT_JS.to_string()),
        )
        .expect("snapshot: async context JS failed");

    // Execute DOM shim (document, window, Element, Event, etc.)
    // Must run before test harness so DOM globals are available for test utilities.
    runtime
        .execute_script(
            "[vertz:dom-shim]",
            deno_core::FastString::from(TEST_DOM_SHIM_JS.to_string()),
        )
        .expect("snapshot: DOM shim JS failed");

    // Execute test harness (describe, it, expect, mock, etc.)
    runtime
        .execute_script(
            "[vertz:test-harness]",
            deno_core::FastString::from(TEST_HARNESS_JS.to_string()),
        )
        .expect("snapshot: test harness JS failed");

    runtime.snapshot()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    #[test]
    fn test_snapshot_creates_successfully() {
        let snapshot = get_test_snapshot();
        assert!(!snapshot.is_empty(), "Snapshot should have non-zero size");
    }

    #[test]
    fn test_new_for_test_creates_runtime_with_harness() {
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let result = rt
            .execute_script(
                "<test>",
                "typeof describe === 'function' && typeof it === 'function' && typeof expect === 'function'",
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_new_for_test_has_structured_clone() {
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let result = rt
            .execute_script(
                "<test>",
                r#"
                const original = { a: 1, b: [2, 3] };
                const cloned = structuredClone(original);
                cloned.a === 1 && cloned.b[1] === 3 && original !== cloned
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_new_for_test_has_async_context() {
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v = new AsyncContext.Variable({ defaultValue: 'default' });
                let inside = null;
                v.run('test-value', () => { inside = v.get(); });
                JSON.stringify({ default: v.get(), inside })
                "#,
            )
            .unwrap();

        let parsed: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(parsed["default"], "default");
        assert_eq!(parsed["inside"], "test-value");
    }

    #[test]
    fn test_new_for_test_async_context_propagates_through_promises() {
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test>",
                r#"
                const v = new AsyncContext.Variable();
                globalThis.__asyncResult = v.run('propagated', async () => {
                    await new Promise(r => setTimeout(r, 1));
                    return v.get();
                }).then(val => { globalThis.__asyncVal = val; });
                "#,
            )
            .unwrap();

            rt.run_event_loop().await.unwrap();
            rt.execute_script("<collect>", "globalThis.__asyncVal")
                .unwrap()
        });

        assert_eq!(result, serde_json::json!("propagated"));
    }

    #[test]
    fn test_new_for_test_runs_test_suite() {
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test-file>",
                r#"
                describe('snapshot test', () => {
                    it('basic assertion', () => { expect(1 + 1).toBe(2); });
                    it('deep equality', () => { expect({ a: 1 }).toEqual({ a: 1 }); });
                    it('mock function', () => {
                        const fn = mock(() => 42);
                        expect(fn()).toBe(42);
                        expect(fn).toHaveBeenCalledTimes(1);
                    });
                });
                "#,
            )
            .unwrap();

            rt.execute_script_void(
                "<run>",
                "globalThis.__vertz_run_tests().then(r => globalThis.__test_results = r)",
            )
            .unwrap();

            rt.run_event_loop().await.unwrap();
            rt.execute_script("<collect>", "JSON.stringify(globalThis.__test_results)")
                .unwrap()
        });

        let results: Vec<serde_json::Value> =
            serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(results.len(), 3);
        for (i, result) in results.iter().enumerate() {
            assert_eq!(
                result["status"], "pass",
                "Test {} should pass, got: {:?}",
                i, result
            );
        }
    }

    #[test]
    fn test_new_for_test_has_console() {
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let result = rt
            .execute_script("<test>", "typeof console.log === 'function'")
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_new_for_test_has_timers() {
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test>",
                "setTimeout(() => { globalThis.__timerFired = true; }, 1);",
            )
            .unwrap();

            rt.run_event_loop().await.unwrap();
            rt.execute_script("<collect>", "globalThis.__timerFired === true")
                .unwrap()
        });

        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_new_for_test_has_dom_stubs() {
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let result = rt
            .execute_script(
                "<test>",
                "typeof HTMLElement === 'function' && typeof EventTarget === 'function'",
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }
}
