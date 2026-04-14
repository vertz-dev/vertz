# Phase 1: Replace Bun APIs with Portable Node.js

- **Author:** davis-v2
- **Reviewer:** review-agent
- **Date:** 2026-04-13

## Changes

- packages/og/src/__tests__/test-helpers.ts (modified)
- packages/og/src/__tests__/image.test.ts (modified)
- .changeset/fix-og-bun-apis.md (new)

## CI Status

- [x] Quality gates passed (typecheck, tests, lint, format)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Test cleanup follows integration-test-safety rules

## Findings

### Approved

No blockers found. Two should-fix items addressed inline:
1. Temp file cleanup moved to `afterEach` (was in test body — leaked on assertion failure)
2. Dynamic `import('node:fs')` for `unlinkSync` replaced with static top-level import

## Resolution

Both should-fix items addressed in the same commit.
