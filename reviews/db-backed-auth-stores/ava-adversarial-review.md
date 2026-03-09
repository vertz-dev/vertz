# Ava — Quality/Tests Adversarial Review

**Feature:** DB-Backed Auth Stores [#1059]

## Summary

Review of test coverage, TDD compliance, quality gates, and test infrastructure for DB-backed auth stores.

## Findings

### Blockers

None identified.

### Should-Fix

1. **Shared test factory for PlanStore doesn't test `dispose()`** — The InMemory implementation clears all data on `dispose()`. The shared factory calls `dispose()` in `afterEach` but doesn't verify the behavior. Add a test: dispose → getPlan returns null.

   **Fixed:** Actually, looking again, the `afterEach` calls `store.dispose()` and then `cleanup()`. A "dispose clears data" test exists in the original `plan-store.test.ts` but not in the shared factory. This should be added.

2. **DbFlagStore fire-and-forget writes are not tested for persistence** — The `setFlag` method uses `void this.db.query(...)` (fire-and-forget). The integration test works around this with `setTimeout(50)` to wait for writes. This is fragile — a slow CI environment could flake. Consider exposing a `flush()` method or returning a promise from `setFlag()` for testing.

3. **No negative test for `validateAuthModels` with missing models** — The integration test only checks the happy path. Should also test that missing models throws the expected error message.

4. **`countActiveSessions` implementation is N+1** — `DbSessionStore.countActiveSessions` calls `listActiveSessions` which fetches all rows, then counts them in JS. Should use `SELECT COUNT(*)`. Not a test issue, but a correctness concern — the behavior differs from InMemory for very large session sets (OOM risk).

### Observations

- Shared test factories cover all store interfaces with behavioral parity tests. Total: 36 (Phase 3) + 34 (Phase 4) + 7 (integration) = 77 new tests.
- TDD discipline was followed — RED state confirmed before each implementation.
- Quality gates (typecheck + lint + format) were run after each phase.
- Pre-existing failures (3 MFA timeouts, 1 crypto test) are correctly identified as not caused by changes.
- Test DB helper with `_queryFn` bridge is a clean solution for testing with real SQLite.

### Coverage Gaps

- `DbClosureStore.removeResource` cascading delete is tested but only for one level of nesting.
- `DbPlanStore` doesn't test concurrent `updateOverrides` calls (not critical for SQLite).
- No test for malformed JSON in `auth_overrides` (the `try/catch` in `loadOverrides` handles it, but no test exercises this path).

## Verdict

**Approve with notes.** Test coverage is comprehensive for the scope. The `countActiveSessions` N+1 issue and the `loadFlags()` timing fragility should be tracked as follow-up items. The shared factory pattern is excellent for ensuring behavioral parity.
