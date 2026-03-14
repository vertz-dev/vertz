# View Transitions API — All Phases Review

- **Author:** claude-opus
- **Reviewer:** claude-opus (adversarial review agent)
- **Date:** 2026-03-14

## Changes

### Phase 1: Core utility + CSS token
- `packages/ui/src/router/view-transitions.ts` (new)
- `packages/ui/src/router/__tests__/view-transitions.test.ts` (new)
- `packages/ui/src/css/token-tables.ts` (modified — added `vt-name` entries)
- `packages/ui/src/css/__tests__/token-tables.test.ts` (modified)

### Phase 2: Router integration
- `packages/ui/src/router/define-routes.ts` (modified — `viewTransition` field)
- `packages/ui/src/router/navigate.ts` (modified — 3-level config resolution)
- `packages/ui/src/router/__tests__/navigate.test.ts` (modified — 8 new tests)
- `packages/ui/src/router/__tests__/view-transitions-router.test-d.ts` (new)
- `packages/ui/src/router/index.ts` (modified — exports)

### Phase 3: Example app + E2E
- `examples/task-manager/src/router.ts` (modified)
- `examples/task-manager/src/app.tsx` (modified — removed old CSS)
- `examples/task-manager/src/components/task-card.tsx` (modified — shared element name)
- `examples/task-manager/src/pages/task-detail.tsx` (modified — matching transition name)
- `examples/task-manager/e2e/page-transitions.spec.ts` (modified)

## CI Status

- [x] `bun test` — 2048 tests pass
- [x] `bun run typecheck` — clean
- [x] `bunx biome check` — clean (pre-existing a11y warnings in example app excluded)

## Review Checklist

- [x] Delivers what the design doc specifies
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### BLOCKER-1: `AbortError` propagation to user code — FIXED

`withViewTransition` did not catch `DOMException: AbortError` from `transition.finished` when a newer transition supersedes the current one. This would cause unhandled promise rejections in user code that `await`s `navigate()`.

**Resolution:** Added `catch` block that swallows `AbortError` (expected during concurrent transitions) and re-throws other errors. Added 2 new tests: one for AbortError swallowing, one for non-AbortError propagation.

### SHOULD-FIX-1: Missing test for update callback throwing — FIXED

Added test verifying that errors from the `update` callback propagate correctly through `transition.finished`.

### SHOULD-FIX-2: Design doc pseudocode drift — ACCEPTED

The design doc's Phase 2 pseudocode shows `withViewTransition(() => applyNavigation(...))` but the actual implementation correctly wraps only `current.value = match` inside `withViewTransition`. The narrative text is correct. Acknowledged as documentation drift — the implementation is correct.

### NIT-1 through NIT-5: Accepted as-is

Minor nits about inline styles in example app, CSS spec constraint comment, E2E test coverage depth. None affect correctness.

## Resolution

BLOCKER-1 and SHOULD-FIX-1 fixed. All tests pass. Approved.
