# Phase 1: AsyncContext.Snapshot + EventEmitter context propagation

- **Author:** claude (main)
- **Reviewer:** claude (review agent)
- **Commits:** 07e8f1821
- **Date:** 2026-03-30

## Changes

- `native/vertz-runtime/src/runtime/async_context.rs` (modified) — Added `Snapshot` class to the AsyncContext JS polyfill, exposed on `globalThis.AsyncContext.Snapshot`. Added unit test `test_snapshot_captures_and_restores_context`.
- `native/vertz-runtime/src/runtime/module_loader.rs` (modified) — Changed EventEmitter listener storage from `Function[]` to `{ fn, snapshot }[]`. Updated `on()`, `prependListener()` to capture `AsyncContext.Snapshot` at registration time. Updated `emit()` to restore snapshot before calling each listener. Updated `removeListener()`, `listeners()`, `rawListeners()` to work with new entry format.
- `native/vertz-runtime/tests/v8_integration.rs` (modified) — Added `test_node_events_async_context_propagation` integration test covering 5 scenarios (cross-scope emit, no-scope emit, removeListener, once, multiple listeners with different contexts).
- `plans/eventemitter-async-context.md` (new) — Design doc for the feature.

## CI Status

- [x] Quality gates passed at 07e8f1821

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps or missing edge cases (see should-fix findings below)
- [x] No security issues
- [x] Public API matches design doc

## Findings

### Approved (with should-fix items)

Overall this is a clean, well-scoped implementation. The core approach is correct: `Snapshot` captures `__currentMapping` by reference (which is safe because `Variable.run()` always creates a new Map rather than mutating), and EventEmitter stores `{ fn, snapshot }` entries with proper unwrapping in all accessor methods.

#### Correctness (all pass)

1. **Snapshot context isolation is correct.** `__currentMapping` is replaced (not mutated) by `Variable.run()`, so a captured reference remains stable. Verified in the unit test.

2. **`emit()` context restoration is correct.** `Snapshot.run()` uses try/finally, so even if a listener throws, `__currentMapping` is restored. This matches Node.js behavior where listener exceptions propagate from `emit()` without corrupting context state.

3. **`once()` context propagation is correct.** The `once` wrapper is stored as `entry.fn`, and `emit()` calls `snapshot.run(() => entry.fn.apply(this, args))`. The actual user listener executes inside the `snapshot.run()` callback, so it sees the correct context.

4. **`removeListener` matching is correct.** The `findIndex` checks both `entry.fn === listener` (direct match) and `entry.fn._original === listener` (once-wrapper match). Both paths work.

5. **Graceful degradation is correct.** `_Snapshot` is `null` when `AsyncContext` is not loaded, and `_snap()` returns `null`. `emit()` skips `snapshot.run()` when snapshot is `null`. The existing `test_node_events_import` test (which does NOT load async context) validates this path.

6. **Existing test `test_node_events_import` is not broken.** The listener storage format change is internal; the public API (`on`, `emit`, `once`, `removeListener`, `listenerCount`, `eventNames`) behaves identically.

7. **Production runtime ordering is correct.** `persistent_isolate.rs` line 269 calls `load_async_context()` before any user modules can be imported, guaranteeing `AsyncContext.Snapshot` is available when `node:events` module is first evaluated.

#### Should-Fix

**S1: Missing test for `listeners()` and `rawListeners()` return values.**

The design doc explicitly specifies:
- `listeners()` returns unwrapped functions: `arr.map(entry => entry.fn._original || entry.fn)`
- `rawListeners()` returns function references (including once wrappers): `arr.map(entry => entry.fn)`

Neither is tested. A consumer calling `emitter.listeners('event')` after the internal storage change could receive `{fn, snapshot}` entry objects instead of functions if the accessor was accidentally missed. While I verified the code IS correct, the behavior should have a test to prevent regressions.

Suggested test addition (can be added to the existing `test_node_events_async_context_propagation`):

```javascript
// Test 6: listeners() returns functions, not {fn, snapshot} entries
const ee6 = new EventEmitter();
const fn6 = () => {};
storage.run('ctx6', () => { ee6.on('test6', fn6); });
const lisArr = ee6.listeners('test6');
console.log('test6: ' + (typeof lisArr[0]) + ',' + (lisArr[0] === fn6));
// Expected: "test6: function,true"

// Test 7: rawListeners() returns the once-wrapper function, not entry
const ee7 = new EventEmitter();
const fn7 = () => {};
storage.run('ctx7', () => { ee7.once('test7', fn7); });
const rawArr = ee7.rawListeners('test7');
console.log('test7: ' + (typeof rawArr[0]) + ',' + (rawArr[0]._original === fn7));
// Expected: "test7: function,true"
```

**S2: Missing test for `prependListener` context capture.**

`prependListener` captures context (line 613 of `module_loader.rs`), but no test verifies a prepended listener sees its registration-time context. While the implementation is correct (same `_snap()` call as `on()`), a test would guard against regressions if the method is refactored independently.

#### Nitpick (non-blocking)

**N1: `_Snapshot` is evaluated once at module load time.**

The check `typeof globalThis.AsyncContext?.Snapshot === 'function'` runs when `node:events` is first imported. If for some reason `AsyncContext` is loaded AFTER `node:events` is imported, context propagation silently won't work. In the current production runtime this can't happen (async context is loaded first), but a code comment noting this invariant would help future maintainers.

**N2: Design doc status is "Draft" — should be updated to "Implemented" or "Complete" before merge.**

## Resolution

(to be filled after fixes)
