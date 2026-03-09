# Phase 4: Versioning & Grandfathering -- Nora (Frontend/API) Review

- **Reviewer:** nora
- **Date:** 2026-03-09
- **Scope:** API ergonomics, DX quality, naming conventions

## Findings

### Blockers

**B1. Design doc says `access.plans.initialize()` but implementation uses `createPlanManager()`.**
The design doc (access-redesign.md lines 870, 887-888, 896-900) clearly specifies that the versioning API lives on `access.plans` -- returned by `defineAccess()`. The implementation instead creates a separate `createPlanManager()` factory that requires manually wiring 4 stores. This is a significant API deviation from the design doc:

Design doc API:
```ts
const access = defineAccess({ ..., clock: () => new Date() });
await access.plans.initialize();
await access.plans.migrate('pro_monthly');
```

Actual API:
```ts
const manager = createPlanManager({
  plans: { ... },
  versionStore: new InMemoryPlanVersionStore(),
  grandfatheringStore: new InMemoryGrandfatheringStore(),
  planStore: new InMemoryPlanStore(),
  clock: () => new Date(),
});
await manager.initialize();
```

The user must manually extract plan definitions from their `defineAccess()` config and pass them separately to `createPlanManager()`, along with 3 store instances. This is poor DX -- the design doc envisioned a single `defineAccess()` call that wire everything together. This deviation should at minimum be documented as intentional with rationale, or addressed by integrating `createPlanManager` into the `defineAccess` return value.

### Should-Fix

**S1. `resolve()` takes `tenantId` but design doc shows it returning `planId`.**
The `resolve(tenantId)` method returns `TenantPlanState | null` which includes `planId`. But it assumes a tenant has exactly one plan. If a tenant has multiple plans (design doc mentions plan groups), this API would need to accept an optional `planId` parameter or return an array. Currently, `resolve()` calls `planStore.getPlan(tenantId)` which returns a single plan. This may need revisiting for multi-plan scenarios.

**S2. `schedule()` is under-documented -- what does it actually schedule?**
The `schedule()` method sets a grace end date on all currently grandfathered tenants. But the name "schedule" implies scheduling a future action (e.g., a cron job). What it actually does is overwrite the grace end dates. If a tenant was set to `indefinite` grandfathering and you call `schedule()`, their null graceEnds gets replaced with a Date -- effectively ending their indefinite status. This should either be named `setMigrationDeadline()` or documented to clarify it overrides existing grace periods.

**S3. Event handler API uses bare `on(handler)` without event type filtering.**
`manager.on(handler)` receives all events. There's no way to subscribe to specific event types (e.g., only `plan:migrated`). The typical pattern in Node.js-style emitters is `on('plan:migrated', handler)`. The current API requires filtering in userland:
```ts
manager.on((event) => {
  if (event.type === 'plan:migrated') { /* ... */ }
});
```
This is functional but less ergonomic than a typed event emitter.

**S4. `PlanManagerConfig.plans` requires the full `PlanDef` but only uses a subset.**
`createPlanManager` takes `Record<string, PlanDef>` but only reads `features`, `limits`, `price`, `grandfathering`, and `addOn` from each plan. The `title`, `description`, `group`, and other fields are ignored. This means users must pass the full plan definition even though most of it is unused by the version manager. A more focused config type would be clearer.

### Observations

**O1. No `clock` injection on `defineAccess()` as the design doc specifies.**
The design doc (line 887) shows: `const access = defineAccess({ ..., clock: () => new Date('2027-01-16') })`. The current `defineAccess()` function does not accept a `clock` parameter. The clock is only accepted by `createPlanManager()`.

**O2. `checkGraceEvents()` must be called manually -- no automatic periodic check.**
The phase plan (line 204) notes that grace events "don't fire automatically -- they're evaluated when initialize() or a periodic check runs." But `initialize()` does NOT call `checkGraceEvents()`. There is no guidance on how users should wire periodic checks. This is fine for Phase 4 but should be documented.

**O3. Naming: `grandfathered()` method returns `GrandfatheringState[]` -- verb-noun mismatch.**
The method name `grandfathered` is an adjective, but it's used as a query method. `listGrandfathered()` would better communicate that it returns a list.

## Verdict

**Changes Requested.** B1 is a significant API deviation from the design doc that affects developer experience. The `createPlanManager()` approach is valid architecturally, but the disconnect from the design doc needs resolution -- either integrate it into `defineAccess()` output or document the deviation with rationale. S2 and S3 should be addressed for API clarity.
