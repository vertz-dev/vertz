---
'@vertz/db': patch
---

fix(db): route SQLite writes without RETURNING through `execute()` so `rowCount` is accurate

Closes [#2890](https://github.com/vertz-dev/vertz/issues/2890).

Writes that don't carry a `RETURNING` clause (`createMany` / `updateMany` / `deleteMany`) used to collapse to `rowCount: 0` on SQLite: the queryFn wrapper routed every statement through `driver.query()` (`stmt.all()`), which returns an empty result set for write-without-RETURNING. A `createMany({ data: [...] })` call would therefore report `count: 0` even when the rows had been persisted.

The fix adds an exported `isWriteWithoutReturning(sql)` helper — a single-pass normalizer that blanks out string literals and comments (line + block, leading + trailing + mid-statement) before checking whether the top-level verb is `INSERT` / `UPDATE` / `DELETE` / `REPLACE` / `TRUNCATE` and whether a `RETURNING` clause is present. Both SQLite queryFn wrappers (D1 binding and local-file dialect) now dispatch write-without-RETURNING through `driver.execute()` (`stmt.run()`), surfacing `changes` as `rowCount`. Postgres routing and the `RETURNING` path are unchanged.
