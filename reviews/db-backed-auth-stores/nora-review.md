# Adversarial Review: DB-Backed Auth Stores

**Reviewer:** nora (Frontend & API Engineer)
**PR:** #1068 | **Issue:** #1059
**Date:** 2026-03-09

---

## Blockers

### B1. `AuthConfig` loses its role as the single config surface for `createAuth()`

The design doc says `createAuth({ ...auth, db })` is how `createServer` internally wires things. But the current `AuthConfig` (in `types.ts`) does NOT have a `db` field. The doc doesn't specify what type signature `createAuth` actually receives after this change.

Two options, and the doc needs to pick one explicitly:

1. **Add `db?` to `AuthConfig`** — then the public type surface says "auth knows about databases," which muddies the line between config and infrastructure.
2. **Create an internal `InternalAuthConfig extends AuthConfig`** with `db?` — `createAuth()` accepts `InternalAuthConfig`, but the public-facing `ServerConfig.auth` stays `AuthConfig`.

Option 2 is cleaner: it keeps `AuthConfig` as pure config (strategies, timeouts, providers) and doesn't leak infrastructure into the type developers see. But the doc doesn't call this out. The type flow map says `createServer passes db to createAuth internally` without showing the actual type boundary.

This is a blocker because the implementation will make a decision here that affects the public API surface. Nail it down before writing code.

### B2. `PlanStore` and `WalletStore` are not on `AuthConfig` today — but the doc says they auto-switch

Looking at the current code, `PlanStore` and `WalletStore` are NOT direct properties on `AuthConfig`. They live on `AuthAccessConfig` (nested under `config.access`). The `closureStore` and `roleStore` are also on `config.access`, not top-level.

The design doc's store selection logic says:
> Persistent stores auto-switch to DB: UserStore, SessionStore, OAuthAccountStore, **RoleAssignmentStore**, **ClosureStore**, **PlanStore**, **WalletStore**

But `RoleAssignmentStore`, `ClosureStore`, `PlanStore`, and `WalletStore` are wired through `AuthAccessConfig.roleStore`, `AuthAccessConfig.closureStore`, and the `AccessContextConfig` (which takes `planStore` and `walletStore` separately). These stores are NOT resolved inside `createAuth()` at all — they're passed in by the caller when creating an access context.

The doc needs to address: how does auto-selection work for stores that `createAuth()` doesn't currently own? Either:
- `createAuth()` needs to start owning `planStore`/`walletStore`/`closureStore`/`roleStore` internally (breaking the current `AuthAccessConfig` pattern), or
- The auto-selection logic lives in `createServer`, which constructs the `AuthAccessConfig` with DB-backed stores before passing it to `createAuth()`.

The second option is more consistent with the current architecture. But neither is specified.

### B3. `authModels` must be user-spread into `createDb()` — violation of "convention over configuration"

The doc requires:
```ts
const db = createDb({
  models: { ...authModels, ...myModels },
});
```

This means if a developer forgets `...authModels`, they get a runtime error when auth tries to query `auth_users`. The doc claims "convention over configuration" in its manifesto alignment, but this is neither: it's mandatory manual wiring that will be the #1 support request.

Consider: if `createServer` detects `db` and `auth` config are both present, it could validate that the required auth models exist in `db._internals.models` and throw a clear error at startup. The doc already shows `createServer` doing this validation for entity models (lines 142-157 of `create-server.ts`). Add the same check for auth models. This isn't blocking the design itself, but the doc should call it out as a Phase 1 or Phase 2 acceptance criterion.

Actually, on re-read, this IS a blocker: the doc's "one recommended path" should make it near-impossible to forget this. Either auto-inject auth models when `auth` config is present, or fail fast with a prescriptive error. The doc should specify which.

---

## Should-fix

### S1. `dispose()` doesn't cover `RoleAssignmentStore`, `ClosureStore`, `PlanStore`, or `WalletStore`

Looking at the current `dispose()` in `createAuth()` (line 2162-2168), it disposes: `sessionStore`, `rateLimitStore`, `oauthAccountStore`, `mfaStore`, `emailVerificationStore`, `passwordResetStore`, and `pendingMfaSecrets`.

Notice what's missing: `roleStore`, `closureStore`, `planStore`, `walletStore`. These stores have `dispose()` methods (or should — `PlanStore` and `WalletStore` do, `FlagStore` doesn't). If `createAuth()` starts owning these stores (via DB-backed auto-selection), it must also dispose them. The design doc's Definition of Done should include a line item: "dispose() cleans up all DB-backed stores."

### S2. The `initialize()` surface area is unclear

Currently `initialize()` is a no-op that logs a message (line 2141-2143). The doc says it will `CREATE TABLE IF NOT EXISTS` for all 7 auth tables. Questions:

