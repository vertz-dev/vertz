# Phase 1: Context Scope Propagation for Lazy Routes

- **Author:** claude-opus-4-6
- **Reviewer:** claude-opus-4-6 (adversarial)
- **Commits:** 78f169ed5..2ddbe712c
- **Date:** 2026-03-30

## Changes

- packages/ui/src/router/router-view.ts (modified)
- packages/ui/src/router/outlet.ts (modified)
- packages/ui/src/router/__tests__/router-view.test.ts (modified)

## CI Status

- [x] Quality gates passed at 2ddbe712c

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc (no API changes)

## Findings

### Approved

The core fix is correct and follows the established pattern from `dialog-stack.ts`.

**S1 (should-fix, resolved):** Missing `.catch()` on Promise chain — added `.catch()` handlers to both RouterView and Outlet to handle rejected dynamic imports and prevent unhandled rejection.

**S3 (should-fix, resolved):** Missing test for Promise rejection — added `errorFallback catches rejected dynamic import` test.

**Observations (non-actionable):**
- Captured scope is a snapshot, not live reference — correct behavior
- Re-entrancy is safe (gen guard + single-threaded JS)
- SSR compatibility preserved (getContextScope/setContextScope check SSR context first)
- Memory retention is bounded (small Map, released when .then() completes)

## Resolution

All should-fix items addressed in commit 2ddbe712c. No remaining blockers.
