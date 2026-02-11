# db-016: CLI commands (migrate dev, deploy, push, status)

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 6: CLI + Cache-Readiness Primitives
- **Estimate:** 16 hours
- **Blocked by:** db-015
- **Blocks:** db-018

## Description

Implement CLI commands for the migration workflow.

Reference: `plans/db-design.md` Section 1.10; `plans/db-implementation.md` Phase 6

### Commands:
- `vertz db migrate dev --name <name>` -- generate snapshot, diff against database, generate SQL, write migration file, apply
- `vertz db migrate deploy` -- apply all pending migrations (production)
- `vertz db push` -- push schema directly to database (no migration file, dev shortcut)
- `vertz db migrate status` -- show pending/applied migrations

### Interactive features:
- Rename confirmation prompt during `migrate dev` (when differ detects potential renames)
- Dry-run output showing what would be applied

### Integration with existing CLI:
- Commands integrate into the existing `vertz` CLI infrastructure (from `@vertz/cli`)
- Or standalone `vertz-db` binary if CLI is not available

## Acceptance Criteria

- [ ] `migrate dev` generates migration file from schema diff
- [ ] `migrate dev` applies the generated migration
- [ ] `migrate dev` updates the snapshot
- [ ] `migrate deploy` applies all pending migrations
- [ ] `push` pushes schema directly without creating a migration file
- [ ] `status` reports pending and applied migrations
- [ ] Rename detection prompts for confirmation
- [ ] Integration test: migrate dev creates a SQL file with correct content
- [ ] Integration test: push modifies database schema directly

## Progress

