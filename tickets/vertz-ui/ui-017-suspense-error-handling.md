# ui-017: Fix Suspense error handling and hydrate promise catch

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 4h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** mike review on PR #199 (should-fix #3), ben follow-up #7

## Description

Two related error handling gaps:

### Suspense silently swallows errors
`Suspense` has no `.catch()` on the thrown promise. If the async component rejects, the error is completely swallowed — no error boundary triggered, no console error, no user feedback. This is a debugging nightmare.

**File:** `packages/ui/src/component/suspense.ts`

### Hydrate resolveComponent missing .catch()
`doHydrate` in `hydrate.ts` line 27 has a voided promise from `resolveComponent` without a `.catch()`. Chunk load failures during hydration will be silent.

**File:** `packages/ui/src/hydrate.ts`

## Acceptance Criteria

- [ ] Suspense catches promise rejections and propagates to nearest ErrorBoundary
- [ ] If no ErrorBoundary exists, the error is re-thrown (not swallowed)
- [ ] Test: Suspense with a rejecting async child triggers ErrorBoundary fallback
- [ ] Test: Suspense with a rejecting async child and no ErrorBoundary throws
- [ ] `resolveComponent` promise failure in hydrate.ts is caught and reported
- [ ] Test: hydrate() with a failing chunk load reports the error

## Progress

- 2026-02-12: Ticket created from mike's review (S3) and ben's follow-up #7
