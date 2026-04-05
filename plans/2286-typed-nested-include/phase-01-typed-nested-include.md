# Phase 1: Typed Nested Include Types

## Context

`IncludeOption` in `packages/db/src/schema/inference.ts` accepts `Record<string, unknown>` for nested `include` fields, making nested relation includes completely untyped. This phase adds type-level validation for nested include keys and typed output resolution, threading `TModels` through the entire client type chain.

**Design doc:** `plans/2286-typed-nested-include.md`
**Issue:** #2286

## Tasks

### Task 1: Add type utilities and modify inference types

**Files:**
- `packages/db/src/schema/inference.ts` (modified)
- `packages/db/src/schema/__tests__/inference.test-d.ts` (modified)

**What to implement:**

1. Add three new type utilities in `inference.ts`:
   - `FindModelByTable<TModels, TTable>` — bidirectional structural match to find a `ModelEntry` by table type
   - `FindModelRelations<TModels, TTable>` — extract relations from the matched model entry
   - `NestedInclude<TModels, TTable, _Depth>` — resolve nested include type with `never` fallback to `Record<string, unknown>`

2. Modify existing types to accept optional `TModels` parameter:
   - `IncludeOption<TRelations, TModels?, _Depth?>` — add `TModels` and `_Depth` params with defaults
   - `IncludeResolve<TRelations, TInclude, TModels?, _Depth?>` — add `TModels` param, pass to `ResolveOneInclude`
   - `ResolveOneInclude<R, TIncludeValue, TModels?, _Depth?>` — activate the dead `_Depth` param by recursing into `IncludeResolve` when `TIncludeValue extends { include: infer I }`
   - `FindResult<TTable, TOptions, TRelations, TModels?>` — pass `TModels` to `IncludeResolve`
   - `FindOptions<TColumns, TRelations, TModels?>` — pass `TModels` to `IncludeOption`

3. Export `FindModelByTable` and `FindModelRelations` from inference.ts (needed by test files).

**Key signatures:**

```typescript
// Bidirectional match to prevent false positives
type FindModelByTable<
  TModels extends Record<string, ModelEntry>,
  TTable extends TableDef<ColumnRecord>,
> = {
  [K in keyof TModels]: TModels[K]['table'] extends TTable
    ? TTable extends TModels[K]['table']
      ? TModels[K]
      : never
    : never;
}[keyof TModels];

type FindModelRelations<
  TModels extends Record<string, ModelEntry>,
  TTable extends TableDef<ColumnRecord>,
> = FindModelByTable<TModels, TTable> extends ModelEntry<infer _T, infer TRels>
  ? TRels
  : {};

type NestedInclude<
  TModels extends Record<string, ModelEntry>,
  TTable extends TableDef<ColumnRecord>,
  _Depth extends readonly unknown[],
> = [FindModelByTable<TModels, TTable>] extends [never]
  ? Record<string, unknown>
  : IncludeOption<
      FindModelRelations<TModels, TTable>,
      TModels,
      [..._Depth, unknown]
    >;
```

**TDD approach:**
- RED: Write `@ts-expect-error` tests for invalid nested include keys (they'll be "unused" since current types accept anything)
- GREEN: Add the type utilities and modify `IncludeOption` so the `@ts-expect-error` directives fire
- Continue with output resolution tests (`FindResult` with nested includes)

**Acceptance criteria:**
- [ ] `IncludeOption<TRelations, Models>` rejects invalid nested include keys at depth 1
- [ ] `IncludeOption<TRelations, Models>` rejects invalid nested include keys at depth 2
- [ ] `IncludeOption<TRelations, Models>` falls back to untyped at depth 3
- [ ] `IncludeOption<TRelations>` (no `TModels`) remains backward compatible (untyped nested)
- [ ] `IncludeOption` works with `createRegistry`-produced models
- [ ] Self-referencing relations (categories → parent/children) work
- [ ] Many-to-many through-relations target the final model, not the join table
- [ ] `IncludeResolve` produces typed nested data in output (nested `author.name` is typed)
- [ ] Nested `select` narrows nested result correctly
- [ ] `FindResult` without `TModels` resolves first-level includes normally (backward compat)
- [ ] `false`/`undefined` values are excluded from `IncludeResolve` result
- [ ] `FindResult` works with `RegistryModels` for nested output resolution
- [ ] Nullable FK one-relation behavior is documented in tests

---

### Task 2: Thread `TModels` through client types

**Files:**
- `packages/db/src/client/database.ts` (modified)
- `packages/db/src/__tests__/database-types.test-d.ts` (modified)

**What to implement:**

1. Add `TModels` parameter to client types in `database.ts`:
   - `TypedGetOptions<TEntry, TModels?>` — pass `TModels` to `IncludeOption`
   - `TypedListOptions<TEntry, TModels?>` — pass `TModels` to `IncludeOption`
   - `ModelDelegate<TEntry, TModels?>` — pass `TModels` to `TypedGetOptions`/`TypedListOptions` and `FindResult`
   - `DatabaseClient<TModels>` — map delegates as `ModelDelegate<TModels[K], TModels>`
   - `TransactionClient<TModels>` — same delegate mapping

2. Verify existing tests in `database-types.test-d.ts` and `database-client-types.test-d.ts` still pass.

3. Add new end-to-end tests in `database-types.test-d.ts`:
   - Positive: `db.posts.get()` include option accepts valid nested includes
   - Negative: `db.posts.get()` include option rejects invalid nested includes (`@ts-expect-error`)

**TDD approach:**
- RED: Write `@ts-expect-error` test for invalid nested include through `DatabaseClient` (directive is unused → test fails)
- GREEN: Thread `TModels` through client types
- Verify all existing tests still pass

**Acceptance criteria:**
- [ ] `DatabaseClient<Models>` delegates validate nested include keys
- [ ] `DatabaseClient<Models>` delegates reject invalid nested include keys
- [ ] All existing `database-types.test-d.ts` tests pass unchanged
- [ ] All existing `database-client-types.test-d.ts` tests pass unchanged
- [ ] `TransactionClient<Models>` has the same nested include typing as `DatabaseClient`

---

### Task 3: Quality gates, entity-layer follow-up issue, and verification

**Files:**
- No new files (verification only)

**What to implement:**

1. Run full quality gates:
   - `vtz test` (all packages)
   - `vtz run typecheck` (all packages)
   - `vtz run lint`

2. Measure typecheck time on linear-clone example before and after.

3. Create a GitHub issue for threading `TModels` through the entity layer's `TypedIncludeOption` (non-goal follow-up).

4. Verify IDE autocomplete works for nested include keys (manual check during implementation).

**Acceptance criteria:**
- [ ] `vtz test` passes
- [ ] `vtz run typecheck` passes
- [ ] `vtz run lint` passes
- [ ] Typecheck time regression < 20% on linear-clone
- [ ] GitHub issue created for entity-layer follow-up
