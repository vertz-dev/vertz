---
'@vertz/db': patch
---

feat(db): type-gate array operators (`arrayContains` / `arrayContainedBy` / `arrayOverlaps`) to Postgres

Closes [#2885](https://github.com/vertz-dev/vertz/issues/2885).

The three Postgres array operators are now part of the typed filter surface on `d.textArray()`, `d.integerArray()`, and `d.vector(n)` columns. They ship on `dialect: 'postgres'` with operand element type flowing from column metadata:

- `d.textArray()` → `readonly string[]`
- `d.integerArray()` → `readonly number[]`
- `d.vector(n)` → `readonly number[]`

On `dialect: 'sqlite'` all three slots resolve to `ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS` — a branded `never` whose type-alias name IS the recovery sentence (same convention as the two existing JSONB brands from #2850 / #2868).

Runtime SQL emission is unchanged — the existing `@>` / `<@` / `&&` output on Postgres already worked. The runtime throw on SQLite now mirrors the JSONB message (`"require dialect: postgres. On SQLite, fetch with list() and filter in application code."`).

Users with custom helpers over `FilterType<TColumns>` may need to thread `TDialect` (same guidance as #2850).
