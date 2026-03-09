# Phase 4: Plan Versioning & Grandfathering — Nora Review

- **Reviewer:** nora
- **Date:** 2026-03-09
- **Focus:** API surface quality, DX ergonomics, schema-to-UI type flow

## Verdict: Approved with notes

## Findings

### Blockers

None.

### Should Fix

1. **Design doc says `access.plans.migrate()` — implementation uses standalone `createPlanManager()`**
   The design doc (lines 846-870) describes the plan management API as `access.plans.migrate(...)`, `access.plans.resolve(...)`, etc., living as a property on the `AccessDefinition` object returned by `defineAccess()`. The actual implementation creates a separate `createPlanManager()` factory that must be instantiated independently with its own config (`PlanManagerConfig`). This is a design deviation. The developer must manually wire up `versionStore`, `grandfatheringStore`, `planStore`, and `clock` — four separate stores — just to get plan versioning working. The design doc implied a more integrated API surface. This should either be reconciled in the design doc, or the integration glue should be provided so developers can write `access.plans.migrate(...)` as documented.

2. **`resolve()` returns `TenantPlanState | null` but the `snapshot` field lacks type safety**
   `plan-manager.ts:248-273` — The `resolve()` return type includes `snapshot: PlanSnapshot`, but `PlanSnapshot.limits` is `Record<string, unknown>`. A developer receiving this response would need to cast or validate the limits themselves. Since the design doc shows `resolve()` as the primary way to query a tenant's effective plan, the snapshot should carry typed limit definitions — not `unknown`. This directly impacts how developers build plan comparison UIs and upgrade prompts.

3. **`schedule()` silently overwrites existing grace dates with no confirmation**
   `plan-manager.ts:239-246` — `schedule()` sets a new `graceEnds` date for all grandfathered tenants of a plan, unconditionally overwriting whatever was there before. If a tenant had a custom grace end (set via a support override), calling `schedule()` for the plan would silently destroy it. There is no way to schedule only for tenants that currently have the default grace period. At minimum, the method should emit an event listing which tenants were updated, or accept a filter option.

4. **`migrate()` with `{ tenantId }` does not verify the tenant is actually on the specified plan**
   `plan-manager.ts:185-188` — When `migrate('pro', { tenantId: 'org-1' })` is called, it migrates `org-1` to the latest version of `pro` without checking whether `org-1` is actually on the `pro` plan. If `org-1` is on the `enterprise` plan, this silently sets their `pro` tenant version and removes their `pro` grandfathering state (which may not exist). The method should verify the tenant is on the given plan before migrating.

5. **No `dispose()` method on `PlanManager`**
   Both `PlanVersionStore` and `GrandfatheringStore` have `dispose()` methods, but the `PlanManager` that wraps them does not. If a developer creates a plan manager for testing and wants to clean up, they must know to dispose the underlying stores individually. Adding `dispose()` to `PlanManager` would be consistent with the rest of the auth module's resource management pattern.

### Notes

1. **Event handler registration is fire-and-forget** — `on()` returns `void`, not an unsubscribe function. The developer must keep a reference to the handler and call `off(handler)` explicitly. Most modern event APIs return an unsubscribe callback: `const unsub = manager.on(handler); unsub();`. This is a minor ergonomic miss but noticeable for developers used to React/Vue patterns.

2. **`checkGraceEvents()` is not automatically scheduled** — The design doc mentions events like `plan:grace_approaching` and `plan:grace_expiring`, but the implementation requires the developer to call `checkGraceEvents()` manually (presumably on a cron). This is documented behavior but the API surface doesn't make it obvious — a developer reading the `PlanManager` interface might expect events to fire automatically. A JSDoc comment on `checkGraceEvents` explaining the expected invocation pattern (e.g., "call this from a daily cron job") would help.

3. **`schedule()` accepts `Date | string` but does no validation** — If the developer passes an invalid date string (e.g., `'not-a-date'`), `new Date('not-a-date')` produces an `Invalid Date` object which is then stored as the grace end. No error is thrown, but future comparisons against it will produce unexpected results. A validation guard would improve DX.
