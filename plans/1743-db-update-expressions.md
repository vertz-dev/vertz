# Update Expressions for `@vertz/db`

**Issue:** #1743
**Status:** Approved — implementing
**Date:** 2026-04-04

## Problem

`@vertz/db`'s `update()` only supports direct value assignments. Atomic operations like `SET click_count = click_count + 1` require dropping to raw SQL, which bypasses the typed client, loses camelCase mapping, and skips autoUpdate columns.

The original issue proposed Prisma-style `{ increment: 1 }` objects. This design expands the scope: instead of special-casing arithmetic, we provide a **general-purpose column expression** that covers increment, decrement, SQL functions, and anything else — through a single primitive.

## API Surface

### Core: `d.expr()` — column-relative SQL expression

```typescript
import { d } from '@vertz/db';
import { sql } from '@vertz/db/sql';

// Atomic increment
db.urls.update({
  where: { id },
  data: {
    clickCount: d.expr((col) => sql`${col} + ${1}`),
  },
});
// → UPDATE "urls" SET "click_count" = "click_count" + $1 WHERE "id" = $2

// SQL function
db.urls.update({
  where: { id },
  data: {
    slug: d.expr((col) => sql`LOWER(${col})`),
  },
});
// → UPDATE "urls" SET "slug" = LOWER("slug") WHERE "id" = $1

// Complex expression with parameters
db.scores.update({
  where: { id },
  data: {
    score: d.expr((col) => sql`GREATEST(${col} - ${penalty}, ${0})`),
  },
});
// → UPDATE "scores" SET "score" = GREATEST("score" - $1, $2) WHERE "id" = $3

// JSONB merge
db.configs.update({
  where: { id },
  data: {
    settings: d.expr((col) => sql`${col} || ${JSON.stringify({ theme: 'dark' })}::jsonb`),
  },
});
```

The `col` callback parameter is a `SqlFragment` containing the quoted, snake_case column reference (`"click_count"`). Users never need to know the DB column name — it's derived from the camelCase key.

### Convenience shortcuts

For the most common operations (arithmetic), provide named helpers built on `d.expr()`:

```typescript
import { d } from '@vertz/db';

db.urls.update({
  where: { id },
  data: {
    clickCount: d.increment(1),
    // → SET "click_count" = "click_count" + $1
  },
});

db.products.update({
  where: { id },
  data: {
    stock: d.decrement(quantity),
    // → SET "stock" = "stock" - $1
  },
});

// For multiply/divide, use d.expr() directly:
db.accounts.update({
  where: { id },
  data: {
    balance: d.expr((col) => sql`${col} * ${1.05}`),
    // → SET "balance" = "balance" * $1
  },
});
```

### Mixed usage — expressions and direct values together

```typescript
db.urls.update({
  where: { id },
  data: {
    clickCount: d.increment(1),     // expression
    lastClickedAt: new Date(),      // direct value
    // updatedAt is auto-set via autoUpdate (existing behavior)
  },
});
// → UPDATE "urls"
//   SET "click_count" = "click_count" + $1,
//       "last_clicked_at" = $2,
//       "updated_at" = NOW()
//   WHERE "id" = $3
//   RETURNING ...
```

### Works with `upsert()` too

Expressions work in the `update` path of upsert (ON CONFLICT DO UPDATE SET):

```typescript
db.urls.upsert({
  where: { slug: 'test' },
  create: { slug: 'test', target: 'https://example.com', clickCount: 1 },
  update: { clickCount: d.increment(1) },
});
// → INSERT INTO "urls" (...) VALUES (...)
//   ON CONFLICT ("slug") DO UPDATE SET "click_count" = "click_count" + $N
```

### Works with `updateMany()` too

```typescript
db.products.updateMany({
  where: { categoryId },
  data: {
    price: d.expr((col) => sql`${col} * ${1.1}`),  // 10% price increase for a category
  },
});
```

### Runtime representation

```typescript
// packages/db/src/sql/expr.ts

import type { SqlFragment } from './tagged';

export interface DbExpr {
  readonly _tag: 'DbExpr';
  readonly build: (columnRef: SqlFragment) => SqlFragment;
}

export function isDbExpr(value: unknown): value is DbExpr {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_tag' in value &&
    (value as DbExpr)._tag === 'DbExpr'
  );
}
```

### Type changes

The update input types widen to accept `DbExpr` alongside the column's inferred type:

