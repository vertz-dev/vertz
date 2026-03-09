# Phase 3: Override Store & Overage — Ben Review

- **Reviewer:** ben
- **Date:** 2026-03-09
- **Focus:** Core correctness, type safety, runtime behavior

## Verdict: Changes Requested

## Findings

### Blockers

1. **Feature overrides silently ignored for versioned/grandfathered tenants**
   In `access-context.ts`, `resolveEffectiveFeatures()` has two code paths:
   - **Versioned path** (lines 658-678): checks snapshot features, then add-ons, then returns `false` on line 676 — **never checks overrides**.
   - **Non-versioned path** (lines 681-697): checks plan features, add-ons, **then overrides** on line 695.

   This means any tenant on a grandfathered/versioned plan will have their feature overrides silently ignored. An admin sets `overrideStore.set('org-1', { features: ['project:export'] })` for a grandfathered tenant, and `can('project:export')` still returns `false`. This is a data-loss-level bug — the override is stored but never evaluated.

   **Fix:** Add the override check before `return false` on line 676:
   ```ts
   // Check overrides (overrides apply regardless of versioning)
   if (overrides?.features?.includes(entitlement)) return true;
   return false;
   ```

2. **`validateOverrides()` does not validate `add` values**
   The `validateOverrides()` function validates `max` (must be >= -1) but applies zero validation to `add`. Accepted inputs include:
   - `add: NaN` — produces `NaN` in `computeEffectiveLimit`, causing every comparison to return `false`, silently blocking the tenant.
   - `add: Infinity` — produces `Infinity` effective max, bypassing all limits.
   - `add: 1.5` — non-integer, which is inconsistent with the integer requirement on `max` and `LimitDef.max`.

   **Fix:** Add validation for `add` in `validateOverrides()`:
   ```ts
   if (limitDef.add !== undefined) {
     if (!Number.isFinite(limitDef.add) || !Number.isInteger(limitDef.add)) {
       throw new Error(`Override limit '${key}' add must be an integer, got ${limitDef.add}`);
     }
   }
   ```

3. **`validateOverrides()` does not validate `max` is an integer**
   The function checks `max < -1` but does not check `Number.isInteger(max)`. This means `max: 1.5` passes validation. The `LimitDef` validation in `defineAccess()` (line 364) explicitly requires integers — the override validation should match.

   **Fix:** Add `!Number.isInteger(limitDef.max)` check alongside the existing `< -1` check.

### Should Fix

1. **`computeEffectiveLimit` does not guard against `add` making the total negative**
   Line 955: `effectiveMax = Math.max(0, effectiveMax + limitOverride.add)` — this clamps to 0, which is correct for preventing negative limits. But `0` means "disabled" in the limit semantics (hard block), which means `add: -200` on a plan with `max: 100` silently disables the feature entirely rather than reducing it to a floor. The semantic difference between "reduced to zero remaining" and "administratively disabled" should be documented or handled differently.

2. **`LimitOverrideDef` allows both `add` and `max` simultaneously**
   The type permits `{ add: 100, max: 500 }` and there's a test for it (override-store.test.ts line 63). But in `computeEffectiveLimit`, when both are set, `max` takes precedence (line 949) and `add` is silently ignored. The type should either use a discriminated union to prevent this at compile time, or the runtime should explicitly warn/throw when both are set.

3. **Old-style `OrgPlan.overrides` and new-style `OverrideStore` can conflict**
   `computeEffectiveLimit()` applies old-style overrides (line 941-944) via `Math.max(effectiveMax, oldOverride.max)`, then applies new-style overrides (lines 947-958). If an old-style override sets `max: 500` and a new-style override sets `max: 100`, the new-style `max` wins (replacing the total), resulting in 100 — which is lower than the old-style intended 500. The interaction is undocumented and likely confusing during migration.

4. **No type-level tests (`.test-d.ts`) for `OverrideStore`, `TenantOverrides`, or `LimitOverrideDef`**
   The `define-access.test-d.ts` file tests `LimitOverride` from `PlanStore` but there are no type-level tests for the new override types. Per project rules, every generic/type in public signatures needs a `.test-d.ts` proving the type flows correctly.

### Notes

- The `InMemoryOverrideStore.set()` merge behavior for limits (line 53: `existing.limits = { ...existing.limits, ...overrides.limits }`) is a shallow merge — it replaces the entire `LimitOverrideDef` for a key rather than merging `add` and `max` independently. This is a reasonable design choice but should be documented on the interface, since `set({ limits: { prompts: { add: 100 } } })` followed by `set({ limits: { prompts: { max: 500 } } })` results in `{ max: 500 }` (the `add: 100` is lost).
- The overage cost computation `(overageUnits * amount) / per` on lines 203-204 uses floating-point division. For billing, consider whether this should use integer cents to avoid floating-point precision issues (e.g., `0.01 * 3 = 0.030000000000000002`).
