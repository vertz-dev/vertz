//! Shared V8 snapshot infrastructure and production snapshot.
//!
//! Contains constants shared between the test snapshot (`test/snapshot.rs`)
//! and the production snapshot (this module):
//! - [`ASYNC_CONTEXT_SNAPSHOT_JS`] — async context polyfill for snapshot creation
//! - [`ASYNC_CONTEXT_REHOOK_JS`] — post-restore promise hook reinstallation
//!
//! The **production snapshot** includes: bootstrap JS + async context + SSR DOM shim.
//! The **test snapshot** (in `test/snapshot.rs`) includes: bootstrap JS + async context
//! + test DOM shim + test harness.
//!
//! Both use `LazyLock` for lazy initialization — the snapshot is created on first
//! use and cached for the process lifetime.

use std::sync::Arc;
use std::sync::LazyLock;
use std::sync::Mutex;
use std::time::Instant;

use deno_core::Extension;
use deno_core::JsRuntimeForSnapshot;
use deno_core::RuntimeOptions;

use super::js_runtime::{CapturedOutput, VertzJsRuntime};
use super::ops::{console, crypto_subtle, performance, sqlite};

/// Async context polyfill variant for snapshots.
///
/// **Differs from `ASYNC_CONTEXT_JS`** (in `runtime/async_context.rs`):
/// stores hook functions on `globalThis.__vertz_promiseHookFns` instead of
/// calling `__vertz_setPromiseHooks` (which doesn't exist during snapshot
/// creation). Use [`ASYNC_CONTEXT_REHOOK_JS`] post-restore to re-install hooks.
///
/// **Includes `AsyncContext.Snapshot` class** — captures the current context
/// mapping at construction time and restores it for the duration of `run()`.
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

  // AsyncContext.Snapshot — captures current mapping, restores it during run().
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

  globalThis.AsyncContext = { Variable, Snapshot };
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
  globalThis.__vertz_async_hooks = { AsyncLocalStorage, AsyncResource };
})();
"#;

/// Post-restore script: re-installs promise hooks using the stored functions.
///
/// Must be executed after restoring from a snapshot that used
/// [`ASYNC_CONTEXT_SNAPSHOT_JS`]. The stored hook functions on
/// `globalThis.__vertz_promiseHookFns` are passed to the native
/// `__vertz_setPromiseHooks` function (which is re-registered post-restore).
pub const ASYNC_CONTEXT_REHOOK_JS: &str = r#"
if (typeof __vertz_setPromiseHooks === 'function' && globalThis.__vertz_promiseHookFns) {
  const h = globalThis.__vertz_promiseHookFns;
  __vertz_setPromiseHooks(h.init, h.before, h.after, h.resolve);
}
"#;

/// Lazily-initialized production snapshot, created once and shared across
/// all production isolates in this process.
static PRODUCTION_SNAPSHOT: LazyLock<&'static [u8]> = LazyLock::new(|| {
    let snapshot = create_production_snapshot();
    Box::leak(snapshot)
});

/// Get the production V8 snapshot.
///
/// Includes: bootstrap JS + async context polyfill (with `Snapshot` class) + SSR DOM shim.
/// Does NOT include: test harness, test DOM shim.
///
/// On first call, creates the snapshot (~5ms). Subsequent calls return the
/// cached snapshot immediately.
pub fn get_production_snapshot() -> &'static [u8] {
    &PRODUCTION_SNAPSHOT
}

