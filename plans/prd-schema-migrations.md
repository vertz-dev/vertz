# PRD: Schema-Driven Database Migrations

**Author:** PM Agent  
**Date:** 2026-02-22  
**Status:** Draft  

---

## 1. Problem Statement

### What's broken

The `entity-todo` example — our North Star demo — currently uses a **noop DB adapter** with no real migration story. When a real database is connected, migrations will need to be hardcoded SQL strings or manually written. This creates several problems:

1. **Schema duplication.** Developers define schema in `schema.ts` using the `d.table()` DSL, but migrations are separate SQL strings. Two sources of truth that inevitably drift.
2. **Error-prone manual work.** Writing `CREATE TABLE` and `ALTER TABLE` SQL by hand is tedious and easy to get wrong — especially across SQLite (local dev) and D1 (Cloudflare production).
3. **No migration lifecycle.** There's no automated way to detect schema changes, generate migration files, or apply them on startup. Each schema change requires manual intervention.
4. **Demo credibility.** A production-grade demo cannot ask developers to hand-write SQL. If the entity-todo experience isn't seamless, the entire Vertz value proposition (define once, get everything) falls apart.

### Why this matters for the demo

Entity-todo is the first thing developers will see. The experience must be: **define a schema → run the app → database is ready.** Any friction in this loop undermines the "it just works" promise.

---

## 2. User Stories

| # | Story | Priority |
|---|-------|----------|
| 1 | As a developer, I want to **define my schema once** in `schema.ts` and have migrations generated automatically, so I never write raw SQL. | P0 |
| 2 | As a developer, I want to **run migrations on app startup** in development, so my database is always in sync with my schema. | P0 |
| 3 | As a developer, I want to **see what changed** before migrations run (dry-run / status), so I can verify correctness. | P1 |
| 4 | As a developer, I want to **generate migration files** for version control, so my team can review and track schema changes. | P1 |
| 5 | As a developer, I want migrations to **work identically on SQLite (local) and D1 (Cloudflare)**, so there are no deployment surprises. | P0 |
| 6 | As a developer, I want a **`push` command** for rapid prototyping that applies changes directly without generating files. | P2 |
| 7 | As a developer, I want **safe production deploys** that apply only pending migrations in order, with checksum verification. | P1 |

---

## 3. Requirements

### 3.1 Functional Requirements

#### Schema → Snapshot Pipeline
- **F1:** Convert `d.table()` definitions into a `SchemaSnapshot` (already exists via `createSnapshot()`).
- **F2:** Persist the previous snapshot so diffs can be computed between schema versions.
- **F3:** Snapshot must capture: columns (type, nullable, primary, unique, default, sensitive, hidden), indexes, foreign keys, and enums.

#### Diff & SQL Generation
- **F4:** Compute structural diff between previous and current snapshots (already exists via `computeDiff()`).
- **F5:** Generate dialect-appropriate SQL from the diff (already exists via `generateMigrationSql()`).
- **F6:** Detect and suggest column renames (vs. drop+add) with confidence scoring.
- **F7:** Generate rollback SQL for reversible migrations.

#### Migration Lifecycle (CLI)
- **F8:** `vertz db push` — Apply schema changes directly to dev database (no migration file). For rapid prototyping.
- **F9:** `vertz db migrate dev` — Generate a numbered migration file, apply it, and update the snapshot.
- **F10:** `vertz db migrate deploy` — Apply all pending migration files in order. For CI/CD and production.
- **F11:** `vertz db status` — Show pending migrations and current state.

#### Runtime Auto-Migration (Dev Mode)
- **F12:** On `createDbProvider()` init in development mode, automatically detect schema drift and apply `push` to sync the database. Zero developer intervention.
- **F13:** In production mode, auto-migration is **disabled** — only `migrate deploy` applies changes.

#### Migration History
- **F14:** Track applied migrations in a `_vertz_migrations` table with name, checksum, and applied_at.
- **F15:** Verify checksums on deploy to detect tampered migration files.

### 3.2 Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Dev startup time** | < 500ms for migration check + apply on a 10-table schema |
| **Zero-config DX** | Entity-todo must work with `pnpm dev` — no manual migration step |
| **Type safety** | Schema changes that break queries must produce TypeScript errors at compile time |
| **Idempotency** | Running migrations multiple times must be safe (skip already-applied) |
| **Atomicity** | Each migration runs in a transaction (where supported by the dialect) |
| **Observability** | Log migration activity: what ran, what was skipped, any errors |

