# Adversarial Review -- DB-Backed Auth Stores

**Reviewer:** mike (Tech Lead)
**PR:** #1068
**Issue:** #1059
**Design doc:** `plans/db-backed-auth-stores.md`

---

## Blockers

### B1. `createServer` does not currently own auth -- the design glosses over a major integration gap

The design doc shows `createServer({ db, auth: { ... } })` as the recommended path, with `createServer` internally calling `createAuth({ ...auth, db })`. But today, `createServer` in `packages/server/src/create-server.ts` has **zero knowledge of auth**. It does not import `createAuth`, does not reference `AuthConfig` or `AuthInstance`, and the returned `AppBuilder` interface (from `@vertz/core`) has no `auth` property.

The E2E acceptance test references `app.auth.api.signUp(...)` and `app.initialize()` -- neither of which exist on `AppBuilder`. This means Phase 2 (or earlier) must either:

1. Extend `AppBuilder` in `@vertz/core` to include `auth` and `initialize()`, or
2. Return a new `ServerInstance` type from `@vertz/server`'s `createServer` that wraps `AppBuilder` with auth-specific members.

Both are non-trivial. Option 1 pollutes `@vertz/core` with auth-specific concerns. Option 2 is a breaking change to `createServer`'s return type (currently typed as `AppBuilder`).

The design doc must explicitly address this integration shape. The implementation plan cannot assume it is a small wiring change -- it touches the core package's public types.

### B2. `authModels` export forces users to manually spread models -- violates "convention over configuration"

The proposed API:

```ts
const db = createDb({
  models: { ...authModels, ...myModels },
});
```

This means every user who wants auth must remember to spread `authModels` into their `createDb` call. Forgetting it will produce a runtime error (table not found) with no compile-time safety.

The design says it follows "convention over configuration," but this is the opposite -- it requires explicit manual configuration. The design should explore whether `createServer` can automatically inject auth models into the db when `auth` config is present, so users never touch `authModels` directly. At minimum, the doc must acknowledge this tension and explain why it was chosen.

### B3. DDL at `initialize()` time -- no dialect-aware SQL generation

The POC shows SQLite-flavored DDL (`INTEGER NOT NULL DEFAULT 0` for booleans, `TEXT` for all string types). The design targets both PostgreSQL and SQLite. The doc must specify:

- How dialect differences in DDL are handled (e.g., `BOOLEAN` vs `INTEGER`, `TIMESTAMPTZ` vs `TEXT`, `UUID` vs `TEXT`).
- Whether `initialize()` generates dialect-specific SQL or uses a lowest-common-denominator schema.
- How this interacts with the migration system mentioned as a non-goal. If a user starts with `initialize()` DDL and later adopts migrations, will the schemas be compatible?

Writing raw `CREATE TABLE` SQL per-dialect is a significant surface area that the design underestimates. This needs a clear strategy before Phase 1.

---

## Should-Fix

### S1. `SessionStore` interface mismatch -- `currentTokens` is memory-only state

The `InMemorySessionStore` stores `currentTokens` (JWT + refresh token pair) in a separate `Map<string, AuthTokens>`. The `SessionStore` interface has `getCurrentTokens(sessionId)` and the `createSessionWithId` / `updateSession` methods accept `currentTokens?`.

Storing JWTs in the database is wrong -- they are ephemeral, session-scoped, and storing them creates a security liability (leaked DB = leaked active tokens). The design must explicitly state that `DbSessionStore` will NOT persist `currentTokens` and how the interface contract handles this (e.g., always returns `null` from `getCurrentTokens()`, or the field becomes memory-backed with a DB-backed session record).

### S2. The `cloud` key reservation on `ServerConfig` is fine but underspecified

Reserving `cloud?: string` is harmless. But the doc says "OAuth providers with no explicit credentials -> routed through Vertz Cloud proxy" and "email operations with no onSend -> routed through Vertz Cloud email relay." These are implementation promises baked into the design doc that constrain future API shape.

Suggestion: remove the forward-looking implementation details for `cloud`. Just say: "`cloud` is reserved for future managed service integration. Shape TBD." This avoids locking in design decisions before that feature is scoped.

### S3. Table schemas use `uuid` for PK but the auth system generates string IDs

The table schemas show `id: uuid` as PK type, but `AuthUser.id` is typed as `string` and session IDs are generated via `crypto.randomUUID()`. UUIDs are fine, but the schema says `uuid` type while the DDL POC shows `TEXT PRIMARY KEY`. This inconsistency needs resolution:

- If using native `UUID` type in PostgreSQL, the DDL must be dialect-aware (see B3).
- If using `TEXT` everywhere, the schema table in the doc should say `text`, not `uuid`.

