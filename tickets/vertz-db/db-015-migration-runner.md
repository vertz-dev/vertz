# db-015: Migration runner + history tracking

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 5: Migration Differ + Runner
- **Estimate:** 16 hours
- **Blocked by:** db-014
- **Blocks:** db-016

## Description

Implement the migration runner that applies SQL migrations to the database, tracks migration history, and manages migration files.

Reference: `plans/db-design.md` Section 1.10; `plans/db-implementation.md` Phase 5

### Migration runner:
- Create `_vertz_migrations` history table on first run
- Apply pending migrations in timestamp order
- Record each applied migration with name, timestamp, checksum
- Dry-run mode: show SQL without executing
- Detect and refuse to apply out-of-order migrations

### File management:
- Timestamped SQL files: `NNNN_description.sql`
- Snapshot update after each migration
- Lock file for tracking applied migrations

### Migration status:
- Report pending vs. applied migrations
- Detect drift (applied migration modified after application)

## Acceptance Criteria

- [ ] Runner creates `_vertz_migrations` table on first run
- [ ] Runner applies pending migrations in order
- [ ] Runner records applied migration in history table
- [ ] Runner skips already-applied migrations
- [ ] Dry-run mode outputs SQL without executing
- [ ] Migration files use timestamped naming convention
- [ ] Snapshot is updated after successful migration
- [ ] Migration status shows pending and applied migrations
- [ ] Integration test: apply two migrations in sequence, verify both recorded
- [ ] Integration test: re-run after applying shows no pending migrations

## Progress

