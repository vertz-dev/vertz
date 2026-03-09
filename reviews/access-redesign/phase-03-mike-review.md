# Phase 3: Overrides + Advanced Limits — Mike (Architecture) Review

- **Reviewer:** mike
- **Commit:** e8ffe848
- **Date:** 2026-03-09

## Scope

Reviewed architecture alignment, design doc conformance, and cross-cutting concerns for Phase 3:

- Phase plan: `plans/access-redesign/phase-03-overrides-and-advanced-limits.md`
- Design doc: `plans/access-redesign.md` (Overrides, Override Edge Cases, One-off, Add-on Compatibility, Overage sections)
- All Phase 3 implementation files
- Export surface and cross-package impact

## Findings

### Blockers

**B1. One-off add-on semantics are entirely missing — this is a scope gap, not a deferral.**

The Phase 3 plan explicitly lists one-off add-on semantics as item #6 of "What to Implement":
> One-off add-ons: Lifetime addition, Stackable, Persists across plan changes, FIFO consumption after base plan periodic allocation.

The design doc has a full section ("One-off add-on semantics") specifying four concrete behaviors. None are implemented:

- The wallet store has no concept of "lifetime" vs "periodic" entries
- `computeEffectiveLimit()` makes no distinction between one-off and recurring add-ons
- `InMemoryPlanStore.attachAddOn()` stores add-ons as a flat `Set<string>` with no quantity tracking (needed for stackability)
- No FIFO consumption logic exists

The `auth_plan_addons` DB table does have an `is_one_off` column (from the DB stores work), proving the design anticipated this. But the runtime logic is missing. This is NOT a known deferral — it's listed as in-scope and unimplemented.

**B2. `access.overrides` API on `AccessDefinition` not wired — design deviation.**

The Phase 3 plan item #9 says: "`access.overrides` API on the `AccessDefinition` return object — delegates to override store."

The design doc shows:
```ts
await access.overrides.set('org-123', { limits: { prompts: { add: 200 } } });
```

This API does not exist. `defineAccess()` returns a frozen `AccessDefinition` object with no `overrides` property. The override store is a separate class that must be manually instantiated. This is a design deviation that should have been escalated.

### Should-Fix

**S1. Two override systems coexist with no migration path or deprecation.**

`OrgPlan.overrides` (old Phase 2 system) and `OverrideStore` (new Phase 3 system) both affect limit resolution. In `computeEffectiveLimit()`:

1. Base plan max is computed
2. Add-on limits are added
3. Old `OrgPlan.overrides` are applied via `Math.max()` (can only increase)
4. New `OverrideStore` overrides are applied (can increase or decrease via `add`/`max`)

These layers interact in non-obvious ways. If both systems are set for the same limit key, the old system runs first, potentially raising the limit, and then the new system's `add` or `max` operates on the inflated value. There is no documentation about this interaction, no test covering both systems active simultaneously, and no plan to deprecate `OrgPlan.overrides`.

**S2. Overage billing validation gaps — Phase 3 plan items partially unimplemented.**

The Phase 3 plan lists:
- "Without payment processor adapter, overage config is validation error in production" -- NOT implemented
- "Overage with InMemory store -- tracked but not billed (test/dev mode)" -- NOT implemented

There is no production/development mode distinction in the codebase. The `defineAccess()` function accepts `overage` config on any limit without any environment check. This is arguably reasonable for now (Phase 5 handles billing integration), but the Phase 3 plan explicitly lists these as expected behaviors.

**S3. `OverrideStore` is not integrated into `defineAccess()` config.**

The design doc architecture shows overrides flowing from the access definition:
```
defineAccess() config -> override store -> can() resolution
```

But the actual flow is:
```
defineAccess() config -> AccessDefinition (no override awareness)
createAccessContext({ overrideStore }) -> can() resolution
```

The override store is injected at the context level, not the definition level. This means:
- You can't configure a default override store in `defineAccess()`
- The `AccessDefinition` type has no override-related properties
- There's no centralized validation (validation requires both `AccessDefinition` AND the override store)

This is an architectural decision that should be documented. It may be intentional (overrides are runtime, definition is config-time), but it deviates from the design doc's `access.overrides` API.

**S4. `computeEffectiveLimit()` is `async` but only uses `await` for `planStore.getAddOns?()`.**

The function signature forces async, but most of the logic is synchronous. This means every `can()` call has unnecessary async overhead even when no add-ons are involved. Consider splitting: if no `planStore.getAddOns` is needed (no add-ons in the plan config), skip the async path.

### Observations

**O1.** The `checkAddOnCompatibility()` and `getIncompatibleAddOns()` functions are well-placed in `plan-store.ts`. They operate on plan definitions and are stateless. Good separation.

**O2.** The overage cap calculation uses `>=` comparison (`overageCost >= ws.overageCap`), which means the cap is the maximum *inclusive*. The design doc says "max $500 overage per period" — `>=` is correct.

**O3.** The `AddOnRequires` type uses `readonly string[] | string[]` for `plans`, which is permissive. This is consistent with how `PlanDef.features` is typed. Acceptable.

**O4.** The Phase 3 commit bundles override store, overage billing, AND add-on compatibility into a single commit (e8ffe848). These are three distinct features. For a strict TDD workflow, each should have been a separate commit series. However, since this is a phase-level commit, it's acceptable if the TDD cycles happened iteratively within the commit.

**O5.** The wallet store was NOT modified in Phase 3. The Phase 3 plan lists `wallet-store.ts` as a file to modify for one-off limit persistence, which confirms B1 — the one-off work was not done.

## Verdict

**Changes Requested** — B1 (one-off add-on semantics missing) is a clear scope gap against the Phase 3 plan. B2 (`access.overrides` API missing) is a design deviation. S1 (two override systems) needs documentation and a deprecation plan for `OrgPlan.overrides`.
