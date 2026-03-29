# Phase 4b: Missing Features for Monorepo Migration

- **Author:** claude-opus
- **Reviewer:** claude-reviewer
- **Commits:** 6a22932e3..5c20f428d
- **Date:** 2026-03-29

## Changes

- `native/vertz-runtime/src/test/globals.rs` (modified) — +516 lines: toMatchObject, asymmetric matchers, timer mocking, bulk mock ops, skipIf/each, module mock stub
- `native/vertz-runtime/tests/test_runner.rs` (modified) — +88 lines: E2E test for phase 4b features

## CI Status

- [x] Quality gates passed at 5c20f428d

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance
- [ ] No type gaps or missing edge cases
- [ ] No security issues
- [x] Public API changes match design doc

## Findings

### BLOCKER-1: `it.each` `%s` replacement is broken — mutates `args` array destructively

`args.shift ? args[0]` removes the first element then reads the new first. Also mutates the row array passed to the callback. Fix: use index counter.

### BLOCKER-2: `runAllTimers()` loops 10,000 times with any `setInterval`

Repeating timers re-enqueue immediately, so `pendingTimers.size` never reaches 0. Fix: snapshot before loop.

### SHOULD-FIX-1: `allMocks` Set grows unboundedly across tests

Never cleared between tests. Acceptable since each file gets a fresh runtime, but within a file it accumulates.

### SHOULD-FIX-2: `trackedSpyOn` duplicates original `spyOn` — dead code

Replace `createMockFunction` globally with tracked version, remove duplicated wrapper.

### SHOULD-FIX-3: `toMatchObject` has no circular reference protection

`subsetMatch` helper lacks WeakSet guard. Circular objects will blow the stack.

### SHOULD-FIX-4: `it.each`/`describe.each` don't compose with `.only`/`.skip`

Need `it.only.each()`, `it.skip.each()`, `describe.only.each()`, `describe.skip.each()`.

### SHOULD-FIX-5: Timer mocking does not mock `Date.now()` or `performance.now()`

Code under test using `Date.now()` gets real timestamps despite fake timers.

### SHOULD-FIX-6: `vi.mock()` stub stores factory but never invokes it

Factory stored raw. Undocumented contract. Acceptable as stub but needs comment.

### NIT-1: Test name `test_vi_restore_all_mocks` actually tests `vi.clearAllMocks`

### NIT-2: `expect.any(Array)` needs `Array.isArray()` fallback

### NIT-3: `advanceTimersByTime(0)` is a no-op but should fire 0-delay timers

While condition `fakeNow < target` is strict less-than. Should be `<=` for due check.

### NIT-4: `describe.each` `%s` same broken replacement as BLOCKER-1

### NIT-5: No test for `expect.stringMatching` with string pattern

### NIT-6: `runOnlyPendingTimers` re-enqueues intervals — correct but undocumented

## Resolution

All blockers and should-fixes addressed in follow-up commit. See below.
