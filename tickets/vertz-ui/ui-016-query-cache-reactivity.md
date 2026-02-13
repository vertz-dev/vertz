# ui-016: Fix query() cache key reactivity

- **Status:** 🟢 Done
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 4h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** mike review on PR #199 (should-fix #4)

## Description

`deriveKey(thunk)` in `query()` computes the cache key once at call time but the design doc specifies that keys update reactively when dependencies change. This means if a query depends on a reactive value (e.g., a signal-based filter), the cache key won't update when the signal changes — the query will keep returning stale cached data.

This is a correctness bug in the caching layer.

**File:** `packages/ui/src/query.ts`

## Acceptance Criteria

- [ ] `deriveKey` is reactive — when a dependency used in the key thunk changes, the derived key updates
- [ ] `query()` re-fetches when its cache key changes due to a reactive dependency change
- [ ] Integration test: `query(() => fetchUser(userId.value))` re-fetches when `userId` signal changes
- [ ] Existing query tests still pass
- [ ] Type-level test: `.test-d.ts` verifying QueryResult type flows correctly

## Progress

- 2026-02-12: Ticket created from mike's review on PR #199
- 2026-02-12: Fixed — replaced version counter with deterministic hash of captured signal values via read-value callback. Old cache entries retained for reuse. 3 new tests, 610 total passing.
