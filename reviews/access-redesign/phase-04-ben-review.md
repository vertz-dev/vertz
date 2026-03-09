# Phase 4: Versioning & Grandfathering -- Ben (Core/Types) Review

- **Reviewer:** ben
- **Date:** 2026-03-09
- **Scope:** Type system, compile-time guarantees, runtime correctness

## Findings

### Blockers

**B1. `PlanVersionStore.createdAt` uses wall-clock time, not injected clock.**
In `InMemoryPlanVersionStore.createVersion()` (line 62), the `createdAt` field is set to `new Date()` -- the real wall clock. However, `createPlanManager` accepts a `clock` parameter for testable time. The version store ignores this clock entirely. This means `PlanVersionInfo.createdAt` is non-deterministic in tests and will always reflect real time, not the injected test clock. The store's `createVersion` should accept an optional `createdAt` parameter, or the `PlanManager` should pass the clock value through.

**B2. Downgrade warning is a no-op -- dead code path.**
The `migrateTenant()` function in `plan-manager.ts` lines 209-223 checks if features were removed in the new version, but the code does nothing with the result. The `break` statement exits the inner loop, but no warning is emitted (no `console.warn`, no event, no return value). The design doc (line 925) states: "`migrate()` warns if new version has fewer features than the tenant's current version." The phase plan (Expected Behaviors, line 169) requires testing "Given new version has fewer features... warns but still migrates." There is no test for this behavior, and the implementation is dead code. This must either emit a `plan:downgrade_warning` event, log a warning, or include the warning in the migrate event metadata.

### Should-Fix

**S1. `PlanSnapshot.limits` is typed as `Record<string, unknown>` -- loses type safety.**
`PlanSnapshot.limits` (plan-version-store.ts:14) uses `Record<string, unknown>` instead of `Record<string, LimitDef>` or a properly typed structure. This propagates through `resolveAllLimitStates` and `resolveAllLimitConsumptions` in access-context.ts, where the limits are cast via `as typeof limitDef` (lines 652, 749). These casts bypass the type system and could silently produce incorrect behavior if the stored snapshot shape drifts from what the code expects. The snapshot should use `Record<string, LimitDef>` to maintain type safety through the chain.

**S2. `PlanSnapshot.features` allows both `readonly string[]` and `string[]`.**
The union type `readonly string[] | string[]` (plan-version-store.ts:13) is redundant since `readonly string[]` is a supertype of `string[]` in TypeScript's type system. This same pattern exists in `PlanHashInput.features` (plan-hash.ts:11) and `PlanDef.features`. Should be simplified to `readonly string[]` everywhere.

**S3. `GraceDuration` type allows arbitrary string values at the PlanDef level.**
`GraceDuration` is typed as `'1m' | '3m' | '6m' | '12m' | 'indefinite'` in define-access.ts, but the runtime `resolveGraceEnd()` function in plan-manager.ts (line 97) uses a `GRACE_DURATION_MS` lookup object that only handles `'1m'`, `'3m'`, `'6m'`, `'12m'`. If a new duration like `'2m'` is added to the type but not the lookup, it silently falls through to the default (1 billing cycle). The lookup should be exhaustive or validated at initialization time.

**S4. `PlanEvent` type uses optional fields for all event-specific data.**
`PlanEvent` (plan-manager.ts:24-33) has `tenantId?`, `version?`, `previousVersion?`, `currentVersion?`, `graceEnds?` all optional. This means consumers cannot distinguish between "this field was intentionally not set" and "this event type doesn't include this field." A discriminated union based on `type` would provide compile-time guarantees that the right fields are present for each event type.

### Observations

**O1. No `.test-d.ts` type flow tests for Phase 4.**
The phase plan doesn't mention type-level tests, and none were added. Given the new types (`PlanManager`, `PlanManagerConfig`, `TenantPlanState`, `PlanEvent`, etc.), there should be type flow verification to ensure generics and type narrowing work correctly at compile time.

**O2. `PlanHashInput.price` has a loose type.**
`{ amount: number; interval: string }` allows any string for `interval`, while `PlanPrice` in define-access.ts constrains it to specific values. The hash input should reuse `PlanPrice` or at least match its constraints to prevent inconsistency.

**O3. `schedule()` accepts `Date | string` for `at` -- string parsing is fragile.**
`new Date(opts.at)` (plan-manager.ts:240) relies on JavaScript's Date constructor parsing, which has cross-engine inconsistencies. ISO-8601 strings are generally safe, but partial dates like `'2026-06-01'` may be interpreted as UTC in some engines and local time in others.

## Verdict

**Changes Requested.** B1 and B2 must be addressed -- the injected clock is ignored in version creation timestamps, and the downgrade warning is dead code with no test. S1 and S4 should be addressed for type safety.
