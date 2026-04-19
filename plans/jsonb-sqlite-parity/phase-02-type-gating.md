# Phase B — Type Gating (filter operators)

## Context

Design doc: [`plans/jsonb-sqlite-parity.md`](../jsonb-sqlite-parity.md). Approved rev 3.

Phase A delivered runtime parity. This phase closes the "compiles but throws at runtime" gap: path-shaped filter keys (`'meta->k'`) and array operators (`arrayContains`, etc.) currently compile on any dialect and runtime-throw on SQLite. Phase B makes them compile **only** on `dialect: 'postgres'` via `TDialect` threading + a keyed-never branded error type.

Phase B is in the same PR as Phase A — no interim state where filter gating lags behind runtime parity.

## Tasks

### Task 1: Thread `TDialect` generic through `createDb` → `Db` → `ModelDelegate`

**Files (≤5):**
- `packages/db/src/client/database.ts` (add `TDialect` generic)
- `packages/db/src/query/crud.ts` (propagate `TDialect` into delegate method option types)
- `packages/db/src/schema/inference.ts` (`FilterType`, `IncludeOption` gain `TDialect`)

**What to implement:**

1. Add `TDialect extends DialectName = DialectName` to `createDb`:
   ```ts
   export function createDb<
     TModels extends Record<string, ModelEntry>,
     TDialect extends DialectName = DialectName,
   >(opts: CreateDbOptions<TModels> & { dialect: TDialect }): Db<TModels, TDialect>
   ```
   The discriminated union `CreateDbOptions` already narrows `dialect` to the literal at call sites — no `as const` required.
2. Add `TDialect` to `Db<TModels, TDialect>`.
3. Thread through `ModelDelegate` so `list` / `get` / `update` / `delete` option types see it.
4. `FilterType<TColumns, TDialect>` and `IncludeOption<..., TDialect>` receive it.
5. Default `= DialectName` preserves existing consumers who omit the generic.

**Acceptance criteria:**
- [ ] `createDb({ dialect: 'sqlite', ... })` infers `TDialect = 'sqlite'`.
- [ ] `createDb({ dialect: 'postgres', ... })` infers `TDialect = 'postgres'`.
- [ ] `db.entity.list<Options>(...)` option types carry `TDialect` through.
- [ ] Nested `include: { related: { where: { ... } } }` option types carry `TDialect` (not just the top-level).
- [ ] All existing tests compile without changes (generic default covers them).

---

### Task 2: Keyed-never branded error + gated filter branches

**Files (≤5):**
- `packages/db/src/schema/inference.ts` (modified)
- `packages/db/src/schema/jsonb-filter-brand.ts` (new — holds the branded type + path-key helper)

**What to implement:**

1. Define the keyed-never brand in `jsonb-filter-brand.ts`:
   ```ts
   type JsonbPathFilterErrorKey =
     'JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS';

   export type JsonbPathFilterGuard = {
     readonly [K in JsonbPathFilterErrorKey]: K;
   };

   type ArrayOpFilterErrorKey =
     'ArrayOpFilter_Error_Requires_Dialect_Postgres_Array_Operators_Not_Supported_On_SQLite';

   export type ArrayOpFilterGuard = {
     readonly [K in ArrayOpFilterErrorKey]: K;
   };
   ```
2. Extend `FilterType` additively. Path-shaped keys + array operators gate on `TDialect`:
   ```ts
   export type FilterType<TColumns extends ColumnRecord, TDialect extends DialectName> =
     BaseFilterType<TColumns> &
     (TDialect extends 'postgres' ? JsonbPathKeys<TColumns> : JsonbPathFilterGuard) &
     (TDialect extends 'postgres' ? ArrayOpsFor<TColumns> : {});
   ```
   Where `JsonbPathKeys<TColumns>` produces keys like `` `${K & string}->${string}` `` for jsonb columns.
3. Preserve existing runtime throws in `where.ts` as defense-in-depth for widened-variable cases.

**Acceptance criteria:**
- [ ] `.test-d.ts` negative: `@ts-expect-error` on `where: { 'meta->k': { eq: 'v' } }` against `dialect: 'sqlite'` — error diagnostic contains the verbatim recovery sentence.
- [ ] `.test-d.ts` negative: `@ts-expect-error` on `where: { tags: { arrayContains: [...] } }` against SQLite.
- [ ] `.test-d.ts` negative: `@ts-expect-error` on a **nested include** `include: { related: { where: { 'meta->k': ... } } }` against SQLite.
- [ ] `.test-d.ts` positive: the same three shapes compile against `dialect: 'postgres'`.
- [ ] 20-model × 5-column fixture typechecks under current perf budget (regression canary).

---

### Task 3: Changeset + docs

**Files (≤5):**
- `.changeset/jsonb-sqlite-parity.md` (new)
- `packages/mint-docs/` — one page addition on "JSONB across dialects" (exact location TBD by reading the mint-docs index)

**What to implement:**

1. Changeset entry (`@vertz/db`, `patch`):
   - Reads parse automatically on SQLite/D1 (`d.jsonb<T>()` no longer returns raw strings).
   - Writes explicitly stringify plain objects/arrays in `toSqliteValue` (no more driver-implicit reliance).
   - Validator hook wired on reads (issue acceptance criterion).
   - Filter path keys (`'meta->k'`) and array operators type-gated to `dialect: 'postgres'` via new `TDialect` generic on `createDb`.
   - `TableSchemaRegistry` internal shape changed — no public API impact.
   - Known footgun documented: widening `dialect` to `DialectName` disables the gate; `where.ts` runtime throw remains the backstop.
   - Closes #2850. Partial follow-ups: #2867 (validator on writes), #2868 (typed JSONB operators).
2. Mint-docs addition: a short "JSONB across dialects" section explaining parse-on-read, filter dialect requirements, recovery path on SQLite (fetch with `list()` + filter in JS). Sentence on inline-`where` for best diagnostic.

**Acceptance criteria:**
- [ ] Changeset file present, marked `patch`, body covers all five user-visible changes + internal note + follow-up links.
- [ ] Mint-docs page added, linked from the nav.
- [ ] The recovery-path sentence in mint-docs matches the JSDoc and the branded error type character-for-character.

---

## Phase B exit criteria

- All three tasks complete.
- `vtz test && vtz run typecheck && vtz run lint` clean monorepo-wide.
- Adversarial review written at `reviews/jsonb-sqlite-parity/phase-02-type-gating.md` and resolved.
- Single PR against `main` ready.
