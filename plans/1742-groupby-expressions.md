# Design: Computed Expressions in groupBy() (#1742)

## Summary

Extend `@vertz/db`'s `groupBy()` to accept computed SQL expressions (e.g., `DATE(clicked_at)`, `date_trunc('hour', clicked_at)`, `EXTRACT(month FROM created_at)`) in the `by` array, alongside plain column names. **All parameters are strongly typed against the model's columns.**

**Issue:** https://github.com/vertz-dev/vertz/issues/1742

**Related type safety issues filed during audit:**
- #2283 — Type `count()` and `aggregate()` args against model columns
- #2284 — Type aggregate/groupBy return values based on requested fields
- #2285 — Type low-level CRUD function args
- #2286 — Type nested include in IncludeOption

---

## API Surface

### Expression Builders on `d.fn`

New namespace `d.fn` on the existing schema builder `d`. **Column parameters are generic** — they capture the literal string type for downstream validation in `groupBy()`.

```typescript
import { d } from '@vertz/db';

// DATE(column) — extract date from timestamp
d.fn.date('clickedAt')
// → SQL: DATE("clicked_at")
// → alias: "dateClickedAt"
// → TCol captured as 'clickedAt'

// date_trunc(precision, column) — truncate timestamp to precision
d.fn.dateTrunc('hour', 'clickedAt')
// → SQL: date_trunc('hour', "clicked_at")
// → alias: "dateTruncHourClickedAt"

d.fn.dateTrunc('day', 'createdAt')
// → SQL: date_trunc('day', "created_at")
// → alias: "dateTruncDayCreatedAt"

// EXTRACT(field FROM column) — extract a date/time field
d.fn.extract('month', 'createdAt')
// → SQL: EXTRACT(month FROM "created_at")
// → alias: "extractMonthCreatedAt"

d.fn.extract('year', 'createdAt')
// → SQL: EXTRACT(year FROM "created_at")
// → alias: "extractYearCreatedAt"
```

### Usage in groupBy (strongly typed)

```typescript
// Clicks per day — using expr.alias for orderBy (recommended)
const byDate = d.fn.date('clickedAt');
const clicksPerDay = await db.clicks.groupBy({
  by: [byDate],                           // ✅ 'clickedAt' validated against clicks columns
  _count: true,
  orderBy: { [byDate.alias]: 'desc' },
});
// Result: [{ dateClickedAt: '2026-04-01', _count: 42 }, ...]

// ❌ Compile error — 'nonExistent' is not a column on clicks
await db.clicks.groupBy({
  by: [d.fn.date('nonExistent')],          // @ts-expect-error
  _count: true,
});

// ❌ Compile error — 'invalid' is not a valid column
await db.clicks.groupBy({
  by: ['invalid'],                         // @ts-expect-error
  _count: true,
});

// Mix columns and expressions — all validated
const clicksByUrlAndDay = await db.clicks.groupBy({
  by: ['urlId', d.fn.date('clickedAt')],   // ✅ both validated
  _count: true,
});
// Result: [{ urlId: 'abc', dateClickedAt: '2026-04-01', _count: 10 }, ...]

// Aggregation fields validated against columns
await db.clicks.groupBy({
  by: ['urlId'],
  _avg: { clickedAt: true },               // @ts-expect-error — clickedAt is timestamp, not numeric
});

// where clause typed via FilterType
await db.clicks.groupBy({
  by: ['urlId'],
  where: { urlId: { contains: 'abc' } },   // ✅ string operators on text column
  _count: true,
});

// Access results via expr.alias (avoids hardcoding strings)
const byDay = d.fn.date('clickedAt');
const result = await db.clicks.groupBy({ by: [byDay], _count: true });
result.data[0][byDay.alias]; // access via alias, no magic strings
```

### Expression Type

