# Phase 1: Fix query() TDZ error

- **Author:** Claude Opus 4.6
- **Reviewer:** Claude Opus 4.6 (adversarial review agent)
- **Commits:** 6d7a315f..77600e0e
- **Date:** 2026-03-24

## Changes

- packages/ui/src/query/query.ts (modified)
- packages/ui/src/query/__tests__/query.test.ts (modified)

## CI Status

- [x] Quality gates passed at 77600e0e

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (failing test first, then fix)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API unchanged

## Findings

### Changes Requested (resolved)

1. **BLOCKER: Double-subscription leak** -- When the lazy entity-metadata path inside `lifecycleEffect` subscribes to the mutation bus and query registry, the eager path after `lifecycleEffect` would also fire (since `entityMeta` is now truthy), overwriting `unsubscribeBus` and leaking a `registerActiveQuery` registration. Fixed by adding `!unsubscribeBus` guard to the eager path.

2. **SHOULD-FIX: Missing post-dispose assertion** -- The original test did not verify that `dispose()` fully cleans up subscriptions. Added assertion that mutation bus emission after dispose does not trigger a refetch.

## Resolution

Both findings addressed in commit 77600e0e. Double-subscription guard added and test strengthened with post-dispose verification.
