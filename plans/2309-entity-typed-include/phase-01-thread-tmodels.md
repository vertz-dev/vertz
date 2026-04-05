# Phase 1: Thread TModels and TRelations Through Entity TypedIncludeOption

## Context

Issue #2309. The entity layer's `TypedIncludeOption` in `packages/server/src/entity/types.ts` lacks `TModels` threading, meaning nested includes can't be type-validated. The DB layer (`@vertz/db`) already has this pattern via `IncludeOption<TRelations, TModels, _Depth>`. This phase adds `TRelations` and `TModels` to the entity layer types and writes comprehensive type tests.

Design doc: `plans/2309-entity-typed-include.md`

## Tasks

### Task 1: Add type tests (RED)

**Files:**
- `packages/server/src/entity/__tests__/vertzql-types.test-d.ts` (modified)

**What to implement:**

Add type tests for `TypedIncludeOption` with `TRelations` + `TModels` threading. These will fail because the type doesn't accept these parameters yet.

Tests to add (all under a new `describe` block):
1. Typed nested include on `true`-config relation (positive)
2. Typed nested include on `RelationConfigObject`-config relation with `select` + `include` (positive)
3. Invalid nested key rejected with `@ts-expect-error` (negative)
4. Backward compat: `TypedIncludeOption<Config>` without `TRelations`/`TModels` accepts nested include as untyped (positive)
5. `TypedQueryOptions` threads `TRelations` + `TModels` through to `TypedIncludeOption` (positive + negative)
6. Top-level access filtering preserved — `false`-config relation rejected (negative)
7. Depth cap at 4 total levels (1 entity + 3 DB) — untyped fallback compiles (positive)
8. `true`-config relations accept structured form `{ where?, orderBy?, limit?, include? }` (positive)

**Setup needed in test file:** Declare table types, relation types, and a `Models` registry type matching the DB layer's `ModelEntry` pattern. Reuse existing test helpers (`Expect`, `Equal`, `HasKey`).

**Acceptance criteria:**
- [ ] All new type tests written
- [ ] Tests with `@ts-expect-error` are initially "unused" (meaning the type isn't restrictive enough yet — this is expected RED state)
- [ ] Positive tests fail typecheck (TypedIncludeOption doesn't accept TRelations/TModels yet)

---

### Task 2: Implement TypedIncludeOption changes (GREEN)

**Files:**
- `packages/server/src/entity/types.ts` (modified)

**What to implement:**

1. Import `FindModelByTable`, `FindModelRelations`, `IncludeOption`, `ModelEntry`, and `RelationDef` (type-only) from `@vertz/db`.

2. Add a helper type `EntityNestedInclude<TModels, TTable, _Depth>` that:
   - Checks if the model is found in registry via `[FindModelByTable<TModels, TTable>] extends [never]`
   - If not found: falls back to `Record<string, unknown>`
   - If found: produces `IncludeOption<FindModelRelations<TModels, TTable>, TModels, [..._Depth, unknown]>`

3. Update `TypedIncludeOption` signature from:
   ```ts
   TypedIncludeOption<TRelationsConfig extends EntityRelationsConfig>
   ```
   to:
   ```ts
   TypedIncludeOption<
     TRelationsConfig extends EntityRelationsConfig,
     TRelations extends Record<string, RelationDef> = Record<string, RelationDef>,
     TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
   >
   ```

4. Update the mapped type body:
   - **`RelationConfigObject` branch**: Add `include?: EntityNestedInclude<TModels, RelationTarget<TRelations[K]>, []>` to the structured object.
   - **`true` branch**: Change from just `true` to `true | { where?, orderBy?, limit?, include? }` where `where`/`orderBy` use the target table columns from `RelationTarget<TRelations[K]>`, and `include` uses `EntityNestedInclude`.

   Note: We need a `RelationTarget` helper. The DB layer has one at line 260 of `inference.ts` but it's not exported. Define a local one or import if available.

5. Update `TypedQueryOptions` signature to add `TRelations` and `TModels`:
   ```ts
   TypedQueryOptions<
     TTable extends TableDef = TableDef,
     TRelationsConfig extends EntityRelationsConfig = EntityRelationsConfig,
     TRelations extends Record<string, RelationDef> = Record<string, RelationDef>,
     TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
   >
   ```
   Pass `TRelations` and `TModels` to `TypedIncludeOption<TRelationsConfig, TRelations, TModels>`.

**Acceptance criteria:**
- [ ] `TypedIncludeOption` accepts `TRelationsConfig`, `TRelations`, `TModels` with backward-compat defaults
- [ ] Nested `include` field available on both `RelationConfigObject` and `true`-config branches
- [ ] `true`-config relations accept structured form
- [ ] All type tests from Task 1 pass (`vtz run typecheck`)
- [ ] Existing tests in `vertzql-types.test-d.ts` still pass (zero modifications needed)
- [ ] `vtz test` passes
- [ ] `vtz run lint` passes

---

### Task 3: Verify exports and quality gates

**Files:**
- `packages/server/src/entity/index.ts` (verify — may not need changes)

**What to implement:**

1. Verify that `TypedIncludeOption` and `TypedQueryOptions` are already exported (they are — lines 63-64 of `index.ts`). No changes needed since the type signatures are backward compatible.
2. Run full quality gates: `vtz test && vtz run typecheck && vtz run lint`
3. Verify code coverage on changed files.

**Acceptance criteria:**
- [ ] All exports verified
- [ ] `vtz test` passes
- [ ] `vtz run typecheck` passes
- [ ] `vtz run lint` passes
- [ ] No runtime behavior changes
