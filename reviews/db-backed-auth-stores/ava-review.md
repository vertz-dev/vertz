# Adversarial Review: DB-Backed Auth Stores

**Reviewer:** ava (DX & Quality Engineer)
**PR:** #1068 | **Issue:** #1059
**Design doc:** `plans/db-backed-auth-stores.md`

---

## Blockers

### B1. Phase acceptance criteria are not concrete enough to write failing tests

The plan says things like "Acceptance: `auth.initialize()` creates all 7 tables in SQLite" (Phase 1) and "sign-up -> restart -> sign-in works (E2E test above)" (Phase 2). These are scenario descriptions, not test specifications.

Per `design-and-planning.md`: "Each phase lists: concrete integration tests as acceptance criteria" and "add integration tests is not an acceptance criterion -- be specific."

Every phase needs acceptance criteria that read like `it()` block descriptions. Examples:

- Phase 1: `initialize() creates auth_users table with correct columns in SQLite`, `initialize() is idempotent -- calling twice does not throw`, `initialize() creates all 7 tables and all indexes`
- Phase 2: `DbUserStore.createUser() persists user retrievable by findByEmail()`, `DbUserStore.findByEmail() is case-insensitive`, `createAuth({ db }) auto-selects DbUserStore over InMemoryUserStore`, `explicit userStore override wins over db-backed auto-selection`
- Phase 3: `DbRoleAssignmentStore.assign() deduplicates on (userId, resourceType, resourceId, role)`, `DbClosureStore.addResource() creates self-reference row`, `DbClosureStore.removeResource() cascades deletion to descendants`
- Phase 4: `DbWalletStore.consume() with concurrent requests does not exceed limit`, `DbPlanStore.assignPlan() stores and retrieves JSON overrides correctly`, `DbOAuthAccountStore.unlinkAccount() removes only the targeted provider`

Without this specificity, the implementer will either miss edge cases or invent their own acceptance criteria that may not match what was designed.

### B2. No testing strategy for verifying DB store behavioral parity with in-memory stores

The plan says "All existing auth tests pass (in-memory path unchanged)" in the Definition of Done, but says nothing about how DB-backed stores will be tested for behavioral parity.

Each in-memory store already has a focused test suite (e.g., `user-store.test.ts`, `session-store.test.ts`, `wallet-store.test.ts`). The DB stores must pass the **exact same behavioral tests** -- otherwise you're shipping two implementations with different guarantees and no way to detect drift.

Recommendation: Extract each store test suite into a shared test factory that accepts a store instance. Then run it twice -- once with `InMemoryXxxStore`, once with `DbXxxStore`. Something like:

```ts
function userStoreTests(createStore: () => UserStore) {
  it('creates a user and retrieves by email', async () => {
    const store = createStore();
    // ... existing test body
  });
  // ... all other tests
}

describe('InMemoryUserStore', () => userStoreTests(() => new InMemoryUserStore()));
describe('DbUserStore', () => userStoreTests(() => new DbUserStore(db.auth_users)));
```

This is the only way to guarantee behavioral parity. Without it, you're relying on the implementer to manually duplicate every test -- which they won't do perfectly.

### B3. `createServer` does not currently have auth integration -- the wiring plan is under-specified

Looking at `packages/server/src/create-server.ts`, the current `createServer()` does not create or accept an auth instance at all. The `ServerConfig` interface has no `auth` field. The design doc proposes adding `auth` to `ServerConfig` and having `createServer` internally call `createAuth()`, but it doesn't address:

1. How does `createServer` expose the auth instance? Does it return `{ auth: AuthInstance }` on `AppBuilder`? The current return type is `AppBuilder` from `@vertz/core`.
2. The `AppBuilder` / `AppConfig` types in `@vertz/core` would need to change. Is that in scope?
3. The E2E acceptance test calls `app.auth.api.signUp(...)` -- but `AppBuilder` has no `.auth` property today.

This is a significant API surface question that needs to be resolved in the design doc before implementation. Either:
- Expand `AppBuilder` to include `.auth` (cross-package change to `@vertz/core`)
- Have `createServer` return an extended type
- Or document that the E2E test is aspirational and the actual wiring approach differs

### B4. `SessionStore` interface vs `InMemorySessionStore` class method mismatch

The `SessionStore` interface in `types.ts` only declares `createSessionWithId()`. But `InMemorySessionStore` also has `createSession()` (auto-generates id). The design doc's table schema includes `id uuid PK` for sessions, and the DB store will need to handle id generation.

The design doc doesn't acknowledge this gap. If `DbSessionStore` only implements the interface (`createSessionWithId`), existing code that calls `createSession()` (non-interface method) will break when swapped to DB. Review all call sites to confirm only `createSessionWithId` is used from the interface.

