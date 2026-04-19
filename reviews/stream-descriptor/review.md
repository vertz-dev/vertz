# StreamDescriptor — Adversarial Review

- **Author:** Vinicius Dacal (with Claude Opus 4.7)
- **Reviewer:** Adversarial review agent (Explore subagent)
- **Commits:** `4b2f674c8dfd20193bc660b7cc6bae5a848569f4` + fixup
- **Date:** 2026-04-19

## Findings

### Blockers

None.

### Should-fix (resolved in fixup)

1. **Missing test for reactive-key descriptor swap** (`query.ts` lines 1006–1013, descriptor-in-thunk in stream-mode re-run). Initial classification was tested, but a thunk that returns different `StreamDescriptor` instances based on a reactive signal was uncovered. **Fix**: added test `Given a thunk that returns different StreamDescriptors based on a reactive signal / When the signal changes / Then the previous iterator aborts and the new descriptor key is used`. Asserts: aborted/opened tracking arrays show the previous iterator received an abort and the new one received its own signal; data resets to the new descriptor's first yield.
2. **Docs claim that `invalidate()` works for stream descriptors was inaccurate.** `invalidate()` matches against `descriptor._entity` (entity-backed REST queries); `StreamDescriptor` doesn't carry `_entity` (design non-goal). **Fix**: docs clarified that `invalidate()` is not yet supported for stream descriptors and `refetch()` is the way to restart a stream.

### Nits (acknowledged but not changed)

- **`isStreamDescriptor` guard against malformed `_stream` returning non-iterables.** Acknowledged as low realistic risk — codegen and hand-written wrappers would catch this early. Documenting the contract in JSDoc is the right level of defense; runtime introspection is overkill.
- **Type-test for overload precedence.** Already covered by the existing positive test `const _ok: QueryStreamResult<TopicEvent> = query(makeStreamDesc<TopicEvent>())`.
- **`serializeQueryParams` docstring clarity.** The function name is self-explanatory enough; not a regression.

### Wins called out by the reviewer

- Descriptor unwrap delegates to existing function-thunk path — Phase 2 lifecycle preserved without duplication.
- Descriptor-in-thunk handled symmetrically in initial classification AND streamMode re-run.
- `options` mutation operates on a fresh shallow copy; user object never mutated.
- Source-type lock correctly treats both `StreamDescriptor` and bare `AsyncIterable` as `'stream'` mode (no false positive on swap between the two).
- Codegen `body`-not-in-key limitation is bounded and documented; only affects POST streams with no query params (rare).
- Tests + type tests are thorough (39 / 215 / 314 across fetch / ui / openapi).

## CI Status

- [x] `vtz test src/query/` — 216 / 216 pass at fixup HEAD
- [x] `tsgo --noEmit` — clean across packages/fetch, packages/ui, packages/openapi
- [x] `oxfmt` — clean
- [x] Full monorepo `vtz ci build-typecheck` + `vtz ci test` — green at HEAD

## Resolution

Both should-fix items addressed in the fixup commit. Nits acknowledged. Ready for push + PR.
