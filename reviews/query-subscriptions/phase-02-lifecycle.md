# Phase 2: Lifecycle — AbortSignal, refetch, reactive-key, source-type lock

- **Author:** Vinicius Dacal (with Claude Opus 4.7)
- **Reviewer:** Adversarial review agent (Explore subagent)
- **Commits:** `00cb6896d6b4bd8cbc8151cb41211675ace1a922` + fixup
- **Date:** 2026-04-19

## Changes

- `packages/ui/src/query/query.ts` (modified — per-pump AbortController, `cancelStreamPump`, `pumpStream` (signal-aware), stream-mode re-run branch in the effect, source-type lock, `refetch` mode-aware, `dispose` cancels pump)
- `packages/ui/src/query/__tests__/query-stream.test.ts` (extended — abort, refetch reset + reconnecting, reactive-key restart, source-type swap, signal-ignoring producer, error-clears-on-restart)

## CI Status

- [x] `vtz test src/query/` — 199 / 199 pass at fixup HEAD
- [x] `tsgo --noEmit` (packages/ui) — clean
- [x] `oxfmt packages/ui/src/query/` — clean

## Findings

### Blockers (resolved in fixup)

1. **`idle.value = true` written during stream classification.** Per design doc Implementation Notes #3, `idle` should flip to `false` on the first non-null thunk return — *not* on the first yield. The implementation incorrectly set `idle = true` in the stream-init `untrack` block, leaving the query "idle" between thunk return and first yield (a window that can be observed by sync `q.idle.value` reads from watchers). **Fix:** changed both the first-time classification and the reactive-key restart to set `idle.value = false` immediately when an AsyncIterable is returned. Updated the existing accumulation test to assert `idle === false` synchronously after construction.

### Should-fix (resolved in fixup)

2. **`iterator.return()` double-call protocol risk on overlapping refetches.** A second `cancelStreamPump` while a previous `iter.return()` Promise is still pending could in principle violate iterator protocol. Re-tracing the code: `cancelStreamPump` clears `currentStreamIterator = undefined` *synchronously, before* awaiting `return()`. So a second sync call finds no iterator and skips the `.return()`. **Verdict:** safe by construction, but the invariant wasn't documented. **Fix:** added a comment to `cancelStreamPump` explaining the idempotency guarantee.
3. **`idle` not reset on reactive-key restart.** Same root cause as Blocker #1, but in the streamMode re-run path: the `untrack` block didn't touch `idle`, so a re-run after a paused/idle state could leave it stale. **Fix:** added `idle.value = false` in the re-run untrack block.
4. **No test for "reactive-key change clears prior error".** The `error.value = undefined` reset in the re-run untrack block was load-bearing but uncovered. **Fix:** added a test where the first iterator throws, then a sessionId change triggers a clean iterator that succeeds, asserting `error` is cleared and new data lands.

### Acknowledged but out of scope

- **Promise-mode `refetch` doesn't unconditionally clear `error.value`** — pre-existing behavior, not a regression introduced by Phase 2. Tracked separately if real demand emerges.
- **`AbortController.abort(reason)` requires a relatively recent runtime.** Vertz targets Bun + modern browsers, both of which support it. If we ever support legacy environments, the abort would silently lose `reason` (the abort itself still happens). Not blocking.
- **Misleading comment on probe-controller "discard" path** — there is no soft discard, only throw. Comment edited for clarity in the same fixup.

### Wins called out by the reviewer

- AbortController defensive checks in `pumpStream`: `signal.aborted` is checked before *and* after every `await iterator.next()`, so producers that ignore the signal still stop landing yields after dispose. Test (`Given a stream that ignores the abort signal / When dispose() is called`) confirms.
- `iter.return()` rejection swallowed via `Promise.resolve(...).catch(() => {})` — no unhandled-rejection risk.
- Pump `finally` block guards against stale-iterator wipes via `if (currentStreamIterator === iterator)`.
- Source-type lock fires in both directions (stream→non-stream re-run, non-stream→stream first-classification).
- 198 → 199 tests pass, including the new error-clear-on-restart case.

## Resolution

All blockers and applicable should-fix findings addressed in the fixup commit. Phase 3 (cross-mode signal on Promise overload + `fromWebSocket` / `fromEventSource` helpers) may proceed.
