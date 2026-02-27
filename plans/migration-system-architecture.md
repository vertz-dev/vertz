# Migration System Architecture — Production-Ready Design

## Context

The vertz migration system has two disconnected subsystems:

1. **Auto-migrate** (`auto-migrate.ts`) — snapshot-based, auto-applies schema changes on server start. No migration files, no history of what changed, no audit trail. Used for rapid development.
2. **File-based migrations** (`migrate-dev.ts`, `migrate-deploy.ts`, `runner.ts`) — proper migration files (`NNNN_description.sql`), history table (`_vertz_migrations`), checksums, drift detection. **Fully implemented but not wired to any CLI command.**

Meanwhile, the CLI's `migrate-smart.ts` shells out to **Prisma** (`npx prisma migrate dev/deploy/status/reset`) — completely unrelated to either native subsystem. It must be deleted.

**Goal:** Unify auto-migrate and file-based migrations into a single coherent system that works in development, production, and team environments with zero gaps.

---

## Mental Model

```
Development:          Production:
schema code           migration files (.sql)
     ↓                      ↓
  computeDiff          migrateDeploy
     ↓                      ↓
 auto-apply OR      apply in order
 generate .sql file     with checksums
     ↓                      ↓
  snapshot saved       history table updated
```

Two modes, **one pipeline**:
- **Dev mode (`vertz db migrate`):** Diff schema → auto-apply to local DB → optionally generate `.sql` file for production
- **Prod mode (`vertz db deploy`):** Apply pending `.sql` files in order with checksum validation

Both share: `computeDiff`, `generateMigrationSql`, `createMigrationRunner`, `computeChecksum`.

---

## Source of Truth Hierarchy

1. **Schema definitions** (`d.table()` calls) — the canonical schema intent
2. **Migration files** (`migrations/*.sql`) — the auditable change history for production
3. **Snapshot** (`migrations/_snapshot.json`) — cached schema state for fast diffing
4. **History table** (`_vertz_migrations`) — what the database has actually applied
5. **Actual database schema** — introspected via `PRAGMA table_info` (SQLite) / `information_schema` (Postgres)

---

## Development Workflow

### `vertz db migrate` (replaces auto-migrate + generates files)

```
1. Load previous snapshot from migrations/_snapshot.json
2. Build current snapshot from d.table() definitions
3. computeDiff(previous, current)
4. If no changes → "No schema changes detected" → exit
5. generateMigrationSql(diff)
6. Apply SQL to local dev database
7. Write migrations/NNNN_description.sql
8. Update migrations/_snapshot.json
9. Record in _vertz_migrations history table
```

**Key detail:** The developer provides a migration name (`--name add-user-roles`). If omitted, we auto-generate from the diff changes (e.g., `add-column-role-to-users`).

### `vertz db push` (quick dev iteration, no file generation)

For rapid prototyping — applies schema changes without creating migration files. This is the current auto-migrate behavior:

```
1. Diff schema → generate SQL → apply → update snapshot
2. No .sql file written
3. No history table record
```

**Warning printed:** "Push mode skips migration file generation. Run `vertz db migrate` before committing."

---

## Production Workflow

### `vertz db deploy`

```
1. Read all migrations/*.sql files (sorted by NNNN prefix)
2. Query _vertz_migrations for applied migrations
3. Compute pending = files - applied
4. For each pending migration:
   a. Validate checksum (file hasn't been tampered with)
   b. Execute SQL
   c. Record in _vertz_migrations
5. Report: "Applied 3 migration(s). Database is up to date."
```

**Safeguards:**
- Checksum mismatch → hard error ("Migration 0003_add_roles.sql has been modified after being applied. This is not allowed.")
- Out-of-order detection → warning ("Migration 0002_x.sql is pending but 0003_y.sql was already applied.")
- Drift detection → compare file checksums against history table checksums

---

## Team Conflict Scenarios

### Scenario: Two developers branch from main, both add migrations

```
Developer A (branch: feature-a):
  migrations/0003_add_user_roles.sql

Developer B (branch: feature-b):
  migrations/0003_add_comments_table.sql
```

When B merges after A:

**Detection:** `vertz db migrate` detects two files with the same sequence number (0003). This is a conflict.

**Resolution:** The CLI renumbers B's migration:
```
migrations/0003_add_user_roles.sql      (A's, already merged)
migrations/0004_add_comments_table.sql  (B's, renumbered)
```

The renumbering happens automatically when running `vertz db migrate` and detecting a gap/collision. The snapshot is rebuilt from the current schema definitions (which are always the source of truth).

### Scenario: Both modify the same table

```
A: ALTER TABLE users ADD COLUMN role TEXT;
B: ALTER TABLE users ADD COLUMN avatar TEXT;
```

These are compatible — both migrations apply independently. Git merges the schema code, `vertz db migrate` generates a new migration from the merged diff.

### Scenario: Conflicting modifications

```
A: ALTER TABLE users ALTER COLUMN name TYPE varchar(100);
B: ALTER TABLE users DROP COLUMN name;
```

