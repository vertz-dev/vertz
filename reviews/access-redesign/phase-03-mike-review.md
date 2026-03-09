# Phase 3: Override Store & Overage — Mike Review

- **Reviewer:** mike
- **Date:** 2026-03-09
- **Focus:** Architecture, cross-cutting concerns, design alignment

## Verdict: Approved with notes

## Findings

### Blockers

1. **Feature overrides not applied in the versioned plan path**
   This is architecturally concerning, not just a code bug. The `resolveEffectiveFeatures()` function has two paths: versioned (grandfathered) and non-versioned. Overrides are only checked in the non-versioned path. This creates a class of bugs where:
   - Admin applies a feature override for a grandfathered tenant
   - Override is stored successfully, validation passes
   - The override has zero runtime effect
   - No error, no warning, no way to detect the silent failure

   The root cause is architectural: the versioned path was added in Phase 4 and the override check (Phase 3) was only added to the fallback path. The versioned path returns early on line 676 before reaching the override check on line 695. This is a symptom of sequential phase additions without regression testing across phases.

   **Fix:** Override checks must be applied uniformly regardless of versioning. Overrides are administrative actions that should always take precedence. The fix should be at the end of the versioned path, before `return false`.

### Should Fix

1. **Two override systems coexist without a migration path**
   There are now two ways to set limit overrides:
   - **Old-style:** `planStore.updateOverrides('org-1', { prompts: { max: 500 } })` — stored on `OrgPlan.overrides`
   - **New-style:** `overrideStore.set('org-1', { limits: { prompts: { max: 500 } } })` — stored in `OverrideStore`

   Both are applied in `computeEffectiveLimit()` in a specific order (old first, new second). There's no documented migration path, no deprecation notice on the old API, and no runtime warning when both are active for the same tenant+limit. This will confuse framework users.

   **Recommendation:** Add a deprecation comment on `PlanStore.updateOverrides` pointing to `OverrideStore`, and document the precedence rules in the `computeEffectiveLimit` JSDoc.

2. **`computeEffectiveLimit` precedence is surprising**
   The current order in `computeEffectiveLimit()`:
   1. Base plan max
   2. Add-on limits (additive)
   3. Old-style `OrgPlan.overrides` — `Math.max(effectiveMax, oldOverride.max)` (takes the higher)
   4. New-style `OverrideStore` — `max` replaces, `add` is additive

   The old-style override uses `Math.max` (can only increase), while the new-style `max` replaces unconditionally (can decrease). This asymmetry means:
   - Old-style `max: 500` + new-style `max: 100` = 100 (new wins)
   - Old-style `max: 500` + no new-style = 500
   - No old-style + new-style `max: 100` = 100

   The old-style being a floor and new-style being a replacement is not intuitive. Document this clearly.

3. **Overage billing computation lives in the access layer, not a billing module**
   The overage cost computation (`overageUnits * amount / per`) is done inline in `can()`, `check()`, and `canAndConsume()`. Per the design doc, Phase 5 introduces proper billing integration. Currently:
   - The access layer computes billing amounts (coupling access to billing math)
   - The computation is duplicated across 3 locations (can, check, canAndConsume)
   - There's no billing event emitted when overage occurs

   This is acceptable for Phase 3, but the billing computation should be extracted to a shared helper before Phase 5 to avoid divergence.

4. **Design doc lists "One-off add-on semantics" under Phase 3 scope**
   The `PriceInterval` type includes `'one_off'` but I see no special runtime handling for one-off add-ons (they behave identically to recurring add-ons). If this was intentionally deferred, the design doc should be updated. If it was missed, it needs implementation.

### Notes

- The `OverrideStore` interface is clean and follows the same async pattern as other stores (`PlanStore`, `WalletStore`, `FlagStore`). The `dispose()` method is consistent across all stores.
- The single-fetch-per-request pattern for overrides (fetch once in `can()`/`check()`/`canAndConsume()`, pass through to helpers) is architecturally sound. No N+1 query risk.
- The override validation being separate from the store is a reasonable design — it allows different store backends (Redis, DB) to share the same validation logic. But the decoupling risk (invalid data stored without validation) should be mitigated by documenting the required call pattern.
- The `MAX_BULK_CHECKS = 100` limit for `canAll`/`canBatch` means at most 100 override fetches per bulk call. Since overrides are fetched per-org (not per-resource), the actual fetch count is bounded by unique orgs in the batch, which is typically 1. This is fine.
- Phase 3 integrates cleanly with Phase 2 (plans, add-ons) without breaking existing tests. The backward compatibility with `OrgPlan.overrides` is maintained. Architecture-wise this is solid incremental delivery.
