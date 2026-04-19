---
'@vertz/db': patch
---

fix(db): automatic jsonb parsing on SQLite/D1 reads, explicit stringify on writes, validator wired, JSONB path filter keys type-gated to Postgres

Closes [#2850](https://github.com/vertz-dev/vertz/issues/2850). Follow-ups tracked at [#2867](https://github.com/vertz-dev/vertz/issues/2867) (validator on writes) and [#2868](https://github.com/vertz-dev/vertz/issues/2868) (typed JSONB operators).

**Behaviour changes**

- **Reads on SQLite / D1 now auto-parse `d.jsonb<T>()` TEXT cells into `T`.** Previously they returned the raw JSON string, forcing callers to `JSON.parse(row.meta as unknown as string)`. Postgres already parsed via `postgres.js` — the two dialects now match.
- **Writes on SQLite / D1 explicitly `JSON.stringify` plain JSON payloads in `toSqliteValue`** using a positive plain-object / array-literal predicate. `Date`, typed arrays, `ArrayBuffer`, `Map`, `Set`, `URL`, `RegExp`, and class instances pass through unchanged. Previously relied on the driver's implicit behaviour — this was fragile across drivers and gave no hook site for the validator.
- **`d.jsonb<T>({ validator })` now runs the validator on the parsed value on reads.** Validator failure surfaces as `{ ok: false, error: { code: 'JSONB_VALIDATION_ERROR', table, column, value, cause } }` through the existing Result machinery. Wiring on writes is tracked separately in [#2867](https://github.com/vertz-dev/vertz/issues/2867).
- **Corrupt JSONB TEXT cells now surface as `{ ok: false, error: { code: 'JSONB_PARSE_ERROR', table, column, columnType, cause } }`** instead of throwing out of the driver.
- **Path-shaped filter keys (`where: { 'meta->field': ... }`) are now a compile error on SQLite.** `createDb({ dialect: 'sqlite', ... })` narrows the new `TDialect` generic from the literal; the keyed-never brand `JsonbPathFilterGuard` surfaces the recovery sentence verbatim in the TS diagnostic: *"JSONB path filters require dialect: 'postgres'. On SQLite, fetch with list() and filter in application code."* Postgres is unchanged — path keys compile and run as before. The pre-existing `where.ts` runtime throw remains as a backstop for the widened-variable case (`const dialect: DialectName = ...`).

**Internal changes**

- `TableSchemaRegistry` column value is now `string | ColumnSchemaEntry`. The string form is a shortcut for `{ sqlType: string }` with no validator; the object form carries an optional `validator`. Internal shape, no public API impact.
- `executeQuery` short-circuits typed `DbError` instances so they reach the Result layer without being repackaged by the PG parser.
- New `TDialect extends DialectName = DialectName` generic on `createDb`, `DatabaseClient`, `TransactionClient`, `ModelDelegate`, `IncludeOption`, and all typed option types. The default preserves back-compat for explicit `Db<...>` references; inference happens at `createDb` call sites via the existing discriminated union.

**Array operator typing** (`arrayContains`, `arrayContainedBy`, `arrayOverlaps`) is tracked at [#2868](https://github.com/vertz-dev/vertz/issues/2868). They remain runtime-only today.
