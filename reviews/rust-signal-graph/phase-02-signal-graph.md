# Phase 2: Rust-Native Signal Graph

- **Author:** main agent
- **Reviewer:** review agent
- **Commits:** 90c0ac254574374a2ba633b2d0f0a2a67742ef18
- **Date:** 2026-04-05

## Changes

- `native/vtz/src/runtime/signal_graph.rs` (new) — Core SignalGraph struct: signals, computeds, effects, batch scheduling, disposal, reentrant-safe split methods
- `native/vtz/src/runtime/signal_graph_tests.rs` (new) — 27 unit tests exercising graph internals directly via V8 handles
- `native/vtz/src/runtime/ops/signals.rs` (new) — V8 native function callbacks, thread-local storage, 26 integration tests
- `native/vtz/benches/signal_graph.rs` (new) — Criterion benchmarks: 5 native + 1 JS baseline for POC gate validation
- `native/vtz/src/runtime/js_runtime.rs` (modified) — Register signal ops at startup and snapshot restore
- `native/vtz/src/runtime/ops/mod.rs` (modified) — Add `signals` module
- `native/vtz/src/runtime/mod.rs` (modified) — Add `signal_graph` module
- `native/vtz/Cargo.toml` (modified) — Add `bitvec`, `smallvec` deps + benchmark definition
- `native/Cargo.lock` (modified) — Lock file updates

## CI Status

- [x] Quality gates passed at 90c0ac254

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases (findings below)
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### Changes Requested

---

### BLOCKER 1: `dispose()` does not remove the node from its subscribers' source lists — dangling subscriber references

**File:** `native/vtz/src/runtime/signal_graph.rs`, `dispose()` method

The `dispose()` method removes the node from its *sources'* subscriber lists (upstream cleanup), but does NOT remove itself from its *subscribers'* source lists (downstream cleanup). When a **Signal** node is disposed:

1. It has `subscribers` (computeds/effects that depend on it).
2. After `dispose()`, those subscribers still hold the disposed signal's ID in their `sources` list.
3. If the slot is **reused** via the free list for a different node, the subscriber's stale source ID now points to a completely unrelated node. The next re-evaluation would incorrectly remove itself from that unrelated node's subscriber list.

**Fix:** In `dispose()`, also iterate `subscribers` (for Signal/Computed nodes) and remove the disposed ID from each subscriber's `sources` list.

---

### BLOCKER 2: `write_signal_callback` auto-batch uses `saturating_sub` masking potential batch depth desynchronization

**File:** `native/vtz/src/runtime/ops/signals.rs`, `write_signal_callback()` and `batch_end_callback()`

Both use `graph.batch_depth = graph.batch_depth.saturating_sub(1)` instead of a checked decrement. If any code path ever calls `batch_end` without a matching `batch_start`, the depth silently stays at 0 instead of surfacing the bug.

The ops layer manually manages batch_depth with raw field access (`graph.batch_depth = ...`) instead of using the type's own methods, which is fragile.

**Fix:** Add `debug_assert!(graph.batch_depth > 0)` before the decrement. Replace raw field access with method calls.

---

## Resolution

Both blockers fixed:

1. **BLOCKER 1 (dispose dangling refs):** `dispose()` now iterates subscribers and removes the disposed ID from each subscriber's `sources` list (downstream cleanup). Added test `dispose_slot_reuse_does_not_corrupt_unrelated_node` to verify.

2. **BLOCKER 2 (batch depth management):** Added `batch_end_no_flush()` method with `debug_assert!(batch_depth > 0)`. Ops layer now uses this method instead of raw field access. `batch_end()` also gets the debug assert.

Quality gates re-run: 27 signal_graph tests + 27 ops tests pass, clippy clean, fmt clean.