### 3.3 Constraints

| Constraint | Detail |
|------------|--------|
| **SQLite locally** | Must generate valid SQLite SQL. SQLite has limited `ALTER TABLE` support (no `DROP COLUMN` before 3.35, no `ALTER COLUMN`). Handle via table rebuild strategy. |
| **D1 in Cloudflare** | Must work with Cloudflare D1's subset of SQLite. D1 runs SQLite but has no filesystem — migration files must be bundled or stored in KV/D1 itself. |
| **No external dependencies** | Migration engine must not require Prisma, Drizzle, or any external ORM. It's built into `@vertz/db`. |
| **Existing infrastructure** | Must build on the existing `packages/db/src/migration/` and `packages/db/src/cli/` modules — not a rewrite. |

---

## 4. Architecture Overview

```
Developer writes schema.ts
         │
         ▼
   d.table() DSL
         │
         ▼
  createSnapshot()          ← packages/db/src/migration/snapshot.ts
         │
         ▼
  computeDiff(prev, curr)   ← packages/db/src/migration/differ.ts
         │
         ▼
  generateMigrationSql()    ← packages/db/src/migration/sql-generator.ts
         │
         ├──→ push (direct apply)     ← packages/db/src/cli/push.ts
         ├──→ migrate dev (file + apply) ← packages/db/src/cli/migrate-dev.ts
         └──→ migrate deploy (ordered)   ← packages/db/src/cli/migrate-deploy.ts
```

**Key insight:** Most of this pipeline already exists in `@vertz/db`. The work is:
1. Wire it into the `createDbProvider()` lifecycle for auto-migration in dev.
2. Ensure SQL generation handles SQLite/D1 dialect constraints.
3. Integrate with `entity-todo` so it "just works."

---

## 5. Success Metrics

### Definition of Done

| Metric | Criteria |
|--------|----------|
| **Entity-todo works end-to-end** | `pnpm dev` starts the app, creates the database, applies schema, and serves CRUD — no manual SQL. |
| **Schema change flow** | Add a column to `schema.ts` → restart dev → column exists in DB. No manual steps. |
| **Migration files generated** | `vertz db migrate dev --name add-priority` creates a numbered `.sql` file in `migrations/`. |
| **Deploy flow** | `vertz db migrate deploy` applies pending migrations to a fresh database in correct order. |
| **SQLite + D1 parity** | Same schema produces valid SQL for both SQLite (local) and D1 (Cloudflare). Tested. |
| **Tests pass** | Unit tests for snapshot, diff, SQL generation. Integration test for full push + migrate cycle. |

### How We Measure

- **Manual QA:** Walk through entity-todo from `git clone` to working app in < 2 minutes.
- **Automated:** CI runs migration integration tests against SQLite.
- **Regression:** Any schema change in entity-todo that breaks the dev flow is a P0 bug.

---

## 6. Out of Scope (This Iteration)

| Excluded | Reason |
|----------|--------|
| **PostgreSQL dialect** | Focus on SQLite/D1 for the demo. PG support can follow. |
| **GUI migration tool** | CLI-only for now. |
| **Down migrations / rollback execution** | `generateRollbackSql()` exists but automatic rollback execution is deferred. |
| **Multi-database support** | One database per app instance. |
| **Schema seeding** | Seed data is a separate concern. |
| **Migration squashing** | Combining old migrations into one. Nice-to-have later. |
| **Interactive rename prompts** | Rename detection exists but interactive confirmation is deferred. CLI will log suggestions. |
| **D1 remote migration tooling** | Applying migrations to remote D1 via Wrangler. For now, migrations bundle with the Worker. |

---

## 7. Open Questions

1. **Snapshot storage location:** Where does the previous snapshot live? Options: `.vertz/snapshot.json` (gitignored), inside the migrations folder (tracked), or derived from migration history. **Recommendation:** Store in `.vertz/schema-snapshot.json`, gitignored for dev, generated from migration history for deploy.

2. **D1 migration bundling:** D1 has no filesystem. How do migration files get to the Worker? **Recommendation:** Bundle migration SQL into the Worker at build time via Vite plugin or import.

3. **Auto-push safety:** In dev mode, should destructive changes (drop table, drop column) require confirmation? **Recommendation:** Log a warning but apply automatically in dev. Block in deploy unless `--force` flag is passed.

---

*This PRD focuses on wiring existing `@vertz/db` migration infrastructure into a seamless developer experience for the entity-todo demo. The building blocks exist — the work is integration and polish.*
