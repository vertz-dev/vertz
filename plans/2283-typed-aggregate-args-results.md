# Design: Strongly Typed Aggregate Args & Results (#2283, #2284)

## Summary

Make `aggregate()` and `groupBy()` fully type-safe: validate args against model columns (including numeric-only restrictions for `_avg`/`_sum`) and compute return types from the requested fields. The `count()` args are already typed via `TypedCountOptions` — no changes needed there.

**Issues:**
- https://github.com/vertz-dev/vertz/issues/2283 — Type `count()` and `aggregate()` args against model columns
- https://github.com/vertz-dev/vertz/issues/2284 — Type aggregate/groupBy return values based on requested fields

**Parent audit:** #1742

---

## API Surface

### TypedAggregateArgs — strongly typed aggregate args

Mirrors the existing `TypedGroupByArgs` pattern. Parameterized by `ModelEntry` so each `db.<model>.aggregate()` call validates columns at compile time.

```typescript
import { d, createDb } from '@vertz/db';

const productsTable = d.table('products', {
  id: d.uuid().primary(),
  name: d.text(),
  price: d.real(),
  stock: d.integer(),
  createdAt: d.timestamp().default('now'),
});

const models = {
  products: { table: productsTable, relations: {} },
};

const db = createDb({ models, dialect: 'sqlite', path: ':memory:' });

// Valid: price and stock are numeric columns
await db.products.aggregate({
  _avg: { price: true },
  _sum: { stock: true },
  _min: { price: true },
  _max: { price: true },
  _count: true,
});

// Valid: where uses FilterType — typed operators
await db.products.aggregate({
  where: { price: { gte: 10 } },
  _count: true,
});

// Valid: per-column count with model columns
await db.products.aggregate({
  _count: { name: true, price: true },
});

// @ts-expect-error — 'invalidCol' does not exist on products
await db.products.aggregate({ where: { invalidCol: 'value' } });

// @ts-expect-error — 'name' is a text column, not numeric
await db.products.aggregate({ _avg: { name: true } });

// @ts-expect-error — 'createdAt' is a timestamp, not numeric
await db.products.aggregate({ _sum: { createdAt: true } });

// @ts-expect-error — 'nonExistent' is not a column
await db.products.aggregate({ _min: { nonExistent: true } });

// @ts-expect-error — per-column count only accepts model columns
await db.products.aggregate({ _count: { fake: true } });
```

### Typed Return Values — aggregate()

The return type is computed from the args. Developers get autocomplete and compile errors on typos.

```typescript
const result = await db.products.aggregate({
  _avg: { price: true },
  _count: true,
});
// result.data type:
// {
//   _avg: { price: number | null };
//   _count: number;
// }

result.data._avg.price; // number | null
result.data._count;     // number
// @ts-expect-error — 'nonExistent' not on result
result.data.nonExistent;

// Per-column count
const result2 = await db.products.aggregate({
  _count: { name: true, price: true },
});
// result2.data._count type: { name: number; price: number }

// Multiple aggregations
const result3 = await db.products.aggregate({
  _avg: { price: true },
  _sum: { stock: true },
  _min: { price: true, stock: true },
  _max: { price: true },
});
// result3.data type (Prettify'd for IntelliSense):
// {
//   _avg: { price: number | null };
//   _sum: { stock: number | null };
//   _min: { price: number | null; stock: number | null };  // numeric cols → number | null
//   _max: { price: number | null };
// }
//
// _min/_max on non-numeric columns preserves the column type:
// _min: { name: true } → { name: string | null }
// _min: { createdAt: true } → { createdAt: Date | null }

// Empty args — returns typed empty object
const result4 = await db.products.aggregate({});
// result4.data type: {}

// Variable args require `as const` for narrow inference
const args = { _avg: { price: true }, _count: true } as const;
const result5 = await db.products.aggregate(args);
// Without `as const`, _count widens to `boolean` and breaks the `extends true` conditional.
// Same caveat as `select` in get()/list() — standard TypeScript behavior.
```

### Typed Return Values — groupBy()

Each row includes group-by columns plus requested aggregation fields. Expression entries in `by` contribute a `Record<string, unknown>` fallback (expression aliases are dynamic strings and not typed — see Non-Goals).

```typescript
const result = await db.products.groupBy({
  by: ['name'],
  _count: true,
  _avg: { price: true },
});
// result.data type: Array<{
//   name: string;               // group-by column, inferred from model
//   _count: number;
//   _avg: { price: number | null };
// }>

result.data[0].name;           // string
result.data[0]._count;         // number
result.data[0]._avg.price;     // number | null
// @ts-expect-error — 'stock' was not requested in _avg
result.data[0]._avg.stock;

// GroupByExpression aliases are untyped — access is dynamic
const byDate = d.fn.date('createdAt');
const result2 = await db.products.groupBy({
  by: [byDate, 'name'],
  _count: true,
});
// result2.data type: Array<{
//   name: string;
//   _count: number;
// } & Record<string, unknown>>
//
// Expression alias: result2.data[0][byDate.alias] is unknown
```