```typescript
/**
 * A computed SQL expression for use in groupBy `by` arrays.
 * TCol is a phantom type capturing the column name for type-level validation.
 */
interface GroupByExpression<TCol extends string = string> {
  readonly _tag: 'GroupByExpression';
  /** The SQL fragment (e.g., `DATE("clicked_at")`). No user params — all values are trusted. */
  readonly sql: string;
  /** The camelCase alias used in SELECT, orderBy, and result mapping (e.g., `dateClickedAt`). */
  readonly alias: string;
}
```

`GroupByExpression` is an **opaque type** — it should only be constructed via `d.fn.*` builders. The interface is exported for type-checking, but no public constructor exists outside `d.fn`. The `groupBy()` function validates `_tag === 'GroupByExpression'` at runtime as defense-in-depth.

### Strongly Typed GroupByArgs

```typescript
/** Extract column keys whose inferred type extends number or bigint. */
type NumericColumnKeys<TColumns extends ColumnRecord> = {
  [K in keyof TColumns]: InferColumnType<TColumns[K]> extends number | bigint ? K : never;
}[keyof TColumns] & string;

/** Strongly typed groupBy arguments, parameterized by the model's columns. */
type TypedGroupByArgs<TEntry extends ModelEntry> = {
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

**Key decisions:**
- `by` validates both plain column names AND expression column parameters against the model
- `_avg` and `_sum` are restricted to **numeric columns only** (integer, real, doublePrecision, serial, bigint)
- `_min` and `_max` accept **any column** — they work on strings, dates, numbers
- `where` uses the existing `FilterType<TColumns>` — fully typed with operators
- `orderBy` remains `Record<string, 'asc' | 'desc'>` for now — fully typing it requires conditional types based on the requested aggregations (tracked in #2284)

### `d.fn` Namespace

```typescript
// Added to the `d` export in packages/db/src/d.ts

d.fn: {
  /** DATE(column) — extract date part from a timestamp column. */
  date<TCol extends string>(column: TCol): GroupByExpression<TCol>;

  /** date_trunc(precision, column) — truncate timestamp to given precision. */
  dateTrunc<TCol extends string>(precision: DateTruncPrecision, column: TCol): GroupByExpression<TCol>;

  /** EXTRACT(field FROM column) — extract a date/time field from a timestamp column. */
  extract<TCol extends string>(field: ExtractField, column: TCol): GroupByExpression<TCol>;
};

/** Valid precisions for date_trunc(). */
type DateTruncPrecision =
  | 'microsecond' | 'millisecond' | 'second' | 'minute'
  | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

/** Valid fields for EXTRACT(). */
type ExtractField =
  | 'century' | 'day' | 'decade' | 'dow' | 'doy' | 'epoch'
  | 'hour' | 'isodow' | 'isoyear' | 'microsecond' | 'millisecond'
  | 'minute' | 'month' | 'quarter' | 'second' | 'timezone'
  | 'timezone_hour' | 'timezone_minute' | 'week' | 'year';
```

### Type Guard Utility

```typescript
/** Type guard to distinguish GroupByExpression from column name strings. */
function isGroupByExpression(item: string | GroupByExpression): item is GroupByExpression {
  return typeof item === 'object' && item !== null && item._tag === 'GroupByExpression';
}
```

### Invalid Usage (compile-time errors)

```typescript
// @ts-expect-error — dateTrunc requires a valid precision literal
d.fn.dateTrunc('invalid', 'clickedAt');

// @ts-expect-error — extract requires a valid field literal
d.fn.extract('invalid', 'createdAt');

// @ts-expect-error — date requires a string column name
d.fn.date(123);

// When used in groupBy — column names validated against model:

// @ts-expect-error — 'nonExistent' not a column on clicks
db.clicks.groupBy({ by: [d.fn.date('nonExistent')], _count: true });

// @ts-expect-error — 'invalid' not a column on clicks
db.clicks.groupBy({ by: ['invalid'], _count: true });

