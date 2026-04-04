# Phase 1: Expression Types and Builders

## Context

This is phase 1 of #1742 (computed expressions in groupBy). This phase creates the foundational types (`GroupByExpression`, `DateTruncPrecision`, `ExtractField`, `NumericColumnKeys`) and the `d.fn.*` builder functions. No integration with `groupBy()` yet — that's phase 2.

Design doc: `plans/1742-groupby-expressions.md`

## Tasks

### Task 1: GroupByExpression type + isGroupByExpression type guard

**Files:**
- `packages/db/src/query/expression.ts` (new)
- `packages/db/src/query/__tests__/expression.test.ts` (new)

**What to implement:**

Create the `GroupByExpression` interface with phantom type parameter and the `isGroupByExpression` type guard:

```typescript
export interface GroupByExpression<TCol extends string = string> {
  readonly _tag: 'GroupByExpression';
  readonly sql: string;
  readonly alias: string;
}

export function isGroupByExpression(
  item: string | GroupByExpression,
): item is GroupByExpression {
  return typeof item === 'object' && item !== null && item._tag === 'GroupByExpression';
}
```

Also define the precision/field union types and validation sets:

```typescript
export type DateTruncPrecision =
  | 'microsecond' | 'millisecond' | 'second' | 'minute'
  | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export type ExtractField =
  | 'century' | 'day' | 'decade' | 'dow' | 'doy' | 'epoch'
  | 'hour' | 'isodow' | 'isoyear' | 'microsecond' | 'millisecond'
  | 'minute' | 'month' | 'quarter' | 'second' | 'timezone'
  | 'timezone_hour' | 'timezone_minute' | 'week' | 'year';

export const VALID_DATE_TRUNC_PRECISIONS: ReadonlySet<string>;
export const VALID_EXTRACT_FIELDS: ReadonlySet<string>;
```

**Acceptance criteria:**
- [ ] `isGroupByExpression` returns `true` for objects with `_tag: 'GroupByExpression'`
- [ ] `isGroupByExpression` returns `false` for plain strings
- [ ] `isGroupByExpression` returns `false` for `null`, `undefined`, random objects
- [ ] `VALID_DATE_TRUNC_PRECISIONS` contains all 10 valid precisions
- [ ] `VALID_EXTRACT_FIELDS` contains all 18 valid fields
- [ ] Type test: `GroupByExpression<'clickedAt'>` is assignable to `GroupByExpression<string>`
- [ ] Type test: `GroupByExpression<string>` is NOT assignable to `GroupByExpression<'clickedAt'>`

---

### Task 2: d.fn builder functions (date, dateTrunc, extract)

**Files:**
- `packages/db/src/query/expression.ts` (modified — add builders)
- `packages/db/src/query/__tests__/expression.test.ts` (modified — add builder tests)
- `packages/db/src/query/__tests__/expression.test-d.ts` (new — type-level tests)

**What to implement:**

Three builder functions that create `GroupByExpression` instances:

```typescript
export function fnDate<TCol extends string>(column: TCol): GroupByExpression<TCol>;
export function fnDateTrunc<TCol extends string>(precision: DateTruncPrecision, column: TCol): GroupByExpression<TCol>;
export function fnExtract<TCol extends string>(field: ExtractField, column: TCol): GroupByExpression<TCol>;
```

Each builder:
1. Validates precision/field against the whitelist Set at runtime (throws with valid options listed)
2. Converts column to snake_case via `camelToSnake()`
3. Generates deterministic camelCase alias via `snakeToCamel()`
4. Returns a frozen `GroupByExpression` object

Alias generation:
- `fnDate('clickedAt')` → alias: `snakeToCamel('date_clicked_at')` → `"dateClickedAt"`
- `fnDateTrunc('hour', 'clickedAt')` → alias: `snakeToCamel('datetrunc_hour_clicked_at')` → `"dateTruncHourClickedAt"`
- `fnExtract('month', 'createdAt')` → alias: `snakeToCamel('extract_month_created_at')` → `"extractMonthCreatedAt"`

SQL generation:
- `fnDate('clickedAt')` → sql: `DATE("clicked_at")`
- `fnDateTrunc('hour', 'clickedAt')` → sql: `date_trunc('hour', "clicked_at")`
- `fnExtract('month', 'createdAt')` → sql: `EXTRACT(month FROM "created_at")`

**Acceptance criteria:**
- [ ] `fnDate('clickedAt')` produces correct SQL and camelCase alias
- [ ] `fnDateTrunc('hour', 'clickedAt')` produces correct SQL and camelCase alias
- [ ] `fnExtract('month', 'createdAt')` produces correct SQL and camelCase alias
- [ ] All 10 `dateTrunc` precisions produce valid SQL
- [ ] All 18 `extract` fields produce valid SQL
- [ ] Invalid precision throws with message listing valid options
- [ ] Invalid field throws with message listing valid options
- [ ] Column names with multiple words convert correctly (e.g., `'createdAt'` → `"created_at"`)
- [ ] All returned objects have `_tag: 'GroupByExpression'`
- [ ] Type test: `d.fn.dateTrunc('invalid', 'col')` — `@ts-expect-error`
- [ ] Type test: `d.fn.extract('invalid', 'col')` — `@ts-expect-error`
- [ ] Type test: `d.fn.date(123)` — `@ts-expect-error`
- [ ] Type test: `fnDate<'clickedAt'>('clickedAt')` returns `GroupByExpression<'clickedAt'>`

---

### Task 3: Add `d.fn` namespace to the `d` object + exports

**Files:**
- `packages/db/src/d.ts` (modified — add `fn` namespace)
- `packages/db/src/query/index.ts` (modified — re-export expression types)
- `packages/db/src/index.ts` (modified — export `GroupByExpression` type)

**What to implement:**

Add `fn` property to the `d` object in `d.ts`:

```typescript
d.fn: {
  date<TCol extends string>(column: TCol): GroupByExpression<TCol>;
  dateTrunc<TCol extends string>(precision: DateTruncPrecision, column: TCol): GroupByExpression<TCol>;
  extract<TCol extends string>(field: ExtractField, column: TCol): GroupByExpression<TCol>;
};
```

The implementation delegates to `fnDate`, `fnDateTrunc`, `fnExtract` from `expression.ts`.

Export from package:
- `GroupByExpression` type from `@vertz/db`
- `DateTruncPrecision` type from `@vertz/db`
- `ExtractField` type from `@vertz/db`
- `isGroupByExpression` from `@vertz/db`

**Acceptance criteria:**
- [ ] `d.fn.date('clickedAt')` works and returns correct expression
- [ ] `d.fn.dateTrunc('hour', 'clickedAt')` works
- [ ] `d.fn.extract('month', 'createdAt')` works
- [ ] Types are importable: `import { type GroupByExpression } from '@vertz/db'`
- [ ] `import { d } from '@vertz/db'; d.fn.date('x')` — compiles and runs
