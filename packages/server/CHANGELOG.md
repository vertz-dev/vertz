# @vertz/server

## 0.2.21

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.21
  - @vertz/db@0.2.21
  - @vertz/errors@0.2.21
  - @vertz/schema@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.20
  - @vertz/db@0.2.20
  - @vertz/errors@0.2.20
  - @vertz/schema@0.2.20

## 0.2.19

### Patch Changes

- [#1266](https://github.com/vertz-dev/vertz/pull/1266) [`ae1a64a`](https://github.com/vertz-dev/vertz/commit/ae1a64a23608880b8e87ed2a44907eabddba873e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add OpenAPI 3.1 spec generation from entity definitions. The `generateOpenAPISpec()` function produces a complete OpenAPI document from entity `expose` configs, including response schemas, create/update input schemas, VertzQL query parameters, relation includes, custom actions, and standard error responses.

- Updated dependencies []:
  - @vertz/core@0.2.19
  - @vertz/db@0.2.19
  - @vertz/errors@0.2.19
  - @vertz/schema@0.2.19

## 0.2.18

### Patch Changes

- [#1263](https://github.com/vertz-dev/vertz/pull/1263) [`2406b51`](https://github.com/vertz-dev/vertz/commit/2406b5145360694def02081756c980bc58879bda) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(server): extract where/orderBy/limit from q= base64 JSON parameter

  The q= parameter parser silently dropped where, orderBy, and limit from the
  decoded JSON even though they were allowed keys. Clients could send filtered
  queries via q= and get unfiltered results with no error. Now properly extracts
  and merges these fields with URL params.

- [#1261](https://github.com/vertz-dev/vertz/pull/1261) [`0e3156a`](https://github.com/vertz-dev/vertz/commit/0e3156afd8d3dea6cdb59fd26657f53558c408cc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(server): AuthInstance.resolveSessionForSSR now assignable to SessionResolver

  Updated the return type of `resolveSessionForSSR` on `AuthInstance` to use the
  correct `{ id: string; email: string; role: string }` user shape and `AccessSet | null`
  for `accessSet`, matching what the implementation already returns. Previously typed
  loosely as `Record<string, unknown>` / `unknown`, which caused a type error when
  passed to `createBunDevServer`'s `sessionResolver` option.

- [#1262](https://github.com/vertz-dev/vertz/pull/1262) [`e015221`](https://github.com/vertz-dev/vertz/commit/e015221049179a19e260a3a6fdd46ec9557e7777) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(server): POST /query now validates cursor length at route level

  The POST /query endpoint was passing `body.after` directly to the CRUD pipeline
  without checking its length. The GET route used `parseVertzQL` which goes through
  the pipeline's silent 512-char guard, but POST /query bypassed this. Now returns
  400 BadRequest when the cursor exceeds MAX_CURSOR_LENGTH (512).

- Updated dependencies []:
  - @vertz/core@0.2.18
  - @vertz/db@0.2.18
  - @vertz/errors@0.2.18
  - @vertz/schema@0.2.18

## 0.2.17

### Patch Changes

- [#1237](https://github.com/vertz-dev/vertz/pull/1237) [`e69ef45`](https://github.com/vertz-dev/vertz/commit/e69ef4540fca9e47249fc18c3cd2a74be84f2db8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add Entity Expose API — unified `expose` config replacing `relations` for controlling VertzQL query surface.

  - `expose.select` restricts which fields appear in API responses
  - `expose.allowWhere` / `expose.allowOrderBy` restrict filtering and sorting
  - `expose.include` controls relation exposure with fractal structure
  - Field-level access descriptors (`rules.*`) for conditional field visibility
  - Descriptor-guarded fields return `null` (not field omission)

- Updated dependencies []:
  - @vertz/core@0.2.17
  - @vertz/db@0.2.17
  - @vertz/errors@0.2.17
  - @vertz/schema@0.2.17

## 0.2.16

### Patch Changes

- [#1165](https://github.com/vertz-dev/vertz/pull/1165) [`15511ba`](https://github.com/vertz-dev/vertz/commit/15511ba68fe78c99ba7d056ef17db94d8380f9fa) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Thread TModel generic through createActionHandler for typed row and context in custom entity actions

- [#1179](https://github.com/vertz-dev/vertz/pull/1179) [`2f574cc`](https://github.com/vertz-dev/vertz/commit/2f574cce9e941c63503efb2e32ecef7b53951725) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add transaction support to DatabaseClient with full model delegates

  - `db.transaction(async (tx) => { ... })` wraps multiple operations atomically
  - `TransactionClient` provides the same model delegates as `DatabaseClient` (`tx.users.create()`, `tx.tasks.list()`, etc.)
  - PostgreSQL uses `sql.begin()` for connection-scoped transactions
  - SQLite uses `BEGIN`/`COMMIT`/`ROLLBACK` via single-connection queryFn
  - Auth plan store operations (`assignPlan`, `removePlan`, `updateOverrides`) now use transactions for atomicity
  - Failure injection tests verify rollback behavior

- [#1116](https://github.com/vertz-dev/vertz/pull/1116) [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `AccessAnalyzer` to extract `defineAccess()` config and `AccessTypesGenerator` to emit typed entitlement unions, making `ctx.can('typo')` a compile error. Add `RlsPolicyGenerator` to generate RLS policies from `rules.where()` conditions. Add `EntitlementRegistry` + `Entitlement` type to `@vertz/server` and `@vertz/ui/auth` for type-safe entitlement narrowing.

- [#1165](https://github.com/vertz-dev/vertz/pull/1165) [`15511ba`](https://github.com/vertz-dev/vertz/commit/15511ba68fe78c99ba7d056ef17db94d8380f9fa) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Thread TModel generic through CrudHandlers and createCrudHandlers for typed row returns and context in CRUD operations

- [#1212](https://github.com/vertz-dev/vertz/pull/1212) [`391096b`](https://github.com/vertz-dev/vertz/commit/391096b426e1debb6cee06b336768b0e20abc191) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(db): handle null direct values in where clause as IS NULL

  Previously, passing `null` as a direct value in a where clause (e.g., `{ revokedAt: null }`)
  generated `column = $N` with a null parameter, which in SQL always evaluates to NULL (not TRUE),
  silently breaking the entire WHERE clause. Now correctly generates `column IS NULL`.

  Also reverts DbSessionStore raw SQL workarounds back to ORM-based `get()` calls.

- [#1218](https://github.com/vertz-dev/vertz/pull/1218) [`8c707ca`](https://github.com/vertz-dev/vertz/commit/8c707ca055f965526b043567b93844343e7a51e8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix OAuth error redirect URL construction to use the URL constructor instead of string concatenation. Handles URL fragments, existing query params, duplicate error params, and absolute URLs correctly.

- [#1216](https://github.com/vertz-dev/vertz/pull/1216) [`c1c0638`](https://github.com/vertz-dev/vertz/commit/c1c06383b8ad50c833b64aa5009fe7b494bb559b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - SSR session injection to eliminate auth loading flash. JWT session data is now injected as `window.__VERTZ_SESSION__` during SSR, so `AuthProvider` hydrates with session data immediately instead of showing a loading state. Zero-config: the CLI auto-wires the session resolver when auth is configured.

- [#1201](https://github.com/vertz-dev/vertz/pull/1201) [`5dfaebc`](https://github.com/vertz-dev/vertz/commit/5dfaebc83853922f08120c2b5e56af7998752a00) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Refactor plan storage to subscription-based tenant architecture

  - `PlanStore` → `SubscriptionStore`, `OrgPlan` → `Subscription`, methods simplified (`assign`, `get`, `remove`)
  - `DbPlanStore` → `DbSubscriptionStore`, `InMemoryPlanStore` → `InMemorySubscriptionStore`
  - All store interfaces (`SubscriptionStore`, `FlagStore`, `WalletStore`) now use `tenantId` instead of `orgId`
  - Removed `plan` field from `AuthUser`, `ReservedSignUpField`, `UserTableEntry`, and `auth_users` DDL
  - `computeAccessSet()` resolves plan via `subscriptionStore.get(tenantId)` instead of `user.plan` parameter
  - `AuthAccessConfig` now accepts `subscriptionStore` and `walletStore`

- [#1221](https://github.com/vertz-dev/vertz/pull/1221) [`667453b`](https://github.com/vertz-dev/vertz/commit/667453bb8011aecaba4cbc79b816409cc8cbc744) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `requestHandler` to `ServerInstance` — a unified handler that routes auth requests (`/api/auth/*`) to `auth.handler` and everything else to the entity handler. Eliminates the manual if/else routing boilerplate every auth-enabled app previously required.

- [#1132](https://github.com/vertz-dev/vertz/pull/1132) [`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat: VertzQL relation queries with where/orderBy/limit support

  Breaking change to EntityRelationsConfig: flat field maps replaced with structured
  RelationConfigObject containing `select`, `allowWhere`, `allowOrderBy`, `maxLimit`.

  - Extended VertzQL include entries to support `where`, `orderBy`, `limit`, nested `include`
  - Recursive include validation with path-prefixed errors and maxLimit clamping
  - Include pass-through from route handler → CRUD pipeline → DB adapter
  - GetOptions added to EntityDbAdapter.get() for include on single-entity fetch
  - Codegen IR and entity schema manifest include allowWhere/allowOrderBy/maxLimit

- Updated dependencies [[`2f574cc`](https://github.com/vertz-dev/vertz/commit/2f574cce9e941c63503efb2e32ecef7b53951725), [`391096b`](https://github.com/vertz-dev/vertz/commit/391096b426e1debb6cee06b336768b0e20abc191), [`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb)]:
  - @vertz/db@0.2.16
  - @vertz/core@0.2.16
  - @vertz/errors@0.2.16
  - @vertz/schema@0.2.16

## 0.2.15

### Patch Changes

- [#1086](https://github.com/vertz-dev/vertz/pull/1086) [`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Redesign access control system with entity-centric `defineAccess()`, plan features/limits with multi-limit resolution, override store with overage billing, plan versioning with grandfathering and grace periods, billing adapter interface with Stripe implementation, and client-side plan event broadcasting.

- [#1086](https://github.com/vertz-dev/vertz/pull/1086) [`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add DB-backed auth store implementations (DbUserStore, DbSessionStore, DbRoleAssignmentStore, DbClosureStore, DbFlagStore, DbPlanStore, DbOAuthAccountStore) with dialect-aware DDL for SQLite and PostgreSQL. Export authModels, initializeAuthTables, validateAuthModels, and all DB store classes from @vertz/server.

- Updated dependencies []:
  - @vertz/core@0.2.15
  - @vertz/db@0.2.15
  - @vertz/errors@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.14
  - @vertz/db@0.2.14
  - @vertz/errors@0.2.14

## 0.2.13

### Patch Changes

- [#1046](https://github.com/vertz-dev/vertz/pull/1046) [`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Access Set Bootstrap + Client-Side can(): server computes global entitlement snapshots (computeAccessSet), embeds in JWT acl claim with 2KB overflow strategy, exposes GET /api/auth/access-set with ETag/304 support. Client-side can() function returns reactive AccessCheck signals, AccessGate blocks UI while loading, createAccessProvider hydrates from SSR-injected **VERTZ_ACCESS_SET**. computeEntityAccess() enables per-entity access metadata for can(entitlement, entity). Compiler recognizes can() as signal-api via reactivity manifest.

- [#1066](https://github.com/vertz-dev/vertz/pull/1066) [`2f6d58a`](https://github.com/vertz-dev/vertz/commit/2f6d58a818d0ecbbd7999b0bfc072e2424640f59) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Make all auth store interfaces async (RateLimitStore, ClosureStore, RoleAssignmentStore, PlanStore) for KV/Redis compatibility

- [#1025](https://github.com/vertz-dev/vertz/pull/1025) [`58fffce`](https://github.com/vertz-dev/vertz/commit/58fffceb6c4e1660fb3d4d1891cd4ce662dca22b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Dual-token sessions: replace single 7-day JWT with 60-second JWT (`vertz.sid`) + 7-day opaque refresh token (`vertz.ref`) stored hashed in session store. Adds token rotation with 10-second idempotent grace period, session management API (list/revoke/revoke-all), device name parsing, and pluggable store interfaces (SessionStore, UserStore, RateLimitStore). Decomposes auth monolith into focused modules.

- [#1040](https://github.com/vertz-dev/vertz/pull/1040) [`efda760`](https://github.com/vertz-dev/vertz/commit/efda76032901138dca7a22acd60ad947a4bdf02a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add email verification and password reset flows to auth module.

  - Email verification: opt-in via `emailVerification` config, sends token on signup via `onSend` callback
  - POST /api/auth/verify-email — validates token, marks emailVerified: true
  - POST /api/auth/resend-verification — rate limited 3/hour per userId
  - Password reset: opt-in via `passwordReset` config with `onSend` callback
  - POST /api/auth/forgot-password — always returns 200 (prevents email enumeration)
  - POST /api/auth/reset-password — validates token, updates password, revokes sessions
  - New error types: TokenExpiredError, TokenInvalidError
  - New stores: InMemoryEmailVerificationStore, InMemoryPasswordResetStore

- [#1037](https://github.com/vertz-dev/vertz/pull/1037) [`3d2799a`](https://github.com/vertz-dev/vertz/commit/3d2799ac4c3e0d8f65d864b4471e205a64db886a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add MFA/TOTP support with backup codes and step-up authentication.

  - TOTP (RFC 6238) generation and verification
  - MFA setup, verify, disable, and backup code routes
  - MFA challenge flow: signIn returns MFA_REQUIRED when MFA is enabled
  - Step-up authentication with `fva` (factor verification age) JWT claim
  - `checkFva()` utility for protecting sensitive operations
  - `InMemoryMFAStore` for development/testing
  - New MFA error types: MFA_REQUIRED, MFA_INVALID_CODE, MFA_ALREADY_ENABLED, MFA_NOT_ENABLED

- [#1034](https://github.com/vertz-dev/vertz/pull/1034) [`7b125db`](https://github.com/vertz-dev/vertz/commit/7b125db968ba9157ce97932b392cb3be7fcc0344) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add OAuth provider support (Google, GitHub, Discord) with PKCE, encrypted state cookies, and automatic account linking.

- [#1047](https://github.com/vertz-dev/vertz/pull/1047) [`d4af7d0`](https://github.com/vertz-dev/vertz/commit/d4af7d0fa0ff1f3cfc21625e9bd16621f833f9cd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(auth): plans & wallet — Layer 4/5 plan checks, wallet limits, canAndConsume/unconsume

  Adds SaaS plan and wallet infrastructure to the auth system:

  - `defineAccess()` now accepts `plans` config with entitlements and limits
  - `PlanStore` / `InMemoryPlanStore` for org-to-plan assignments with expiration and overrides
  - `WalletStore` / `InMemoryWalletStore` for consumption tracking with atomic check-and-increment
  - `calculateBillingPeriod()` for period-anchored billing calculations
  - Layer 4 (plan check) and Layer 5 (wallet check) in `can()` and `check()`
  - `canAndConsume()` — atomic access check + wallet increment
  - `unconsume()` — rollback after operation failure
  - `computeAccessSet()` enrichment with limit info for JWT embedding
  - Plan expiration with free fallback
  - Per-customer overrides via `max(override, plan_limit)`

- [#1063](https://github.com/vertz-dev/vertz/pull/1063) [`a82b2ec`](https://github.com/vertz-dev/vertz/commit/a82b2ec1ccc94f278916796783c33d81ffead211) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Feature flag store + reactive access invalidation: InMemoryFlagStore implements per-tenant boolean feature flags. Layer 1 in createAccessContext() now evaluates flag requirements on entitlements — disabled flags produce 'flag_disabled' denial with meta.disabledFlags. computeAccessSet() populates real flag state from FlagStore. Access event broadcaster provides authenticated WebSocket broadcasting for flag_toggled, limit_updated, role_changed, and plan_changed events. Client-side access event client connects with exponential backoff reconnection (1s–30s cap, ±25% jitter). handleAccessEvent() performs inline signal updates for flag/limit changes; role/plan changes trigger jittered refetch. AuthProvider accepts accessEvents prop to wire WebSocket events into the reactive access cascade.

- [#1039](https://github.com/vertz-dev/vertz/pull/1039) [`45e84cf`](https://github.com/vertz-dev/vertz/commit/45e84cf2f11123bf3ed66ae8cf311efc1393238c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(auth): resource hierarchy with closure table, role inheritance, and defineAccess()

  Introduces hierarchical RBAC replacing flat createAccess():

  - `defineAccess()` with hierarchy, roles, inheritance, and entitlements config
  - `rules.*` builders: role(), entitlement(), where(), all(), any(), authenticated(), fva()
  - InMemoryClosureStore for resource hierarchy (4-level depth cap)
  - InMemoryRoleAssignmentStore with inheritance resolution (additive, most permissive wins)
  - `createAccessContext()` with can(), check(), authorize(), canAll()
  - Five-layer resolution engine (flags and plan/wallet stubbed for Phase 8/9)

- [#1052](https://github.com/vertz-dev/vertz/pull/1052) [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add client-side auth session management (AuthProvider, useAuth, AuthGate)

  - AuthProvider wraps app with auth context, manages JWT session lifecycle
  - useAuth() returns reactive state + SdkMethods (signIn, signUp, signOut, mfaChallenge, forgotPassword, resetPassword)
  - SdkMethods work with form() for automatic validation and submission
  - Proactive token refresh scheduling (10s before expiry, tab visibility, online/offline handling)
  - AuthGate gates rendering on auth state resolution (shows fallback during loading)
  - SSR hydration via window.**VERTZ_SESSION** (no initial fetch needed)
  - AccessContext integration: AuthProvider auto-manages access set when accessControl=true
  - Server: signin/signup/refresh responses now include expiresAt timestamp

- [#967](https://github.com/vertz-dev/vertz/pull/967) [`eab229b`](https://github.com/vertz-dev/vertz/commit/eab229bc63a08ae6877ff4905d99c364a8694358) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Validate entity models are registered in createDb() at server creation time. When an entity name doesn't match a key in the DatabaseClient's model registry, createServer() now throws a clear error listing all missing models and showing which models are registered. Previously this caused a cryptic runtime TypeError when the entity was first accessed.

- Updated dependencies [[`127df59`](https://github.com/vertz-dev/vertz/commit/127df59424102142ac1aee9dfcc31b22c2959343), [`efda760`](https://github.com/vertz-dev/vertz/commit/efda76032901138dca7a22acd60ad947a4bdf02a), [`3d2799a`](https://github.com/vertz-dev/vertz/commit/3d2799ac4c3e0d8f65d864b4471e205a64db886a), [`7b125db`](https://github.com/vertz-dev/vertz/commit/7b125db968ba9157ce97932b392cb3be7fcc0344)]:
  - @vertz/db@0.2.13
  - @vertz/errors@0.2.13
  - @vertz/core@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.12
  - @vertz/db@0.2.12
  - @vertz/errors@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.11
  - @vertz/db@0.2.11
  - @vertz/errors@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.8
  - @vertz/db@0.2.8
  - @vertz/errors@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.7
  - @vertz/db@0.2.7
  - @vertz/errors@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.6
  - @vertz/db@0.2.6
  - @vertz/errors@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.5
  - @vertz/db@0.2.5
  - @vertz/errors@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.4
  - @vertz/db@0.2.4

## 0.2.3

### Patch Changes

- [#882](https://github.com/vertz-dev/vertz/pull/882) [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove deprecated module system (`createModule`, `createModuleDef`, services, routers) from public API. The entity + action pattern is now the only supported way to define routes. Internal infrastructure (Trie router, middleware runner, schema validation, CORS, error handling) is preserved.

- Updated dependencies [[`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c)]:
  - @vertz/core@0.2.3
  - @vertz/db@0.2.3

## 0.2.2

### Patch Changes

- [#861](https://github.com/vertz-dev/vertz/pull/861) [`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix: address second-pass security audit findings — hidden field stripping in action pipeline, CSS value sanitization, empty string coercion guard

- Updated dependencies []:
  - @vertz/core@0.2.2
  - @vertz/db@0.2.2

## 0.2.0

### Minor Changes

- [#290](https://github.com/vertz-dev/vertz/pull/290) [`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Rename `@vertz/core` → `@vertz/server` and `createApp()` → `createServer()`

  - Added `@vertz/server` package that re-exports all public API from `@vertz/core`
  - Added `createServer` as the preferred factory function (alias for `createApp`)
  - Added `vertz.server` namespace alias for `vertz.app`
  - Deprecated `createApp()` with console warning pointing to `createServer()`
  - Updated all internal imports to use `@vertz/server`
  - Compiler now recognizes both `vertz.app()` and `vertz.server()` calls

### Patch Changes

- Updated dependencies [[`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380), [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`c8efe6b`](https://github.com/vertz-dev/vertz/commit/c8efe6b4aef9ea9b9b4e3de414297ce2f829f7bb), [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06), [`4f780bb`](https://github.com/vertz-dev/vertz/commit/4f780bba6bee7a493c9a1e0b8463ea2126a7285b), [`c1e38d0`](https://github.com/vertz-dev/vertz/commit/c1e38d010da1bea95ed9246968fabc22e300a6e9)]:
  - @vertz/core@0.2.0
