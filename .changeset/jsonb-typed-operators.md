---
'@vertz/db': patch
---

feat(db): typed JSONB operators — `path()` builder, `jsonContains`, `jsonContainedBy`, `hasKey`

Closes [#2868](https://github.com/vertz-dev/vertz/issues/2868).

Adds the typed JSONB operator surface deferred from #2850:

- **Typed `path()` builder** — `path((m: T) => m.x.y).eq(value)` preserves the payload's leaf type through the selector. Operator availability is conditional on the leaf: `contains` / `startsWith` / `endsWith` on strings, `gt` / `gte` / `lt` / `lte` on numbers, `bigint`, and `Date`. Numeric array indexing emits integer segments unquoted (`->0`), matching Postgres JSONB array semantics.
- **Whole-payload operators** — `jsonContains` (emits `@>`, operand is `DeepPartial<T>` capped at depth 5), `jsonContainedBy` (emits `<@`), `hasKey` (emits `?`, operand is `keyof T & string` via a union-safe `JsonbKeyOf<T>` helper).
- **Dialect gating** reuses the keyed-never brand mechanism from #2850. On SQLite, attempting any of these operators fails at compile time with `JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS` — the type name IS the recovery sentence. Same diagnostic appears in `d.jsonb` JSDoc and mint-docs verbatim.

The new `path` export lives at the package root (`import { path } from '@vertz/db'`). The string-keyed path filter (`'meta->k'`) remains as an escape hatch for dynamic paths; prefer `path()` for static paths.

Follow-ups filed: #2885 (array-operator type gating), #2886 (`hasAllKeys` / `hasAnyKey`).

**Callout for consumers with custom helpers over `FilterType<TColumns>`:** the column-value branch for JSONB columns is now `JsonbColumnValue<T, TDialect>` instead of the generic `ColumnFilterOperators`. Helpers that destructure or remap `FilterType` for JSONB columns may need minor adjustment to accept the new operator surface.