```typescript
// packages/db/src/schema/table.ts

import type { DbExpr } from '../sql/expr';

type Update<T extends ColumnRecord> = {
  [K in ColumnKeysWhereNot<T, 'primary'>]?: InferColumnType<T[K]> | DbExpr;
};

type ApiUpdateInput<T extends ColumnRecord> = {
  [K in ColumnKeysWhereNot<T, 'isReadOnly'> &
    ColumnKeysWhereNot<T, 'primary'> &
    string]?: InferColumnType<T[K]> | DbExpr;
};
```

### `d` namespace additions

```typescript
// Added to packages/db/src/d.ts

import { sql } from './sql/tagged';
import type { DbExpr } from './sql/expr';

// On the `d` object:
expr(build: (col: SqlFragment) => SqlFragment): DbExpr;
increment(value: number): DbExpr;
decrement(value: number): DbExpr;
```

Implementation:

```typescript
expr: (build) => ({ _tag: 'DbExpr', build }),
increment: (n) => ({ _tag: 'DbExpr', build: (col) => sql`${col} + ${n}` }),
decrement: (n) => ({ _tag: 'DbExpr', build: (col) => sql`${col} - ${n}` }),
```

### Public exports

```typescript
// packages/db/src/index.ts — add:
export type { DbExpr } from './sql/expr';
export { isDbExpr } from './sql/expr';
export { sql } from './sql/tagged';  // re-export so d.expr() doesn't need a second import path

// packages/db/src/sql/index.ts — add:
export type { DbExpr } from './expr';
export { isDbExpr } from './expr';
```

## Manifesto Alignment

### One Way to Do Things
`d.expr()` is the single primitive. Shortcuts (`d.increment`, etc.) are sugar built on top — not alternative patterns. There's one mechanism, one detection path, one way the SQL is composed.

### Explicit Over Implicit
The callback `(col) => sql`${col} + ${1}`` makes the SQL transformation visible. No hidden behavior — you can read exactly what SQL will be generated. Compare to Prisma's `{ increment: 1 }` where the mapping is opaque.

### LLM-First
- `d.increment(1)` is obvious — an LLM will get it right on first prompt
- `d.expr(col => sql`${col} + ${1}`)` is composable and follows existing `sql` template patterns
- No snake_case knowledge needed — `col` is auto-derived

### If It Builds, It Works
`DbExpr` is accepted on any column type. While we could add `NumericDbExpr` that only accepts numeric columns, the complexity isn't worth it pre-v1. The DB will error on type mismatches (e.g., `d.increment(1)` on a text column), which is a clear, immediate error — not a silent corruption.

### Functions Over Decorators
`d.expr()` is a pure function returning a data descriptor. No decorators, no class inheritance, no magic.

## Alternatives Rejected

### 1. Prisma-style `{ increment: 1 }` objects
```typescript
data: { clickCount: { increment: 1 } }
```
**Rejected because:** Overfits to arithmetic. Can't express `UPPER(col)`, `COALESCE(col, 0)`, JSONB merge, or any non-arithmetic operation. Would need a new special case for each SQL function. Also ambiguous with JSONB columns where `{ increment: 1 }` could be a valid JSON value.

### 2. Bare `SqlFragment` as value (no self-reference)
```typescript
data: { clickCount: sql`"click_count" + ${1}` }
```
**Rejected because:** Requires knowing the snake_case column name. Duplicates the column reference (key + SQL). Error-prone — typo in the column name is a silent bug. Violates "if it builds, it works."

### 3. Magic `d.self` marker in SQL template
```typescript
data: { clickCount: sql`${d.self} + ${1}` }
```
**Rejected because:** `d.self` is a global marker resolved at build time — implicit and magical. The callback pattern `d.expr(col => ...)` is explicit about scope.

## Non-Goals

1. **INSERT expressions** — `d.expr()` references the current column value, which doesn't exist during INSERT. Timestamp defaults (`'now'` sentinel) are a separate mechanism and out of scope.
2. **Cross-column references** — `d.expr()` only exposes the current column. Cross-column SET (e.g., `SET a = b + 1`) is rare in app code and can use raw `db.query(sql`...`)`.
3. **Typed expression constraints** — No `NumericDbExpr` that restricts to numeric columns. The DB validates types at execution time, which is sufficient pre-v1.
4. **Dialect-specific functions** — The `sql` template composes raw SQL strings. Users are responsible for dialect-appropriate SQL within `d.expr()`. The shortcuts (`increment`, etc.) use standard SQL operators that work across PostgreSQL and SQLite.
5. **Replacing the `'now'` sentinel** — The existing `autoUpdate` / `'now'` pattern works and is internal. Replacing it with `d.expr()` would be a nice cleanup but is a separate concern.

