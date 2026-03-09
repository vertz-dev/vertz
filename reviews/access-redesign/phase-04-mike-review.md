# Phase 4: Plan Versioning & Grandfathering — Mike Review

- **Reviewer:** mike
- **Date:** 2026-03-09
- **Focus:** Architecture, cross-cutting concerns, design doc alignment, risk assessment

## Verdict: Approved with notes

## Findings

### Blockers

None. The architecture is sound and the implementation matches the design intent. The issues below are real but not blocking — they can be addressed incrementally.

### Should Fix

1. **Design deviation: `createPlanManager()` is standalone, not integrated into `AccessDefinition`**
   The design doc (lines 844-870) shows `access.plans.migrate(...)`, `access.plans.resolve(...)`, etc. as methods on the access definition object. The implementation creates a standalone `createPlanManager(config)` that requires manual wiring of four stores. This is a conscious simplification (the plan manager needs runtime stores that `defineAccess()` doesn't have), but the design doc should be updated to reflect the actual API surface. If the intent is to eventually provide an integrated `access.plans.*` facade, document that as a future integration step.

2. **`initialize()` grandfathering is raceable in multi-instance deployments**
   `plan-manager.ts:158-169` — When `version > 1` is detected, `initialize()` lists all tenants on the plan and sets grandfathering state for each. In a multi-instance deployment (multiple servers starting simultaneously), two instances could both detect the version change and both attempt to grandfather the same tenants. With `InMemoryPlanVersionStore` this is moot, but with a database-backed store, this could create duplicate writes or race conditions. The `createVersion` call itself is not atomic with the grandfathering writes — another instance could create a version between the hash check and the version creation. This should be documented as a known limitation of the in-memory implementation, with the expectation that DB-backed stores will use transactions.

3. **`listTenantsOnPlan` falls back to empty array when `planStore.listByPlan` is undefined**
   `plan-manager.ts:173-178` — If the `PlanStore` does not implement the optional `listByPlan` method, `initialize()` silently skips grandfathering entirely. A plan version is created, but zero tenants are grandfathered — existing tenants are implicitly forced to the new version with no grace period. This is a silent behavior change based on store capabilities. At minimum, this should log a warning. Ideally, `PlanManagerConfig` should require a `PlanStore` with `listByPlan` (making the method non-optional for the plan manager's use case).

4. **No version count warning per design doc**
   The design doc (line 933) specifies: "Too many active versions — Warning when a plan has > 3 concurrent active versions." This is not implemented. The `initialize()` method creates versions without checking how many active versions exist. For pre-v1 this is acceptable, but it should be tracked as a TODO.

5. **`resolveEffectiveFeatures` and `resolveAllLimitStates` have duplicated version resolution logic**
   `access-context.ts:658-679` and `access-context.ts:737-745` both independently resolve the tenant's versioned snapshot via `getTenantVersion` + `getVersion`. This pattern is repeated three times (features, limit states, limit consumptions). If the version resolution logic needs to change (e.g., adding a cache, or handling version expiration), it must be updated in three places. Extracting a shared `resolveVersionedSnapshot(orgId, planId, planVersionStore)` helper would reduce duplication and risk.

6. **`access-context.ts` has a stale comment: "checkLayers1to3" says "Layers 1-4"**
   `access-context.ts:101` — The comment says "checks Layers 1-4 with pre-resolved orgId" but the function is named `checkLayers1to3` and only handles through Layer 3 (plan features). Layer 4 (limits) is handled separately in `can()`. The comment should match the function name.

### Notes

1. **Clean separation of concerns** — The split between `plan-hash.ts` (pure computation), `plan-version-store.ts` (storage), `grandfathering-store.ts` (storage), and `plan-manager.ts` (orchestration) follows good module architecture. Each file has a single responsibility and can be tested independently.

2. **Clock injection is well-designed** — The `clock?: () => Date` pattern in `PlanManagerConfig` is exactly right for testability. All time-dependent logic uses the injected clock, making tests deterministic. Good.

3. **Event system is minimal but sufficient** — The `on(handler)` / `off(handler)` pattern is lightweight and avoids over-engineering. For pre-v1, this is the right level of abstraction. If event filtering or typed event maps are needed later, they can be added without breaking changes.

4. **Migration semantics are well-considered** — The distinction between `migrate(planId)` (grace-period-aware batch) and `migrate(planId, { tenantId })` (immediate single-tenant) covers the two primary migration use cases. The `schedule()` method for setting future dates is a nice addition.

5. **Versioned resolution in access-context is transparent to callers** — The `can()`, `check()`, `canAndConsume()`, and `unconsume()` methods all use versioned snapshots when available, without any change to their public API. Callers don't need to know whether versioning is active. This is the right architectural approach.

6. **Risk: snapshot storage growth** — Each plan version stores a full snapshot of features, limits, and price. For SaaS products with many plans and frequent iteration, this could grow significantly over time. The design doc acknowledges this (line 1321: "Grows with version history. Needed for grandfathering.") but there is no pruning mechanism. Old versions with no remaining grandfathered tenants could be garbage collected. Not blocking for pre-v1, but worth tracking.
