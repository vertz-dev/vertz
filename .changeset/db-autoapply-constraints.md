---
'@vertz/db': patch
---

fix(db): emit indexes, foreign keys, and enum CHECK constraints when autoApply generates DDL

`createDb({ migrations: { autoApply: true } })` previously built `CREATE TABLE`
statements by hand and skipped non-inline UNIQUE indexes from `d.index()`,
FOREIGN KEY constraints derived from `d.ref.one()`, and CHECK constraints for
`d.enum()` columns. Applications used autoApply for local dev and hand-written
migrations for prod (typical Cloudflare D1 flow) got silent schema drift: tests
passed against the permissive autoApply schema but production rejected the same
operations.

The autoApply path now uses the same snapshot + SQL generator pipeline as the
migrations CLI, so the DDL it emits matches what `vertz db generate` would
produce. `generateBootstrapSql()` is a new export on `@vertz/db/migration` that
emits idempotent `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
for any `SchemaSnapshot`.

Closes #2848.
