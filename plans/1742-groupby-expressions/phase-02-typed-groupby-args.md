# Phase 2: Strongly Typed GroupByArgs

## Context

This is phase 2 of #1742. Phase 1 created the expression types and `d.fn.*` builders. This phase makes `GroupByArgs` strongly typed against the model's columns — including `by`, `where`, aggregation fields (`_avg`, `_sum`, `_min`, `_max`, `_count`), and validates that expression column params exist on the model.

Design doc: `plans/1742-groupby-expressions.md`

## Tasks

### Task 1: NumericColumnKeys utility type + TypedGroupByArgs

**Files:**
- `packages/db/src/schema/inference.ts` (modified — add `NumericColumnKeys`)
- `packages/db/src/schema/__tests__/inference.test-d.ts` (modified — type tests)

**What to implement:**

Add a utility type that extracts column keys whose inferred type is numeric:

```typescript
export type NumericColumnKeys<TColumns extends ColumnRecord> = {
  [K in keyof TColumns]: InferColumnType<TColumns[K]> extends number | bigint ? K : never;
}[keyof TColumns] & string;
```

This filters to columns defined with `d.integer()`, `d.real()`, `d.doublePrecision()`, `d.serial()`, `d.bigint()` — i.e., columns whose TypeScript type is `number` or `bigint`. Columns like `d.decimal()` (type `string`) and `d.text()` are excluded.

**Acceptance criteria:**
- [ ] Type test: `NumericColumnKeys` includes `integer`, `real`, `doublePrecision`, `serial`, `bigint` columns
- [ ] Type test: `NumericColumnKeys` excludes `text`, `uuid`, `boolean`, `timestamp`, `date`, `decimal`, `jsonb` columns
- [ ] Type test: `NumericColumnKeys` on a table with no numeric columns resolves to `never`

---

### Task 2: TypedGroupByArgs type + update ModelDelegate

**Files:**
- `packages/db/src/query/aggregate.ts` (modified — add `TypedGroupByArgs`)
- `packages/db/src/client/database.ts` (modified — update `ModelDelegate.groupBy` signature)
- `packages/db/src/schema/__tests__/inference.test-d.ts` (modified — add type tests)

**What to implement:**

Create `TypedGroupByArgs` that parameterizes `GroupByArgs` by the model entry:

```typescript
import type { GroupByExpression } from './expression';
import type { NumericColumnKeys } from '../schema/inference';

// Internal helper to get column record from ModelEntry
type EntryColumns<TEntry extends ModelEntry> = TEntry['table']['_columns'];

export type TypedGroupByArgs<TEntry extends ModelEntry> = {
  readonly by: readonly (
    | (keyof EntryColumns<TEntry> & string)
    | GroupByExpression<keyof EntryColumns<TEntry> & string>
  )[];
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly _count?: true | { readonly [K in keyof EntryColumns<TEntry>]?: true };
  readonly _avg?: { readonly [K in NumericColumnKeys<EntryColumns<TEntry>>]?: true };
  readonly _sum?: { readonly [K in NumericColumnKeys<EntryColumns<TEntry>>]?: true };
  readonly _min?: { readonly [K in keyof EntryColumns<TEntry>]?: true };
  readonly _max?: { readonly [K in keyof EntryColumns<TEntry>]?: true };
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
  readonly limit?: number;
  readonly offset?: number;
};
```

Update `ModelDelegate` interface:

```typescript
// Before:
groupBy(options: agg.GroupByArgs): Promise<Result<Record<string, unknown>[], ReadError>>;

// After:
groupBy(options: agg.TypedGroupByArgs<TEntry>): Promise<Result<Record<string, unknown>[], ReadError>>;
```

The internal `implGroupBy` function still accepts the untyped `GroupByArgs` — the type narrowing happens at the `ModelDelegate` interface level (same pattern as existing `where`, `select`, `orderBy` on CRUD methods).

Also update the `internals.ts` export to include the new type.

**Acceptance criteria:**
- [ ] Type test: `db.products.groupBy({ by: ['category'] })` — compiles (valid column)
- [ ] Type test: `db.products.groupBy({ by: ['invalid'] })` — `@ts-expect-error` (invalid column)
- [ ] Type test: `db.products.groupBy({ by: [d.fn.date('createdAt')] })` — compiles (valid column in expression)
- [ ] Type test: `db.products.groupBy({ by: [d.fn.date('nonExistent')] })` — `@ts-expect-error`
- [ ] Type test: `_avg: { price: true }` compiles (price is integer)
- [ ] Type test: `_avg: { name: true }` — `@ts-expect-error` (name is text)
- [ ] Type test: `_sum: { price: true }` compiles
- [ ] Type test: `_min: { name: true }` compiles (min works on any column)
- [ ] Type test: `_max: { name: true }` compiles
- [ ] Type test: `_count: { name: true }` compiles
- [ ] Type test: `where: { category: 'widgets' }` compiles
- [ ] Type test: `where: { nonCol: 'x' }` — `@ts-expect-error`
- [ ] Existing groupBy runtime tests still pass (no regression)
- [ ] Quality gates pass: `vtz test && vtz run typecheck && vtz run lint`