---

## Manifesto Alignment

**Principle 1 — "If it builds, it works":** This directly eliminates runtime surprises from typos in aggregate column names and wrong-type aggregation fields. The compiler catches them.

**Principle 3 — "AI agents are first-class users":** LLMs get autocomplete and error feedback from the type system. No need to memorize which columns are numeric.

**Principle 2 — "One way to do things":** We follow the exact same `TypedXxxArgs<TEntry>` pattern established by `TypedGroupByArgs` and `TypedCountOptions`. No new patterns.

---

## Non-Goals

- **Typed `orderBy` in groupBy** — `orderBy` currently accepts `Record<string, 'asc' | 'desc'>` which can reference aggregation aliases (`_count`, `_avg_price`). Typing this requires dependent types on the requested aggregation fields. Out of scope — track separately if needed.
- **Typed expression alias keys in groupBy results** — Expression aliases (e.g., `dateClickedAt`) in groupBy results are dynamic strings from `GroupByExpression`. Typing them precisely would require template literal types mirroring the `camelToSnake`/`snakeToCamel` logic. Out of scope — expression alias access remains `unknown` via `Record<string, unknown>` fallback.
- **`_having` support for groupBy** — Prisma supports `having` for post-aggregation group filtering. Useful but a separate feature — not part of the type safety audit.
- **Empty aggregation guard** — Calling `aggregate({})` with no aggregation fields is valid (returns `{}`). Making it a compile error via `never` would be a nice guardrail but is not required for type safety.
- **Runtime validation** — These are compile-time-only type improvements. The runtime functions (`aggregate()`, `groupBy()`, `count()`) remain unchanged.

---

## Unknowns

None identified. The patterns (`TypedGroupByArgs`, `NumericColumnKeys`, `FilterType`) are all established. This is purely wiring them into the remaining gaps.

---

## Type Flow Map

### Aggregate Args

```
ModelDelegate<TEntry>
  → aggregate<TArgs>(options: TypedAggregateArgs<TEntry, TArgs>)
    → TEntry['table']['_columns'] (= EntryColumns<TEntry>)
      → where: FilterType<EntryColumns<TEntry>>
      → _avg: { [K in NumericColumnKeys<EntryColumns<TEntry>>]?: true }
      → _sum: { [K in NumericColumnKeys<EntryColumns<TEntry>>]?: true }
      → _min: { [K in keyof EntryColumns<TEntry>]?: true }
      → _max: { [K in keyof EntryColumns<TEntry>]?: true }
      → _count: true | { [K in keyof EntryColumns<TEntry>]?: true }
```

### Aggregate Result

```
TypedAggregateArgs<TEntry, TArgs>
  → Prettify<AggregateResult<EntryColumns<TEntry>, TArgs>>
    → For _avg/_sum (always numeric):
       result[`_${fn}`] = { [col in keys of TArgs[K]]: number | null }
    → For _min/_max (column-aware — preserves original type):
       result[`_${fn}`] = { [col in keys of TArgs[K]]: InferColumnType<TColumns[col]> | null }
    → For _count:
       TArgs['_count'] extends true → result._count = number
       TArgs['_count'] extends Record → result._count = { [col]: number }
```

Note: `_min`/`_max` return the column's actual type (string for text, Date for timestamp, number for numeric) rather than `number | null`. This matches SQL semantics — MIN/MAX preserves the column type. `_avg`/`_sum` always return `number | null` because SQL coerces to numeric.

### GroupBy Result

```
TypedGroupByArgs<TEntry>
  → GroupByResult<EntryColumns<TEntry>, TArgs>
    → For each by[i]:
       string column → result[col] = InferColumnType<TEntry['table']['_columns'][col]>
    → Plus aggregation fields (same as AggregateResult)
```

---

## E2E Acceptance Test

