# Phase 1: Shared Snapshot Infrastructure + Production Snapshot

## Context

Issue #2116 extends V8 startup snapshots from the test runner to the production runtime. This phase creates the shared infrastructure and the production snapshot itself. Design doc: `plans/2116-v8-prod-snapshots.md`.

## Tasks

### Task 1: Create `runtime/snapshot.rs` with shared constants and production snapshot

**Files:** (4)
- `native/vtz/src/runtime/snapshot.rs` (new)
- `native/vtz/src/runtime/mod.rs` (modified — add `pub mod snapshot`)
- `native/vtz/src/test/snapshot.rs` (modified — import shared constants)

**What to implement:**

Create `native/vtz/src/runtime/snapshot.rs` containing:

1. Module-level doc (`//!`) explaining:
   - This module holds shared V8 snapshot infrastructure used by both test and production snapshots
   - The production snapshot includes: bootstrap JS + async context + SSR DOM shim
   - The test snapshot (in `test/snapshot.rs`) includes: bootstrap JS + async context + test DOM shim + test harness

2. `ASYNC_CONTEXT_SNAPSHOT_JS` constant — moved from `test/snapshot.rs`. Must be updated to include the `Snapshot` class (which the test version was missing). The snapshot variant stores hook functions on `globalThis.__vertz_promiseHookFns` instead of calling `__vertz_setPromiseHooks` directly (the native function doesn't exist during snapshot creation).

3. `ASYNC_CONTEXT_REHOOK_JS` constant — moved from `test/snapshot.rs`. Re-installs promise hooks post-restore.

4. `get_production_snapshot()` — public function returning `&'static [u8]`, backed by `LazyLock`.

5. `create_production_snapshot()` — private function that:
   - Creates `Extension` with `VertzJsRuntime::all_op_decls()` and op state
   - Creates `JsRuntimeForSnapshot`
   - Executes bootstrap JS (`VertzJsRuntime::bootstrap_js()`)
   - Executes `ASYNC_CONTEXT_SNAPSHOT_JS`
   - Executes SSR DOM shim (`crate::ssr::dom_shim::DOM_SHIM_JS`)
   - Returns `runtime.snapshot()`

Update `test/snapshot.rs` to:
- Remove `ASYNC_CONTEXT_SNAPSHOT_JS` and `ASYNC_CONTEXT_REHOOK_JS` constants
- Import them from `crate::runtime::snapshot`
- Keep `create_test_snapshot()` and `get_test_snapshot()` unchanged (they add test DOM shim + test harness on top)

Update `runtime/mod.rs` to add `pub mod snapshot`.

**Acceptance criteria:**
- [ ] `ASYNC_CONTEXT_SNAPSHOT_JS` includes `Snapshot` class (matching `ASYNC_CONTEXT_JS` in `runtime/async_context.rs`)
- [ ] `get_production_snapshot()` returns non-empty bytes
- [ ] `test/snapshot.rs` compiles using shared constants
- [ ] Existing test snapshot tests pass unchanged

---

### Task 2: Add `VertzJsRuntime::new_for_production()` and tests

**Files:** (2)
- `native/vtz/src/runtime/js_runtime.rs` (modified — add `new_for_production()`)
- `native/vtz/src/runtime/snapshot.rs` (modified — add tests)

**What to implement:**

Add `new_for_production()` to `VertzJsRuntime` in `js_runtime.rs`:

1. Same pattern as `new_for_test()` but uses `get_production_snapshot()` instead of `get_test_snapshot()`
2. Accepts full `VertzRuntimeOptions` including cache fields
3. Uses `VertzModuleLoader::new_with_shared_cache()` when cache options are provided, otherwise `VertzModuleLoader::new()`
4. Post-restore: re-registers native V8 functions + executes `ASYNC_CONTEXT_REHOOK_JS`
5. Returns `Result<Self, AnyError>` — failure is a bug, no fallback

Add tests in `runtime/snapshot.rs`:

```rust
#[test] fn test_production_snapshot_creates_successfully()
#[test] fn test_production_snapshot_has_bootstrap_globals()    // console, setTimeout, fetch, URL, TextEncoder, structuredClone
#[test] fn test_production_snapshot_has_async_context()         // Variable get/run
#[test] fn test_production_snapshot_has_async_context_snapshot() // Snapshot class
#[test] fn test_production_snapshot_has_dom_shim()              // document, createElement, HTMLElement
#[test] fn test_production_snapshot_does_not_have_test_harness() // no describe/it/expect
#[test] fn test_production_snapshot_dom_state()                 // document.body, getElementById('app')
#[test] fn bench_production_snapshot_vs_fresh()                 // median of 5 iterations, 30% threshold
```

**Acceptance criteria:**
- [ ] `new_for_production()` creates a working runtime
- [ ] All bootstrap globals available (console, setTimeout, fetch, URL, TextEncoder, structuredClone)
- [ ] `AsyncContext.Variable` works with get/run
- [ ] `AsyncContext.Snapshot` works (captures and restores context)
- [ ] DOM shim globals present (document, HTMLElement)
- [ ] Test harness NOT present (describe, it, expect are undefined)
- [ ] Pre-initialized DOM state correct (document.body, #app div)
- [ ] Snapshot path is at least 30% faster than fresh path (median of 5 iterations)
- [ ] All existing tests pass (`cargo test --all`)
- [ ] `cargo clippy --all-targets --release -- -D warnings` clean
- [ ] `cargo fmt --all -- --check` clean
