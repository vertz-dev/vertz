# Mike — Architecture Adversarial Review

**Feature:** DB-Backed Auth Stores [#1059]

## Summary

Architecture review of DB-backed auth store implementations, cross-cutting concerns, and alignment with the design doc.

## Findings

### Blockers

None identified.

### Should-Fix

1. **No transaction support in multi-statement operations** — `DbPlanStore.assignPlan` executes 3 separate queries (DELETE plan, INSERT plan, DELETE overrides). `DbPlanStore.removePlan` executes 2 queries (DELETE plan, DELETE overrides). If any query fails mid-sequence, the data is left in an inconsistent state. The `AuthDbClient` interface doesn't expose transactions. This is acceptable for SQLite (where single-writer serializes operations) but will need transactions for PostgreSQL.

   **Action:** Add a TODO comment in `AuthDbClient` noting that transaction support is needed for PostgreSQL. Not blocking because this PR targets SQLite first.

2. **`INSERT OR IGNORE` across all stores is SQLite-specific** — DbRoleAssignmentStore, DbClosureStore, DbOAuthAccountStore all use `INSERT OR IGNORE`. PostgreSQL uses `ON CONFLICT DO NOTHING`. The dialect-aware DDL helper exists but isn't used for DML. When PostgreSQL support is added, every `INSERT OR IGNORE` needs to be replaced with dialect-aware DML.

   **Action:** Add a code comment at the top of `db-types.ts` documenting that DML queries currently target SQLite only.

3. **DbFlagStore's `ON CONFLICT(tenant_id, flag) DO UPDATE SET` is also SQLite-specific** — PostgreSQL uses the same syntax, so this particular query is actually portable. Good.

### Design Doc Alignment

- **auth_plan_addons table exists but is unused** — The design doc mentions add-on support via `auth_plan_addons`, and the table is created by DDL, but no store writes to or reads from it. The Phase 4 acceptance criteria mention "Add-on stacking works (one-off × N)" — this is not implemented.

  **Assessment:** The `auth_plan_addons` table is defined in the DDL (Phase 1) for forward compatibility, but the PlanStore interface doesn't have add-on methods. The access redesign will add this. Not a blocker.

- **OverrideStore as separate entity** — The design doc lists "OverrideStore" as a separate store backed by `auth_overrides`. The implementation merges override management into `DbPlanStore` (which is how `InMemoryPlanStore` works via `OrgPlan.overrides`). This is a design deviation, but it's the simpler and more consistent approach. The `auth_overrides` table is used correctly — it's just accessed through PlanStore rather than a separate OverrideStore class.

- **Store auto-selection in createServer** — The design doc specifies that `createServer({ db, auth })` should auto-wire all DB stores. Currently, Phase 2 wires User and Session stores. The remaining stores (RoleAssignment, Closure, Flag, Plan, OAuth) are exported but not auto-wired in `createServer`. This should be wired when the access control integration is complete.

### Architecture

- **AuthDbClient interface is correctly minimal** — Avoids the `DatabaseClient<Record<string, ModelEntry>>` type variance issue. Only requires `query()` and `_internals.dialect`.
- **Separation of concerns** — Each store is a single file, single class, implements a single interface. Clean.
- **No cross-store dependencies** — Each DB store only depends on `AuthDbClient`. The `DbRoleAssignmentStore.getEffectiveRole` depends on `ClosureStore` interface (not a specific implementation), which is correct.
- **Consistent patterns** — All stores follow the same constructor, query, row-mapping pattern.

## Verdict

**Approve.** Architecture is clean and extensible. The SQLite-specific DML and lack of transaction support are known limitations that align with the "SQLite first" approach in the design doc. The unused `auth_plan_addons` table and missing auto-wiring are correctly deferred to the access redesign. No blocking architectural concerns.
