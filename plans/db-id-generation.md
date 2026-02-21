# Design: Auto ID Generation in @vertz/db

**Status:** Approved (v3 — review feedback addressed)
**Author:** mike
**Date:** 2026-02-20
**Package:** `@vertz/db`

## Problem

Users must manually generate IDs before every insert:

```typescript
import { createId } from '@paralleldrive/cuid2';

const user = await db.create(users, {
  id: createId(),  // ← manual, every time
  name: 'Alice',
});
```

This is a paper cut for anyone using `@vertz/db` standalone. The DB package knows which column is the primary key and what type it is — it should handle this.

## Design

### Schema API

ID generation strategy is configured via `.primary()` options:

```typescript
const users = d.table('users', {
  id: d.text().primary({ generate: 'cuid' }),
  name: d.text(),
  email: d.text(),
});
```

No chain-order sensitivity. No separate `.generate()` method. Primary key config stays in one place.

Supported strategies:

| Strategy | Output | Use Case |
|----------|--------|----------|
| `'cuid'` | `clx7k2m...` (24 chars) | Default recommendation. URL-safe, collision-resistant, non-sequential |
| `'uuid'` | `0192d4e0-b1a8-7...` (v7, time-sortable) | Chronological index ordering, interop with UUID-based systems |
| `'nanoid'` | `V1StGXR8_Z5j...` (21 chars) | Short, URL-safe |

**No `'ulid'`** — similar to cuid but less adopted. Add later if demanded.

**No `'auto-increment'` / `'serial'`** — Postgres handles these natively via `d.serial()`. The `generate` option is for application-side generation only.

### Rules

1. `generate` is an option on `.primary()`. No chain-order issues — it's a single method call.
2. `.primary({ generate })` implies `hasDefault: true` — the column is optional in `$create_input` types. (Note: `.primary()` already sets `hasDefault: true`, so this is consistent.)
3. User-provided IDs are **always respected**. Generation only fires when the value is `undefined` or not present in the data object. Explicit `null` is treated as a user-provided value (not generated) — this lets users intentionally pass null for nullable PKs or trigger DB-level defaults.
4. `.primary()` without `generate` keeps current behavior — user must provide the ID (though `hasDefault: true` makes it optional in types — this is existing behavior, not new).
5. `generate` is only valid on string-type columns (`text`, `uuid`, `varchar`). On `integer`/`serial` columns, the TypeScript overload rejects it.

### Runtime: Where Generation Happens

In `crud.ts`, the `create()`, `createMany()`, `createManyAndReturn()`, and `upsert()` functions check primary key columns before building the INSERT.

The table metadata is already available — `create()` receives `table: TableDef<ColumnRecord>`, which has `table._columns` with full column metadata.

```typescript
// New helper in crud.ts or helpers.ts
function fillGeneratedIds(
  table: TableDef<ColumnRecord>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const filled = { ...data };
  for (const [name, col] of Object.entries(table._columns)) {
    const meta = (col as ColumnBuilder<unknown, ColumnMetadata>)._meta;
    if (meta.generate && filled[name] === undefined) {
      filled[name] = generateId(meta.generate);
    }
  }
  return filled;
}
```