// @ts-expect-error — 'name' is text, not numeric
db.products.groupBy({ by: ['category'], _avg: { name: true } });

// @ts-expect-error — 'nonCol' not a column on products
db.products.groupBy({ by: ['category'], where: { nonCol: 'x' } });
```

---

## Manifesto Alignment

### Principles Applied

1. **If it builds, it works** — Column names are validated at the type level against the model. `DateTruncPrecision` and `ExtractField` are union types. Invalid columns, precisions, and fields are all caught at compile time. Numeric aggregations reject non-numeric columns. The `GroupByExpression` phantom type carries the column name through to `groupBy()` for validation.

2. **One way to do things** — There is exactly one way to group by a date expression: `d.fn.date('col')`. No raw SQL escape hatch in this API. No alternate syntax. No callback-based expressions.

3. **AI agents are first-class users** — `d.fn.date('clickedAt')` reads naturally in English. An LLM can infer the correct usage from the function name and parameter type. The `d.fn` namespace is discoverable — autocomplete shows all available functions. The `expr.alias` pattern for result access is self-documenting. Strong typing means autocomplete shows valid column names.

4. **Test what matters** — Every expression builder gets a test that verifies the generated SQL and alias. Integration tests verify the full groupBy-with-expression flow against PGlite. Type tests (`.test-d.ts`) verify all compile-time constraints.

### Tradeoffs

- **Explicit over implicit:** Expression aliases are deterministic, camelCase, and predictable (`dateClickedAt`, `dateTruncHourCreatedAt`). We don't support custom aliases — one way to do things.
- **Convention over configuration:** The alias naming convention follows `<function><Args><Column>` in camelCase, consistent with the existing camelCase convention for column result keys. No configuration needed.
- **Compile-time over runtime:** Column names, precision/field values, and numeric constraints are all checked by the type system. Runtime validation is defense-in-depth for JavaScript consumers.

### What Was Rejected

1. **`d.fn.raw()` escape hatch** — The issue proposes `d.fn.raw('EXTRACT(month FROM clicked_at)')`. Rejected because raw SQL in the `by` array bypasses all safety (quoting, casing, aliasing, type checking). If users need raw SQL, they already have `db.query(sql\`...\`)`. Adding raw to `groupBy` creates two ways to do things.

2. **Expression builder DSL** — A full SQL expression tree (like Drizzle's `sql` builder or Knex's `raw`) was considered. Too much abstraction for the current need. We're solving time-series grouping — three functions cover 95% of use cases. More functions can be added later without API changes.

3. **Custom aliases** — `d.fn.date('clickedAt').as('day')` was considered. Rejected to maintain one way to do things — deterministic aliases eliminate confusion about what key to use in results.

4. **Snake_case aliases** — Initial design used snake_case aliases (`date_clicked_at`). Rejected because the existing `groupBy` result keys use camelCase for column names (`urlId`, `createdAt`). Mixing casing conventions in a single result object would trip up both developers and LLMs. CamelCase aliases (`dateClickedAt`) are consistent with the existing convention.

---

## Non-Goals

- **Full SQL expression builder** — This is not a general-purpose expression DSL. Only `DATE`, `date_trunc`, and `EXTRACT` are supported initially. New `d.fn` functions should only be added when they serve a demonstrated use case and have deterministic alias conventions.
- **Expressions in `where` clauses** — The `where` parameter is not extended. Computed filters are a separate concern (and a much larger change).
- **Expressions in `orderBy`** — `orderBy` references expression results by their alias (a string). No new expression syntax needed — use `{ [expr.alias]: 'desc' }`.
- **SQLite support** — `date_trunc` and `EXTRACT` are PostgreSQL-specific. SQLite uses different functions (`strftime`). Dialect-specific expression generation is a future concern. See "SQLite Dialect Guard" in Security Considerations.
- **Aggregate expressions** — `d.fn.sum()`, `d.fn.avg()` etc. are out of scope. The existing `_sum`, `_avg` options cover aggregation.
- **`HAVING` clause** — Filtering on aggregation results (`HAVING COUNT(*) > 10`) is a natural companion but a separate feature. The expression alias system is forward-compatible with a future `having` parameter.
- **Fully typed `orderBy`** — Typing `orderBy` to include aggregation aliases (e.g., `_count`, `_avg_price`) requires conditional types based on which aggregations were requested. Tracked separately in #2284.
- **Typed return values** — Typing the result shape (`Record<string, unknown>[]` → computed type) is a separate concern tracked in #2284.

---

## Unknowns

None identified. The design is a straightforward extension of the existing `groupBy` infrastructure:
- The `by` array already iterates over items — we add a type check for `GroupByExpression`.
- SQL generation already builds string fragments — expressions contribute their own SQL.
- Result mapping already iterates `options.by` — expressions use their alias as the result key.
- Typed utilities (`FilterType`, `OrderByType`, etc.) already exist in `inference.ts` — we integrate them.

---

## POC Results

Not needed. The change is localized to:
1. A new `GroupByExpression` interface + 3 builder functions + `isGroupByExpression` type guard (~40 lines)
2. `TypedGroupByArgs` + `NumericColumnKeys` utility types (~30 lines)
3. Modified `groupBy()` to handle expression items in the `by` array + updated orderBy validation (~25 lines changed)
4. `d.fn` namespace addition to `d.ts` (~25 lines)
5. Updated `ModelDelegate.groupBy()` signature to use `TypedGroupByArgs` (~5 lines)

No architectural risk. No cross-package impact beyond the `@vertz/db` public API types.

---

## Type Flow Map

```
d.fn.date<'clickedAt'>('clickedAt')
  │
  ├─ TCol = 'clickedAt' (captured as literal type)
  ├─ column: 'clickedAt' ──► camelToSnake() ──► quoted in SQL
  │
  └─ returns: GroupByExpression<'clickedAt'> { _tag, sql, alias }
       │
       ├─ TypedGroupByArgs<TEntry>.by accepts:
       │    (keyof EntryColumns<TEntry> & string) | GroupByExpression<keyof EntryColumns<TEntry> & string>
       │    │
       │    └─ GroupByExpression<'clickedAt'> matches iff 'clickedAt' ∈ keyof EntryColumns<TEntry>
       │       ├─ ✅ 'clickedAt' exists on clicks → compiles
       │       └─ ❌ 'nonExistent' not on clicks → compile error
       │
       ├─ groupBy() iterates by[]
       │    ├─ string item ──► existing path (camelToSnake + quote)
       │    └─ GroupByExpression item ──► expr.sql in SELECT + GROUP BY
       │                              ──► expr.alias in SELECT AS (quoted)
       │
       ├─ orderBy validation: expr aliases collected into validExprAliases set
       │    └─ orderBy key lookup: validAggAliases ∪ validExprAliases ∪ column names
       │
       └─ Result mapping: row[expr.alias] ──► result[expr.alias]

TypedGroupByArgs<TEntry>._avg
  │
  └─ { [K in NumericColumnKeys<EntryColumns<TEntry>>]?: true }
       │
       ├─ NumericColumnKeys filters to columns where InferColumnType extends number | bigint
       ├─ d.integer() → ✅ (number)
       ├─ d.real() → ✅ (number)
       ├─ d.bigint() → ✅ (bigint)
       ├─ d.text() → ❌ (string — rejected)
       └─ d.timestamp() → ❌ (Date — rejected)
```

No dead generics. `TCol` flows from `d.fn.*` builder → `GroupByExpression<TCol>` → `TypedGroupByArgs.by` validation → compile-time error if column doesn't exist on the model.

---

## E2E Acceptance Test

```typescript
import { d, createDb } from '@vertz/db';

// Setup: clicks table with timestamp column
const clicksTable = d.table('clicks', {
  id: d.uuid().primary().default('gen_random_uuid()'),
  urlId: d.text(),
  clickedAt: d.timestamp().default('now()'),
});

// ── Happy path: group by DATE expression ──
const byDate = d.fn.date('clickedAt');
const clicksPerDay = await db.clicks.groupBy({
  by: [byDate],
  _count: true,
  orderBy: { [byDate.alias]: 'desc' },
});

// Result shape — camelCase alias, consistent with column keys
expect(clicksPerDay.ok).toBe(true);
expect(clicksPerDay.data[0]).toHaveProperty('dateClickedAt');
expect(clicksPerDay.data[0]).toHaveProperty('_count');
expect(typeof clicksPerDay.data[0].dateClickedAt).toBe('string'); // '2026-04-01'
expect(typeof clicksPerDay.data[0]._count).toBe('number');

// ── Happy path: ordering by expression alias works correctly ──
expect(clicksPerDay.data[0].dateClickedAt >= clicksPerDay.data[1]?.dateClickedAt).toBe(true);

// ── Happy path: group by dateTrunc expression ──
const clicksPerHour = await db.clicks.groupBy({
  by: [d.fn.dateTrunc('hour', 'clickedAt')],
  _count: true,
});
expect(clicksPerHour.data[0]).toHaveProperty('dateTruncHourClickedAt');

// ── Happy path: mix columns and expressions ──
const clicksByUrlAndDay = await db.clicks.groupBy({
  by: ['urlId', d.fn.date('clickedAt')],
  _count: true,
});
expect(clicksByUrlAndDay.data[0]).toHaveProperty('urlId');         // camelCase column
expect(clicksByUrlAndDay.data[0]).toHaveProperty('dateClickedAt'); // camelCase alias
expect(clicksByUrlAndDay.data[0]).toHaveProperty('_count');

// ── Happy path: extract expression ──
const clicksByMonth = await db.clicks.groupBy({
  by: [d.fn.extract('month', 'clickedAt')],
  _count: true,
});
expect(clicksByMonth.data[0]).toHaveProperty('extractMonthClickedAt');

// ── expr.alias access pattern ──
const byDay = d.fn.date('clickedAt');
const result = await db.clicks.groupBy({ by: [byDay], _count: true });
expect(result.data[0][byDay.alias]).toBeDefined(); // access via alias, no magic strings

// ── Compile-time errors (type tests) ──
// @ts-expect-error — invalid precision
d.fn.dateTrunc('invalid', 'clickedAt');

// @ts-expect-error — invalid extract field
d.fn.extract('invalid', 'createdAt');

// @ts-expect-error — date() requires string
d.fn.date(123);

// @ts-expect-error — 'nonExistent' not a column on clicks
db.clicks.groupBy({ by: [d.fn.date('nonExistent')], _count: true });

// @ts-expect-error — 'invalid' not a column on clicks
db.clicks.groupBy({ by: ['invalid'], _count: true });

// @ts-expect-error — 'urlId' is text, not numeric — cannot use _avg
db.clicks.groupBy({ by: ['urlId'], _avg: { urlId: true } });

// @ts-expect-error — where validates against model columns
db.clicks.groupBy({ by: ['urlId'], where: { nonCol: 'x' }, _count: true });
```

---

## Security Considerations

### SQL Injection Prevention

1. **Function names are hardcoded** — `DATE`, `date_trunc`, `EXTRACT` are string literals in the builder functions, never user-supplied.
2. **Precision/field values are whitelisted** — `DateTruncPrecision` and `ExtractField` union types restrict values at compile time. At runtime, the builders validate against the same whitelist before generating SQL.
3. **Column names go through `camelToSnake()` and are double-quoted** — Same safety as existing column handling. No raw column interpolation.
4. **No parameters needed** — Expression SQL contains no user-supplied values. Column names are trusted (they come from the developer's code, not user input). Precisions/fields are from a whitelist.
5. **Opaque construction** — `GroupByExpression` is only constructible via `d.fn.*` builders. The `groupBy()` function validates `_tag === 'GroupByExpression'` at runtime. Hand-crafted objects that bypass builders are rejected.

### Runtime Validation

Even though types prevent invalid values at compile time, the builders also validate at runtime (defense in depth for JavaScript consumers or type-cast bypasses). Error messages include valid options:

```typescript
function dateTrunc<TCol extends string>(
  precision: DateTruncPrecision,
  column: TCol,
): GroupByExpression<TCol> {
  if (!VALID_DATE_TRUNC_PRECISIONS.has(precision)) {
    throw new Error(
      `Invalid date_trunc precision: "${precision}". Valid: ${[...VALID_DATE_TRUNC_PRECISIONS].join(', ')}`
    );
  }
  const snakeCol = camelToSnake(column);
  return {
    _tag: 'GroupByExpression',
    sql: `date_trunc('${precision}', "${snakeCol}")`,
    alias: snakeToCamel(`datetrunc_${precision}_${snakeCol}`),
  };
}
```

### orderBy Validation for Expression Aliases

The `groupBy()` function builds a `validExprAliases` set from expression items in the `by` array. The `orderBy` validation checks keys in this order:
1. `'_count'` → special-cased to `COUNT(*)` (existing)
2. Starts with `'_'` → validated against `validAggAliases` (existing)
3. In `validExprAliases` → use the expression's SQL in ORDER BY (new)
4. Otherwise → treated as column name, `camelToSnake()` + quoted (existing)

This prevents expression aliases from being misidentified as column names and avoids the `camelToSnake()` mangling issue.

### SQLite Dialect Guard

When `d.fn.dateTrunc()` or `d.fn.extract()` expressions are used with a SQLite dialect, `groupBy()` throws a clear error:

```
date_trunc expressions are not supported on SQLite. Use db.query(sql`...`) for dialect-specific SQL.
```

`d.fn.date()` is supported on both PostgreSQL and SQLite (SQLite has `DATE()` built-in).

### Alias Collision Detection

If a `by` array contains both a plain column and an expression whose alias matches the column name (e.g., table has a `dateClickedAt` column and `d.fn.date('clickedAt')` produces alias `dateClickedAt`), `groupBy()` throws early with a duplicate alias error. This prevents ambiguous SELECT clauses.

---

## Review Feedback Addressed

| # | Source | Issue | Resolution |
|---|--------|-------|------------|
| C1 | DX | Snake_case aliases create casing inconsistency | Switched to camelCase aliases (`dateClickedAt`) matching existing convention |
| C2 | DX | No typed result — developer memorizes alias | Promoted `expr.alias` access pattern in all examples; return type gap tracked in #2284 |
| C4 | DX | orderBy should use `[expr.alias]` pattern | All examples now show `{ [expr.alias]: 'desc' }` pattern |
| B1 | Tech | orderBy validation doesn't handle expression aliases | Added `validExprAliases` set + 3rd check path in orderBy validation |
| B2 | Tech | Injection via manual GroupByExpression construction | Made opaque — only `d.fn.*` builders, runtime `_tag` validation |
| N1 | Tech | Alias collision with real column names | Added duplicate alias detection |
| #1 | Product | SQLite dialect gap | Added SQLite dialect guard with clear error |
| #3 | Product | orderBy with expression aliases unspecified | Explicitly specified in orderBy validation section |
| S3 | DX | Error messages should include valid options | Updated error format to list valid values |
| S5 | DX | `HAVING` not mentioned | Added to non-goals |
| — | User | Column params must be strongly typed | Added `GroupByExpression<TCol>` phantom type, `TypedGroupByArgs`, `NumericColumnKeys` |
| — | User | Audit for more untyped APIs | Filed #2283, #2284, #2285, #2286 |
