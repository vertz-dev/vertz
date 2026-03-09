# Phase 3: Overrides + Advanced Limits — Ben (Core/Types) Review

- **Reviewer:** ben
- **Commit:** e8ffe848
- **Date:** 2026-03-09

## Scope

Reviewed all Phase 3 source and test files:

- `packages/server/src/auth/override-store.ts` (new)
- `packages/server/src/auth/access-context.ts` (modified — override resolution, overage billing)
- `packages/server/src/auth/define-access.ts` (modified — `requires` validation, `OverageConfig` type, `AddOnRequires` type)
- `packages/server/src/auth/plan-store.ts` (modified — `checkAddOnCompatibility`, `getIncompatibleAddOns`)
- `packages/server/src/auth/index.ts` + `packages/server/src/index.ts` (export additions)
- All corresponding test files

## Findings

### Blockers

**B1. `remove()` does NOT support removing just `max` from an override — design doc mismatch.**

The design doc says: "When `max` is removed (via `overrides.remove`), only the `max` is cleared — if an `add` was also set, it takes effect." But `OverrideStore.remove()` only accepts `{ limits: string[] }` which removes the *entire* limit key (both `add` and `max`). There is no API to remove just `max` while preserving `add`.

The test at line 70-79 of `override-store.test.ts` works around this by calling `set()` again with only `{ add: 100 }`, which *replaces* the limit entry. This is not the same semantics as removing `max` — it requires the caller to know and re-supply the `add` value. If the caller only knows they want to remove `max`, they'd have to first `get()`, then `set()` back the `add` portion. The design doc specifies a single `remove()` call should suffice.

Fix: Either extend `remove()` to accept `{ limits: { prompts: ['max'] } }` (per-field removal) or add a `removeField()` method.

**B2. `computeEffectiveLimit()` — old-style `OrgPlan.overrides` takes `Math.max()` with new-style override, creating silent precedence conflict.**

At lines 851-855 of `access-context.ts`:
```ts
const oldOverride = orgPlan.overrides[limitKey];
if (oldOverride) {
  effectiveMax = Math.max(effectiveMax, oldOverride.max);
}
```

This runs *before* the new `OverrideStore` logic. If a tenant has old-style `OrgPlan.overrides.prompts = { max: 500 }` AND new-style `overrideStore` with `prompts: { add: -200 }`, the old override raises the limit to 500 first, then the new `add: -200` reduces it to 300. But if only the new override was intended, the old override silently inflates the result. There's no documentation, migration path, or deprecation warning on `OrgPlan.overrides`.

Moreover, `Math.max(effectiveMax, oldOverride.max)` means old overrides can only *increase* limits, never decrease — different from the new override semantics where `add` can go negative. This asymmetry will confuse users transitioning from old to new overrides.

### Should-Fix

**S1. `LimitOverrideDef` allows non-integer `add` and non-integer `max` values at runtime.**

`validateOverrides()` checks that `max >= -1` but does NOT check that `max` is an integer. The `LimitDef.max` validation in `defineAccess()` explicitly checks `Number.isInteger(limitDef.max)` (line 354), but `validateOverrides()` omits this. A fractional `max: 10.5` would pass validation but cause incorrect behavior with integer-based wallet consumption.

Similarly, `add` has no validation at all — `add: NaN`, `add: Infinity`, `add: 0.5` all pass.

**S2. `computeEffectiveLimit()` calls `planStore.getAddOns?.()` every time it's called, even though `resolveAllLimitStates()` and `resolveAllLimitConsumptions()` call it in a loop per limit key.**

For a tenant with 5 limit keys and 3 add-ons, this means 5 calls to `getAddOns()` when 1 would suffice. The add-on list doesn't change between loop iterations. The result should be hoisted out of the loop and passed as a parameter.

**S3. `OverageConfig` type allows `per: 0` which would cause division by zero.**

In `can()` (line 195) and `check()` (line 343): `const overageCost = (overageUnits * (ws.overageAmount ?? 0)) / (ws.overagePer ?? 1)`. If `per` is `0`, this divides by zero producing `Infinity`, which would always exceed the cap. The `OverageConfig` type and `defineAccess()` validation don't guard against `per: 0` or `per < 1`.

**S4. `TenantOverrides.features` is typed as `string[]` — no validation that features match the `entity:action` format.**

The `validateOverrides()` function checks against `accessDef.entitlements[feature]`, which is correct. But the `TenantOverrides` type allows any string, so downstream code could accidentally trust unvalidated override features. Consider a branded or narrowed type.

### Observations

**O1.** The `OverrideStore` interface has `dispose(): void` (synchronous), consistent with other stores. Good.

**O2.** `computeEffectiveLimit()` correctly handles the precedence: `max` overrides `add` if both are set. The logic at lines 860-868 is clear: check `max` first, fall through to `add` only if `max` is undefined.

**O3.** The overage cost calculation `(overageUnits * overageAmount) / overagePer` uses floating-point arithmetic. For billing at $0.01/unit with large volumes, this could introduce floating-point errors. Not a blocker for Phase 3 (billing integration is Phase 5), but worth noting for when real money is involved.

**O4.** The `_walletStore` parameter in `resolveAllLimitConsumptions()` is unused (prefixed with `_`). This is technically fine since the wallet consumption happens in the caller, but it's a code smell — the parameter should be removed if it's not needed.

## Verdict

**Changes Requested** — B1 (remove semantics) is a clear design doc deviation. B2 (old/new override conflict) creates a silent correctness issue. S1 (missing integer validation) is a real validation gap.
