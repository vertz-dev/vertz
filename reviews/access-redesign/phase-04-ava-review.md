# Phase 4: Versioning & Grandfathering -- Ava (Quality/Tests) Review

- **Reviewer:** ava
- **Date:** 2026-03-09
- **Scope:** Test coverage, TDD compliance, quality gates

## Findings

### Blockers

**B1. Missing test: "warns if new version has fewer features."**
The phase plan (line 169) explicitly lists this as a required behavior:
```
describe('Given new version has fewer features', () => {
  describe('When calling migrate()', () => {
    it('warns but still migrates', () => {})
  })
})
```
No test for this behavior exists in `plan-manager.test.ts` or anywhere else. The implementation (plan-manager.ts lines 209-223) has a dead code path that detects removed features but does nothing with the information. This is a spec gap -- the behavior is specified but neither tested nor properly implemented.

**B2. No `.test-d.ts` file for Phase 4 types.**
The TDD rules require: "Every phase with generic type parameters MUST include `.test-d.ts` tests proving each generic flows from definition to consumer." Phase 4 introduces multiple new exported types (`PlanManager`, `PlanManagerConfig`, `TenantPlanState`, `PlanEvent`, `PlanEventType`, `GrandfatheringState`, `PlanVersionInfo`, `PlanSnapshot`, `GraceDuration`, `GrandfatheringPolicy`). None of these have type-level tests verifying compile-time constraints. At minimum, there should be `@ts-expect-error` tests for:
- Invalid `GraceDuration` values
- Wrong `PlanManagerConfig` shapes
- `PlanEvent` field access without type narrowing

### Should-Fix

**S1. `checkGraceEvents()` deduplication is not tested.**
If `checkGraceEvents()` is called multiple times (e.g., on a periodic schedule), it will emit the same events repeatedly for the same tenants. There's no idempotency mechanism and no test verifying this behavior. Users could get duplicate "approaching" emails if the check runs daily. Either the behavior should be documented (it's the user's responsibility to deduplicate) or there should be a test confirming the expected behavior.

**S2. No test for `off()` handler removal.**
The `PlanManager.off()` method is implemented but never tested. There should be a test confirming that calling `off(handler)` prevents the handler from receiving subsequent events.

**S3. No test for concurrent `initialize()` calls.**
What happens if `initialize()` is called concurrently (e.g., two server instances starting simultaneously)? The InMemory store will handle it fine, but there's no test verifying that two concurrent `initialize()` calls don't create duplicate versions. This would be a real problem with a DB-backed store.

**S4. No test for `migrate()` when `planStore.listByPlan` is not implemented.**
`listTenantsOnPlan()` (plan-manager.ts:174) returns `[]` if `planStore.listByPlan` is undefined. This means `initialize()` would skip grandfathering when using a PlanStore that doesn't implement `listByPlan`. There's no test verifying this fallback behavior.

**S5. Integration test duplicates most unit test scenarios.**
The `auth-versioning.test.ts` integration test covers largely the same scenarios as `plan-manager.test.ts` unit tests (initialize lifecycle, hash determinism, indefinite grandfathering, grace events, schedule). The integration test should focus on cross-package contract validation (public imports, wiring) rather than re-testing internal logic. Currently, about 60% of the integration test cases are duplicates.

**S6. `plan-hash.test.ts` "title excluded" test is effectively a no-op.**
Test on line 72-84 claims to test that "title differences do NOT affect the hash." But `computePlanHash` doesn't accept `title` at all -- the test just computes the same config twice and verifies they match. This is identical to the determinism test at line 6. The meaningful test would be: pass two `PlanDef` objects with different titles to `extractSnapshot()` + `computePlanHash()` and verify the hashes match. Currently, title exclusion is tested implicitly by the fact that `computePlanHash` doesn't take title, but the test name is misleading.

### Observations

**O1. Code coverage cannot be verified from the diff alone.**
The 90% line coverage target should be validated by running `bun test --coverage` on the changed files: `plan-hash.ts`, `plan-version-store.ts`, `grandfathering-store.ts`, `plan-manager.ts`, and the modified `access-context.ts`.

**O2. Test setup boilerplate is extensive.**
Most tests in `plan-manager.test.ts` repeat the same 10-15 lines of store setup. The `makeManager()` helper is only used for simple cases. More complex tests (lines 100-237) create stores manually. A builder pattern or extended helper would reduce boilerplate and make tests more readable.

**O3. No test for `dispose()` on `PlanManager`.**
The `PlanManager` interface doesn't have a `dispose()` method, but its underlying stores do. There's no lifecycle management for cleanup. If a user creates a PlanManager and then wants to clean up, they must manage the stores directly.

## Verdict

**Changes Requested.** B1 is a clear specification gap -- a required behavior is neither implemented nor tested. B2 is a process violation (no `.test-d.ts` for new types). S1, S2, and S4 are missing edge case tests that should be added.
