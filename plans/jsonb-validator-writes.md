# `d.jsonb<T>()` validator on writes (all dialects)

**Issue:** [#2867](https://github.com/vertz-dev/vertz/issues/2867)
**Status:** Design (rev 2 — addresses three design-review rounds)
**Related:** #2850 (closed — read-side wiring landed in PR #2870)

## Context & Problem

`ColumnMetadata.validator` (`packages/db/src/schema/column.ts:22`) is accepted by `d.jsonb<T>({ validator })` and `d.jsonb<T>(schema)` (Zod-style schemas, when they expose `.parse()`). `d.json` is not exposed today — only `d.jsonb` carries a validator — so this ticket scopes to `d.jsonb` and the `'json'` branch in `fromSqliteValue` remains reachable only via raw/driver-level paths, outside the CRUD layer.

After PR #2870, the validator runs **on reads** for both SQLite and D1 via the row-mapper in `sqlite-driver.ts:141–147`. Postgres reads don't need it — `postgres.js` returns parsed JSONB, and no shape check runs there today either. The read-side Postgres branch is out of scope for both tickets.

The validator is still **dead on writes** for both dialects. Concretely:

```ts
const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'uuid' }),
  meta: d.jsonb<{ displayName: string }>({
    validator: {
      parse(v) {
        if (typeof v !== 'object' || v === null || typeof (v as { displayName?: unknown }).displayName !== 'string') {
          throw new TypeError('missing displayName');
        }
        return v as { displayName: string };
      },
    },
  }),
});

// Today: this write succeeds. The bad payload hits the DB.
await db.install.create({ data: { meta: { wrong: true } as unknown as { displayName: string } } });
// Later, a read fails with JsonbValidationError — long after the user could have fixed it.
```

The point of attaching a validator is to bounce the bad value at the gate the developer controls, not to leave a landmine for the next read. The read-side guard is a backstop for corrupt storage; the write-side guard is the one that prevents the corruption.

## Goals

1. When a `validator` is attached to a `d.jsonb<T>()` column, it runs on every write value for that column (create, createMany, createManyAndReturn, update, updateMany, upsert — both create and update branches).
2. Validation failure **does not reach the driver** — it surfaces as `{ ok: false, error: { code: 'JSONB_VALIDATION_ERROR', ... } }` via the existing Result wrap in `database.ts` (same machinery as read-side `JsonbValidationError`).
3. Behaviour is **identical** across Postgres and SQLite/D1. The validator runs in `crud.ts`, upstream of any dialect-specific value conversion.
4. If the validator **transforms** the value (Zod `.default()`, `.transform()`, coerce, etc.), the transformed value is what gets persisted. Symmetric with the read path, which also uses the validator's return value.
5. Zero impact on columns without a validator — no per-row overhead on plain writes.

## Non-Goals

- **Framework-level default validators for primitive columns** (`d.text().min(3)`, `d.integer().max(100)`). Separate ticket. Those constraint builders set `_minLength` / `_maxValue` / etc. today; turning them into validators is a different change.
- **Partial-update diffing.** `update({ where, data: { otherField: 'x' } })` doesn't touch `meta`, so the validator doesn't run on `meta`. Only provided jsonb values are validated.
- **Postgres read-side validator.** Still out of scope. The validator currently runs only on SQLite reads (where parse happens). Extending it to Postgres reads is a follow-up we'll file if a user asks.
- **Coercion beyond what the user's validator does.** We don't coerce `"2024-01-01"` to `Date` or similar. Whatever the validator returns is what gets stored.
- **MySQL.** No driver yet.

## API Surface

### 1. Validator runs on create / update / upsert (both dialects)

```ts
const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'uuid' }),
  tenantId: d.uuid(),
  meta: d.jsonb<{ displayName: string }>({
    validator: {
      parse(v) {
        if (typeof v !== 'object' || v === null || typeof (v as { displayName?: unknown }).displayName !== 'string') {
          throw new TypeError('missing displayName');
        }
        return v as { displayName: string };
      },
    },
  }),
});

const db = createDb({
  dialect: 'sqlite', // or 'postgres' — same behaviour
  path: ':memory:',
  models: { install: d.model(installTable) },
  migrations: { autoApply: true },
});

// Valid: reaches the DB.
const ok = await db.install.create({ data: { tenantId: 't1', meta: { displayName: 'Acme' } } });
// ok.ok === true

// Invalid: rejected before the SQL is even built.
const bad = await db.install.create({
  data: { tenantId: 't1', meta: { wrong: true } as unknown as { displayName: string } },
});
// bad.ok === false
// bad.error.code === 'JSONB_VALIDATION_ERROR'
// bad.error.table === 'install'
// bad.error.column === 'meta'
// bad.error.value === { wrong: true }
```

### 2. `update` / `upsert` symmetric

```ts
await db.install.update({
  where: { id },
  data: { meta: { displayName: 'Beta' } }, // validator runs
});

await db.install.upsert({
  where: { id },
  create: { tenantId: 't1', meta: { displayName: 'New' } }, // validator runs on create branch
  update: { meta: { displayName: 'Updated' } },              // and on update branch
});
```

### 3. Unprovided values skip the validator

```ts
// Updating a different field doesn't re-validate meta — meta isn't in `data`.
await db.install.update({ where: { id }, data: { tenantId: 't2' } }); // ok
```

### 4. Transformed values are persisted

```ts
const meta = d.jsonb<{ displayName: string; tier: 'free' | 'pro' }>({
  validator: {
    parse(v) {
      const obj = v as { displayName: string; tier?: 'free' | 'pro' };
      return { displayName: obj.displayName, tier: obj.tier ?? 'free' };
    },
  },
});
// INSERT persists { displayName, tier: 'free' } — the validator's return value, not the caller's input.
```

### 5. `WriteError` union gains `DbJsonbValidationError`

```ts
type WriteError =
  | DbConnectionError
  | DbQueryError
  | DbConstraintError
  | DbJsonbValidationError; // NEW — write-side variant reuses the read-side shape
```

`DbJsonbValidationError` already exists in `packages/db/src/errors.ts:88` for the read path. Same shape, same code (`'JSONB_VALIDATION_ERROR'`) — the union is widened so consumers of the write result can discriminate on it.

## Manifesto Alignment

- **"If it builds, it works."** A typed `d.jsonb<T>()` column with a validator promises `T` at both ends of the round trip. Today the type says `T` but writes accept `unknown` because the validator is never invoked. We close the gap at the point it matters: the write.
- **LLM-first.** An LLM emitting a `create` call gets the same error shape (`'JSONB_VALIDATION_ERROR'`) regardless of dialect. The error names table + column + value so the LLM can self-correct without another round trip to the schema.
- **Cross-dialect parity for basic CRUD.** Writes now behave the same on both dialects. The decision to run the validator in `crud.ts` (not in dialect drivers) makes parity structural, not coincidental.

### Rejected alternatives

- **Option A — Run the validator inside each driver (postgres driver + sqlite driver).** Forces two implementations to stay in sync. The symmetry goal we explicitly want would become a review checklist item instead of a structural guarantee. Worse on every axis.
- **Option B — Run the validator only when `validator` was provided as a `{ validator }` option, not when provided as a schema.** User-visible split with no benefit. A `d.jsonb(schema)` caller gets a validator on reads today (PR #2870 wired both forms uniformly); writes should behave the same.
- **Option C — Only validate on create, not update/upsert.** Leaves the footgun partially open. The next person to write a bad payload via `update` gets the same read-side landmine we're closing. No.

## Type Flow Map

No new generics. The runtime change doesn't alter the public type surface — `d.jsonb<T>({ validator })` already returns `ColumnBuilder<T, DefaultMeta<'jsonb'>>`. The user-facing types for `create` / `update` / `upsert` already demand `T` on input; this ticket makes the runtime honour that contract.

What does change at the type level:

```
WriteError = DbConnectionError | DbQueryError | DbConstraintError | DbJsonbValidationError
```

Consumers who exhaustively discriminate on `write.error.code` get a new case. This is additive — existing code that handles the three original codes still compiles; code with an exhaustive `never`-default will get a compile error prompting them to handle the new case. That's the intended signal. Covered by a `.test-d.ts` assertion that `DbJsonbValidationError` is assignable to `WriteError`.

## Implementation Plan

Single PR. Small surface.

Files (≤5):
- `packages/db/src/query/crud.ts` (modified — add a `runJsonbValidators` helper, invoke before `buildInsert` / `buildUpdate` in every write path)
- `packages/db/src/errors.ts` (modified — add `DbJsonbValidationError` to `WriteError` union; extend `toWriteError` to map `JsonbValidationError` → `DbJsonbValidationError`)
- `packages/db/src/query/__tests__/crud-jsonb-validator-writes.test.ts` (new — acceptance matrix across all write methods, both dialects use local SQLite as the default; Postgres branch covered by one integration test using the existing pg test harness)
- `packages/db/src/__tests__/errors.test-d.ts` (modified — assert `DbJsonbValidationError` ∈ `WriteError`)
- `packages/db/src/d.ts` (modified — one JSDoc line on `d.jsonb` noting the validator runs on writes too)

### Work

1. **Helper.** Add `runJsonbValidators(table, data)` in `crud.ts`, plus a per-table `hasJsonbValidator` fast-path flag memoised via `WeakMap<TableDef, boolean>` so the detection walk runs once per table, not once per row:
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
     if (!hasJsonbValidator(table)) return data; // fast path — no allocation

     const out: Record<string, unknown> = { ...data };
     for (const [key, value] of Object.entries(data)) {
       const col = table._columns[key];
       if (!col) continue;
       const meta = (col as ColumnBuilder<unknown, ColumnMetadata>)._meta;
       if (!meta.validator) continue;
       // Skip null (nullable columns) and undefined (field omitted).
       if (value === null || value === undefined) continue;
       // Skip DbExpr so `arrayAppend(col, ...)` style updates aren't mis-validated.
       // Timestamp `'now'` sentinels never hit this branch — timestamp columns
       // have no `meta.validator`, so the `!meta.validator` check above already
       // short-circuits them. We intentionally do NOT skip the string `'now'`
       // here so a legitimate jsonb payload equal to `'now'` is still validated.
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
2. **Invocation sites.** Call `runJsonbValidators` in:
   - `create` — after `fillGeneratedIds`, before `buildInsert`.
   - `createMany` / `createManyAndReturn` — inside the `.map` over each row, before `buildInsert`. **Batch atomicity:** validation runs eagerly for every row. If any row fails, `.map` throws synchronously before the batch SQL is built — no rows reach the DB. Acceptance matrix asserts this.
   - `update` / `updateMany` — after readOnly filtering, before `buildUpdate`.
   - `upsert` — run on `filteredCreate` (post-`fillGeneratedIds`) and `filteredUpdate` (post-autoUpdate injection). The validator never sees the non-jsonb `id` field since it's column-scoped. The autoUpdate timestamp `'now'` sentinels are safe because timestamp columns have no `meta.validator`.
3. **Error mapping + catch site.** `runJsonbValidators` throws `JsonbValidationError` synchronously from inside the CRUD function (`crud.create`, `crud.update`, etc.). Each CRUD method is invoked from `database.ts`'s `impl*` wrappers (`implCreate` at `database.ts:661–676`, `implUpdate` at `:715–730`, etc.), which wrap the entire call in `try { … } catch (e) { return err(toWriteError(e)); }`. The validator throw propagates up through the `await crud.create(…)` call and is caught by that outer `try/catch` before any Promise settles, surfacing as the Result `err` branch. No new wiring needed at the database-client layer; the catch sites already exist for every write method.

   In `toWriteError` (`packages/db/src/errors.ts`), add a `JsonbValidationError` branch **above** the generic `code`-sniffing path (same pattern as `toReadError` uses today):
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
   Widen `WriteError`:
   ```ts
   export type WriteError =
     | DbConnectionError
     | DbQueryError
     | DbConstraintError
     | DbJsonbValidationError;
   ```
4. **Fast path cost.** After the WeakMap memoisation (step 1), the first call per table walks `Object.values(table._columns)` once; every subsequent call is a single `WeakMap.get`. `createMany` with 1000 rows on a validator-free table now pays one walk + 1000 WeakMap hits, not 1000 walks. The `out` allocation (`{ ...data }`) only happens when `hasJsonbValidator === true`, so validator-free writes are allocation-neutral.

   **RETURNING + validator on SQLite writes.** A write that issues `INSERT ... RETURNING` on SQLite passes the returned rows back through `convertRowWithSchema` (`sqlite-driver.ts:141`), which runs the validator on the read path. If the validator accepts the write-side input but rejects the persisted row (unlikely but possible with non-idempotent validators), the read-side `JsonbValidationError` surfaces from `executeQuery` and flows through the same `toWriteError` catch in `database.ts`. The resulting `WriteError` is `{ code: 'JSONB_VALIDATION_ERROR', … }` — same shape as the write-side throw. We document this in the mint-docs entry: *"On SQLite, RETURNING rows run through the read-side validator too; if a validator is non-idempotent (e.g. `.transform()` that produces a shape the validator itself rejects), you'll see `JSONB_VALIDATION_ERROR` even though the write succeeded at the driver."* Non-goal to add a `phase: 'read' | 'write'` discriminator in this ticket — tracked as follow-up if a user hits it.
5. **Acceptance test matrix.** One `describe` per write method (`create`, `createMany`, `createManyAndReturn`, `update`, `updateMany`, `upsert`-create-branch, `upsert`-update-branch). For each:
   - Valid value → `ok: true`, read-back confirms persistence.
   - Invalid value → `ok: false`, `error.code === 'JSONB_VALIDATION_ERROR'`, `error.table` / `error.column` / `error.value` populated, **no row reaches the DB** (verified by a follow-up `list` showing the table is empty / unchanged).
   - Transformed value (validator returns a coerced object) → persisted value matches the validator's output, not the caller's input.
   - `update` that doesn't include the jsonb field → validator not called (verified by counting invocations).
   - **Batch atomicity** for `createMany` / `createManyAndReturn`: invalid row at index 3 of 10 → whole batch fails, zero rows persisted.
   - **Fast-path regression** on validator-free tables: a 100-row `createMany` on a table with zero validators returns `ok: true` and never touches the validator helper path (verified by checking the WeakMap entry's value is `false` after the first call).
   - **String `'now'` into a jsonb column where `T` includes strings**: validator IS invoked (regression guard against the dropped `'now'` skip).
   - **Legitimate jsonb payload equal to the literal string `'now'`**: asserts the helper does not silently skip it.

   Postgres parity: one representative test per shape (create valid, create invalid, update valid, update invalid) runs against the existing PG test harness, skipped when `$POSTGRES_URL` is unset. This is thinner than the SQLite matrix because the validator code runs in `crud.ts` above the dialect split — the dialect can't change the outcome, only the SQL shape. The PG tests lock that invariant.

   **Plain-CRUD regression on PG.** Keep the existing `crud.test.ts` suites unchanged so a validator-free PG write path is covered by the existing regression set. No new PG-specific test is needed for the fast path — the existing suite IS the fast-path regression.
6. **JSDoc.** On `d.jsonb`: *"The validator also runs on every write value — invalid payloads surface as `{ code: 'JSONB_VALIDATION_ERROR' }` without reaching the driver. `error.value` is the raw caller-provided input (pre-validator), so avoid attaching validators that carry secrets unless you're comfortable with the input appearing in error logs."*

## E2E Acceptance Test

```ts
// packages/db/src/query/__tests__/crud-jsonb-validator-writes.test.ts
import { describe, expect, it } from '@vertz/test';
import { d } from '../../d';
import { createDb } from '../../client/database';

const validator = {
  parse(v: unknown) {
    const obj = v as { displayName?: unknown };
    if (typeof obj !== 'object' || obj === null || typeof obj.displayName !== 'string') {
      throw new TypeError('missing displayName');
    }
    return { displayName: obj.displayName, tier: 'free' as const };
  },
};

const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'cuid' }),
  tenantId: d.uuid(),
  meta: d.jsonb<{ displayName: string; tier: 'free' | 'pro' }>({ validator }),
});

describe('Feature: d.jsonb validator on writes', () => {
  describe('Given a meta column with a validator', () => {
    describe('When create() is called with an invalid payload', () => {
      it('Then returns { ok: false, error.code: "JSONB_VALIDATION_ERROR" } without reaching the driver', async () => {
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { install: d.model(installTable) },
          migrations: { autoApply: true },
        });
        const res = await db.install.create({
          data: { tenantId: 't1', meta: { wrong: true } as unknown as { displayName: string; tier: 'pro' } },
        });
        expect(res.ok).toBe(false);
        if (res.ok) throw new TypeError('expected failure');
        expect(res.error.code).toBe('JSONB_VALIDATION_ERROR');
        const typed = res.error as { table?: string; column?: string; value?: unknown };
        expect(typed.table).toBe('install');
        expect(typed.column).toBe('meta');
        expect(typed.value).toEqual({ wrong: true });
        const listed = await db.install.list({});
        expect(listed.ok).toBe(true);
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data).toHaveLength(0); // no row reached the DB
      });
    });

    describe('When create() is called with a value the validator coerces', () => {
      it('Then the persisted value equals the validator output, not the caller input', async () => {
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { install: d.model(installTable) },
          migrations: { autoApply: true },
        });
        const res = await db.install.create({
          data: { tenantId: 't1', meta: { displayName: 'Acme' } as { displayName: string; tier: 'pro' } },
        });
        expect(res.ok).toBe(true);
        const listed = await db.install.list({});
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data[0]!.meta).toEqual({ displayName: 'Acme', tier: 'free' });
      });
    });

    describe('When update() is called without the jsonb field', () => {
      it('Then the validator is not invoked', async () => {
        let calls = 0;
        const countingValidator = {
          parse(v: unknown) {
            calls++;
            return v as { displayName: string; tier: 'free' | 'pro' };
          },
        };
        const t = d.table('counted', {
          id: d.uuid().primary({ generate: 'cuid' }),
          tenantId: d.uuid(),
          meta: d.jsonb<{ displayName: string; tier: 'free' | 'pro' }>({ validator: countingValidator }),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { counted: d.model(t) },
          migrations: { autoApply: true },
        });
        const created = await db.counted.create({
          data: { tenantId: 't1', meta: { displayName: 'x', tier: 'free' } },
        });
        if (!created.ok) throw new TypeError('create failed');
        calls = 0;
        const updated = await db.counted.update({
          where: { id: created.data.id },
          data: { tenantId: 't2' },
        });
        expect(updated.ok).toBe(true);
        expect(calls).toBe(0);
      });
    });
  });
});
```

## Unknowns

*(None identified — the read-side wiring in PR #2870 already resolved the same invariants.)*

Resolved before writing this doc:
- **Is there an existing per-row hook we can piggy-back on?** No — `crud.ts` currently filters readOnly columns and fills generated IDs inline per write method. We add the validator step alongside.
- **Do `buildInsert` / `buildUpdate` mutate `data`?** No. They produce `{ sql, params }` without aliasing. Safe to pass a new object from the helper.
- **Does the Postgres driver double-validate?** No. `postgres.js` doesn't know about our validator. The validator runs once in `crud.ts` before SQL is built, and the driver never sees a `JsonbValidationError` thrown out of `crud.ts` because we throw before the driver call.
- **Does `isDbExpr` exist and mean what we need?** Yes — `packages/db/src/sql/expr.ts`. Already used in `update` / `upsert` to let auto-update columns pass through with a SQL expression; reusing it here keeps the same semantics.
- **What about the `'now'` sentinel injected by auto-update columns?** Handled structurally: timestamp columns have no `meta.validator`, so the helper's `!meta.validator` short-circuit skips them before the value-type check. The helper does **not** skip the literal string `'now'` by value (removed between rev 1 and rev 2), so a jsonb column carrying a legitimate payload equal to `'now'` is still validated.

## POC Results

**No POC required.** All mechanisms exist:
- `JsonbValidationError` already defined and wired through `toReadError` (`packages/db/src/errors.ts:133–142`).
- `toWriteError` follows the same pattern for `UniqueConstraintError` / `ForeignKeyError` etc.
- `crud.ts` already has per-write pre-processing (`fillGeneratedIds`, readOnly filtering) — we're adding one more step of the same kind.
- The validator-on-reads test matrix in `packages/db/src/client/__tests__/jsonb-parity.test.ts` gives us a template for the write-side matrix.

## Definition of Done

- [ ] `runJsonbValidators` helper added to `crud.ts`; invoked in `create`, `createMany`, `createManyAndReturn`, `update`, `updateMany`, `upsert` (both branches).
- [ ] Per-table `hasJsonbValidator` flag memoised via `WeakMap<TableDef, boolean>` so `createMany`'s hot loop is one WeakMap hit per row, not one column walk per row.
- [ ] `WriteError` union widened with `DbJsonbValidationError`.
- [ ] `toWriteError` maps `JsonbValidationError` → `DbJsonbValidationError` before the generic code-sniffing path.
- [ ] Acceptance test matrix passes on local SQLite across all seven write shapes.
- [ ] `createMany` batch atomicity test: invalid row at index 3 of 10 → zero rows persisted.
- [ ] Literal `'now'` jsonb value regression test (guards against the removed `'now'` skip).
- [ ] Fast-path regression test: 100-row `createMany` on a validator-free table — existing CRUD test suite unchanged proves the hot path.
- [ ] Postgres integration tests (valid + invalid create, valid + invalid update) pass against the PG harness when `$POSTGRES_URL` is set.
- [ ] Validator-transformed value is what gets persisted — asserted by a round-trip test.
- [ ] Validator is NOT invoked when the jsonb field is absent from the `update` payload — asserted by a call-count test.
- [ ] `.test-d.ts` confirms `DbJsonbValidationError` is assignable to `WriteError`, AND an exhaustive `switch` over `WriteError['code']` with a `never` default includes `'JSONB_VALIDATION_ERROR'`.
- [ ] Changeset added (`@vertz/db` patch). Body explicitly flags the `WriteError` union widening as the one caller-visible break — any exhaustive `switch (err.code)` default `satisfies never` will now need a `'JSONB_VALIDATION_ERROR'` arm.
- [ ] JSDoc on `d.jsonb` updated with the write-side sentence AND the `error.value` PII note.
- [ ] `packages/mint-docs/` JSONB section gets a one-paragraph update covering the write-side behaviour (the code example, the error code name, and the RETURNING-on-SQLite edge note).

Process:
- [x] Follow-up of #2850. Issue #2867 is this work. No further follow-ups filed.
