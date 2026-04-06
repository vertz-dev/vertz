# Phase 2: Wire Persistent Isolate + Validation

## Context

Issue #2116 extends V8 startup snapshots to the production runtime. Phase 1 created the shared snapshot infrastructure and `new_for_production()`. This phase wires the persistent isolate to use the snapshot path and validates the full integration. Design doc: `plans/2116-v8-prod-snapshots.md`.

## Tasks

### Task 1: Update persistent isolate to use production snapshot

**Files:** (1)
- `native/vtz/src/runtime/persistent_isolate.rs` (modified)

**What to implement:**

In the `run_v8_thread()` function's `'init: loop`:

1. Replace `VertzJsRuntime::new(...)` with `VertzJsRuntime::new_for_production(...)`
2. Remove the `load_async_context()` call (now baked into snapshot)
3. Remove the `load_dom_shim()` call (now baked into snapshot)
4. Keep all other init logic unchanged (inspector setup, inspect_brk, module loading, auto-install retry)

Both the initial creation and every retry iteration must use `new_for_production()`. The snapshot bytes are `&'static [u8]` (shared, immutable), so each `JsRuntime::new()` call creates a fresh isolate — retry semantics are preserved.

**Acceptance criteria:**
- [ ] `persistent_isolate.rs` uses `new_for_production()` instead of `new()` + manual polyfill
- [ ] `load_async_context()` and `load_dom_shim()` calls removed from init loop
- [ ] All existing persistent isolate tests pass unchanged
- [ ] The retry path (`'init: loop` on auto-install) still works correctly

---

### Task 2: Full validation + cross-reference

**Files:** (1)
- `plans/2107-test-runner-isolate-optimization.md` (modified — add cross-reference to #2116)

**What to implement:**

1. Run `cargo test --all` — all tests must pass
2. Run `cargo clippy --all-targets --release -- -D warnings` — clean
3. Run `cargo fmt --all -- --check` — clean
4. Log production snapshot blob size (add `eprintln!` in `create_production_snapshot()` for measurement, then remove)
5. Add a cross-reference note in `plans/2107-test-runner-isolate-optimization.md` mentioning that the shared constants were extracted to `runtime/snapshot.rs` for the production snapshot (#2116)

**Acceptance criteria:**
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` clean
- [ ] `cargo fmt --all -- --check` clean
- [ ] Snapshot blob size measured and documented in commit message
- [ ] Cross-reference added to #2107 plan doc
