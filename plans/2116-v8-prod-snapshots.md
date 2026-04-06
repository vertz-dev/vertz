# V8 Startup Snapshots for Production Runtime

**Issue:** #2116
**Status:** Draft
**Author:** viniciusdacal

## Summary

Extend the V8 startup snapshot infrastructure (proven in the test runner, #2107) to the production runtime. Pre-bake bootstrap JS + async context polyfill + SSR DOM shim into a serialized V8 heap, eliminating ~5-8ms of JS parsing/execution on every isolate creation in `vertz dev`, `vertz build`, and serverless cold starts.

---

## API Surface (Rust)

### New: `create_production_snapshot()` in `snapshot.rs`

```rust
// native/vtz/src/runtime/snapshot.rs (NEW file)

/// Lazily-initialized production snapshot.
static PRODUCTION_SNAPSHOT: LazyLock<&'static [u8]> = LazyLock::new(|| {
    let snapshot = create_production_snapshot();
    Box::leak(snapshot)
});

/// Get the production V8 snapshot.
///
/// Includes: bootstrap JS + async context polyfill + SSR DOM shim.
/// Does NOT include: test harness, test DOM shim.
pub fn get_production_snapshot() -> &'static [u8] {
    &PRODUCTION_SNAPSHOT
}

/// Create the production snapshot blob.
fn create_production_snapshot() -> Box<[u8]> {
    // 1. Register all ops (same as VertzJsRuntime::all_op_decls())
    // 2. Execute bootstrap JS (VertzJsRuntime::bootstrap_js())
    // 3. Execute ASYNC_CONTEXT_SNAPSHOT_JS (stores hooks on globalThis)
    // 4. Execute SSR DOM shim (ssr::dom_shim::DOM_SHIM_JS)
    // 5. runtime.snapshot()
}
```

### New: `VertzJsRuntime::new_for_production()`

```rust
impl VertzJsRuntime {
    /// Create a runtime from the production snapshot.
    ///
    /// Faster than `new()` — skips bootstrap JS, async context polyfill,
    /// and DOM shim execution. Only re-registers native V8 functions
    /// and re-installs promise hooks.
    ///
    /// Accepts the full `VertzRuntimeOptions` including cache-related
    /// fields (compile_cache, shared_source_cache, v8_code_cache,
    /// resolution_cache) for module loader parity with `new_for_test()`.
    ///
    /// # Errors
    ///
    /// Returns `AnyError` if snapshot restore or post-restore JS execution
    /// fails. There is no fallback to the non-snapshot path — a failure here
    /// indicates a bug in the snapshot infrastructure, not a recoverable
    /// condition.
    pub fn new_for_production(
        options: VertzRuntimeOptions,
    ) -> Result<Self, AnyError> {
        // 1. Create Extension with all ops + op state
        // 2. Create VertzModuleLoader (with shared caches if provided)
        // 3. Create JsRuntime with startup_snapshot + module_loader
        // 4. Re-register native V8 functions (structuredClone, promise hooks, signals)
        // 5. Execute ASYNC_CONTEXT_REHOOK_JS
        // 6. Return wrapped runtime
    }
}
```

### Changed: `persistent_isolate.rs` init loop

The persistent isolate's `'init: loop` creates a fresh runtime on each attempt (retrying after auto-install). Both the initial creation and every retry iteration use the snapshot path. Since `get_production_snapshot()` returns `&'static [u8]` (immutable shared bytes), `JsRuntime::new()` creates a fresh isolate from those bytes each time — retry semantics are preserved correctly.

```rust
// Before (inside 'init: loop):
runtime = VertzJsRuntime::new(VertzRuntimeOptions { ... })?;
crate::runtime::async_context::load_async_context(&mut runtime)?;
crate::ssr::dom_shim::load_dom_shim(&mut runtime)?;

// After (inside 'init: loop — same retry behavior):
runtime = VertzJsRuntime::new_for_production(VertzRuntimeOptions { ... })?;
// async context + DOM shim already baked into snapshot
```

### Shared infrastructure

The `ASYNC_CONTEXT_SNAPSHOT_JS` and `ASYNC_CONTEXT_REHOOK_JS` constants are currently in `test/snapshot.rs`. They will be moved to a shared location (`runtime/snapshot.rs`) since both test and production snapshots use them.

```rust
//! Shared V8 snapshot infrastructure and production snapshot.
//!
//! Contains constants shared between the test snapshot (`test/snapshot.rs`)
//! and the production snapshot (this module):
//! - `ASYNC_CONTEXT_SNAPSHOT_JS` — async context polyfill for snapshot creation
//! - `ASYNC_CONTEXT_REHOOK_JS` — post-restore promise hook reinstallation
//!
//! The production snapshot includes: bootstrap JS + async context + SSR DOM shim.
//! The test snapshot includes: bootstrap JS + async context + test DOM shim + test harness.

// native/vtz/src/runtime/snapshot.rs — shared between test + production

/// Async context polyfill variant for snapshots.
///
/// **Differs from `ASYNC_CONTEXT_JS`** (in `runtime/async_context.rs`):
/// stores hook functions on `globalThis.__vertz_promiseHookFns` instead of
/// calling `__vertz_setPromiseHooks` (which doesn't exist during snapshot
/// creation). Use `ASYNC_CONTEXT_REHOOK_JS` post-restore to re-install hooks.
///
/// **Includes `AsyncContext.Snapshot` class** — the test runner's copy was
/// missing this; the shared version must have full parity with `ASYNC_CONTEXT_JS`.
pub const ASYNC_CONTEXT_SNAPSHOT_JS: &str = /* moved from test/snapshot.rs, with Snapshot class added */;

/// Post-restore: re-installs promise hooks using stored functions.
pub const ASYNC_CONTEXT_REHOOK_JS: &str = /* moved from test/snapshot.rs */;
```

`test/snapshot.rs` will import from `runtime/snapshot.rs` instead of defining its own copies.

---

## Manifesto Alignment

### Principle 7: Performance is not optional

> "We measure cold starts, request throughput, type-check speed, and build times. If we're not the fastest, we find out why and we fix it."

This is a direct performance optimization. Every isolate creation in the Vertz runtime pays ~5-8ms of JS parsing cost for bootstrap + async context + DOM shim. Snapshots eliminate this cost entirely.

**Where it matters most:**
- **Dev server restarts** — `vertz dev` recreates the isolate on every file change. Faster restarts = faster feedback loop. This is the most frequently hit path.
- **Serverless cold starts** — On Cloudflare Workers / AWS Lambda, isolate creation is on the critical path of process startup, which determines cold start latency for the first request. The persistent isolate model (one isolate per process) means this saving applies once per cold start, not per request — but that single cold start is the metric users notice.
- **Build pipeline** — `vertz build` creates isolates for compilation. Faster startup = faster builds.

### Principle 8: No ceilings

> "If the runtime is too slow, we build a faster one."

We already built a custom Rust+V8 runtime. This extends that investment by eliminating unnecessary JS execution on the hot path.

### Tradeoff accepted

- **Explicit over implicit** — Snapshot restore is less visible than explicit `execute_script()` calls. We accept this because the post-restore re-registration steps are explicit and well-documented, and the snapshot creation function serves as the single source of truth for what's baked in.

---

## Non-Goals

1. **Per-request isolate isolation** — The persistent isolate model (one isolate, all requests) is unchanged. Snapshots benefit the single isolate creation, not request handling.

2. **Build-time snapshot generation via `build.rs`** — The LazyLock approach (snapshot created on first use, cached for process lifetime) is validated by the test runner and avoids adding `deno_core` as a build dependency (which would double compile time). We keep this approach.

3. **Snapshot for the Bun plugin (`vertz-compiler`)** — The NAPI compiler runs inside Bun's process, not in our V8 isolates. Snapshots don't apply.

4. **Merging test and production snapshots** — They serve different purposes (test harness + test DOM shim vs SSR DOM shim). Keeping them separate avoids loading test infrastructure in production.

5. **Snapshot versioning or persistence to disk** — Snapshots are re-created per process via LazyLock. No need to cache them on disk since creation is fast (~5ms one-time cost).

---

## Unknowns

### 1. SSR DOM shim snapshot compatibility

**Question:** Does the SSR DOM shim (`ssr/dom_shim.rs::DOM_SHIM_JS`) use any V8 features that don't survive snapshot serialization (e.g., `Proxy`, `WeakRef`, `FinalizationRegistry`)?

**Resolution:** Code inspection. The SSR DOM shim uses `Proxy` in 3 places: `SSRElement.style` getter, `SSRElement.dataset` getter, and `getComputedStyle()`. However, all three are **lazy** — the `Proxy` objects are created inside property getters, not during module initialization. During snapshot creation, the init block only creates a `SSRDocument`, a `<div id="app">`, and appends it to `body`. None of these trigger `.style` or `.dataset` getters, so no `Proxy` instances exist on the V8 heap at snapshot time. The `Proxy` **constructor** itself is a V8 built-in that survives snapshot restore, so post-restore usage of `.style`/`.dataset` works correctly.

**Status: No blocker.** The `Proxy` usage is safe because it's lazy, but this is fragile — any future change to the DOM shim's init block that accesses `.style` or `.dataset` would break snapshot creation. Implementation should add a test comment documenting this constraint.

**Note on pre-initialized DOM state:** The snapshot captures a `document` with `head`, `body`, and a `<div id="app">`. This is correct — the persistent isolate's `SSR_RESET_JS` already resets `document.body.childNodes` and recreates the `#app` div before each render. The `__vertz_collected_css` array starts empty in the snapshot.

### 2. Snapshot size impact on memory

**Question:** How large is the production snapshot blob, and does it meaningfully impact RSS?

**Resolution:** Measure during implementation. The test snapshot (which includes the 4346-line test DOM shim + 3410-line test harness) is already used successfully. The production snapshot is smaller (no test harness, smaller DOM shim), so this is lower risk.

**Status:** Will measure. Expected to be well under 10MB based on test snapshot precedent.

---

## POC Results

The test runner snapshot (#2107) serves as the POC for this approach:

- **Question:** Can V8 startup snapshots meaningfully reduce isolate creation time in the Vertz runtime?
- **What was tried:** Pre-baked bootstrap JS + async context + DOM shim + test harness into a V8 snapshot using `JsRuntimeForSnapshot`. Restored with `startup_snapshot` in `RuntimeOptions`.
- **What was learned:**
  - Isolate creation: **5.58ms -> 1.39ms** (75% reduction) in release builds
  - Native V8 functions (structuredClone, promise hooks) must be re-registered post-restore — function objects survive but native callbacks don't
  - `Proxy` objects cannot be serialized in snapshots — class-based alternatives work
  - LazyLock is preferable to `build.rs` (avoids doubling compile time)
  - Op count must match between snapshot creation and restore (deno_core validates this)
- **Link:** Plans doc at `plans/2107-test-runner-isolate-optimization.md`, implementation in `native/vtz/src/test/snapshot.rs`

---

## Type Flow Map

N/A — This is a Rust-internal change with no TypeScript generics. All changes are within the `native/vtz` crate. No public TypeScript API is affected.

---

## E2E Acceptance Test

### Benchmark: isolate creation time

```rust
#[test]
fn bench_production_snapshot_vs_fresh() {
    const ITERATIONS: usize = 5;

    // Warm up (first snapshot creation includes LazyLock init)
    let _ = VertzJsRuntime::new_for_production(VertzRuntimeOptions::default()).unwrap();

    // Fresh isolate (current path) — median of ITERATIONS
    let mut fresh_times = Vec::with_capacity(ITERATIONS);
    for _ in 0..ITERATIONS {
        let start = Instant::now();
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        load_async_context(&mut rt).unwrap();
        load_dom_shim(&mut rt).unwrap();
        fresh_times.push(start.elapsed());
    }
    fresh_times.sort();
    let fresh_median = fresh_times[ITERATIONS / 2];

    // Snapshot-based isolate (new path) — median of ITERATIONS
    let mut snap_times = Vec::with_capacity(ITERATIONS);
    for _ in 0..ITERATIONS {
        let start = Instant::now();
        let _rt = VertzJsRuntime::new_for_production(
            VertzRuntimeOptions::default()
        ).unwrap();
        snap_times.push(start.elapsed());
    }
    snap_times.sort();
    let snap_median = snap_times[ITERATIONS / 2];

    // Snapshot path must be at least 30% faster (generous threshold for CI noise)
    assert!(
        snap_median < fresh_median * 7 / 10,
        "Snapshot median ({:?}) should be <70% of fresh median ({:?})",
        snap_median, fresh_median,
    );
}
```

### Functional: production snapshot has all required globals

```rust
#[test]
fn test_production_snapshot_has_bootstrap_globals() {
    let mut rt = VertzJsRuntime::new_for_production(
        VertzRuntimeOptions::default()
    ).unwrap();

    // Bootstrap globals
    let result = rt.execute_script("<test>", r#"
        typeof console.log === 'function'
        && typeof setTimeout === 'function'
        && typeof fetch === 'function'
        && typeof URL === 'function'
        && typeof TextEncoder === 'function'
        && typeof structuredClone === 'function'
    "#).unwrap();
    assert_eq!(result, serde_json::json!(true));
}

#[test]
fn test_production_snapshot_has_async_context() {
    let mut rt = VertzJsRuntime::new_for_production(
        VertzRuntimeOptions::default()
    ).unwrap();

    let result = rt.execute_script("<test>", r#"
        const v = new AsyncContext.Variable({ defaultValue: 'default' });
        let inside = null;
        v.run('prod-value', () => { inside = v.get(); });
        JSON.stringify({ default: v.get(), inside })
    "#).unwrap();

    let parsed: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
    assert_eq!(parsed["default"], "default");
    assert_eq!(parsed["inside"], "prod-value");
}

#[test]
fn test_production_snapshot_has_dom_shim() {
    let mut rt = VertzJsRuntime::new_for_production(
        VertzRuntimeOptions::default()
    ).unwrap();

    let result = rt.execute_script("<test>", r#"
        typeof document !== 'undefined'
        && typeof document.createElement === 'function'
        && typeof HTMLElement === 'function'
    "#).unwrap();
    assert_eq!(result, serde_json::json!(true));
}

#[test]
fn test_production_snapshot_does_not_have_test_harness() {
    let mut rt = VertzJsRuntime::new_for_production(
        VertzRuntimeOptions::default()
    ).unwrap();

    let result = rt.execute_script("<test>", r#"
        typeof describe === 'undefined'
        && typeof it === 'undefined'
        && typeof expect === 'undefined'
    "#).unwrap();
    assert_eq!(result, serde_json::json!(true));
}
```

### Functional: production snapshot has AsyncContext.Snapshot class

```rust
#[test]
fn test_production_snapshot_has_async_context_snapshot() {
    let mut rt = VertzJsRuntime::new_for_production(
        VertzRuntimeOptions::default()
    ).unwrap();

    let result = rt.execute_script("<test>", r#"
        const v = new AsyncContext.Variable({ defaultValue: 'initial' });
        const snapshot = v.run('captured', () => new AsyncContext.Snapshot());
        const result = snapshot.run(() => v.get());
        result === 'captured'
    "#).unwrap();
    assert_eq!(result, serde_json::json!(true));
}
```

### Functional: DOM state is correct post-restore

```rust
#[test]
fn test_production_snapshot_dom_state() {
    let mut rt = VertzJsRuntime::new_for_production(
        VertzRuntimeOptions::default()
    ).unwrap();

    // Snapshot includes pre-initialized document with #app div
    let result = rt.execute_script("<test>", r#"
        typeof document !== 'undefined'
        && document.body !== null
        && document.getElementById('app') !== null
    "#).unwrap();
    assert_eq!(result, serde_json::json!(true));
}
```

### Integration: persistent isolate uses snapshot (including restart path)

```rust
#[test]
fn test_persistent_isolate_loads_with_snapshot() {
    // Verify the persistent isolate still initializes correctly
    // and can handle SSR + API requests after switching to snapshot path.
    // The 'init: loop retry path must also work — each retry creates
    // a fresh isolate from the shared snapshot bytes.
    // (Existing persistent_isolate tests should pass unchanged.)
}
```

---

## Implementation Plan

### Phase 1: Shared snapshot infrastructure + production snapshot

1. Create `native/vtz/src/runtime/snapshot.rs` with:
   - Module-level doc explaining relationship to `test/snapshot.rs`
   - Shared constants (`ASYNC_CONTEXT_SNAPSHOT_JS` with `Snapshot` class added, `ASYNC_CONTEXT_REHOOK_JS`)
   - `create_production_snapshot()` and `get_production_snapshot()` (LazyLock)
2. Add `VertzJsRuntime::new_for_production()` method accepting full `VertzRuntimeOptions` (including cache fields for module loader parity)
3. Update `test/snapshot.rs` to import shared constants from `runtime/snapshot.rs`
4. Add unit tests: bootstrap globals, async context (Variable + Snapshot), DOM shim, no test harness, DOM state post-restore
5. Add benchmark test (median of 5 iterations, 30% threshold for CI stability)

### Phase 2: Wire persistent isolate + validation

1. Update `persistent_isolate.rs` to call `new_for_production()` instead of `new()` + manual polyfill loading (both initial creation and every retry in `'init: loop`)
2. Remove now-redundant `load_async_context()` and `load_dom_shim()` calls from the init loop
3. Add regression test for the restart/retry path
4. Run all existing persistent isolate tests to verify no regressions
5. Run `cargo test --all` to validate across the full crate
6. Measure and log snapshot blob size
7. Update `plans/2107-test-runner-isolate-optimization.md` cross-reference
