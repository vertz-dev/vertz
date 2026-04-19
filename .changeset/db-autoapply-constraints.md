---
'@vertz/db': patch
---

fix(db): emit indexes, foreign keys, and enum CHECK constraints when autoApply generates DDL

`createDb({ migrations: { autoApply: true } })` previously built `CREATE TABLE`
statements by hand and skipped non-inline UNIQUE indexes from `d.index()`,
FOREIGN KEY constraints derived from `d.ref.one()`, and CHECK constraints for
`d.enum()` columns. Applications using autoApply for local dev and hand-written
migrations for prod (the typical Cloudflare D1 flow) got silent schema drift:
tests passed against the permissive autoApply schema but production rejected
the same operations.

The autoApply path now uses the same snapshot + SQL generator pipeline as the
migrations CLI, so the DDL it emits matches what `vertz db generate` would
produce. `generateBootstrapSql()` is a new export on `@vertz/db/migration` that
emits idempotent `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
for any `SchemaSnapshot`. `createLocalSqliteDriver` now also issues
`PRAGMA foreign_keys = ON` so the new FOREIGN KEY declarations are enforced
across SQLite backends (upstream SQLite compiles with FK enforcement OFF by
default).

**Snapshot wire-format changes** (may produce one noisy `column_altered` entry
on the next `vertz db generate` after upgrading; the generated ALTER is safe
to apply):

- Enum columns now store `type: <enumName>` (e.g. `"ticket_status"`) instead
  of the literal `"enum"`, matching what `introspectPostgres` returns.
- Column defaults are stored as SQL expressions (`"'pending'"`, `"now()"`,
  `"true"`), matching what `introspectPostgres` / `introspectSqlite` return.
- `.autoUpdate()` columns now carry `default: "now()"` so downstream DDL
  consumers can emit the `DEFAULT` clause the INSERT path needs.

Closes #2848.
