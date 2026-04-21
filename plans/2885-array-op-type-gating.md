# `@vertz/db` — Array Operator Type Gating (`arrayContains`, `arrayContainedBy`, `arrayOverlaps`)

**Issue:** [#2885](https://github.com/vertz-dev/vertz/issues/2885)
**Status:** Design (single revision — small scope)
**Builds on:** [#2850](https://github.com/vertz-dev/vertz/issues/2850) (TDialect thread + keyed-never brand mechanism), [#2868](https://github.com/vertz-dev/vertz/issues/2868) (JSONB typed operators — established brand pattern), [#2886](https://github.com/vertz-dev/vertz/issues/2886) (JSONB plural-key ops — same gating approach).

## Context & Problem

`packages/db/src/sql/where.ts:264-296` already emits `@>` / `<@` / `&&` on Postgres for the runtime operators `arrayContains` / `arrayContainedBy` / `arrayOverlaps`. The runtime gate (`dialect.supportsArrayOps`) throws on SQLite.

**The type layer is silent.** `FilterType<TColumns, TDialect>` never mentions the three operators. `ColumnFilterOperators<TType, TNullable>` doesn't offer them. Calling `where: { tags: { arrayContains: [...] } }` on `d.textArray()` compiles (the value widens through the `ColumnFilterOperators` union branch) and throws at runtime on SQLite.

The gap mirrors exactly what #2850 fixed for JSONB path filters and what #2868 extended for `jsonContains` / `hasKey`. Same brand mechanism, different column set.

## Goals

1. **Typed array operators** available on `d.textArray()`, `d.integerArray()`, and `d.vector(n)` columns.
2. **Operand element type flows** from column metadata: `d.textArray() → readonly string[]`, `d.integerArray() → readonly number[]`, `d.vector(n) → readonly number[]`.
3. **Dialect gating via brand.** On `dialect: 'postgres'`: typed operands. On `dialect: 'sqlite'`: resolve to a keyed-never brand whose name reads as the recovery sentence.
4. **No runtime change.** SQL emission on Postgres is already correct; the runtime throw on SQLite remains as the backstop for widened-variable cases (same pattern as #2850 / #2868 call out).

## Non-Goals

- **Removing the runtime throw.** It stays — excess-property checks only fire on fresh literals, so the widened-dialect case (`const dialect: DialectName = ...`) still needs the runtime guard.
- **Range / min-max array constraints.** Out of scope; `arrayContains` etc. are set-containment operators, not element-predicate filters.
- **Postgres ANY / ALL / array-subscript.** Out of scope.
- **Extending `arrayContains` to `d.jsonb<T[]>()` payloads.** JSONB arrays go through `jsonContains` (already typed). Array operators here are for native Postgres array columns only.
- **Mixing dialect-conditional operand shapes on the same operator key.** Not a concern — these three keys exist nowhere else in the filter surface.

## Unknowns

None identified. The design is a direct mechanical application of the #2850 / #2868 / #2886 keyed-never brand pattern; the runtime code is unchanged. No POC required.

## API Surface

### 1. Column detection (internal)

Array columns are identified by `sqlType`:

```ts
type IsArrayColumn<C> =
  C extends ColumnBuilder<unknown, infer M>
    ? M extends
        | { readonly sqlType: 'text[]' }
        | { readonly sqlType: 'integer[]' }
        | { readonly sqlType: 'vector' }
      ? true
      : false
    : false;
```

`d.bytea()` (sqlType `'bytea'`, inferred type `Uint8Array`) is deliberately excluded — it's a byte blob, not a typed element sequence.

### 2. Element extraction (internal)

```ts
type ArrayElementOf<C> =
  C extends ColumnBuilder<infer T, ColumnMetadata>
    ? T extends readonly (infer U)[]
      ? U
      : never
    : never;
```

Resolves to `string` / `number` for the three supported array column types.

### 3. New brand (Postgres-only surface)

```ts
declare const __ArrayFilterBrand: unique symbol;

export interface ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Not_Supported {
  readonly [__ArrayFilterBrand]: 'array-filter-requires-postgres';
}
```

Placed in a new file `packages/db/src/schema/array-filter-brand.ts` (mirrors the module boundary of `jsonb-filter-brand.ts`).

### 4. `ArrayOperatorSlots<TElem, TDialect>`

```ts
export type ArrayOperatorSlots<TElem, TDialect extends DialectName> = TDialect extends 'postgres'
  ? {
      readonly arrayContains?: readonly TElem[];
      readonly arrayContainedBy?: readonly TElem[];
      readonly arrayOverlaps?: readonly TElem[];
    }
  : {
      readonly arrayContains?: ArrayFilter_Error_…;
      readonly arrayContainedBy?: ArrayFilter_Error_…;
      readonly arrayOverlaps?: ArrayFilter_Error_…;
    };
```

### 5. `FilterType` extension

Current branching in `inference.ts:123-134`:

```ts
[K in keyof TColumns | JsonbPathKey<TColumns>]?: K extends keyof TColumns
  ? IsJsonbColumn<TColumns[K]> extends true
    ? JsonbColumnValue<InferColumnType<TColumns[K]>, TDialect>
    :
        | InferColumnType<TColumns[K]>
        | ColumnFilterOperators<InferColumnType<TColumns[K]>, IsNullable<TColumns[K]>>
  : JsonbPathValue<TDialect>;
```

New shape:

```ts
[K in keyof TColumns | JsonbPathKey<TColumns>]?: K extends keyof TColumns
  ? IsJsonbColumn<TColumns[K]> extends true
    ? JsonbColumnValue<InferColumnType<TColumns[K]>, TDialect>
    : IsArrayColumn<TColumns[K]> extends true
      ?
          | InferColumnType<TColumns[K]>
          | (ColumnFilterOperators<InferColumnType<TColumns[K]>, IsNullable<TColumns[K]>> &
              ArrayOperatorSlots<ArrayElementOf<TColumns[K]>, TDialect>)
      :
          | InferColumnType<TColumns[K]>
          | ColumnFilterOperators<InferColumnType<TColumns[K]>, IsNullable<TColumns[K]>>
  : JsonbPathValue<TDialect>;
```

Array column value is the direct payload shorthand OR a composite operator object with **both** standard operators (`eq` / `ne` / `in` / `notIn` / `isNull` when nullable) **and** the three array operators. Intersection is safe — the key sets don't overlap.

### 6. Example usage (Postgres)

```ts
const tagsTable = d.table('post', {
  id: d.uuid().primary({ generate: 'uuid' }),
  tags: d.textArray(),
  ratings: d.integerArray(),
  embedding: d.vector(1536),
});

// ✓ typed positives
await pg.post.list({ where: { tags: { arrayContains: ['typescript'] } } });
await pg.post.list({ where: { ratings: { arrayOverlaps: [5, 4] } } });
await pg.post.list({ where: { embedding: { arrayContainedBy: [0.1, 0.2 /* … */] } } });

// ✓ still works: direct equality, existing operators
await pg.post.list({ where: { tags: ['typescript', 'rust'] } });
await pg.post.list({ where: { tags: { eq: ['typescript'] } } });

// ✗ operand element type is enforced
await pg.post.list({
  where: {
    tags: {
      // @ts-expect-error — number is not assignable to string
      arrayContains: [42],
    },
  },
});
```

### 7. Example — SQLite rejection

```ts
const sqliteTagsTable = /* same table */;
const lite = createDb({ dialect: 'sqlite', path: ':memory:', models: { post: d.model(sqliteTagsTable) } });

await lite.post.list({
  where: {
    tags: {
      // @ts-expect-error — ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Not_Supported
      arrayContains: ['typescript'],
    },
  },
});
```

The brand name appears verbatim in the TS diagnostic — the **type alias name IS the recovery sentence** (same convention as `JsonbPathFilter_Error_…` and `JsonbOperator_Error_…`).

## Manifesto Alignment

- **Type Safety Wins.** The runtime already rejects SQLite on these operators — moving the gate to the type layer means the error surfaces at build time instead of first-run.
- **One Way to Do Things.** The brand mechanism is the established pattern for dialect-conditional operators (`JsonbPathFilter_Error_…`, `JsonbOperator_Error_…`). Adding a third (`ArrayFilter_Error_…`) is a mechanical extension of the same idiom — no new concept.
- **Explicit over implicit.** Array-column filter shapes are now explicit in `FilterType` rather than being accidentally permitted by a wildcard `ColumnFilterOperators` union.

Rejected alternative: **deriving array-ness from `InferColumnType<C> extends readonly U[]`**. This would also accept a hypothetical future `d.bytea()`-like column typed as `readonly number[]`. Using `sqlType` is narrower and aligns with how `IsJsonbColumn` already works.

Rejected alternative: **making `ArrayOperatorSlots` a standalone union member in `FilterType`** (alongside the existing `InferColumnType<TColumns[K]> | ColumnFilterOperators<…>`). Intersection with `ColumnFilterOperators` composes better: users can write `{ eq: [...], arrayOverlaps: [...] }` in one object. A standalone branch would force an either/or.

## Type Flow Map

| Generic                         | Source                              | Flows to                                                   |
| ------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `TDialect` (of `FilterType`)    | `createDb({ dialect })`             | `ArrayOperatorSlots<_, TDialect>` → brand-vs-typed branch |
| `TColumns[K]` (column builder)  | `d.table({ tags: d.textArray() })`  | `IsArrayColumn`, `ArrayElementOf`                          |
| `InferColumnType<TColumns[K]>`  | Column phantom type (`string[]`)    | Direct-payload shorthand slot                              |
| `ArrayElementOf<TColumns[K]>`   | `string[]` → `string`                | Operand element of `arrayContains` etc.                    |

Every generic terminates at a consumer. `TDialect` in particular now reaches array columns in addition to JSONB path and payload operators.

## E2E Acceptance Test

```ts
// packages/db/src/client/__tests__/array-operators.test-d.ts (new)

import { d } from '@vertz/db';
import type { FilterType } from '@vertz/db/schema/inference';

const post = d.table('post', {
  id: d.uuid().primary({ generate: 'uuid' }),
  tags: d.textArray(),
  ratings: d.integerArray(),
  embedding: d.vector(3),
});

type Cols = (typeof post)['_columns'];

// Postgres: positives
const pgContains: FilterType<Cols, 'postgres'> = {
  tags: { arrayContains: ['typescript'] },
};
void pgContains;

const pgIntOverlap: FilterType<Cols, 'postgres'> = {
  ratings: { arrayOverlaps: [5, 4] },
};
void pgIntOverlap;

const pgVectorContained: FilterType<Cols, 'postgres'> = {
  embedding: { arrayContainedBy: [0.1, 0.2, 0.3] },
};
void pgVectorContained;

// Postgres: element-type negatives
const pgWrongElem: FilterType<Cols, 'postgres'> = {
  tags: {
    // @ts-expect-error — number is not assignable to string
    arrayContains: [42],
  },
};
void pgWrongElem;

// Composition with existing ops (intersection)
const pgMixed: FilterType<Cols, 'postgres'> = {
  tags: { eq: ['a', 'b'], arrayOverlaps: ['c'] },
};
void pgMixed;

// SQLite: brand diagnostic
const liteContains: FilterType<Cols, 'sqlite'> = {
  tags: {
    // @ts-expect-error — ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Not_Supported
    arrayContains: ['typescript'],
  },
};
void liteContains;

const liteContainedBy: FilterType<Cols, 'sqlite'> = {
  tags: {
    // @ts-expect-error — ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Not_Supported
    arrayContainedBy: ['typescript'],
  },
};
void liteContainedBy;

const liteOverlaps: FilterType<Cols, 'sqlite'> = {
  tags: {
    // @ts-expect-error — ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Not_Supported
    arrayOverlaps: ['typescript'],
  },
};
void liteOverlaps;

// Direct value still works on SQLite
const liteDirect: FilterType<Cols, 'sqlite'> = {
  tags: ['typescript'],
};
void liteDirect;
```

And the runtime SQL emission is already covered by `packages/db/src/sql/__tests__/where.test.ts:361-377` — no new runtime tests required beyond confirming the existing assertions still pass.

## Definition of Done

- [ ] `IsArrayColumn`, `ArrayElementOf`, `ArrayOperatorSlots` defined
- [ ] `ArrayFilter_Error_…` brand defined in its own module
- [ ] `FilterType` routes array columns through the new branch
- [ ] `.test-d.ts` coverage: positive Postgres (per element type), negative Postgres (wrong element), negative SQLite (brand), direct-value fallback, mixed-operator intersection
- [ ] Existing runtime tests remain green (`where.test.ts`, `sqlite-builders.test.ts`)
- [ ] Quality gates green (`vtz test && vtz run typecheck && vtz run lint` on `packages/db`)
- [ ] Adversarial review in `reviews/2885-array-op-type-gating/phase-01-operators.md`
- [ ] Changeset added under `.changeset/`
- [ ] PR to `main` opened; CI green
