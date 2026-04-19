# Phase 4: HMR contract test, mint-docs page, changeset

- **Author:** Vinicius Dacal (with Claude Opus 4.7)
- **Reviewer:** Self-review (Phase 4 is documentation + integration test only — no logic changes)
- **Date:** 2026-04-19

## Changes

- `packages/ui/src/query/__tests__/query-stream-hmr.test.ts` (new — 3 real-timer integration tests covering data accumulation via the helper, dispose-closes-socket within 50ms, and the HMR re-mount contract that the new query gets a fresh AbortSignal independent of the disposed one)
- `packages/mint-docs/guides/ui/live-data.mdx` (new — full guide page covering when to use, result shape, lifecycle, reactive keys, helpers, non-goals, and three recipes: cursor/replay, dedup wrapper, forgetting-to-wire-the-signal pitfall)
- `packages/mint-docs/docs.json` (modified — registered the new page under `@vertz/ui` group)
- `.changeset/ui-query-stream-subscriptions.md` (new — `@vertz/ui` patch changeset summarizing the full public API surface added across phases 1–4)

## Phase scope adjustments

The phase spec proposed `query-stream.local.ts` (running under `bun test`) for the integration tests. The worktree's bun-workspace resolution can't currently resolve `@vertz/fetch` and other workspace packages from `bun test` — but the tests don't actually require real network I/O / file watchers / port binding, so the practical fix was to convert the file to `query-stream-hmr.test.ts` (regular `vtz test` test) using a mock `RealisticFakeWS`. This keeps the contract under CI rather than gated behind a manual script. The real-timer behavior (no `vi.useFakeTimers()`) is preserved so the dispose-close timing assertion reflects production conditions.

A separate `bun test`-based real-WebSocketServer test would be a follow-up if the workspace install gets fixed.

## CI Status

- [x] `vtz test src/query/` — 210 / 210 pass at HEAD (was 207 + 3 HMR tests)
- [x] `tsgo --noEmit` (packages/ui) — clean
- [x] `oxfmt packages/ui/src/query/` + the docs page — clean
- [x] Lint warnings on `packages/ui/src/query/query.ts` are pre-existing `as unknown as T` patterns that already pervade the file; no new warnings introduced by this phase

## Self-review checklist

- [x] HMR test asserts on the contract (signals from disposed and fresh queries are distinct objects, the disposed one stays aborted) rather than just "no error thrown"
- [x] Docs page covers every numbered open-question decision from the design doc (always-array data, required `key`, no SSR for streams, no accumulated cache, no `refetchInterval` interop, no reducer/select, function-thunk only, source-type lock)
- [x] Docs page includes the three recipes from the design doc (cursor/replay, dedup wrapper, forgetting-to-wire-the-signal)
- [x] Changeset names every new public symbol: stream overload, `QueryStreamResult`, `QueryStreamOptions`, `QueryDisposedReason`, `QueryStreamMisuseError`, `serializeQueryKey`, `fromWebSocket`, `fromEventSource`, plus the cross-mode signal addition to the Promise overload
- [x] Changeset references issue #2846

## Resolution

Phase 4 complete. All 4 phases delivered. Branch ready for the rebase + push + PR cycle.