## Unknowns

None identified. The implementation touches well-understood code paths (`buildUpdate`, `crud.update`, `crud.updateMany`) and the `SqlFragment` composition mechanism is already battle-tested in the `sql` tagged template.

## Review Findings (addressed)

### 1. `renumberParams` not exported (Technical — blocker)

`renumberParams()` in `tagged.ts` is private. `buildUpdate()` needs it to compose expression fragments. **Resolution:** Export a dialect-aware variant `renumberParamsWithDialect()` that replaces `$N` with `dialect.param(offset + N)`. This ensures SQLite compatibility (`?` instead of `$N`).

```typescript
// In tagged.ts — new export
export function renumberParamsWithDialect(
  sqlStr: string,
  offset: number,
  dialect: Dialect,
): string {
  let counter = 0;
  return sqlStr.replace(/\$(\d+)/g, () => {
    counter++;
    return dialect.param(offset + counter);
  });
}
```

### 2. AutoUpdate column overwrite (Technical — should-fix)

`crud.update()` unconditionally injects `'now'` for autoUpdate columns, which would overwrite user-provided `DbExpr` values. **Resolution:** Check if the user already provided a value before injecting:

```typescript
for (const col of autoUpdateCols) {
  if (!(col in filteredData)) {
    filteredData[col] = 'now';
  }
}
```

### 3. Dialect-aware param renumbering (Technical — should-fix)

Expression fragments use `$N` format from the `sql` template, but SQLite expects `?`. **Resolution:** Addressed by finding #1 — `renumberParamsWithDialect()` translates to the target dialect.

### 5. Drop `d.multiply()` and `d.divide()` (DX — should-fix)

The arithmetic shortcuts beyond +/- are speculative. No real use case demanded them yet. `d.expr(col => sql`${col} * ${factor}`)` covers multiply/divide clearly. Fewer shortcuts = less autocomplete noise, less LLM confusion about "which one to use." **Resolution:** Ship only `d.increment()`, `d.decrement()`, and `d.expr()`. Add multiply/divide later when demanded.

### 6. Re-export `sql` from main `@vertz/db` (DX — should-fix)

`d.expr()` requires the `sql` tagged template, which currently lives at `@vertz/db/sql`. This is the only `d.*` API that needs a second import. **Resolution:** Re-export `sql` from the main `@vertz/db` entrypoint so developers can write `import { d, sql } from '@vertz/db'`. The `@vertz/db/sql` subpath stays for users who only need the SQL builder.

### 7. Upsert ON CONFLICT SET must handle `DbExpr` (Product — should-fix)

`upsert()` passes update values to `buildInsert()`'s `onConflict.updateValues`. The ON CONFLICT SET clause in `buildInsert()` pushes values directly as params — a `DbExpr` would be serialized as an object, producing a SQL error. **Resolution:** Add the same `isDbExpr()` detection in `buildInsert()`'s ON CONFLICT SET clause. Same pattern as `buildUpdate()`. Also fix autoUpdate overwrite in `upsert()` (same `if (!(col in filteredUpdate))` guard).

### 8. `DbExpr` check ordering in `buildUpdate` (Technical — implementation note)

`isDbExpr(value)` must be checked **before** the `'now'` sentinel check to ensure expressions take precedence:

```typescript
if (isDbExpr(value)) {
  // compose expression fragment
} else if (nowSet.has(key) && value === 'now') {
  // timestamp sentinel
} else {
  // direct value
}
```

## POC Results

Not applicable — the change is localized (SET clause builder + type widening) and doesn't introduce new architectural patterns.

## Type Flow Map

```
d.expr(fn)                → DbExpr { _tag, build }
d.increment(n)            → DbExpr { _tag, build }
                               ↓
User passes in data:      { clickCount: DbExpr }
                               ↓
ApiUpdateInput<T>         accepts InferColumnType<T[K]> | DbExpr
$update type              accepts InferColumnType<T[K]> | DbExpr
                               ↓
crud.update()             passes data to buildUpdate()
                               ↓
buildUpdate()             detects isDbExpr(value)
                          calls value.build(sql.raw('"column_name"'))
                          gets SqlFragment back
                          inlines SQL + renumbers params
                               ↓
SQL output                "click_count" = "click_count" + $1
```

### Type tests (`.test-d.ts`)

