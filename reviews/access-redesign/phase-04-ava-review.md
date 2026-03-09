# Phase 4: Plan Versioning & Grandfathering — Ava Review

- **Reviewer:** ava
- **Date:** 2026-03-09
- **Focus:** Quality gates, test coverage, TDD compliance, developer tooling

## Verdict: Approved with notes

## Findings

### Blockers

1. **No test for array-order sensitivity in `computePlanHash`**
   `plan-hash.test.ts` tests key-order invariance (sorted keys produce same hash) but never tests whether `features: ['a', 'b']` and `features: ['b', 'a']` produce the same or different hash. This is a critical ambiguity — if they produce different hashes (which they do, since `sortedReplacer` doesn't sort arrays), a feature reorder in `defineAccess()` silently creates a new version and grandfathers all tenants. Either add a test asserting array order matters (documenting the design choice) or add a test asserting array order does NOT matter (and fix the implementation). Currently the behavior is untested and undocumented.

### Should Fix

1. **`plan-manager.test.ts` has no test for the "downgrade warning" code path**
   `plan-manager.ts:209-224` contains logic to detect feature removal during migration (iterating `prevFeatures` and checking `targetFeatures`). This code path is never tested. The design doc (line 925) says "migrate() warns if new version has fewer features" — but the current implementation only has a comment `// Warning: new version has fewer features (logged, not blocking)` with a bare `break` and no actual logging or event emission. The dead code should either be tested and completed, or removed.

2. **`plan-manager.test.ts` does not test `on()`/`off()` lifecycle directly**
   Event handler registration and removal are tested only implicitly (events are collected via `on()` in the `makeManager` helper). There is no test that verifies `off()` actually stops event delivery, or that double-registration delivers events twice. These are edge cases that could regress silently.

3. **No test for `initialize()` with add-on plans (skipping `addOn: true`)**
   `plan-manager.ts:138` has `if (planDef.addOn) continue;` but no test verifies this branch. If the skip logic is removed or broken, add-on plans would get their own version tracking, which is not the intended behavior per the design.

4. **`access-context.test.ts` versioned plan resolution tests do not cover `check()` path**
   The Phase 4 tests in `access-context.test.ts` (lines 1051-1337) only test `can()`. The `check()` method has its own versioned plan resolution path (`access-context.ts:288-331`) that also calls `resolveEffectiveFeatures` and `resolveAllLimitStates` with `planVersionStore`. None of the Phase 4 tests verify that `check()` returns the correct `reasons`, `meta.requiredPlans`, or `meta.limit` values for a grandfathered tenant on an old version. The `check()` path has independent branching logic that could diverge from `can()`.

5. **No test for `canAndConsume()` with versioned limits**
   `access-context.ts:506-516` passes `planVersionStore` through to `resolveAllLimitConsumptions`, but no test exercises `canAndConsume()` when a tenant has a versioned snapshot with different limit values. If the versioned limit resolution has a bug in the consumption path, it would go undetected.

6. **Missing coverage for `checkGraceEvents()` edge case: grace end exactly equal to `now`**
   The boundary condition `timeUntilGraceEnd === 0` (grace end is exactly `now`) falls through both the `<= SEVEN_DAYS_MS && > 0` and `<= THIRTY_DAYS_MS && > SEVEN_DAYS_MS` checks. At exactly 0, `timeUntilGraceEnd > 0` is false, so no event is emitted. This is arguably correct (grace has expired, not "approaching" or "expiring"), but the behavior at the boundary should be tested explicitly.

7. **`grandfathering-store.test.ts` does not test `setGrandfathered` overwrite behavior**
   If `setGrandfathered` is called twice for the same tenant/plan with different versions or grace dates, the second call overwrites the first. This is the implicit behavior of `Map.set()`, but there is no test verifying it works correctly (e.g., version updated, grace date updated).

### Notes

1. **Test isolation is good** — Each test creates its own store instances. No shared mutable state between tests. Tests can run in any order.

2. **`plan-manager.test.ts` uses both `makeManager` helper and manual store setup** — Some tests use the `makeManager` convenience function while others construct stores manually. The manual approach is necessary when simulating multi-deploy scenarios (sharing stores across manager instances), but the inconsistency could confuse future contributors. A comment explaining when to use which pattern would help.

3. **No `.test-d.ts` type-level tests for Phase 4 types** — The TDD rules require `.test-d.ts` tests for type flow verification. `PlanManager`, `PlanEvent`, `TenantPlanState`, `PlanVersionStore`, and `GrandfatheringStore` interfaces have no type-level tests proving generics flow correctly. While these types are not heavily generic, the `PlanEvent` discriminated union issue (noted by ben) would benefit from type-level tests.