Looking at the auth index.ts, `createSession` is only called in the `InMemorySessionStore`'s max-session-enforcement logic (the public `createSession` calls `createSessionWithId` under the hood? No -- `createSession` is a separate method that generates an id). The auth handler code at lines 363, 437, 1310, 1485 all use `createSessionWithId`, so this is likely fine -- but it should be explicitly acknowledged in the doc.

---

## Should-Fix

### S1. Concurrent wallet consume needs an explicit test plan

The design doc identifies atomic wallet consume as an unknown, proposes the single-UPDATE solution, and confirms it in POC results. Good. But the testing strategy is missing.

The in-memory `consume()` is "atomic" only because JavaScript is single-threaded. The DB version relies on database-level atomicity. You need a test that actually exercises concurrent consume:

```ts
it('concurrent consume does not exceed limit', async () => {
  // Set up wallet with limit 5
  // Fire 10 concurrent consume(1) calls
  // Assert: exactly 5 succeed, exactly 5 fail
  // Assert: final consumption is exactly 5
});
```

This test should be in the Phase 4 acceptance criteria, not just an "it would be nice."

### S2. Date handling across SQLite and PostgreSQL is a landmine

The `InMemorySessionStore` stores `Date` objects natively. The `DbSessionStore` will need to serialize dates to strings (SQLite) or `timestamptz` (PostgreSQL) and deserialize them back.

The existing codebase already has timestamp handling in `@vertz/db` (see `integration-sqlite.test.ts` where ISO strings are used), but the design doc doesn't acknowledge:

- `auth_sessions.expiresAt` comparisons: the in-memory store does `session.expiresAt > new Date()`. The DB store must do `WHERE expires_at > NOW()` (or equivalent). Time zone handling matters.
- `auth_wallet.period_start` is used as part of the unique key and for lookups. Millisecond precision differences between JS `Date` and database timestamp types can cause lookup misses.
- `auth_plans.started_at` and `expires_at` round-trips must preserve the exact same value.

Add a section to the design doc acknowledging timestamp serialization strategy, or at minimum add explicit tests for Date round-trip fidelity.

### S3. `initialize()` idempotency testing needs more than "call twice"

The doc says `initialize()` uses `CREATE TABLE IF NOT EXISTS`. But idempotency has subtler failure modes:

1. Table exists but with a different schema (e.g., missing column from a newer version). `CREATE TABLE IF NOT EXISTS` silently succeeds. This is a **time bomb** -- the table exists but is missing columns, causing runtime errors later.
2. Index creation -- `CREATE INDEX IF NOT EXISTS` is needed, not just `CREATE INDEX`.
3. What happens when `initialize()` is called concurrently (two server instances starting at the same time)?

Testing plan should include:
- `initialize()` with tables already existing (basic idempotency)
- `initialize()` followed by DDL introspection to verify all columns and indexes exist
- Verification that `CREATE INDEX IF NOT EXISTS` is used for all indexes

The doc should acknowledge that schema migration (column additions) is a non-goal but that the `initialize()` approach has this known limitation.

### S4. `dispose()` on DB stores -- what does it actually do?

Every in-memory store's `dispose()` clears the in-memory data structures. For DB stores, `dispose()` semantics are unclear:

- Should it close DB connections? No -- the `DatabaseClient` is shared across the app.
- Should it clear data? No -- that defeats the purpose of persistence.
- Should it be a no-op? Probably -- but then the `dispose()` method on the interface is misleading.

The design doc should specify that `DbXxxStore.dispose()` is a no-op (the `DatabaseClient` owns connection lifecycle). This matters because `InMemorySessionStore.dispose()` also clears a `setInterval` timer -- the DB store won't need one since expired session cleanup should be handled differently (e.g., `DELETE WHERE expires_at < NOW()` on `initialize()` or a separate cleanup method).

### S5. `auth_sessions.currentTokens` is missing from the table schema

The `SessionStore` interface includes `getCurrentTokens(sessionId)` and `updateSession` accepts `currentTokens?: AuthTokens`. The `InMemorySessionStore` stores current tokens in a separate `Map<string, AuthTokens>`.

But the `auth_sessions` table schema has no column for `currentTokens`. This is JWT + refresh token data that the session store needs to track. Either:
- Add a `current_tokens` text column (JSON-serialized)
- Or decide that DB-backed sessions don't need `currentTokens` (but then the interface contract is violated)

This is a schema gap that will cause a runtime error during implementation.

### S6. Missing `emailVerified` in `auth_users` table definition mismatch

