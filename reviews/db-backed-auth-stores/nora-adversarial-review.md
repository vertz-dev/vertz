# Nora — Frontend/DX Adversarial Review

**Feature:** DB-Backed Auth Stores [#1059]

## Summary

Review of the public API surface, developer experience, and export ergonomics for DB-backed auth stores.

## Findings

### Blockers

None identified.

### Should-Fix

1. **`DbFlagStore.loadFlags()` is a foot-gun** — After constructing `new DbFlagStore(db)`, the developer must remember to call `loadFlags()` before using the store. If they forget, all `getFlag()` calls return `false`. The `ServerInstance.initialize()` should handle this automatically. If a developer constructs `DbFlagStore` manually, the empty-cache behavior is silent and hard to debug.

   **Suggestion:** Add a JSDoc warning on the constructor, or throw on first `getFlag()` if `loadFlags()` hasn't been called.

2. **No `DbUserStore` or `DbSessionStore` in integration test** — The E2E integration test covers RoleAssignment, Closure, Flag, Plan, and OAuth stores but skips User and Session. These were tested in Phase 2 shared factories, but the integration test should verify they work with the same `createTestDb()` setup.

### Observations

- All DB store classes are exported from `@vertz/server` — good discoverability.
- `authModels`, `initializeAuthTables`, `validateAuthModels` are all exported — the developer has everything they need.
- The `createServer({ db, auth })` pattern from the design doc isn't fully wired yet (the auto-selection of DB stores in `createServer` is Phase 2 work that was done, but the full store auto-selection for Phase 4 stores may not be wired in `createServer`).
- Shared test factories are a good DX pattern — they make it trivial to add new store backends.

### API Surface

- `AuthDbClient` type is exported — good for users who want to build custom stores.
- No breaking changes to existing APIs.
- All new exports are additive.

## Verdict

**Approve with notes.** The `loadFlags()` foot-gun should be addressed eventually (auto-call in `initialize()` or a guard), but it's not a blocker for this PR. Missing User/Session stores in the integration test is a gap but covered by shared factory tests.