**Ordering constraint:** `fillGeneratedIds()` must run **before** the readOnly column filter. If a PK column has both `generate` and `readOnly`, the ID must be generated first, then readOnly filtering skips it (since it's now present). In practice: fill IDs → filter readOnly → build INSERT.

Applied in each create path:

- **`create()`** — fill before readOnly filter and `buildInsert()`
- **`createMany()`** — fill per row before readOnly filter and `buildInsert()`
- **`createManyAndReturn()`** — fill per row before readOnly filter and `buildInsert()`
- **`upsert()`** — fill on the `create` data path before readOnly filter and `buildInsert()`

### ID Generators Module

New file: `packages/db/src/id/generators.ts`

```typescript
import { createId } from '@paralleldrive/cuid2';
import { v7 as uuidv7 } from 'uuid';
import { nanoid } from 'nanoid';

export type IdStrategy = 'cuid' | 'uuid' | 'nanoid';

export function generateId(strategy: IdStrategy): string {
  switch (strategy) {
    case 'cuid': return createId();
    case 'uuid': return uuidv7();
    case 'nanoid': return nanoid();
  }
}
```

**Dependencies:**
- `cuid` → `@paralleldrive/cuid2` (~5KB)
- `uuid` → `uuid` package v7 (time-sortable, better for PK indexes than random v4)
- `nanoid` → `nanoid` (~1KB)

All synchronous. No async in the insert path.

### Column Metadata Extension

```typescript
// In column.ts — add to ColumnMetadata interface
interface ColumnMetadata {
  // ... existing fields
  readonly generate?: IdStrategy;
}
```

Add to `DefaultMeta`:
```typescript
readonly generate?: undefined;
```

### `.primary()` Signature Change

Current:
```typescript
primary(): ColumnBuilder<TType, Omit<TMeta, 'primary' | 'hasDefault'> & { readonly primary: true; readonly hasDefault: true }>;
```

New — add optional config parameter:
```typescript
primary(options?: { generate?: IdStrategy }): ColumnBuilder<
  TType,
  Omit<TMeta, 'primary' | 'hasDefault' | 'generateStrategy'> & {
    readonly primary: true;
    readonly hasDefault: true;
    readonly generate: /* inferred from options */;
  }
>;
```

**Type-level guard for integer columns**: The `generate` option is only available when `TType extends string`. We add an overload:

```typescript
// On columns where TType extends string — generate allowed
primary(options?: { generate?: IdStrategy }): ColumnBuilder<...>;

// On columns where TType is number — no generate option
primary(): ColumnBuilder<...>;
```

This means `d.integer().primary({ generate: 'cuid' })` is a compile error. Clean, no runtime surprises.

### Runtime Implementation in `column.ts`

```typescript
primary(options?: { generate?: string }) {
  return cloneWith(this, {
    primary: true,
    hasDefault: true,
    ...(options?.generate ? { generate: options.generate } : {}),
  }) as ReturnType<ColumnBuilder<unknown, ColumnMetadata>['primary']>;
}
```

### Return Types

`create()` returns the full row via `RETURNING *`. The generated ID is always present in the returned object. The return type is the full row type (not `$create_input`), so `id` is non-optional in the result. No changes needed.

### Entity Layer Interaction

The entity layer (`@vertz/server`) calls `db.create()`. Since the DB package now handles ID generation, the entity CRUD pipeline needs **zero changes**. It just stops getting errors when users omit the ID.

If an entity needs a custom ID strategy, it can provide the ID in the action's `beforeCreate` hook — the DB layer respects user-provided values.

## Edge Cases

### 1. Composite Primary Keys
Not supported with `generate`. Composite keys use `d.primaryKey([...])` at the table level, not `.primary()` on individual columns. If someone does use `.primary()` on multiple columns, each can independently have `generate` or not.

### 2. Non-String Primary Keys
`d.integer().primary({ generate: 'cuid' })` → **compile error** via TypeScript overloads. `d.serial().primary()` → no generate (DB handles auto-increment).

### 3. Transactions
ID generation is in-process, synchronous, before the INSERT. Generated ID is available immediately within the transaction scope. No special handling.

### 4. `upsert()` Create Path
The `create` data in `upsert({ create, update, where })` goes through the same `fillGeneratedIds()`. If the PK is missing from `create` data and has a generate strategy, it's filled in.

### 5. User Provides ID
Always respected. `fillGeneratedIds` only acts when the value is `undefined`. Explicitly passing `id: myCustomId` works exactly as before.

### 6. Batch Inserts with `createMany()`
Each row gets its own generated ID. The `fillGeneratedIds` helper runs per-row in the `.map()` that already exists for filtering readOnly columns.

## Migration Path

**Non-breaking.** Existing code that provides IDs manually continues to work unchanged. The `generate` option is opt-in.

```diff
 const users = d.table('users', {
-  id: d.text().primary(),
+  id: d.text().primary({ generate: 'cuid' }),
   name: d.text(),
 });

 // Before: had to provide ID
-const user = await db.create(users, { id: createId(), name: 'Alice' });
+// After: ID auto-generated
+const user = await db.create(users, { name: 'Alice' });
+// user.id → 'clx7k2m...'
```

## Files Changed

| File | Change |
|------|--------|
| `packages/db/src/schema/column.ts` | Add `generateStrategy` to `ColumnMetadata`, update `.primary()` signature and implementation |
| `packages/db/src/id/generators.ts` | **New** — `generateId()` function, `IdStrategy` type |
| `packages/db/src/id/index.ts` | **New** — barrel export |
| `packages/db/src/query/crud.ts` | Add `fillGeneratedIds()` helper, call in `create()`, `createMany()`, `createManyAndReturn()`, `upsert()` |
| `packages/db/src/query/helpers.ts` | Optionally move `fillGeneratedIds` here (alongside `getTimestampColumns` etc.) |
| `packages/db/package.json` | Add `@paralleldrive/cuid2`, `uuid`, `nanoid` dependencies |

**No changes to:** `d.ts`, `type-gen.ts`/`table.ts` (types already handle `hasDefault`), `buildInsert`/`insert.ts` (receives complete data), entity layer.

## Tests

1. **`primary({ generate: 'cuid' })`** — insert without ID → row has a cuid-format ID
2. **`primary({ generate: 'uuid' })`** — insert without ID → row has a UUIDv7-format ID
3. **`primary({ generate: 'nanoid' })`** — insert without ID → row has a nanoid-format ID
4. **User-provided ID respected** — insert with explicit ID → that ID is used, not overwritten
5. **`createMany()` generates unique IDs** — batch insert of 100 rows → 100 unique IDs
6. **`createManyAndReturn()` returns generated IDs** — each returned row has a unique ID
7. **`upsert()` create path generates ID** — upsert with missing PK in create data → ID generated
8. **No `generate` → current behavior** — `.primary()` without options works as before
9. **`d.integer().primary({ generate: 'cuid' })`** → TypeScript compile error
10. **`d.serial().primary()`** → no generate, DB handles auto-increment
11. **Composite key — partial generate** — one column with generate, other without
12. **Transaction** — generated ID available within transaction scope
13. **Column metadata** — `._meta.generate` correctly set to the strategy string
14. **`generateId()` unit tests** — each strategy returns correct format, uniqueness over 1000 calls

## Open Questions

None. Contained change within `@vertz/db`.
