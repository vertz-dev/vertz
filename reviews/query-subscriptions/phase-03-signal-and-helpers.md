# Phase 3: Cross-mode signal + WebSocket / EventSource helpers

- **Author:** Vinicius Dacal (with Claude Opus 4.7)
- **Reviewer:** Adversarial review agent (Explore subagent)
- **Commits:** `85e23cb39` + fixup
- **Date:** 2026-04-19

## Changes

- `packages/ui/src/query/query.ts` (modified — Promise overload signature accepts `(signal?: AbortSignal)`, `currentPromiseController` state, abort hook on classification, dispose() aborts the promise controller, all SSR/hydration/nav-prefetch probes now pass a never-aborted `probeSignalForDiscovery`)
- `packages/ui/src/query/sources.ts` (new — `fromWebSocket<T>` and `fromEventSource<T>` helpers; internal `iterateEventStream` uses a monotonic version counter for the wake-up latch)
- `packages/ui/src/query/__tests__/sources.test.ts` (new — 5 mock-based tests)
- `packages/ui/src/query/__tests__/query-stream.test.ts` (extended — promise-signal-on-dispose, zero-arg promise compat, signal-aware-probe-doesn't-crash)
- `packages/ui/src/query/__tests__/query.test-d.ts` (extended — Promise signal overload type, generic helpers)
- `packages/ui/src/query/index.ts` (modified — re-exports)

## CI Status

- [x] `vtz test src/query/` — 207 / 207 pass at fixup HEAD
- [x] `tsgo --noEmit` (packages/ui) — clean
- [x] `oxfmt packages/ui/src/query/` — clean

## Findings

### Blockers (resolved in fixup)

1. **SSR / hydration / nav-prefetch probes called the thunk with no signal arg.** A signal-aware promise thunk like `(signal) => { signal.addEventListener('abort', ...); return fetch(...); }` would crash with `Cannot read property 'addEventListener' of undefined` during SSR pass 1 or hydration key probing. The Promise overload's `(signal?: AbortSignal)` makes the param *typed* as optional, so well-defended thunks (`signal?.addEventListener`) survive — but a thunk that uses non-optional access matches the public type signature and shouldn't crash. **Fix:** added a closure-level `probeSignalForDiscovery: AbortSignal = new AbortController().signal` (never aborted) and passed it to all four `callThunkWithCapture()` sites (SSR data loading, hydration probe, SSR-hydrated dep tracking, nav-prefetch derived-key discovery). Locked the contract with a new test (`Given a signal-aware promise thunk / Then the thunk always receives a real AbortSignal — never undefined`).
2. **Race in `iterateEventStream` queue/latch.** A message arriving after `queue.length` was checked but before `pendingResolve` was assigned could cause a missed wake-up — the consumer would await indefinitely. **Fix:** replaced the bare `pendingResolve?.()` latch with a monotonic `version` counter. Every push bumps `version`; the consumer compares `version > seenVersion` *before* awaiting, so a push that races the queue-drain check is observed without needing the resolver to be installed.

### Should-fix (resolved in fixup)

3. **Helpers returned `AsyncIterable<unknown>` — consumers had to cast.** **Fix:** added a `<T = unknown>` generic parameter to both `fromWebSocket` and `fromEventSource` so callers can write `fromWebSocket<TickEvent>(url, signal)` and the query infers `data: TickEvent[]`. Default stays `unknown` for ergonomic narrowing-at-use-site.
4. **Queue retained references after consumer abandoned the generator.** **Fix:** added `queue.length = 0` in the `finally` so the closure releases buffered message objects.
5. **No type-d test for cross-mode promise signal compat.** **Fix:** added `query((signal: AbortSignal | undefined) => Promise.resolve(42))` and generic-helper type tests to `query.test-d.ts`.

### Acknowledged but out of scope

- **Native `error` event has no payload.** Web platform limitation — fromWebSocket / fromEventSource throw a generic `new Error('source error')`. Documented in the module-level JSDoc and the test description. Production consumers should wrap their messages in an envelope (`{ ok, data, error }`) for diagnostic detail.
- **`dispose()` aborts the promise controller but doesn't *await* producer cleanup.** This is the standard `AbortSignal` contract — the framework hints; the producer is responsible for honoring the hint. A producer that ignores `signal.aborted` will leak; that's the producer's bug, not the framework's. Documented.
- **Mock `FakeSource` is shared across WebSocket and EventSource tests.** Tests are sequential, no observed cross-talk. Not a hardening blocker.
- **`currentPromiseController` first-run check.** Reviewer's concern about uninitialized state was a false alarm — the `if (currentPromiseController && ...)` guard correctly handles `undefined` on the first run.

### Wins called out by the reviewer

- Stream and promise modes use *separate* AbortControllers — `dispose()` aborts both independently; no cross-contamination.
- Promise overload signature change is fully backward compatible (zero-arg thunks compile unchanged).
- `iterateEventStream` correctly distinguishes `'message'`, `'error'`, and `'close'` events; EndStream on close is handled.
- 207 / 207 tests pass.

## Resolution

Both blockers and applicable should-fixes addressed in the fixup commit. Phase 4 (HMR `.local.ts` test, mint-docs page, changeset) may proceed.