```typescript
import { describe, it, expect } from 'bun:test';
import { d, createDb } from '@vertz/db';
import type { ModelEntry } from '@vertz/db';

const productsTable = d.table('products', {
  id: d.uuid().primary(),
  name: d.text(),
  price: d.real(),
  stock: d.integer(),
  category: d.text(),
  createdAt: d.timestamp().default('now'),
});

const models = {
  products: { table: productsTable, relations: {} },
} satisfies Record<string, ModelEntry>;

describe('Feature: Typed aggregate args and results (#2283, #2284)', () => {
  describe('Given a products model with numeric (price, stock) and text (name, category) columns', () => {
    describe('When calling aggregate() with _avg on a numeric column', () => {
      it('Then accepts the call and returns typed result with _avg.price as number | null', () => {
        // Type test: the call compiles and result shape is known
      });
    });

    describe('When calling aggregate() with _avg on a text column', () => {
      it('Then rejects at compile time — text columns not assignable to numeric-only args', () => {
        // @ts-expect-error — 'name' is text, not numeric
        // db.products.aggregate({ _avg: { name: true } });
      });
    });

    describe('When calling aggregate() with where on an invalid column', () => {
      it('Then rejects at compile time — unknown column not in FilterType', () => {
        // @ts-expect-error — 'invalidCol' not on products
        // db.products.aggregate({ where: { invalidCol: 'x' } });
      });
    });

    describe('When calling aggregate() with _count: true', () => {
      it('Then result._count is typed as number', () => {
        // result.data._count satisfies number
      });
    });

    describe('When calling aggregate() with per-column _count', () => {
      it('Then result._count is typed as { [col]: number } for requested columns', () => {
        // result.data._count.name satisfies number
      });
    });

    describe('When calling groupBy() with by columns and aggregations', () => {
      it('Then each row has typed group columns and typed aggregation fields', () => {
        // row.category satisfies string
        // row._count satisfies number
        // row._avg.price satisfies number | null
      });
    });

    describe('When accessing a non-requested field on the aggregate result', () => {
      it('Then rejects at compile time — field does not exist on computed result type', () => {
        // @ts-expect-error — 'nonExistent' not on result
        // result.data.nonExistent;
      });
    });

    describe('When calling aggregate() with no aggregation fields', () => {
      it('Then returns typed empty object', () => {
        // result.data satisfies {}
      });
    });

    describe('When calling aggregate() with _min on a text column', () => {
      it('Then result._min.name is typed as string | null (preserves column type)', () => {
        // result.data._min.name satisfies string | null
      });
    });

    describe('When calling aggregate() with args stored in a variable using as const', () => {
      it('Then narrows the return type correctly', () => {
        // const args = { _count: true } as const;
        // result.data._count satisfies number
      });
    });

    describe('When calling groupBy() with a GroupByExpression in by', () => {
      it('Then row has typed string columns and Record<string, unknown> fallback for expression aliases', () => {
        // row.name satisfies string (typed)
        // row[expr.alias] is unknown (untyped fallback)
      });
    });
  });
});
```

---

## Implementation Notes

- **`Prettify<>` wrapper** — Apply `Prettify<{ [K in keyof T]: T[K] }>` to all computed result types so IntelliSense shows a clean flat object, not nested intersections.
- **`EntryColumns` deduplication** — `EntryColumns<TEntry>` is defined in both `database.ts` and `aggregate.ts`. Export from `inference.ts` as the single source of truth.
- **`as const` caveat** — Same as `select` in `get()`/`list()`: variable-stored args need `as const` for narrow inference. Document in tests, not a design flaw.
- **Existing call site audit** — Before merging Phase 1, grep for `.aggregate(` and `.groupBy(` across the repo to catch newly-surfaced type errors (intentional breaking change, pre-v1).
- **`_min`/`_max` runtime fix** — The runtime currently coerces all aggregation values via `Number(val)`, which NaN's text values. Fix the runtime to preserve the original value for `_min`/`_max` (return `val` directly instead of `Number(val)`) to match the column-aware return types.

---

## Implementation Strategy

### Phase 1: Typed Aggregate Args

Add `TypedAggregateArgs<TEntry>` (following the established `TypedGroupByArgs` pattern) and wire it into `ModelDelegate.aggregate()`.

**Files:**
- `packages/db/src/query/aggregate.ts` — add `TypedAggregateArgs` type
- `packages/db/src/client/database.ts` — change `aggregate()` signature
- `packages/db/src/query/__tests__/aggregate-types.test-d.ts` — type-level tests (inline + `as const` variable args, positive and negative)
- `packages/db/src/index.ts` — export `TypedAggregateArgs`

### Phase 2: Typed Aggregate Return Values

Add conditional types that compute the result shape from the args for `aggregate()`. Fix `_min`/`_max` runtime to preserve column types.

**Files:**
- `packages/db/src/query/aggregate.ts` — add `AggregateResult` conditional type with `Prettify<>`, fix `_min`/`_max` runtime coercion
- `packages/db/src/client/database.ts` — change `aggregate()` return type
- `packages/db/src/query/__tests__/aggregate-types.test-d.ts` — type-level tests for return shapes (including empty args, per-column count, `_min`/`_max` on text columns)

### Phase 3: Typed GroupBy Return Values

Add conditional types that compute per-row shape for `groupBy()` results. Expression entries contribute `Record<string, unknown>` fallback.

**Files:**
- `packages/db/src/query/aggregate.ts` — add `GroupByResult` conditional type
- `packages/db/src/client/database.ts` — change `groupBy()` return type
- `packages/db/src/query/__tests__/aggregate-types.test-d.ts` — type-level tests for groupBy return shapes (string columns + expression fallback)
