# Review: SDK Type-Safe Query Parameters (All Phases)

- **Author:** viniciusdacal
- **Reviewer:** claude-opus-4.6 (adversarial)
- **Commits:** 2eb770f0b..3147f6af4
- **Date:** 2026-04-06

## Changes

- `packages/compiler/src/ir/types.ts` (modified)
- `packages/compiler/src/analyzers/entity-analyzer.ts` (modified)
- `packages/compiler/src/analyzers/__tests__/entity-analyzer.test.ts` (modified)
- `packages/codegen/src/types.ts` (modified)
- `packages/codegen/src/ir-adapter.ts` (modified)
- `packages/codegen/src/__tests__/ir-adapter-entities.test.ts` (modified)
- `packages/codegen/src/generators/entity-types-generator.ts` (modified)
- `packages/codegen/src/__tests__/entity-types-query.test.ts` (new)
- `packages/codegen/src/generators/entity-sdk-generator.ts` (modified)
- `packages/codegen/src/__tests__/entity-sdk-query-types.test.ts` (new)
- `packages/codegen/src/__tests__/sdk-query-types.test-d.ts` (new)
- `packages/codegen/src/generators/__tests__/entity-sdk-generator.test.ts` (modified)

## CI Status

- [x] Quality gates passed (379 tests, typecheck clean, 0 lint errors)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Blocker 1: PascalCase mismatch (RESOLVED)

`entity-types-generator.ts` used naive `charAt(0).toUpperCase()` instead of proper `toPascalCase` from `utils/naming`. For hyphenated entity names like `task-category`, types generator would emit `Task-categoryListQuery` (invalid TS) while SDK generator would import `TaskCategoryListQuery`.

**Resolution:** Replaced with `toPascalCase` import. Added test for hyphenated entity names.

### Blocker 2: Missing .test-d.ts type-level tests (RESOLVED)

Design doc requires compile-time verification that generated types reject invalid usage. No `.test-d.ts` file existed.

**Resolution:** Added `sdk-query-types.test-d.ts` with positive and negative type tests per the design doc spec.

### Should-fix: Missing changeset (RESOLVED)

No changeset for `@vertz/compiler` and `@vertz/codegen`.

**Resolution:** Added `.changeset/sdk-type-safe-query-params.md`.

## Resolution

All findings resolved. No remaining blockers.
