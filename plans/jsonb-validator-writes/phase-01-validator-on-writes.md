# Phase 1: Validator on writes (all dialects)

## Context

Wire the dead `ColumnMetadata.validator` hook on write paths so that `d.jsonb<T>({ validator })` rejects invalid payloads before they reach the driver, on both Postgres and SQLite/D1. This is the write-side complement to the read-side work merged in PR #2870 (closes #2850).

Full design: [`../jsonb-validator-writes.md`](../jsonb-validator-writes.md). Issue: [#2867](https://github.com/vertz-dev/issues/2867).

One feature branch: `fix/jsonb-validator-writes-2867`, branched from `origin/main`.

## Tasks

### Task 1: `runJsonbValidators` helper + wire into every CRUD write path

**Files:** (max 5)
- `packages/db/src/query/crud.ts` (modified — add helper, WeakMap fast-path cache, invoke in 7 write methods)
- `packages/db/src/query/__tests__/crud-jsonb-validator-writes.test.ts` (new — acceptance matrix on local SQLite)

**What to implement:**

Add a pure helper in `crud.ts`:

```ts
const tableHasJsonbValidator = new WeakMap<TableDef<ColumnRecord>, boolean>();

function hasJsonbValidator(table: TableDef<ColumnRecord>): boolean {
  const cached = tableHasJsonbValidator.get(table);
  if (cached !== undefined) return cached;
  let found = false;
  for (const col of Object.values(table._columns)) {
    const meta = (col as ColumnBuilder<unknown, ColumnMetadata>)._meta;
    if (meta.validator) { found = true; break; }
  }
  tableHasJsonbValidator.set(table, found);
  return found;
}

function runJsonbValidators(
  table: TableDef<ColumnRecord>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!hasJsonbValidator(table)) return data;
  const out: Record<string, unknown> = { ...data };
  for (const [key, value] of Object.entries(data)) {
    const col = table._columns[key];
    if (!col) continue;
    const meta = (col as ColumnBuilder<unknown, ColumnMetadata>)._meta;
    if (!meta.validator) continue;
    if (value === null || value === undefined) continue;
    if (isDbExpr(value)) continue;
    try {
      out[key] = meta.validator.parse(value);
    } catch (cause) {
      throw new JsonbValidationError({ table: table._name, column: key, value, cause });
    }
  }
  return out;
}
```

Invocation sites (all in `crud.ts`):
- `create` — after `fillGeneratedIds`, before `buildInsert`.
- `createMany` / `createManyAndReturn` — inside `.map` over rows, before `buildInsert`. Eager — any throw aborts the batch before SQL runs.
- `update` / `updateMany` — after readOnly filtering, before `buildUpdate`.
- `upsert` — run on both `filteredCreate` and `filteredUpdate`.

**Acceptance criteria:**

- [ ] `runJsonbValidators` + WeakMap cache added to `crud.ts`.
- [ ] All 7 write paths invoke the helper at the documented insertion points (create, createMany, createManyAndReturn, update, updateMany, upsert-create-branch, upsert-update-branch).
- [ ] BDD acceptance matrix in the new test file:
  - Given a meta column with a validator, when create/createMany/createManyAndReturn/update/updateMany/upsert is called with a valid payload, then persists it and the round-trip value equals the validator output.
  - Given the same column, when any write method is called with an invalid payload, then the write rejects with `{ code: 'JSONB_VALIDATION_ERROR', table, column, value }` and no row reaches the DB.
  - Given `createMany` with one invalid row in a batch of 10, when invoked, then zero rows persist (batch atomicity).
  - Given an `update` call that doesn't include the validated field, when invoked, then the validator is not called (counted).
  - Given a validator-free table, when a 100-row `createMany` runs, then it returns `ok: true` and the WeakMap entry is `false`.
  - Given a jsonb payload equal to the literal string `'now'`, when create is called, then the validator IS invoked.
  - Given a DbExpr (e.g. `arrayAppend(col, ...)`), when update is called, then the validator is NOT invoked on that value.

### Task 2: Widen `WriteError` + extend `toWriteError`

**Files:** (max 5)
- `packages/db/src/errors.ts` (modified — widen `WriteError` union, add `JsonbValidationError` branch to `toWriteError`)
- `packages/db/src/__tests__/errors.test.ts` (modified — runtime assertion that `toWriteError(new JsonbValidationError(...))` returns the expected shape)
- `packages/db/src/__tests__/errors.test-d.ts` (modified or new — type assertion that `DbJsonbValidationError` ∈ `WriteError` and an exhaustive switch with `never` default compiles)

**What to implement:**

In `packages/db/src/errors.ts`:
```ts
export type WriteError =
  | DbConnectionError
  | DbQueryError
  | DbConstraintError
  | DbJsonbValidationError; // NEW
```

In `toWriteError`, add a branch **above** the generic `'code' in error` path (`JsonbValidationError` extends `DbError` which has a `code` property, so ordering matters):
```ts
if (error instanceof JsonbValidationError) {
  return {
    code: 'JSONB_VALIDATION_ERROR',
    message: error.message,
    table: error.table,
    column: error.column,
    value: error.value,
    cause: error,
  };
}
```

**Acceptance criteria:**

- [ ] `WriteError` union widened with `DbJsonbValidationError`.
- [ ] `toWriteError` branch for `JsonbValidationError` placed above the generic `code`-sniffing path.
- [ ] Runtime test: `toWriteError(new JsonbValidationError({ table: 't', column: 'c', value: { x: 1 }, cause: new Error('bad') }))` returns `{ code: 'JSONB_VALIDATION_ERROR', message: ..., table: 't', column: 'c', value: { x: 1 }, cause: ... }`.
- [ ] Type test: `const _err: WriteError = { code: 'JSONB_VALIDATION_ERROR', ... }` compiles.
- [ ] Type test: exhaustive switch over `err.code: WriteError['code']` with `never` default includes a `'JSONB_VALIDATION_ERROR'` arm (adding only the four existing arms errors).

### Task 3: JSDoc + mint-docs

**Files:** (max 5)
- `packages/db/src/d.ts` (modified — append sentence to `d.jsonb` JSDoc)
- `packages/mint-docs/src/.../jsonb-dialects.mdx` (modified — find the "JSONB across dialects" section added in PR #2870, add write-side paragraph)
- `.changeset/jsonb-validator-writes.md` (new — `@vertz/db` patch, body covers the `WriteError` widening as the one caller-visible break)

**What to implement:**

Append to `d.jsonb` JSDoc:
> The validator also runs on every write value — invalid payloads surface as `{ code: 'JSONB_VALIDATION_ERROR' }` without reaching the driver. `error.value` is the raw caller-provided input (pre-validator), so avoid attaching validators that carry secrets unless you're comfortable with that input appearing in error logs.

Mint-docs paragraph (append to the existing JSONB dialects section):
> On writes, if you attach a validator via `d.jsonb<T>({ validator })` or a schema-like object exposing `.parse()`, the validator runs for every `create` / `update` / `upsert` payload that includes the column. Failures return `{ ok: false, error: { code: 'JSONB_VALIDATION_ERROR', table, column, value } }` without reaching the driver. On SQLite specifically, `RETURNING` rows also pass through the read-side validator — so a non-idempotent validator (e.g. one that transforms input to a shape the validator itself would reject) will surface `JSONB_VALIDATION_ERROR` on the read side even when the write succeeded at the driver.

Changeset body: note the `WriteError` union widening as the one caller-visible break (an exhaustive `switch (err.code)` with a `never` default will need a new `'JSONB_VALIDATION_ERROR'` arm).

**Acceptance criteria:**

- [ ] `d.jsonb` JSDoc includes the write-side sentence + the PII warning on `error.value`.
- [ ] `packages/mint-docs/.../jsonb-dialects.mdx` contains the write-side paragraph with the error code name and the RETURNING edge note.
- [ ] `.changeset/jsonb-validator-writes.md` exists, `@vertz/db` patch, body mentions the WriteError widening.