### S4. Missing index on `auth_sessions.user_id` + `revoked_at` + `expires_at` for `listActiveSessions`

The `SessionStore.listActiveSessions(userId)` filters by `userId`, `!revokedAt`, and `expiresAt > now`. The table schema only shows an index on `user_id`. In production with many sessions, this query will table-scan the non-revoked, non-expired filter. Consider a composite index or at least document the expected query patterns.

### S5. `resolveInheritedRole` is duplicated in `InMemoryRoleAssignmentStore` -- DB store will need it too

The `getEffectiveRole` method in `InMemoryRoleAssignmentStore` contains the inheritance resolution logic. The `DbRoleAssignmentStore` will need the same logic. This should be extracted to a shared function before Phase 3, not copy-pasted into the DB implementation. The design should note this refactoring as part of Phase 3.

### S6. Phase 5 is not a vertical slice -- it is a cleanup/docs phase

The workflow rules say "vertical slices -- each phase usable end-to-end." Phase 5 is "integration tests + docs update." Integration tests should be in each phase (Phase 2 already has the E2E test). Docs and changeset should be in the final implementation phase. Phase 5 as described adds no new user-facing capability and is not a slice.

Suggestion: fold Phase 5 into Phase 4, or make Phase 5 about a specific capability (e.g., "migration generation" or "auth table introspection").

---

## Nits

### N1. `auth_` prefix collision risk with user entities

The doc says auth tables use `auth_` prefix "to avoid collision with user entity tables." But nothing prevents a user from naming their entity `auth_users` or `auth_sessions`. The entity model validation in `createServer` checks that entity names exist in the db models -- but auth models and entity models share the same namespace. Consider adding a validation check that entity names don't collide with auth model names.

### N2. `overrides` as JSON text column -- no queryability

Storing `Record<string, LimitOverride>` as serialized JSON text means you cannot query overrides at the SQL level (e.g., "find all orgs with a custom limit on feature X"). This is acceptable for the current use case (read whole record, deserialize) but worth noting as a tradeoff.

### N3. The design says "No second config path for db" but `createAuth({ db })` is a second path

The manifesto alignment section says "One recommended path... No second config path for db." But the design explicitly supports `createAuth({ db })` for standalone usage. This is two paths. The doc should be honest about this -- it is intentional (testing/standalone), not a violation, but the manifesto alignment section should not claim there is only one path.

### N4. `auth_wallet` table missing `limit` column

The `consume()` method needs to know the limit for the atomic check. The design's SQL shows `consumed + :amount <= :limit` where `:limit` comes from the application layer (plan definition). This means the wallet row does not store the limit -- the caller must always provide it. This is correct and matches the in-memory implementation, but consider whether the limit should be stored for auditability (knowing what the limit was at consumption time).

---

## Risk Assessment

**Hardest part:** B1 (integration with `createServer` return type). This touches the core package's type system and may require a new `ServerInstance` type distinct from `AppBuilder`. If done wrong, it breaks every existing `createServer` consumer.

**Second hardest:** B3 (dialect-aware DDL). Writing and testing `CREATE TABLE` SQL for both SQLite and PostgreSQL across 7 tables is tedious and error-prone. Each dialect has different type names, different constraint syntax, and different default value handling.

**Riskiest assumption:** That `db.query(sql\`CREATE TABLE IF NOT EXISTS...\`)` is sufficient for production DDL. This bypasses the migration system entirely. If the auth schema ever needs to change (add a column, change an index), there is no upgrade path. The "non-goal" of migrations is fine for v0, but this decision should be called out as tech debt that will need addressing.

**What could go wrong:**
- Concurrent `initialize()` calls in a multi-process deployment could race on `CREATE TABLE IF NOT EXISTS` -- unlikely to cause data loss but could produce confusing error messages.
- Session expiry cleanup in the DB store needs a different strategy than the in-memory `setInterval` approach. The design does not address this (background worker? lazy cleanup on read?).
- The `InMemorySessionStore` does a linear scan for `findByRefreshHash` -- the DB version will use an index. But if `findByPreviousRefreshHash` also needs an index on `previous_refresh_hash`, the table schema needs to add that (currently not shown).

---

## Verdict: **Request Changes**

The three blockers (B1, B2, B3) must be addressed before this design is ready for implementation. B1 is the most significant -- it represents a gap between the proposed API and the actual codebase that requires non-trivial architectural work. B2 is a DX concern that may have a better solution. B3 is an implementation strategy that needs to be specified, not left to Phase 1 discovery.

The overall direction is sound -- `db` at `createServer()` level is the right call architecturally. Auth should not own its infrastructure. The store abstraction layer is clean and the in-memory fallback preserves testability. But the design needs to be more honest about the integration complexity and more specific about the dialect-aware DDL strategy.
