# Phase 1: Parameterize CrudHandlers and createCrudHandlers

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Commits:** uncommitted changes on `viniciusdacal/providence` (atop 1dc7183c)
- **Date:** 2026-03-11

## Changes

- `packages/server/src/entity/crud-pipeline.ts` (modified) -- parameterized `CrudHandlers<TModel>` and `createCrudHandlers<TModel>`
- `packages/server/src/entity/__tests__/crud-pipeline.test-d.ts` (new) -- type-level tests

## CI Status

- [x] `tsc --noEmit` passes for `@vertz/server`
- [x] `bun test` -- `.test-d.ts` files are NOT executed by `bun test` (requires `.test.` or `.spec.` pattern); type checking only via `tsc --noEmit`

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### Approved

#### Finding 1 (Resolved): `.test-d.ts` files are NOT executed at runtime

The reviewer initially flagged runtime failures, but `.test-d.ts` files are NOT picked up by `bun test` — they require `.test.` or `.spec.` in the filename. These files are type-checked only via `tsc -p tsconfig.typecheck.json --noEmit`. Verified: `bun test crud-pipeline.test-d.ts` returns "no matching test files". The existing `action-pipeline.test-d.ts` uses the same pattern. **No fix needed.**

#### Finding 2 (Noted): Files need to be committed

The crud-pipeline changes are uncommitted. They will be committed along with the changeset and review files.

#### Finding 3 (Observation): `as TModel['table']['$response']` casts are sound but inherently unchecked

There are 4 cast sites:
- Line 227: `as TModel['table']['$response'][]` (list)
- Line 263: `as TModel['table']['$response']` (get)
- Line 334: `as TModel['table']['$response']` (create)
- Line 374: `as TModel['table']['$response']` (update)

Each cast bridges the gap between `narrowRelationFields(...): Record<string, unknown>` and the parameterized response type. This is the correct approach -- the pipeline helper functions operate on untyped records and cannot be generically parameterized without a large refactor. The cast is at the boundary where we've already applied `stripHiddenFields` + `narrowRelationFields`, so the runtime shape matches the phantom type.

**No action needed** -- this is a reasonable design trade-off. Documenting for the record.

#### Finding 4 (Approved): After hooks correctly NOT parameterized

The `EntityAfterHooks` interface in `types.ts` uses `TResponse = unknown` (type-erased). The implementation passes stripped `Record<string, unknown>` to after hooks. This is correct per the review checklist requirement.

#### Finding 5 (Approved): Backward compatibility with route-generator.ts

`route-generator.ts` calls `createCrudHandlers(def, db, ...)` with `def: EntityDefinition` (unparameterized). Since both `CrudHandlers` and `createCrudHandlers` have `= ModelDef` defaults, this compiles without changes. Verified via `tsc --noEmit`.

The `applySelect` call in route-generator.ts (line 152) reassigns `result.data.body.items` with `Record<string, unknown>[]`. Since the unparameterized default resolves `$response` to `Record<string, unknown>`, this is type-safe.

#### Finding 6 (Approved): `db` parameter correctly unparameterized

`EntityDbAdapter` remains unparameterized -- it operates on `Record<string, unknown>` at runtime. The casts at return sites bridge back to the phantom type. No change to `EntityDbAdapter` needed.

#### Finding 7 (Approved): Negative type test is well-designed

The `@ts-expect-error` test (line 139) correctly catches model mismatches: `EntityContext<projectsModel>` is incompatible with `EntityContext<tasksModel>` because `EntityContext` carries `TModel` through to `entity: EntityOperations<TModel>`, and the table schemas differ. This is a genuine structural incompatibility, not just a brand check.

**However**, this test fails at runtime (Finding 1). Fixing the runtime execution issue will also fix this test.

## Resolution

No changes needed. Finding 1 was a false positive — `.test-d.ts` files are type-check-only. All aspects approved.
