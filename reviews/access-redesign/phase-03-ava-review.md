# Phase 3: Override Store & Overage — Ava Review

- **Reviewer:** ava
- **Date:** 2026-03-09
- **Focus:** Test quality, coverage, TDD compliance, quality gates

## Verdict: Changes Requested

## Findings

### Blockers

1. **No test for feature overrides on versioned/grandfathered tenants**
   The `resolveEffectiveFeatures()` function has a bug where the versioned path skips override checks (see ben's review). But more critically from a testing perspective, there is *zero* test coverage for the interaction between `overrideStore` and `planVersionStore`. The entire override test suite uses `setupOverrideAccess()` which never creates a `PlanVersionStore`. This means:
   - Feature overrides + versioned plan: untested
   - Limit overrides + versioned plan: untested (the `computeEffectiveLimit` path appears correct, but without tests we cannot be sure)

   Per TDD rules: if it's not tested, it doesn't exist. These interactions need explicit test cases.

2. **No test for `canAndConsume()` with overrides**
   The override tests only exercise `can()`. There are no tests verifying that `canAndConsume()` respects override limits. `canAndConsume()` has its own separate code path through `resolveAllLimitConsumptions()` and `computeEffectiveLimit()`. Specifically missing:
   - `canAndConsume()` with `add` override (does atomic consumption use the override-adjusted max?)
   - `canAndConsume()` with `max` override
   - `canAndConsume()` with `max: 0` override (should block before consumption)
   - `canAndConsume()` with overage + cap (the cap check in `canAndConsume()` lines 539-554 is a separate code path from `can()`)

3. **No test for `unconsume()` with overrides**
   `unconsume()` fetches overrides (line 596) and passes them to `resolveAllLimitConsumptions()`. There are no tests confirming this works correctly. If overrides change the effective max from 100 to -1 (unlimited), does `unconsume()` correctly skip the wallet entry?

### Should Fix

1. **Override `set()` merge test (line 70-80) tests wrong scenario**
   The test "remove() of max reveals the add value" doesn't actually test `remove()` — it tests `set()` overwriting with a new value. The test comment says "For removing just max, we re-set with only add." This confirms the `remove()` API gap (nora's finding) and the test title is misleading.

2. **No negative test for `validateOverrides()` with `NaN`, `Infinity`, or non-integer values**
   The test suite validates the happy paths (`add: -50`, `max: 0`, `max: -1`) and one invalid case (`max: -2`), but does not test:
   - `max: NaN` — what happens?
   - `max: Infinity` — what happens?
   - `max: 1.5` — what happens?
   - `add: NaN` — what happens?
   These are all values that pass the current validation and produce broken behavior at runtime.

3. **Overage cap test only covers exact cap hit**
   The overage cap test (line 1821) consumes exactly 600 units on a limit of 100, producing `500 * 0.01 = $5.00` which equals the cap. But it doesn't test:
   - *Over* the cap (601 units, `$5.01 > $5.00`)
   - One unit before the cap (599 units, `$4.99 < $5.00`)
   - `canAndConsume()` with overage cap (the atomic consumption path)
   Boundary tests around the cap value are critical for billing correctness.

4. **No test for `check()` returning overage meta when tenant is under the limit**
   There's a test for `check()` returning `meta.limit.overage: true` when in overage, but no test for what `check()` returns when the tenant is under the limit but the plan has overage configured. Does `meta.limit.overage` appear? (It shouldn't per current code, but this is worth asserting.)

5. **Coverage gap: `can()` with overage + no cap**
   The overage test at line 1705 uses `overage: { amount: 0.01, per: 1 }` (no cap). This is tested for `can()` returning `true`. But there's no corresponding `check()` test for this scenario (no cap, in overage). The `check()` test (line 1763) also uses no cap, but there should be explicit assertions on what `meta.limit.remaining` shows when in overage without a cap.

### Notes

- The `override-store.test.ts` file has good coverage of the `InMemoryOverrideStore` CRUD operations (12 tests). The store itself is well-tested in isolation.
- The `validateOverrides()` tests (7 tests) cover the main validation paths but lack boundary/adversarial inputs.
- Test structure follows the "Given...it..." pattern consistently. Setup helpers reduce duplication.
- Total override-related tests in `access-context.test.ts`: 7 (feature override, add, max, throttle, unlimited, reduction, addon+override). The count is reasonable for Phase 3 scope, but the missing `canAndConsume`/`unconsume`/versioned interactions are significant gaps.