The table schema defines `email_verified` as `boolean`, which maps to `INTEGER` (0/1) in SQLite. The `AuthUser` type has `emailVerified?: boolean`. The DB store's `findByEmail()` must convert SQLite's `0`/`1` to `boolean`. The `@vertz/db` layer handles this for known column types, but since auth tables are created via raw DDL (not `d.table()`), the conversion won't happen automatically.

Wait -- the design doc says tables are defined with `d.table()` and exported as `authModels`. But `initialize()` creates tables via raw `sql` tagged templates. Which is it? The Type Flow Map shows `authModels (table defs via d.table())` flowing into `createDb()`, but the POC Results show raw `CREATE TABLE` DDL. These two approaches are contradictory:

- If tables are created via `d.table()` + migration, the schema types flow through the query builder and conversions are automatic.
- If tables are created via raw DDL, the query builder's type-safe delegates may not match the actual table structure.

Clarify: Are auth tables created via the migration system (`d.table()`) or via raw DDL in `initialize()`? The design doc seems to assume both simultaneously.

### S7. No type-level tests (`.test-d.ts`) specified

Per `tdd.md`: "Every phase with generic type parameters MUST include `.test-d.ts` tests." The type flow map shows `DatabaseClient<TModels>` flowing through to store implementations. The plan should specify:

- `.test-d.ts` verifying that `createDb({ models: { ...authModels, ...userModels } })` produces a client where `db.auth_users` is properly typed
- `@ts-expect-error` tests for passing wrong model types
- Type verification that `createAuth({ db })` accepts `DatabaseClient` but not arbitrary objects

### S8. `auth_closure` schema uses TEXT for `ancestor_id`/`descendant_id` but in-memory store uses `string`

This is fine semantically, but the `ClosureStore.addResource()` method generates closure rows programmatically. The DB store needs to replicate the "get all ancestors of parent, insert rows for each" logic in SQL. This is a multi-statement operation that should use a transaction for atomicity. The design doc doesn't mention transactions for closure table updates, only for wallet consume.

If `addResource()` fails halfway through inserting ancestor paths (e.g., unique constraint violation on a concurrent insert), the closure table will be in an inconsistent state. This should be called out.

---

## Nits

### N1. Phase 5 is too vague

Phase 5 says "Full E2E integration test with all stores" and "Update auth docs." This phase should be rolled into the earlier phases. Each phase should have its own integration test. A final "integration test phase" often becomes a dumping ground for untested gaps.

### N2. The E2E acceptance test doesn't cover access control stores

The acceptance test only covers sign-up, sign-in, and restart persistence. It doesn't exercise:
- Role assignment persistence across restart
- Closure table persistence
- Plan/wallet persistence
- OAuth account persistence

These should be in the E2E test or clearly delegated to per-phase acceptance tests.

### N3. `auth_` prefix convention should be documented as a constant

The design doc says "All auth tables prefixed with `auth_` to avoid collision." This prefix should be a constant (`AUTH_TABLE_PREFIX = 'auth_'`) used in both DDL generation and model registration, not hard-coded in 7 different places.

### N4. `overrides` column as JSON text -- consider validation

The `auth_plans.overrides` column stores `Record<string, LimitOverride>` as JSON text. What happens if the JSON is malformed (e.g., manual database edit)? The `getPlan()` implementation should handle `JSON.parse()` failures gracefully rather than throwing an unhandled exception.

### N5. Design doc says "no migration system" but `d.table()` models imply migration support

If `authModels` are defined via `d.table()`, they participate in the migration system that `@vertz/db` provides (`packages/db/src/migration/`). The non-goal of "no migration system" conflicts with using `d.table()` for schema definitions. Clarify whether auth tables opt out of auto-migration or whether `initialize()` is a stopgap that will eventually be replaced by the standard migration flow.

---

## Verdict

**Request changes.**

The design is sound at the high level -- the API surface is clean, the infrastructure-at-framework-root approach is correct, and the store selection logic is well-reasoned. However, there are several gaps that will cause implementation pain:

1. **Phase acceptance criteria are not testable** (B1) -- the implementer will waste cycles figuring out what "acceptance" means
2. **No behavioral parity testing strategy** (B2) -- the highest-risk failure mode is "DB store behaves differently from in-memory store in subtle ways"
3. **`createServer` wiring is under-specified** (B3) -- the E2E test assumes APIs that don't exist yet
4. **Schema gaps** (S5, S6) -- `currentTokens` missing from schema, `d.table()` vs raw DDL confusion

Fix blockers B1-B4 and should-fix items S5-S6 before implementation begins. The remaining should-fix items (S1-S4, S7-S8) can be addressed during implementation but should be acknowledged in the design doc.