Git will show a merge conflict in the schema definition files. The developer resolves the conflict in code, then runs `vertz db migrate` to generate the correct migration.

---

## Snapshot Management

### Committed to git: `migrations/_snapshot.json`

The snapshot is **committed to the repository**. It represents the schema state after the last migration was generated.

**Why committed (not disposable):**
- Enables `computeDiff` without a running database
- CI can validate schema consistency
- New developers don't need to reconstruct from migration history

**If deleted:** Can be reconstructed by replaying all migration files against an empty schema. The CLI provides `vertz db snapshot --rebuild` for this.

### Migration Journal: `migrations/_journal.json`

Tracks migration metadata for conflict detection and reconstruction:

```json
{
  "version": 1,
  "migrations": [
    {
      "name": "0001_initial_schema.sql",
      "description": "Initial schema",
      "createdAt": "2024-01-15T10:30:00Z",
      "checksum": "abc123..."
    },
    {
      "name": "0002_add_user_roles.sql",
      "description": "Add user roles",
      "createdAt": "2024-01-20T14:00:00Z",
      "checksum": "def456..."
    }
  ]
}
```

**Purpose:**
- Detects sequence number collisions during merge
- Validates migration file integrity without a database connection
- Enables snapshot reconstruction from journal history

---

## Schema Drift Detection

### `vertz db status`

Reports the state of the migration system:

```
1. Compare schema definitions vs snapshot → pending code changes
2. Compare migration files vs _vertz_migrations → pending/applied migrations
3. Introspect actual DB schema vs expected schema → drift detection
4. Report:

Migration Status:
  Applied: 5 migrations
  Pending: 2 migrations

Schema Status:
  Code changes not yet in a migration: 3 changes
    - Added column 'avatar' to table 'users'
    - Added table 'notifications'
    - Removed index on 'posts.slug'

Database Drift:
  ⚠ Column 'temp_flag' exists in database but not in schema
  ⚠ Table '_debug_log' exists in database but not in schema
```

### Introspection (new file: `packages/db/src/migration/introspect.ts`)

SQLite introspection via PRAGMA:
```typescript
export async function introspectSqlite(queryFn: MigrationQueryFn): Promise<SchemaSnapshot>
```

Uses:
- `PRAGMA table_list` — enumerate tables
- `PRAGMA table_info(tableName)` — column definitions
- `PRAGMA index_list(tableName)` — indexes
- `PRAGMA foreign_key_list(tableName)` — foreign keys

Postgres introspection via information_schema:
```typescript
export async function introspectPostgres(queryFn: MigrationQueryFn): Promise<SchemaSnapshot>
```

The introspected schema is compared against the expected schema (from snapshot) to detect drift — changes made directly to the database that aren't tracked in migrations.

---

## CLI Commands

All commands live under `vertz db`:

| Command | Purpose | Environment |
|---------|---------|-------------|
| `vertz db migrate [--name <name>]` | Diff schema, generate .sql file, apply to dev DB | Development |
| `vertz db migrate --dry-run` | Show what SQL would be generated without applying | Development |
| `vertz db push` | Apply schema changes without migration files (rapid prototyping) | Development |
| `vertz db deploy` | Apply pending .sql files to database | Production/CI |
| `vertz db deploy --dry-run` | Show pending migrations without applying | Production/CI |
| `vertz db status` | Show applied/pending migrations, code changes, drift | Any |
| `vertz db reset` | Drop all tables, re-apply all migrations from scratch | Development |
| `vertz db baseline` | Mark current DB state as "migrated" without running SQL | Production (existing DB) |

### Delete: `packages/cli/src/commands/migrate-smart.ts`

The entire Prisma wrapper is deleted. No Prisma references remain in the codebase.

---

## Future: `vertz db introspect` — Schema Generation from Existing Database

**Not in scope for this version**, but the introspection infrastructure built in Phase 1 (`introspectSqlite`, `introspectPostgres`) paves the road for this.

### Vision

A developer with an existing database (e.g. migrating from another framework, or a legacy app) runs:

```bash
vertz db introspect --connection sqlite:./my-app.db --output src/schema/
```

The command:

1. Connects to the existing database
2. Introspects all tables, columns, types, relations, indexes, constraints
3. Generates TypeScript files using `d.table()` and `d.model()` definitions

### Example output: `src/schema/users.ts`

```typescript
import { d } from '@vertz/db';

export const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  role: d.enum('role', ['admin', 'user', 'moderator']).default('user'),
  avatarUrl: d.text().nullable(),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

export const usersModel = d.model(usersTable);
```

### Example output: `src/schema/posts.ts` (with relations)

```typescript
import { d } from '@vertz/db';

export const postsTable = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  body: d.text(),
  authorId: d.uuid().references('users', 'id'),
  published: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
});

export const postsModel = d.model(postsTable);
```

### Why this matters