- Does `initialize()` only run DDL when DB-backed stores are active? (It should.)
- What happens if the user calls `initialize()` with in-memory stores? (Should be a no-op, as today.)
- Does `initialize()` need to run migrations in the future? (The doc says no, but the `initialize()` contract should be documented clearly so it's not abused.)

The doc should add an explicit note: "`initialize()` is DDL-only when `db` is present, no-op otherwise. No schema migration support."

### S3. `FlagStore` is missing `dispose()` on its interface

The `FlagStore` interface (in `flag-store.ts`) has no `dispose()` method, while every other store interface does. If the framework is adding DB-backed stores systematically, `FlagStore` sticks out. Even though the doc says `FlagStore` stays in-memory for now, the interface should be consistent. Either add `dispose(): void` to `FlagStore` now, or note it as a follow-up.

### S4. `currentTokens` on `SessionStore` won't map to DB cleanly

`SessionStore.createSessionWithId()` accepts `currentTokens?: AuthTokens` (a JWT string + refresh token string). `SessionStore.getCurrentTokens()` returns them. In the in-memory store, these are just held in a Map. For a DB-backed store, storing raw JWT strings in a database column is problematic:

- JWTs can be large (especially with ACL claims). The `auth_sessions` table schema in the doc has no column for `currentTokens`.
- The in-memory `currentTokens` is used for the "return tokens in session" pattern. Is this needed for DB-backed stores? If the JWT is always re-derivable from the session + user, storing it is redundant.

The doc should either add a `current_tokens` text column to `auth_sessions` (JSON-serialized) or explicitly state that `getCurrentTokens()` returns `null` for DB-backed sessions and explain the impact.

### S5. Table schema uses `uuid` for id columns but DDL POC shows `TEXT PRIMARY KEY`

The table schema section says `id: uuid | PK` for all tables, but the POC DDL example uses `id TEXT PRIMARY KEY`. This is fine for SQLite (which doesn't have a native UUID type), but the doc should clarify: are IDs stored as text in all dialects? If so, the table schema should say `text` not `uuid` to avoid confusion during implementation.

### S6. `auth_sessions.previous_refresh_hash` schema mismatch

The `StoredSession` interface has `previousRefreshHash: string | null`, and the in-memory store tracks this. The DB table schema has `previous_refresh_hash: text | nullable`. This is consistent. But the `createSessionWithId()` method's data parameter doesn't include `previousRefreshHash` — it's only set via `updateSession()`. The DB-backed store needs to handle the initial `INSERT` with `previous_refresh_hash = NULL`, then `UPDATE` on refresh. Make sure the implementation doesn't accidentally set it to empty string vs null.

### S7. No index on `auth_sessions.user_id` for `listActiveSessions`/`countActiveSessions`

The table schema mentions `user_id: uuid | indexed` — good. But the doc doesn't specify a composite index on `(user_id, revoked_at)` which would be needed for efficiently querying active (non-revoked) sessions. The `listActiveSessions` and `countActiveSessions` methods filter by both user_id AND revoked_at IS NULL AND expires_at > now. Consider calling out the index strategy for these queries.

---

## Nits

### N1. `auth_` prefix is fine but consider a constant

The doc hardcodes `auth_` as the table prefix. During implementation, define a single `AUTH_TABLE_PREFIX = 'auth_'` constant rather than string-littering `'auth_users'`, `'auth_sessions'`, etc. throughout the codebase.

### N2. The E2E acceptance test uses `app.auth.api.signUp()`

The current `createServer` returns an `AppBuilder` (line 131 of `create-server.ts`), which doesn't have an `auth` property. The test assumes `app.auth.api.signUp()`. The doc should clarify how auth is exposed on the server instance. Is it `app.auth`? Is it a method? This is a DX question that should be answered in the API Surface section.

### N3. Standalone `createAuth({ db })` contradicts "one way to do things"

The Manifesto Alignment says "No second config path for db." But the doc also says standalone `createAuth({ db })` works. This IS a second path — developers can pass `db` to `createAuth` directly or let `createServer` do it. If the standalone path is for testing only, document that explicitly and consider whether `db` should even be on the public `createAuth` config at all (vs. only the internal config).

### N4. Phase ordering could be tightened

Phase 1 does DDL + `authModels` export. Phase 2 does `DbUserStore` + `DbSessionStore` + wiring. This means Phase 1 has no runtime behavior beyond table creation — it can't be validated end-to-end independently. Consider merging Phases 1 and 2, or making Phase 1's acceptance criterion more concrete (e.g., "tables exist AND can be queried by the typed query builder").

### N5. `email_verified` is `boolean` in the schema but `INTEGER` in the POC DDL

The table schema says `email_verified: boolean`, but the SQLite DDL POC uses `email_verified INTEGER NOT NULL DEFAULT 0`. The implementation needs to handle boolean-to-integer mapping for SQLite. This is standard, but worth noting in the doc to avoid a bug where `findByEmail` returns `0`/`1` instead of `true`/`false`.

---

## Verdict

**Request changes.**

The three blockers (B1-B3) all relate to unclear type boundaries and wiring strategy. The design's API surface _reads_ clean, but the gap between the current codebase's architecture (stores split across `AuthConfig` and `AuthAccessConfig`, access stores owned externally) and the doc's proposed auto-selection is not bridged. The implementation will have to make significant architectural decisions that aren't specified.

Specifically:
1. Define the exact type that `createAuth()` receives (B1) — this affects whether `db` leaks into the public API.
2. Specify which component owns the access-related stores (B2) — `createAuth()` vs. `createServer` vs. the caller.
3. Decide on auto-injection vs. fail-fast validation for `authModels` in `createDb()` (B3) — this is the #1 DX footgun.

Once these are addressed, the design is solid. The store interfaces are consistent, the table schemas are reasonable, the phasing makes sense, and the auto-selection (DB when present, in-memory when absent) is the right call for DX. The POC results give confidence that the implementation is feasible.

Client-side impact: none identified. The auth client API (`useSession`, etc.) consumes the same `AuthApi` / session types regardless of backing store. This is correctly scoped as a server-only change.
