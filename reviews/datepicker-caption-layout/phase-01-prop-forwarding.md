# Phase 1: captionLayout Prop Forwarding

- **Author:** vertz-dev-front[bot]
- **Reviewer:** adversarial-review-agent
- **Commits:** 36cc0874
- **Date:** 2026-03-19

## Changes

- `packages/ui-primitives/src/date-picker/date-picker-composed.tsx` (modified)
- `packages/theme-shadcn/src/components/primitives/date-picker.tsx` (modified)
- `packages/ui-primitives/src/date-picker/__tests__/date-picker-composed.test.ts` (modified)
- `packages/theme-shadcn/src/__tests__/date-picker.test.ts` (modified)
- `plans/1586-datepicker-caption-layout.md` (new)

## CI Status

- [x] Quality gates passed (test + typecheck + lint)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps
- [x] No security issues
- [x] API matches design doc
- [x] All forwarding points covered (6/6 verified)

## Findings

### SHOULD-FIX (addressed)

- **S1: Missing changeset** — Added `.changeset/datepicker-caption-layout.md`

### NICE-TO-HAVE (addressed)

- **N1: Default behavior negative test** — Added test asserting no `<select>` without `captionLayout`
- **N3: Design doc status** — Updated to "Implemented"

### NICE-TO-HAVE (deferred)

- **N2: No `.test-d.ts` type test** — Type is a lookup type, mechanically guaranteed. Low risk.

## Verdict: APPROVED