- **Zero-friction adoption** — existing apps can adopt vertz without manually rewriting their schema
- **Database-first workflows** — some teams prefer designing in the DB first, then generating code
- **Migration path** — teams moving from Prisma, Drizzle, TypeORM, or raw SQL get an instant starting point
- The generated code is fully editable — the user can refine column annotations (`.hidden()`, `.readOnly()`, etc.) after generation

### Infrastructure reuse

The `introspectSqlite()` and `introspectPostgres()` functions from Phase 1 already return a `SchemaSnapshot`. The introspect command adds a **code generator** layer on top that converts `SchemaSnapshot` → TypeScript source code. The snapshot infrastructure is the same; only the output format differs (SQL for migrations, TypeScript for introspection).

---

## Files to Create/Modify

### New files

| File | Purpose |
|------|---------|
| `packages/db/src/migration/introspect.ts` | SQLite + Postgres schema introspection |
| `packages/db/src/migration/journal.ts` | Journal read/write/conflict detection |
| `packages/db/src/cli/baseline.ts` | `baseline()` — mark current DB as migrated |
| `packages/db/src/cli/reset.ts` | `reset()` — drop + re-apply all migrations |

### Modified files

| File | Changes |
|------|---------|
| `packages/db/src/migration/runner.ts` | Fix `CREATE_HISTORY_SQL` — currently uses Postgres-only syntax (`serial`, `timestamp with time zone`, `now()`). Add dialect-aware DDL. |
| `packages/db/src/cli/migrate-dev.ts` | Add journal writing, snapshot updating, auto-naming from diff |
| `packages/db/src/cli/status.ts` | Add introspection-based drift detection, code-vs-snapshot diff |
| `packages/db/src/migration/index.ts` | Export new types: `introspect*`, `Journal*`, etc. |
| `packages/cli/src/commands/` | Wire new commands, delete `migrate-smart.ts` |

### Existing files (reuse as-is)

| File | Reused capability |
|------|-------------------|
| `packages/db/src/migration/differ.ts` | `computeDiff()` — schema diffing |
| `packages/db/src/migration/sql-generator.ts` | `generateMigrationSql()`, `generateRollbackSql()` |
| `packages/db/src/migration/snapshot.ts` | `SchemaSnapshot`, `createSnapshot()` |
| `packages/db/src/migration/files.ts` | `formatMigrationFilename()`, `nextMigrationNumber()` |
| `packages/db/src/migration/auto-migrate.ts` | Retained for `vertz db push` quick-iteration mode |
| `packages/db/src/cli/migrate-deploy.ts` | `migrateDeploy()` — production deployment |

---

## Implementation Phases

### Phase 1: Foundation — History Table Fix + Introspection

**Files:**
- `packages/db/src/migration/runner.ts` — dialect-aware `CREATE_HISTORY_SQL`
- `packages/db/src/migration/introspect.ts` (new) — SQLite + Postgres schema introspection

**Acceptance criteria:**
- History table DDL works on both SQLite and Postgres
- `introspectSqlite(queryFn)` returns a `SchemaSnapshot` matching the actual database schema
- Integration test: create tables via raw SQL → introspect → verify snapshot matches

### Phase 2: Journal + Enhanced migrate-dev

**Files:**
- `packages/db/src/migration/journal.ts` (new) — journal read/write/conflict detection
- `packages/db/src/cli/migrate-dev.ts` — add journal writing, snapshot saving, auto-naming, collision detection

**Acceptance criteria:**
- `migrateDev()` writes both `.sql` file and `_journal.json`
- `migrateDev()` updates `_snapshot.json` after generating migration
- Collision detection: if two migrations share a sequence number, the second is renumbered
- Integration test: simulate two branches merging with conflicting migration numbers → verify renumbering

### Phase 3: Status + Drift Detection

**Files:**
- `packages/db/src/cli/status.ts` — full status reporting with introspection
- `packages/db/src/cli/baseline.ts` (new) — mark current DB as migrated
- `packages/db/src/cli/reset.ts` (new) — drop + re-apply

**Acceptance criteria:**
- `migrateStatus()` reports applied, pending, code changes, and database drift
- `baseline()` inserts all existing migration filenames into `_vertz_migrations` without executing SQL
- `reset()` drops all tables and re-applies from migration files
- Integration test: manually add a column via SQL → `migrateStatus()` reports it as drift

### Phase 4: CLI Wiring

**Files:**
- `packages/cli/src/commands/` — wire all new commands
- Delete `packages/cli/src/commands/migrate-smart.ts`

**Acceptance criteria:**
- `vertz db migrate`, `vertz db push`, `vertz db deploy`, `vertz db status`, `vertz db reset`, `vertz db baseline` all work end-to-end
- No Prisma references anywhere in the CLI
- Integration test: full lifecycle — define schema → migrate → deploy → status → all green

---

## Verification

```bash
bun test --filter db      # All migration tests
bun test --filter cli     # CLI command tests
bun run typecheck         # Full typecheck
bun run lint              # Biome lint
```

End-to-end: define schema → `vertz db migrate` → verify .sql file → `vertz db deploy` on clean DB → `vertz db status` reports all applied, no drift.
