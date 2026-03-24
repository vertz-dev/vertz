# Composite Primary Keys in `d.table()`

**Issue:** [#1760](https://github.com/vertz-dev/vertz/issues/1760)
**Status:** Draft (Rev 2 — addressing review feedback)
**Date:** 2026-03-23

## Problem

`d.table()` only supports `.primary()` on a single column. There is no way to define composite primary keys (e.g., `(tenant_id, external_id)` or junction tables like `(user_id, role_id)`).

Cloud tables like `oauth_accounts(provider, provider_account_id)`, `tenant_members(tenant_id, user_id)`, and `entitlements(role_id, permission)` naturally use composite PKs. These tables currently work around the limitation with surrogate UUID PKs + unique indexes. This issue enables the natural composite PK pattern; migrating existing auth tables to use composite PKs is a **follow-up issue** after this lands.

## API Surface

### Table-level `primaryKey` option

```ts
// Composite PK via table options — type-safe, constrained to column names
const tenantMembers = d.table('tenant_members', {
  tenantId: d.uuid(),
  userId: d.uuid(),
  role: d.text().default('member'),
  joinedAt: d.timestamp().default('now'),
}, { primaryKey: ['tenantId', 'userId'] });

// Type inference:
// tenantMembers.$insert → { tenantId: string; userId: string; role?: string; joinedAt?: Date }
//   ↑ PK columns are REQUIRED (no hasDefault), non-PK columns with defaults are optional
// tenantMembers.$update → { role?: string; joinedAt?: Date }
//   ↑ PK columns excluded
// tenantMembers.$create_input → { tenantId: string; userId: string; role?: string; joinedAt?: Date }
//   ↑ Composite PK columns INCLUDED (unlike single-PK tables where the PK is auto-generated)
// tenantMembers.$update_input → { role?: string; joinedAt?: Date }
//   ↑ PK columns excluded
```

### `d.table()` overload signatures

```ts
// Overload 1: No primaryKey option (existing behavior, backward compatible)
table<TColumns extends ColumnRecord>(
  name: string,
  columns: TColumns,
  options?: TableOptions,
): TableDef<TColumns>;

// Overload 2: With primaryKey option (composite PK)
table<TColumns extends ColumnRecord, const TPK extends readonly (keyof TColumns & string)[]>(
  name: string,
  columns: TColumns,
  options: TableOptionsWithPK<TColumns, TPK>,
): TableDef<MarkAsPrimary<TColumns, TPK>>;
```

The `primaryKey` array is type-constrained to `keyof TColumns & string`. Referencing a non-existent column is a **compile-time error** (Principle 1: "If it builds, it works"). Runtime validation is belt-and-suspenders.

### Key DX difference: `.primary()` vs `primaryKey` option

| Aspect | `.primary()` (single-column) | `primaryKey: [...]` (composite) |
|--------|------------------------------|--------------------------------|
| `hasDefault` | `true` (auto-generated UUID) | `false` (externally provided) |
| `$insert` | PK column is **optional** | PK columns are **required** |
| `$create_input` | PK column **excluded** (server generates) | PK columns **included** (caller provides) |
| Auto-generation | UUID/CUID/nanoid via `generate` | None — values must be provided |

`primaryKey: ['id']` (single-element array) is **not** equivalent to `d.uuid().primary()`. The table-level option never sets `hasDefault: true` or `generate`. Use `.primary()` for auto-generated single PKs; use `primaryKey` for externally-provided PKs (whether single or composite).

### Single-column `.primary()` continues to work unchanged

```ts
// Existing API — no changes
const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
});
```

### Validation: mutual exclusion

```ts
// ERROR — can't use both .primary() and table-level primaryKey
const bad = d.table('bad', {
  id: d.uuid().primary(),  // column-level PK
  name: d.text(),
}, { primaryKey: ['id', 'name'] });  // table-level PK → throws at runtime
```

### Composite PK columns with `.default()`

If a `primaryKey` column also has `.default()`, the column retains `hasDefault: true` and remains **optional** in `$insert`. This is correct — the developer explicitly provided a default. The `MarkAsPrimary` type only adds `primary: true`; it does NOT override existing `hasDefault`.

```ts
const events = d.table('events', {
  tenantId: d.uuid(),
  eventDate: d.timestamp().default('now'), // has default
  name: d.text(),
}, { primaryKey: ['tenantId', 'eventDate'] });

// events.$insert → { tenantId: string; name: string; eventDate?: Date }
//   tenantId: required (no default) ✓
//   eventDate: optional (has default) ✓
//   name: required (no default) ✓
// events.$update → { name?: string }
//   Both PK columns excluded ✓
```

### Foreign keys referencing composite-PK tables

Foreign keys point to the target table's primary key. For composite-PK tables, FK resolution uses the **first** PK column. This is the existing behavior and covers the common case where `d.ref.one()` references a single FK column.

Multi-column FKs (composite FK → composite PK) are a **non-goal** for this issue. The current FK model (`column` → `targetColumn`) stays single-column.

### `findPkColumns()` replaces `findPkColumn()`

```ts
// Before: returns string (first PK column)
function findPkColumn(table): string

// After: returns string[] (all PK columns)
function findPkColumns(table): string[]
```

All callers updated. For single-PK tables, returns `['id']`-style single-element array.

**All single-PK-assuming functions across the codebase:**

| Function | Location | Scope |
|----------|----------|-------|
| `findPkColumn()` | `packages/db/src/migration/snapshot.ts` | Updated in Phase 3 |
| `resolvePkColumn()` | `packages/db/src/query/relation-loader.ts` | Documented limitation in Phase 4 |
| `resolvePrimaryKeyColumn()` | `packages/server/src/entity/crud-pipeline.ts` | Out of scope — entity layer non-goal |
| `resolvePrimaryKey()` | `packages/server/src/entity/tenant-chain.ts` | Out of scope — entity layer non-goal |

## Manifesto Alignment

- **"If it builds, it works"** — Composite PK columns become required in `$insert` at the type level. The `primaryKey` option is type-constrained to valid column names. Invalid column references are compile-time errors.
- **"One way to do things"** — Table-level `primaryKey` for composites/externally-provided PKs, column-level `.primary()` for auto-generated single PKs. Mutually exclusive, each has one clear use case.
- **"AI agents are first-class users"** — The `primaryKey: ['col1', 'col2']` option reads naturally. LLMs already know this pattern from Sequelize, Drizzle, Prisma.

## Non-Goals

- **Composite foreign keys** — Multi-column FK constraints (`FOREIGN KEY (a, b) REFERENCES target (x, y)`) are out of scope. The current single-column FK model is sufficient for now.
- **Ordered composite keys** — No explicit ordering within the composite key beyond array position. The order in the `primaryKey` array determines the SQL `PRIMARY KEY (...)` column order.
- **Migration: altering PKs** — Adding/removing columns from an existing composite PK via migration diffing is not addressed. This is a `table_added`-only feature for now. The differ will **warn** if a PK flag change is detected but will not emit ALTER SQL.
- **Auto-generation on composite PKs** — Composite PK columns don't get `generate: 'uuid'` auto-assigned. Each column value must be provided explicitly (unless the column has `.default()`).
- **Entity layer composite PK support** — The entity CRUD pipeline (`@vertz/server`) assumes single-PK tables for route generation (`/:id`), cursor pagination, and PK-based lookups. Using a composite-PK table with `entity()` is **unsupported**. A runtime guard will be added to throw a clear error if attempted (see Phase 4). Full entity-layer composite PK support is a separate issue.
- **Auth table migration** — Migrating existing auth tables (`oauth_accounts`, `tenant_members`, `entitlements`) from surrogate keys to composite PKs is a follow-up issue after this feature lands.

## Unknowns

None identified. All initial unknowns resolved during review.

## Type Flow Map

```
d.table('t', columns, { primaryKey: ['a', 'b'] })
  ↓
Overload 2: TPK inferred as readonly ['a', 'b']
  ↓
createTable() validates: columns exist, no .primary() on any column
  ↓
Clones PK columns with primary: true (preserves existing hasDefault)
  ↓
Returns TableDef<MarkAsPrimary<TColumns, TPK>>
  ↓
MarkAsPrimary: for each K in TPK[number], Omit<Meta, 'primary'> & { primary: true }
  ↓
$insert: ColumnKeysWhereNot<Marked, 'hasDefault'> → PK columns without default are REQUIRED
$update: ColumnKeysWhereNot<Marked, 'primary'> → PK columns are EXCLUDED
$create_input: PK columns INCLUDED (primary: true but hasDefault may be false)
  ↓
Snapshot: columns[col].primary = true for each PK column
  ↓
SQL generator: PRIMARY KEY ("a", "b") — already works (collects all primary columns)
```

### `MarkAsPrimary` mapped type

```ts
type MarkAsPrimary<TColumns extends ColumnRecord, TPK extends readonly string[]> = {
  [K in keyof TColumns]: K extends TPK[number]
    ? ColumnBuilder<
        InferColumnType<TColumns[K]>,
        Omit<TColumns[K] extends ColumnBuilder<unknown, infer M> ? M : never, 'primary'> & {
          readonly primary: true;
        }
      >
    : TColumns[K];
};
```

This `Omit`s only `'primary'` and adds `primary: true`. Existing `hasDefault` is preserved — if a PK column has `.default()`, it stays optional in `$insert`. If it doesn't, it's required. This is correct because the `primaryKey` option is for externally-provided PKs where the developer controls the default behavior per column.

### `$create_input` for composite PKs

The existing `ApiCreateInput` type excludes columns with `primary: true`. For composite-PK junction tables, this is wrong — the API caller needs to provide the PK values (e.g., `tenantId` and `userId` to create a membership).

**Solution:** `$create_input` excludes PK columns that have `hasDefault: true` (auto-generated single PKs) but includes PK columns that have `hasDefault: false` (composite PKs without defaults). This means the behavior is:
- `.primary()` → `hasDefault: true` → excluded from `$create_input` ✓
- `primaryKey: ['a', 'b']` where a/b have no default → `hasDefault: false` → included in `$create_input` ✓

Updated type:

```ts
type ApiCreateInput<T extends ColumnRecord> = {
  // Required: non-readOnly, non-auto-PK, no default
  [K in ColumnKeysWhereNot<T, 'isReadOnly'> &
    ColumnKeysWhereNot<T, 'hasDefault'> &
    string]: InferColumnType<T[K]>;
} & {
  // Optional: non-readOnly, non-auto-PK, has default
  [K in ColumnKeysWhereNot<T, 'isReadOnly'> &
    ColumnKeysWhere<T, 'hasDefault'> &
    string]?: InferColumnType<T[K]>;
};
```

The key change: remove the `ColumnKeysWhereNot<T, 'primary'>` filter from `ApiCreateInput`. Instead, PK columns are included/excluded based on their `hasDefault` status alone. Single-column `.primary()` sets `hasDefault: true` → optional. Composite PK columns without `.default()` have `hasDefault: false` → required.

## E2E Acceptance Test

```ts
import { describe, it, expect } from 'bun:test';
import { d } from '@vertz/db';

describe('Feature: Composite primary keys', () => {
  describe('Given a table with composite primary key', () => {
    const tenantMembers = d.table('tenant_members', {
      tenantId: d.uuid(),
      userId: d.uuid(),
      role: d.text().default('member'),
      joinedAt: d.timestamp().default('now'),
    }, { primaryKey: ['tenantId', 'userId'] });

    describe('When checking column metadata', () => {
      it('Then marks PK columns as primary', () => {
        expect(tenantMembers._columns.tenantId._meta.primary).toBe(true);
        expect(tenantMembers._columns.userId._meta.primary).toBe(true);
        expect(tenantMembers._columns.role._meta.primary).toBe(false);
      });

      it('Then PK columns do NOT have hasDefault', () => {
        expect(tenantMembers._columns.tenantId._meta.hasDefault).toBe(false);
        expect(tenantMembers._columns.userId._meta.hasDefault).toBe(false);
      });
    });

    describe('When inferring Insert type', () => {
      it('Then requires both tenantId and userId (no hasDefault)', () => {
        type Insert = typeof tenantMembers.$insert;
        const valid: Insert = { tenantId: '123', userId: '456' };
        // @ts-expect-error — userId is required
        const invalid: Insert = { tenantId: '123' };
      });
    });

    describe('When inferring Update type', () => {
      it('Then excludes both PK columns from updatable fields', () => {
        type Update = typeof tenantMembers.$update;
        const valid: Update = { role: 'admin' };
        // Verified: Not<HasKey<Update, 'tenantId'>> and Not<HasKey<Update, 'userId'>>
      });
    });

    describe('When inferring $create_input type', () => {
      it('Then includes composite PK columns (externally provided)', () => {
        type CreateInput = typeof tenantMembers.$create_input;
        const valid: CreateInput = { tenantId: '123', userId: '456' };
        // @ts-expect-error — tenantId is required in create input
        const invalid: CreateInput = { role: 'admin' };
      });
    });

    describe('When generating migration SQL', () => {
      it('Then emits PRIMARY KEY ("tenant_id", "user_id")', () => {
        // Snapshot + SQL generator test
      });
    });
  });

  describe('Given a table with single .primary() column', () => {
    describe('When using existing API', () => {
      it('Then continues to work unchanged (backward compatible)', () => {
        const users = d.table('users', {
          id: d.uuid().primary(),
          name: d.text(),
        });
        expect(users._columns.id._meta.primary).toBe(true);
        expect(users._columns.id._meta.hasDefault).toBe(true);
      });
    });
  });

  describe('Given both .primary() and primaryKey option', () => {
    it('Then throws a validation error', () => {
      expect(() =>
        d.table('bad', {
          id: d.uuid().primary(),
          name: d.text(),
        }, { primaryKey: ['id', 'name'] }),
      ).toThrow(/Cannot use both/);
    });
  });

  describe('Given upsert on a composite-PK table', () => {
    it('Then upserts correctly using composite key as conflict target', () => {
      // Upsert with where: { tenantId: 'x', userId: 'y' }
      // Both PK columns used as conflict target
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Schema Layer — `primaryKey` table option + column metadata

**Goal:** `d.table()` accepts `primaryKey` option, marks columns as `primary: true` at runtime, validates constraints.

**Changes:**
- `packages/db/src/schema/column.ts` — Export `createColumnWithMeta` (or a thin `cloneMeta` wrapper) so `createTable()` can clone columns with overridden metadata.
- `packages/db/src/schema/table.ts`:
  - Add `primaryKey?: readonly string[]` to `TableOptions` (and a generic `TableOptionsWithPK<TColumns, TPK>` variant for the typed overload)
  - Add `_primaryKey: readonly string[]` to `TableDef`
  - Modify `createTable()` to:
    1. Validate `primaryKey` columns exist in the column record
    2. Validate no column has `.primary()` when `primaryKey` is used
    3. Clone PK columns with `primary: true` metadata (preserving existing `hasDefault`)
    4. Derive `_primaryKey` from column metadata (either from `primaryKey` option or from column-level `.primary()`)
  - Add `MarkAsPrimary<TColumns, TPK>` mapped type
- `packages/db/src/d.ts` — Add overloaded `d.table` type signatures (with and without `primaryKey`)

**Acceptance criteria:**
```ts
describe('Given d.table() with primaryKey option', () => {
  describe('When creating a table with composite PK', () => {
    it('Then _primaryKey contains the specified columns', () => {});
    it('Then PK columns have primary: true metadata', () => {});
    it('Then PK columns preserve their existing hasDefault', () => {});
    it('Then non-PK columns are unchanged', () => {});
  });
  describe('When using .primary() alongside primaryKey', () => {
    it('Then throws validation error', () => {});
  });
  describe('When primaryKey references non-existent column', () => {
    it('Then throws validation error at runtime', () => {});
    // Also: compile-time error via type constraint
  });
  describe('When using single-column .primary()', () => {
    it('Then _primaryKey is derived from the primary column', () => {});
    it('Then behavior is backward compatible', () => {});
  });
  describe('When primaryKey column has .default()', () => {
    it('Then column retains hasDefault: true', () => {});
    it('Then column is optional in $insert', () => {});
  });
});
```

### Phase 2: Type Inference — `$insert`, `$update`, `$create_input`, `$update_input`

**Goal:** Composite PK columns are required in `$insert` (not optional), excluded from `$update`, and included in `$create_input`.

**Changes:**
- `packages/db/src/schema/table.ts`:
  - Existing `Insert` and `Update` types already work correctly because `MarkAsPrimary` sets `primary: true` on composite PK columns. `Insert` reads `hasDefault`, `Update` reads `primary`. No changes to these types.
  - `ApiCreateInput` — Remove the `ColumnKeysWhereNot<T, 'primary'>` filter. PK column inclusion is now determined solely by `hasDefault`. This means:
    - `.primary()` columns: `hasDefault: true` → optional in `$create_input` (excluded by omission since they'll be in the optional bucket)
    - Composite PK columns without `.default()`: `hasDefault: false` → required in `$create_input`
  - Add `.test-d.ts` type tests for all derived types with composite PK

**Acceptance criteria:**
```ts
describe('Given a composite-PK table', () => {
  describe('When checking $insert type', () => {
    it('Then PK columns without .default() are required', () => {});
    it('Then PK columns with .default() are optional', () => {});
    it('Then non-PK columns with .default() are still optional', () => {});
  });
  describe('When checking $update type', () => {
    it('Then all PK columns are excluded', () => {});
    it('Then non-PK columns are optional', () => {});
  });
  describe('When checking $create_input type', () => {
    it('Then composite PK columns without .default() are required', () => {});
    it('Then composite PK columns with .default() are optional', () => {});
  });
  describe('When checking $update_input type', () => {
    it('Then all PK columns are excluded', () => {});
  });
  describe('When checking single-column .primary() $create_input', () => {
    it('Then auto-generated PK is still optional (backward compat)', () => {});
  });
});
```

### Phase 3: Migration — snapshot + SQL generation + diffing

**Goal:** Composite PKs flow through to snapshots and produce correct `PRIMARY KEY (col1, col2)` SQL. Differ warns on PK flag changes.

**Changes:**
- `packages/db/src/migration/snapshot.ts`:
  - `findPkColumn()` → `findPkColumns()` returning `string[]`
  - Update `deriveForeignKeys()` to use `findPkColumns()[0]` (first PK column for single-column FK)
  - `createSnapshot()` already reads `col._meta.primary` per column — no change needed since we set `primary: true` on composite PK columns in Phase 1
- `packages/db/src/migration/sql-generator.ts` — Already handles multiple `primary: true` columns (lines 206-215). No changes needed. Verified by tech review.
- `packages/db/src/migration/differ.ts`:
  - Add PK flag change detection in the `column_altered` section. If `beforeCol.primary !== afterCol.primary`, emit a console warning: `"Primary key change detected on column '${colName}' in table '${tableName}'. ALTER PRIMARY KEY is not supported — recreate the table or manage this migration manually."`
  - This is a warning only — no SQL emitted.

**Acceptance criteria:**
```ts
describe('Given a composite-PK table snapshot', () => {
  describe('When generating migration SQL', () => {
    it('Then emits PRIMARY KEY with all composite columns', () => {});
  });
  describe('When resolving FK to composite-PK table', () => {
    it('Then uses first PK column as target', () => {});
  });
  describe('When diffing snapshots with composite PK', () => {
    it('Then correctly detects table addition', () => {});
  });
  describe('When differ detects PK flag change on existing column', () => {
    it('Then emits a console warning', () => {});
    it('Then does NOT emit ALTER SQL', () => {});
  });
});
```

### Phase 4: Query Layer + entity guard

**Goal:** Query helpers and relation loader work with composite PKs. Entity layer rejects composite-PK tables with a clear error.

**Changes:**
- `packages/db/src/query/helpers.ts` — `getPrimaryKeyColumns()` already returns `string[]` — no changes needed.
- `packages/db/src/query/relation-loader.ts` — `resolvePkColumn()` returns first PK column. Add a documenting comment about the limitation. No behavioral change.
- `packages/db/src/query/crud.ts` — `fillGeneratedIds()` iterates all columns with `generate` strategy. Composite PK columns won't have `generate`, so no changes needed. Add upsert test with composite PK (using all PK columns as `where` clause).
- `packages/server/src/entity/crud-pipeline.ts` — In `createCrudPipeline()` (or `resolvePrimaryKeyColumn()`), add a runtime check: if `getPrimaryKeyColumns(table).length > 1`, throw `"Entity CRUD does not support composite primary keys. Table '${table._name}' has composite PK: [${pkCols.join(', ')}]. Use direct database queries or define a surrogate single-column PK."`.

**Acceptance criteria:**
```ts
describe('Given a composite-PK table', () => {
  describe('When calling getPrimaryKeyColumns()', () => {
    it('Then returns all PK column names', () => {});
  });
  describe('When using relation loader', () => {
    it('Then resolves first PK column for FK lookup', () => {});
  });
  describe('When creating a row', () => {
    it('Then does not auto-generate IDs for composite PK columns', () => {});
  });
  describe('When upserting with composite PK where clause', () => {
    it('Then uses all PK columns as conflict target', () => {});
  });
  describe('When entity() is used with a composite-PK table', () => {
    it('Then throws a clear error at route generation time', () => {});
  });
});
```
