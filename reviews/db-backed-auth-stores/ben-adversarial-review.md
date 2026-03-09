# Ben — Core/Types Adversarial Review

**Feature:** DB-Backed Auth Stores [#1059]

## Summary

DB-backed implementations for 7 auth stores (User, Session, RoleAssignment, Closure, Flag, Plan, OAuth), dialect-aware DDL, shared test factories, integration test, and exports.

## Findings

### Blockers

None identified.

### Should-Fix

1. **`INSERT OR IGNORE` is SQLite-only syntax** — All DB stores use `INSERT OR IGNORE` which only works on SQLite. For PostgreSQL compatibility, need `ON CONFLICT DO NOTHING` or dialect-aware SQL generation. This is acceptable for now since the DDL helper already splits by dialect, but the DML queries hardcode SQLite syntax. The design doc explicitly targets SQLite first, so this is deferred.

2. **DbPlanStore.assignPlan uses DELETE+INSERT instead of UPSERT** — The `assignPlan` method deletes then inserts. Under concurrent access, another reader could see no plan between the DELETE and INSERT. Consider using `INSERT ... ON CONFLICT(tenant_id) DO UPDATE SET` for atomicity. Same issue as (1) — dialect-dependent.

3. **DbPlanStore.updateOverrides does 3 round-trips** — Checks plan exists, loads existing overrides, checks if override row exists, then inserts or updates. Could be reduced with upsert. Not a blocker since auth operations are low-throughput.

### Observations

- `AuthDbClient` interface is well-designed — minimal surface avoids the `ModelDef` type variance issue.
- `DbFlagStore` write-through pattern correctly handles the synchronous `FlagStore` interface constraint.
- All DB stores follow the same constructor pattern (`constructor(private db: AuthDbClient) {}`).
- Type conversions (ISO string to Date, SQLite INTEGER to boolean) are consistent across stores.
- `resolveInheritedRole` in `DbRoleAssignmentStore` is correctly duplicated from InMemory — the logic is storage-agnostic.

### Type Safety

- All `query<T>()` calls have explicit row type annotations. Good.
- `AuthDbClient.query` returns `Result<QueryResult<T>, ReadError>` — all stores correctly check `.ok` before accessing `.data`.
- No `as any` or `@ts-ignore` in any DB store.
- `DbDialectName` type is `'sqlite' | 'postgres'` — closed union, safe.

## Verdict

**Approve with notes.** The SQLite-only DML syntax is a known limitation documented in the design. All type safety patterns are solid. The `AuthDbClient` abstraction cleanly decouples auth stores from the full `DatabaseClient` type.
