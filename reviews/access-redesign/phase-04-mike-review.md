# Phase 4: Versioning & Grandfathering -- Mike (Architecture) Review

- **Reviewer:** mike
- **Date:** 2026-03-09
- **Scope:** Design doc alignment, architecture decisions, cross-cutting concerns

## Findings

### Blockers

**B1. `createPlanManager()` is a standalone factory, not integrated into `defineAccess()` as the design doc specifies.**
The design doc (access-redesign.md lines 870, 887-900) explicitly states:

> "Where does `access.plans` live? `defineAccess()` returns an `AccessDefinition` object. The `plans` property on it provides the plan management API (migrate, schedule, resolve, grandfathered)."

The implementation creates a separate `createPlanManager()` factory with its own config. This is an architectural deviation -- the design doc envisions a single entry point (`defineAccess()`) that returns everything the user needs, including versioning. The current approach forces users to:
1. Define plans in `defineAccess()` config
2. Extract those plan definitions
3. Manually create stores
4. Pass everything to `createPlanManager()`
5. Wire the `planVersionStore` back into `createAccessContext()`

This is dual-wiring that the design doc explicitly avoided. The `defineAccess()` return should include a `plans` property with the PlanManager API, or this should be documented as an intentional deviation.

**B2. `initialize()` does NOT set tenant versions for new tenants.**
When `initialize()` creates version 1 for a plan, it does not set tenant versions for existing tenants. Existing tenants only get grandfathered on version > 1 (plan-manager.ts line 158). This means:
- Deploy 1: `initialize()` creates v1, existing tenants have `tenantVersion = null`
- Deploy 2: `initialize()` creates v2, checks existing tenants via `listByPlan()`, but `getTenantVersion()` returns `null` so the `tenantVersion < version` check (line 165) fails because `null < 2` is `false` in JS (comparison with null)

This means existing tenants on v1 are NOT automatically grandfathered when v2 is created unless they had their version explicitly set. The integration test (auth-versioning.test.ts line 61) manually sets `versionStore.setTenantVersion('org-acme', 'pro', 1)` after the first initialize, which papers over this gap. In production, who sets the tenant version after the first `initialize()`? There needs to be either:
- `initialize()` auto-sets tenant versions for all existing tenants on first deploy
- A documented manual step for initial tenant version assignment
- A separate `assignPlan()` wrapper that also sets the version

### Should-Fix

**S1. `resolveEffectiveFeatures` and `resolveAllLimitStates` duplicate version resolution logic.**
Both functions (access-context.ts lines 558-604 and 618-704) independently call `planVersionStore.getTenantVersion()` and `planVersionStore.getVersion()`. This is duplicated logic that should be extracted into a shared `resolveVersionedPlanDef()` helper that returns the effective plan definition (either from snapshot or current config). The duplication increases the risk of the two paths diverging in behavior.

**S2. `resolveAllLimitConsumptions` also duplicates the same version resolution.**
A third copy of the version resolution pattern exists in `resolveAllLimitConsumptions` (access-context.ts lines 731-741). Three copies of the same logic is a maintenance hazard.

**S3. `PlanManager` creates new instances per deploy -- no single long-lived manager.**
The integration test and usage pattern show creating a new `createPlanManager()` for each deployment (different plan configs). This means the event handlers are lost between deploys. In production, you'd likely have a single long-lived manager instance, but the plan config would change between deploys. The current architecture doesn't handle the case where you want to update plans on a running server without recreating the manager.

**S4. `listByPlan` is optional on `PlanStore` but required for grandfathering to work.**
The `PlanStore` interface defines `listByPlan?` as optional (plan-store.ts:46). But `initialize()` in `createPlanManager` needs it to find existing tenants for grandfathering. If `listByPlan` is undefined, existing tenants silently get no grandfathering (plan-manager.ts:174 returns `[]`). This is a correctness hazard -- `PlanManagerConfig` should either require a `PlanStore` with `listByPlan` or document the limitation prominently.

**S5. The design doc mentions "warning when a plan has > 3 concurrent active versions" (line 933) -- not implemented.**
The Anti-patterns section says: "Too many active versions -- Warning when a plan has > 3 concurrent active versions." This is not implemented and not mentioned in the phase plan. Should be tracked as future work or implemented here.

### Observations

**O1. `access.plans.initialize()` is idempotent per the plan but has a subtle race condition.**
Two concurrent `initialize()` calls could both check `getCurrentHash()`, both find no match, and both call `createVersion()`. The InMemory store would create two versions. With a DB store, this would require a uniqueness constraint on `(planId, hash)` or a transaction.

**O2. No validation that plan IDs in `createPlanManager` match plan IDs in `defineAccess()`.**
A user could pass different plan IDs to `createPlanManager` vs `defineAccess()`, leading to silent mismatches where versioning tracks plans that the access engine doesn't know about.

**O3. `extractSnapshot()` does a shallow copy of limits.**
`plan-manager.ts:128` does `{ ...planDef.limits }` which is a shallow copy. If `LimitDef` objects are later mutated (unlikely but possible), the snapshot would be affected. A deep copy or `Object.freeze` would be safer.

**O4. The `addOn` skip in `initialize()` is correct but undocumented.**
`initialize()` skips add-ons (line 139: `if (planDef.addOn) continue`). This is architecturally correct (add-ons don't have independent versions), but it's not documented in the phase plan or design doc.

## Verdict

**Changes Requested.** B1 is an architectural deviation from the design doc that needs resolution or explicit documentation. B2 is a correctness bug -- tenants on the initial plan version are never assigned a version number, so grandfathering on subsequent deploys is broken unless the version is manually set. S1/S2 address meaningful code duplication. S4 is a silent failure mode that needs attention.
