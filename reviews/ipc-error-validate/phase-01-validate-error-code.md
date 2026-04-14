# Phase 1: Validate DesktopErrorCode at Runtime

- **Author:** Claude Opus 4.6
- **Reviewer:** Claude Opus 4.6 (adversarial)
- **Commits:** de6b0dcb0
- **Date:** 2026-04-14

## Changes

- `packages/desktop/src/types.ts` (modified) — added `DESKTOP_ERROR_CODES` Set and `validateErrorCode()` function
- `packages/desktop/src/ipc.ts` (modified) — replaced dynamic `as DesktopErrorCode` with `validateErrorCode()`
- `packages/desktop/src/internal/binary-fetch.ts` (modified) — replaced dynamic and literal `as` casts
- `packages/desktop/src/fs.ts` (modified) — removed unnecessary literal `as` cast
- `packages/desktop/src/__tests__/validate-error-code.test.ts` (new) — 10 runtime tests
- `packages/desktop/package.json` (modified) — updated test script

## CI Status

- [x] Quality gates passed at de6b0dcb0

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### Approved

- Should-fix: Missing changeset — addressed in follow-up commit.
- Nit: `DesktopErrorCode` type and `DESKTOP_ERROR_CODES` Set can drift if type is extended but Set isn't updated. Acceptable — Set is typed as `Set<DesktopErrorCode>` so adding invalid values is caught, and exhaustive test covers all known codes.
- Nit: `validateErrorCode` is not in the public barrel export. Intentional — it's an internal utility.

## Resolution

Changeset added. No other changes needed.
