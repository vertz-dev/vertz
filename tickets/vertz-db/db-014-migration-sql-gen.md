# db-014: Migration SQL generation from diff

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 5: Migration Differ + Runner
- **Estimate:** 20 hours
- **Blocked by:** db-013
- **Blocks:** db-015

## Description

Generate SQL migration statements from the diff changes produced by db-013.

Reference: `plans/db-design.md` Section 1.10; `plans/db-implementation.md` Phase 5

### SQL generation targets:
- `CREATE TABLE` with all column definitions, constraints, and indexes
- `ALTER TABLE ADD COLUMN` / `DROP COLUMN` / `ALTER COLUMN`
- `ALTER TABLE ADD CONSTRAINT` / `DROP CONSTRAINT`
- `CREATE INDEX` / `DROP INDEX`
- `CREATE TYPE ... AS ENUM (...)` / `ALTER TYPE ... ADD VALUE`
- `ALTER TABLE RENAME COLUMN`
- Foreign key constraints with CASCADE/SET NULL/NO ACTION

### Rollback SQL:
- Generate reversal SQL for each change (forward-only, but provide reversal for reference)
- Rollback SQL stored in comments or separate section

## Acceptance Criteria

- [ ] Generates valid `CREATE TABLE` with all column types and constraints
- [ ] Generates `ALTER TABLE ADD COLUMN` for new columns
- [ ] Generates `ALTER TABLE DROP COLUMN` for removed columns
- [ ] Generates `ALTER TABLE ALTER COLUMN` for type/nullable/default changes
- [ ] Generates `ALTER TABLE RENAME COLUMN` for detected renames
- [ ] Generates `CREATE INDEX` and `DROP INDEX`
- [ ] Generates `CREATE TYPE` for new enums
- [ ] Generates FK constraints with correct ON DELETE/ON UPDATE actions
- [ ] Rollback SQL is generated alongside forward SQL
- [ ] Integration test: generated SQL executes successfully against PGlite
- [ ] Integration test: full round-trip (schema -> snapshot -> diff -> SQL -> apply -> verify)

## Progress