/// Create a V8 snapshot with bootstrap JS + async context + SSR DOM shim pre-baked.
///
/// The SSR DOM shim uses `Proxy` in 3 lazy getters (`.style`, `.dataset`,
/// `getComputedStyle()`), but no `Proxy` instances are created during this
/// init block — only basic DOM construction happens. This is safe for snapshot
/// serialization, but fragile: changes to the DOM shim's init block that
/// trigger `.style` or `.dataset` would break snapshot creation.
fn create_production_snapshot() -> Box<[u8]> {
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
        .expect("production snapshot: bootstrap JS failed");

    // Execute async context polyfill (snapshot variant — stores hooks on
    // globalThis instead of installing them, since __vertz_setPromiseHooks
    // doesn't exist during snapshot creation)
    runtime
        .execute_script(
            "[vertz:async-context]",
            deno_core::FastString::from(ASYNC_CONTEXT_SNAPSHOT_JS.to_string()),
        )
        .expect("production snapshot: async context JS failed");

    // Execute SSR DOM shim (document, window, Element, etc.)
    // Note: The SSR DOM shim uses Proxy in lazy getters (.style, .dataset,
    // getComputedStyle), but no Proxy instances are created during init —
    // only basic DOM construction (SSRDocument, div#app) happens here.
    runtime
        .execute_script(
            "[vertz:dom-shim]",
            deno_core::FastString::from(crate::ssr::dom_shim::DOM_SHIM_JS.to_string()),
        )
        .expect("production snapshot: SSR DOM shim JS failed");

    runtime.snapshot()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    #[test]
    fn test_production_snapshot_creates_successfully() {
        let snapshot = get_production_snapshot();
        assert!(
            !snapshot.is_empty(),
            "Production snapshot should have non-zero size"
        );
    }

    #[test]
    fn test_production_snapshot_has_bootstrap_globals() {
        let mut rt = VertzJsRuntime::new_for_production(VertzRuntimeOptions::default()).unwrap();

        let result = rt
            .execute_script(
                "<test>",
                r#"
                typeof console.log === 'function'
                && typeof setTimeout === 'function'
                && typeof fetch === 'function'
                && typeof URL === 'function'
                && typeof TextEncoder === 'function'
                && typeof structuredClone === 'function'
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_production_snapshot_has_async_context() {
        let mut rt = VertzJsRuntime::new_for_production(VertzRuntimeOptions::default()).unwrap();

        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v = new AsyncContext.Variable({ defaultValue: 'default' });
                let inside = null;
                v.run('prod-value', () => { inside = v.get(); });
                JSON.stringify({ default: v.get(), inside })
                "#,
            )
            .unwrap();

        let parsed: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(parsed["default"], "default");
        assert_eq!(parsed["inside"], "prod-value");
    }

    #[test]
    fn test_production_snapshot_has_async_context_snapshot() {
        let mut rt = VertzJsRuntime::new_for_production(VertzRuntimeOptions::default()).unwrap();

        let result = rt
            .execute_script(
                "<test>",
                r#"
                const v = new AsyncContext.Variable({ defaultValue: 'initial' });
                const snapshot = v.run('captured', () => new AsyncContext.Snapshot());
                const result = snapshot.run(() => v.get());
                result === 'captured'
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_production_snapshot_has_dom_shim() {
        let mut rt = VertzJsRuntime::new_for_production(VertzRuntimeOptions::default()).unwrap();

        let result = rt
            .execute_script(
                "<test>",
                r#"
                typeof document !== 'undefined'
                && typeof document.createElement === 'function'
                && typeof HTMLElement === 'function'
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_production_snapshot_does_not_have_test_harness() {
        let mut rt = VertzJsRuntime::new_for_production(VertzRuntimeOptions::default()).unwrap();

        let result = rt
            .execute_script(
                "<test>",
                r#"
                typeof describe === 'undefined'
                && typeof it === 'undefined'
                && typeof expect === 'undefined'
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_production_snapshot_dom_state() {
        let mut rt = VertzJsRuntime::new_for_production(VertzRuntimeOptions::default()).unwrap();

        let result = rt
            .execute_script(
                "<test>",
                r#"
                typeof document !== 'undefined'
                && document.body !== null
                && document.getElementById('app') !== null
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_production_snapshot_has_structured_clone() {
        let mut rt = VertzJsRuntime::new_for_production(VertzRuntimeOptions::default()).unwrap();

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
    fn test_production_snapshot_async_context_propagates_through_promises() {
        let mut rt = VertzJsRuntime::new_for_production(VertzRuntimeOptions {
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
    fn bench_production_snapshot_vs_fresh() {
        use std::time::Instant;

        const ITERATIONS: usize = 5;

        // Warm up (first snapshot creation includes LazyLock init)
        let _ = VertzJsRuntime::new_for_production(VertzRuntimeOptions::default()).unwrap();

        // Fresh isolate (current path) — median of ITERATIONS
        let mut fresh_times = Vec::with_capacity(ITERATIONS);
        for _ in 0..ITERATIONS {
            let start = Instant::now();
            let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
            crate::runtime::async_context::load_async_context(&mut rt).unwrap();
            crate::ssr::dom_shim::load_dom_shim(&mut rt).unwrap();
            fresh_times.push(start.elapsed());
        }
        fresh_times.sort();
        let fresh_median = fresh_times[ITERATIONS / 2];

        // Snapshot-based isolate (new path) — median of ITERATIONS
        let mut snap_times = Vec::with_capacity(ITERATIONS);
        for _ in 0..ITERATIONS {
            let start = Instant::now();
            let _rt = VertzJsRuntime::new_for_production(VertzRuntimeOptions::default()).unwrap();
            snap_times.push(start.elapsed());
        }
        snap_times.sort();
        let snap_median = snap_times[ITERATIONS / 2];

        // Snapshot path must be at least 20% faster (generous threshold for CI noise)
        assert!(
            snap_median < fresh_median * 8 / 10,
            "Snapshot median ({:?}) should be <80% of fresh median ({:?})",
            snap_median,
            fresh_median,
        );
    }
}