```typescript
import { d } from '@vertz/db';
import { sql } from '@vertz/db/sql';

declare const urlTable: TableDef<{
  id: ColumnBuilder<string, { primary: true; hasDefault: true; /* ... */ }>;
  clickCount: ColumnBuilder<number, DefaultMeta<'integer'>>;
  slug: ColumnBuilder<string, DefaultMeta<'text'>>;
}>;

type UrlUpdate = (typeof urlTable)['$update'];

// Positive: direct values still work
const directUpdate: UrlUpdate = { clickCount: 5 };

// Positive: DbExpr works on any column
const exprUpdate: UrlUpdate = { clickCount: d.increment(1) };
const strExprUpdate: UrlUpdate = { slug: d.expr((col) => sql`LOWER(${col})`) };

// Positive: mixed direct + expr
const mixedUpdate: UrlUpdate = { clickCount: d.increment(1), slug: 'new-slug' };

// @ts-expect-error — primary key not in $update
const pkUpdate: UrlUpdate = { id: 'new-id' };
```

## E2E Acceptance Test

From a developer's perspective, using the public `@vertz/db` API:

```typescript
import { d, createDb, sql } from '@vertz/db';

// Schema
const urlsTable = d.table('urls', {
  id: d.uuid().primary(),
  slug: d.text().unique(),
  target: d.text(),
  clickCount: d.integer().default(0),
  updatedAt: d.timestamp().autoUpdate(),
});

const Url = d.model(urlsTable);
const db = createDb({ /* ... */ });

// Seed
const url = await db.urls.create({
  data: { slug: 'test', target: 'https://example.com' },
});
expect(url.clickCount).toBe(0);

// Atomic increment
const updated = await db.urls.update({
  where: { id: url.id },
  data: { clickCount: d.increment(1) },
});
expect(updated.clickCount).toBe(1);

// Multiple increments
const again = await db.urls.update({
  where: { id: url.id },
  data: { clickCount: d.increment(5) },
});
expect(again.clickCount).toBe(6);

// Decrement
const decremented = await db.urls.update({
  where: { id: url.id },
  data: { clickCount: d.decrement(2) },
});
expect(decremented.clickCount).toBe(4);

// General expression
const uppercased = await db.urls.update({
  where: { id: url.id },
  data: { slug: d.expr((col) => sql`UPPER(${col})`) },
});
expect(uppercased.slug).toBe('TEST');

// Mixed direct values + expressions
const mixed = await db.urls.update({
  where: { id: url.id },
  data: {
    clickCount: d.increment(1),
    target: 'https://new-target.com',
  },
});
expect(mixed.clickCount).toBe(5);
expect(mixed.target).toBe('https://new-target.com');

// Upsert with expression in update path
const upserted = await db.urls.upsert({
  where: { slug: 'TEST' },
  create: { slug: 'TEST', target: 'https://example.com', clickCount: 1 },
  update: { clickCount: d.increment(1) },
});
expect(upserted.clickCount).toBe(6); // existing row was incremented

// updateMany with expressions
await db.urls.updateMany({
  where: { slug: 'TEST' },
  data: { clickCount: d.expr((col) => sql`${col} * ${2}`) },
});
const final = await db.urls.findFirst({ where: { id: url.id } });
expect(final!.clickCount).toBe(10);

// @ts-expect-error — wrong: plain object is not a valid expression
await db.urls.update({
  where: { id: url.id },
  data: { clickCount: { increment: 1 } },
});
```

## Files Changed

| File | Change |
|------|--------|
| `packages/db/src/sql/expr.ts` | **New** — `DbExpr` interface, `isDbExpr()`, `expr()`, arithmetic shortcuts |
| `packages/db/src/sql/tagged.ts` | Export `renumberParamsWithDialect()` for dialect-aware fragment composition |
| `packages/db/src/sql/insert.ts` | Detect `DbExpr` values in ON CONFLICT SET clause (upsert path) |
| `packages/db/src/sql/update.ts` | Detect `DbExpr` values, compose SQL fragments in SET clause |
| `packages/db/src/sql/index.ts` | Re-export `DbExpr`, `isDbExpr` |
| `packages/db/src/d.ts` | Add `expr`, `increment`, `decrement`, `multiply`, `divide` to `d` |
| `packages/db/src/query/crud.ts` | Fix autoUpdate injection to not overwrite user-provided expressions |
| `packages/db/src/schema/table.ts` | Widen `$update` and `$update_input` types to accept `DbExpr` |
| `packages/db/src/index.ts` | Re-export `DbExpr` type and `isDbExpr` |
| `packages/db/src/sql/__tests__/update.test.ts` | Tests for expression handling in `buildUpdate` |
| `packages/db/src/sql/__tests__/expr.test.ts` | **New** — Unit tests for `DbExpr`, shortcuts, `isDbExpr` |
