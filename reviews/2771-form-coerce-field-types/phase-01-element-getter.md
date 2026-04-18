# Phase 1: ArraySchema.element getter

- **Author:** Vinicius Dacal (with Claude)
- **Reviewer:** independent adversarial agent
- **Commits:** `3db116c32` (initial), nit-fix amendment (typed return as `Schema<T>` instead of `Schema<unknown>`)
- **Date:** 2026-04-18

## Changes

- `packages/schema/src/schemas/array.ts` (modified) — added `get element(): Schema<T>` returning `this._element`.
- `packages/schema/src/schemas/__tests__/array.test.ts` (modified) — added `.element accessor` describe block with 4 tests (reference identity, schema-type match, live-parse round-trip, clone survival).
- `plans/2771-form-coerce-field-types.md` (new) — design doc, three sign-offs.
- `plans/2771-form-coerce-field-types/phase-{01,02,03}-*.md` (new) — phase plans.

## CI Status

- [x] Tests: 13 passed in array.test.ts; 471 passed in `@vertz/schema` overall.
- [x] Typecheck: `turbo run typecheck --filter @vertz/schema` — 4/4 successful.
- [x] Lint/format: oxlint + oxfmt clean on changed files.

## Review Findings

**Verdict: Approve with nits — no blockers.**

### Nits applied

- Reviewer flagged the `as Schema<unknown>` cast as gratuitous and noted that `ObjectSchema.shape` returns the actual generic without a cast. **Resolved:** typed the getter as `Schema<T>` (drops the cast, preserves more type information for downstream consumers). Tests still pass.

### Nits acknowledged but not actioned

- Test of `_schemaType()` could go through `.metadata.type` for cleaner public-API assertion. Acknowledged, but the test file already uses both patterns (`.metadata.type` exists at line 92 in the existing tests). Leaving as is for symmetry with `_schemaType` calls in Phase 2's coerce.ts which dispatches on `_schemaType()` directly.

## Resolution

All findings addressed. Phase 1 complete and ready to integrate into Phase 2.
