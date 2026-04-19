# Phase 1: Foundation — Stream Overload, Tuple Key Serialization

- **Author:** Vinicius Dacal (with Claude Opus 4.7)
- **Reviewer:** Adversarial review agent (Explore subagent)
- **Commits:** `9125b46057d51337ea67fce56186ae6d34cdfa9b` + fixup
- **Date:** 2026-04-19

## Changes

- `packages/ui/src/query/key-serialization.ts` (new)
- `packages/ui/src/query/__tests__/key-serialization.test.ts` (new)
- `packages/ui/src/query/__tests__/query-stream.test.ts` (new)
- `packages/ui/src/query/__tests__/query.test-d.ts` (modified — stream overload type tests)
- `packages/ui/src/query/query.ts` (modified — types, classification, pump, mutual exclusion, signal threading)
- `packages/ui/src/query/index.ts` (modified — re-exports)
- `plans/query-subscriptions.md` (new — design doc Rev 2)
- `plans/query-subscriptions/phase-0{1,2,3,4}-*.md` (new — phase specs)

## CI Status

- [x] `vtz test src/query/` — 193 / 193 pass at fixup HEAD
- [x] `tsgo --noEmit` (packages/ui) — clean at fixup HEAD
- [x] `oxfmt packages/ui/src/query/` — clean
- [x] `oxlint packages/ui/src/query/` — only pre-existing `as unknown as` warnings (pattern used throughout the file, not introduced here) and one `no-throw-plain-error` in a test fixture (intentional — simulating an external upstream throwing)

## Findings

### Blockers (resolved in fixup)

1. **Missing `QueryStreamMisuseError` export from `@vertz/ui`.** The error class was thrown but not re-exported from `packages/ui/src/query/index.ts`, so consumers couldn't `instanceof`-check it. **Fix:** added to the index re-export.
2. **Stream thunk received no `AbortSignal`.** The pump invoked thunks without passing a signal, so signal-aware thunks (e.g., `signal.addEventListener('abort', ...)` or `fetch(url, { signal })`) would throw on `undefined`. **Fix:** added a closure-level placeholder `AbortController` (Phase 1: never aborted) and threaded its `signal` through `callThunkWithCapture(signal?)`. Phase 2 will replace the placeholder with per-pump controllers that abort on dispose / refetch. Locked the contract with a new test (`Given a signal-aware stream thunk / Then the thunk receives a real AbortSignal`).

### Should-fix (resolved in fixup)

3. **Fire-and-forget `pumpStream` had no outer `.catch`.** `pumpStream`'s try/catch handles iterator errors in-band, but pathological iterables (whose `.next()` returns rejected non-Promise values) could still produce unhandled-rejection warnings. **Fix:** added an outer `.catch` that mirrors the in-band error path.
4. **Missing `serializeQueryKey([null])` test.** Null is JSON-serializable but slipped through both validate and replacer paths uncovered. **Fix:** added test asserting `serializeQueryKey([null]) === '[null]'`.
5. **Missing `serializeQueryKey([1n])` (bigint) test.** Same gap. **Fix:** added test asserting bigint throws naming `index 0`.

### Nits (resolved in fixup)

6. **`reconnecting.value = false`** explicitly set inside the stream-init `untrack` block for parallelism with `loading` / `idle` / `rawData` (signal already initializes to `false`, so behavior unchanged — clarity only).
7. **Misleading comment in mutual-exclusion test.** The comment said "we need to flush microtasks to surface" the throw, but the throw is actually synchronous (`lifecycleEffect` runs the effect inline on installation). **Fix:** rewrote the comment to explain the synchronous path.
8. **Zero-arg stream thunk type test.** Added `query(() => makeStream(), { key })` (no signal arg) to `query.test-d.ts` to lock in that both shapes compile.

### Wins called out by the reviewer

- Tuple-key serialization is thorough — handles deep nesting, reordering at multiple levels, and rejects non-serializable values with named paths.
- `isAsyncIterable` discrimination is robust (duck-typed via `Symbol.asyncIterator`, null-safe, no prototype reach-through).
- Mutual-exclusion check is early and explicit — `QueryStreamMisuseError` thrown before opening the iterator.
- Type tests cover stream overload narrowing (`data: T[]`), tuple keys, required `key`, and Promise-overload regression.

## Resolution

All blockers and should-fix findings addressed in the fixup commit. Quality gates green. Phase 2 may proceed.
