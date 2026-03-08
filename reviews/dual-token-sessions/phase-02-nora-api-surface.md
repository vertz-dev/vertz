# Phase 2: Dual-Token Sessions -- API Surface Review

- **Author:** ben
- **Reviewer:** nora (API surface, type flow, public API design)
- **Date:** 2026-03-08
- **Branch:** `feat/dual-token-sessions`
- **Issue:** #1016

---

## API Surface Findings

### [CRITICAL] Missing public exports for Phase 2 store types and interfaces

- **File:** `packages/server/src/index.ts`
- **Issue:** The `@vertz/server` package's public API (`src/index.ts`) does not export any of the Phase 2 store types or implementations that external consumers need to implement custom stores. Missing from the public surface:
  - Types: `SessionStore`, `StoredSession`, `RateLimitStore`, `UserStore`, `AuthTokens`, `SessionInfo`, `RoleAssignmentTableEntry`, `UserTableEntry`
  - Classes: `InMemorySessionStore`, `InMemoryRateLimitStore`, `InMemoryUserStore`

  These are exported from `packages/server/src/auth/index.ts` (the auth barrel), but `packages/server/src/index.ts` (the package entry point) only re-exports a subset of auth types from Phase 1. A consumer writing `import { SessionStore, InMemorySessionStore } from '@vertz/server'` will get a compile error.

- **Impact:** External consumers cannot implement custom stores (e.g., a PostgreSQL session store) because the `SessionStore` interface is not importable from the public package. They also cannot use `InMemorySessionStore` for testing. The `AuthTokens` type is missing too, which is needed for the `Session.tokens` field returned by all auth operations. `SessionInfo` is returned by `listSessions` but consumers can't import it for type annotations.

- **Recommendation:** Add all Phase 2 types and implementations to `packages/server/src/index.ts`:
  ```ts
  // In the type export block from './auth':
  export type {
    // ...existing...
    AuthTokens,
    RateLimitStore,
    SessionInfo,
    SessionStore,
    StoredSession,
    UserStore,
  } from './auth';

  // In the value export block from './auth':
  export {
    // ...existing...
    InMemoryRateLimitStore,
    InMemorySessionStore,
    InMemoryUserStore,
  } from './auth';
  ```

### [CRITICAL] `AuthApi.signUp` and `AuthApi.signIn` strip the `ctx` parameter -- no IP/UA extraction via programmatic API

- **File:** `packages/server/src/auth/index.ts:837-838`
- **Issue:** The `AuthApi` interface defines `signUp` and `signIn` as taking only `(data: SignUpInput)` and `(data: SignInInput)` respectively. The API object bindings confirm this:
  ```ts
  signUp: (data: SignUpInput) => signUp(data),
  signIn: (data: SignInInput) => signIn(data),
  ```
  The internal `signUp` and `signIn` functions accept an optional second parameter `ctx?: { headers: Headers }` which is used to extract IP address and User-Agent for session metadata. But the programmatic API wrapping explicitly discards this.

  This means any caller using `auth.api.signUp()` or `auth.api.signIn()` (the documented server-side API) will always get empty strings for `ipAddress` and `userAgent` on their sessions. The `listSessions` response will show all sessions with blank IP/UA and "Unknown device" names, making the device management UI useless for programmatic sign-ins.

  The HTTP handler calls `signUp(body, { headers: request.headers })` correctly, so this only affects programmatic API consumers (server-to-server calls, tests, custom handlers).

- **Impact:** Session metadata (IP, UA, device name) is silently lost for all programmatic API usage. Session management UI shows "Unknown device" everywhere. Security audit trails are incomplete.

- **Recommendation:** Update `AuthApi` interface and bindings to accept the optional context:
  ```ts
  // In types.ts:
  signUp: (data: SignUpInput, ctx?: { headers: Headers }) => Promise<Result<Session, AuthError>>;
  signIn: (data: SignInInput, ctx?: { headers: Headers }) => Promise<Result<Session, AuthError>>;

  // In index.ts:
  signUp: signUp,
  signIn: signIn,
  ```

### [HIGH] `AuthApi` type signature mismatch: `signOut` and `refreshSession` expect `AuthContext` but implementations accept `{ headers: Headers }`

- **File:** `packages/server/src/auth/types.ts:221-223`
- **Issue:** The `AuthApi` interface defines:
  ```ts
  signOut: (ctx: AuthContext) => Promise<Result<void, AuthError>>;
  refreshSession: (ctx: AuthContext) => Promise<Result<Session, AuthError>>;
  ```
  `AuthContext` is `{ headers: Headers; request: Request; ip?: string }`. But the actual implementations at lines 307 and 354 accept only `{ headers: Headers }`. The `request` and `ip` fields on `AuthContext` are never read.

  This compiles because `{ headers: Headers }` is structurally compatible with `AuthContext` (TypeScript's structural typing means the binding is valid -- the implementation ignores the extra fields). But it forces callers to construct a full `Request` object just to sign out or refresh:
  ```ts
  // Current API forces this awkward construction:
  await auth.api.signOut({
    headers: requestHeaders,
    request: new Request('http://dummy'),  // required by type but unused
  });
  ```

  The test in `token-refresh.test.ts:37-42` confirms this awkwardness -- it constructs dummy `Request` objects that are never read.

- **Impact:** API ergonomics are poor. External consumers must fabricate `Request` objects to satisfy the type checker. The `AuthContext.ip` field suggests IP extraction should happen at this level, but it doesn't.

- **Recommendation:** Either:
  1. Simplify `signOut` and `refreshSession` to accept `{ headers: Headers }` (or just `Headers`), matching their actual requirements.
  2. Or actually use the `AuthContext.request` and `AuthContext.ip` fields in the implementation (e.g., for rate-limiting by IP in `refreshSession`).

  Option 1 is preferred for API cleanliness -- keep the interface honest about what it needs.

### [HIGH] Security headers deviate from design doc specification

- **File:** `packages/server/src/auth/index.ts:534-536`
- **Issue:** The `securityHeaders()` function returns only `{ 'Cache-Control': 'no-store' }`. The design doc (section 11.7) specifies four headers:
  ```
  Cache-Control: no-store, no-cache, must-revalidate
  Pragma: no-cache
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  ```
  Three headers are missing entirely, and `Cache-Control` is incomplete.

- **Impact:**
  - Missing `X-Content-Type-Options: nosniff` allows MIME-sniffing attacks on auth responses.
  - Missing `Pragma: no-cache` means HTTP/1.0 proxies may cache auth responses.
  - Missing `Referrer-Policy` means OAuth callback URLs could leak via Referer headers.
  - Incomplete `Cache-Control` means HTTP/1.1 caches might serve stale auth responses (some caches treat `no-store` differently than `no-store, no-cache, must-revalidate`).

- **Recommendation:** Update `securityHeaders()` to match the design doc:
  ```ts
  function securityHeaders(): Record<string, string> {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };
  }
  ```

### [HIGH] Design doc specifies `emailVerified` in JWT claims but implementation omits it

- **File:** `packages/server/src/auth/types.ts:167-176` and `packages/server/src/auth/index.ts:146-155`
- **Issue:** The design doc section 4.2 specifies `emailVerified: boolean` as a standard claim in the JWT payload (`SessionJWT` interface). The implementation's `SessionPayload` interface omits this field entirely. The `createSessionTokens` function does not include `emailVerified` in the JWT.

  Additionally, `AuthUser` has `emailVerified?: boolean` (optional), but it's never populated during sign-up (defaults to `undefined`). The JWT claims only include `sub`, `email`, `role`, `jti`, and `sid`.

- **Impact:** Future phases that depend on `emailVerified` being in the JWT (e.g., gating features for unverified users, as described in section 3.4) will require a breaking change to the JWT structure. Clients checking session payload for email verification status won't find the field.

- **Recommendation:** Either:
  1. Add `emailVerified` to `SessionPayload` and populate it in `createSessionTokens` (matching the design doc).
  2. Or explicitly document this as a Phase N deferral in the design doc, acknowledging the JWT structure deviation.

### [MEDIUM] `timingSafeEqual` implementation is not truly constant-time for different-length strings

- **File:** `packages/server/src/auth/crypto.ts:10-20`
- **Issue:** The `timingSafeEqual` function has an early return on line 11: `if (a.length !== b.length) return false;`. For SHA-256 hex strings (always 64 chars), this is safe because all inputs are the same length. However, the function name and signature suggest general-purpose use. If a developer uses it for non-hash comparisons (e.g., API keys of different lengths), the length check leaks timing information.

  Additionally, the implementation uses a JavaScript `for` loop with XOR, which is subject to JIT compiler optimizations that could break the constant-time guarantee. Node.js/Bun provide `crypto.timingSafeEqual` that uses platform-native constant-time comparison.

- **Impact:** Low risk for current usage (SHA-256 hashes are always 64 chars). Higher risk if the function is exported or reused for other comparisons.

- **Recommendation:** Either:
  1. Use the built-in `crypto.timingSafeEqual` (from Node/Bun's `node:crypto` module) which guarantees constant-time behavior at the platform level.
  2. Or rename this function to `timingSafeEqualHex` and add a comment that it assumes equal-length inputs.

### [MEDIUM] `UserStore.findById` returns `AuthUser | null`, losing the password hash -- refreshSession can bypass email lookup

- **File:** `packages/server/src/auth/types.ts:114-118` and `packages/server/src/auth/index.ts:394`
- **Issue:** In `refreshSession`, the code calls `userStore.findById(storedSession.userId)` (line 394). The `UserStore.findById` method returns `AuthUser | null`, not `{ user: AuthUser; passwordHash: string } | null`. This is intentionally different from `findByEmail` (which returns the password hash for verification).

  However, there's an asymmetry: `getSession` (line 339) calls `userStore.findByEmail(payload.email)` to load user data, which returns the password hash unnecessarily. The design doc says refreshSession should "load user from DB (fresh data, not from old JWT)". Using `findById` is correct for refresh, but `getSession` using `findByEmail` is a slower path (email lookup vs. ID lookup) and loads unnecessary password hash data.

- **Impact:** Minor performance concern. `getSession` is called on every request via the middleware, and it does an email-based lookup instead of an ID-based lookup. In a real database, email lookup may hit a secondary index vs. primary key lookup for ID.

- **Recommendation:** Change `getSession` to use `findById(payload.sub)` instead of `findByEmail(payload.email)`. This matches the design doc's intent (JWT already has the user ID in `sub`) and avoids unnecessarily loading password hashes into memory on every request.

### [MEDIUM] `buildAuthUser` is a no-op wrapper

- **File:** `packages/server/src/auth/index.ts:118-120`
- **Issue:** The `buildAuthUser` function is:
  ```ts
  function buildAuthUser(stored: { user: AuthUser; passwordHash: string }): AuthUser {
    return stored.user;
  }
  ```
  This is a trivial extraction that adds a layer of indirection without value. It's only used in `signIn` and `getSession`.

- **Impact:** Code complexity without benefit. Developers reading the code might expect `buildAuthUser` to do something (e.g., strip sensitive fields, apply transformations), but it's just `stored.user`.

- **Recommendation:** Remove `buildAuthUser` and access `stored.user` directly.

### [MEDIUM] `SessionInfo` design doc mismatch: `ipAddress` and `userAgent` are non-nullable in implementation but nullable in doc

- **File:** `packages/server/src/auth/types.ts:190-200`
- **Issue:** The design doc (section 4.5) defines:
  ```ts
  interface SessionInfo {
    ipAddress: string | null;
    userAgent: string | null;
    deviceName: string | null;
    // ...
  }
  ```
  The implementation defines:
  ```ts
  interface SessionInfo {
    ipAddress: string;
    userAgent: string;
    deviceName: string;
    // ...
  }
  ```
  All three fields are non-nullable strings in the implementation. The implementation defaults empty string `''` for missing values (lines 221-224 in `signUp`), which is different from `null`.

- **Impact:** External consumers implementing a `SessionStore` that returns `null` for unknown IP/UA will get type errors. The design doc and implementation disagree on the API contract.

- **Recommendation:** Either update the design doc to match (strings, empty string for unknown) or change to nullable strings with `null` semantics. The empty-string approach is fine but should be documented as intentional.

### [MEDIUM] `Session.tokens` is optional in the type but always present in all code paths

- **File:** `packages/server/src/auth/types.ts:183-188`
- **Issue:** The `Session` interface defines `tokens?: AuthTokens` (optional). But every code path that creates a `Session` always populates `tokens`:
  - `signUp` return (line 239): always includes tokens
  - `signIn` return (line 299): always includes tokens
  - `refreshSession` return (lines 405-410, 426-431): always includes tokens
  - `getSession` return (line 347): does NOT include tokens (correct -- getting an existing session doesn't issue new tokens)

  The HTTP handler checks `if (result.data.tokens)` before setting cookies (lines 608, 643, 724), but this condition is always true for signup/signin/refresh results. The optional typing forces unnecessary null checks throughout the codebase.

- **Impact:** Poor type accuracy. Consumers of `signUp`/`signIn`/`refreshSession` must null-check `tokens` even though it's always present. This is a "lie" in the type system -- the return type is looser than reality.

- **Recommendation:** Split the type:
  ```ts
  interface SessionWithTokens extends Session {
    tokens: AuthTokens;  // required, not optional
  }
  ```
  Return `SessionWithTokens` from `signUp`, `signIn`, and `refreshSession`. Return `Session` (without tokens) from `getSession`.

### [MEDIUM] Sign-up rate limit uses wrong default: 3 attempts per hour (design doc says 3 per hour, but sign-in says 5)

- **File:** `packages/server/src/auth/index.ts:182-183`
- **Issue:** The sign-up rate limit uses `emailPassword?.rateLimit?.maxAttempts || 3` (line 183). This reuses the sign-in rate limit config for sign-up, but the default falls to 3 (not 5 like sign-in). The design doc (section 11.2) confirms 3 per hour for sign-up, so the value is correct.

  However, there's a subtle bug: the sign-up rate limit reuses the sign-in `rateLimit` config (`emailPassword?.rateLimit?.maxAttempts`). If a consumer sets `rateLimit: { window: '15m', maxAttempts: 10 }` intending to configure sign-in, sign-up also uses 10 attempts (but with a hardcoded 1-hour window). The config conflation is confusing.

- **Impact:** Consumers cannot independently configure sign-up vs. sign-in rate limits. Setting a liberal sign-in limit (10 attempts) also liberalizes sign-up to 10 attempts per hour, which may not be intended.

- **Recommendation:** Either:
  1. Add separate `signUpRateLimit` config option.
  2. Or document that `emailPassword.rateLimit` applies to both sign-in and sign-up, and sign-up always uses a 1-hour window.

### [LOW] Route parsing is fragile: `path.replace('/api/auth', '')` doesn't handle trailing slashes or query parameters

- **File:** `packages/server/src/auth/index.ts:540`
- **Issue:** The route parsing at line 540:
  ```ts
  const path = url.pathname.replace('/api/auth', '') || '/';
  ```
  This performs a simple string replacement, not a prefix check. It would incorrectly transform `/api/auth-extra/signup` to `-extra/signup`. Additionally, a request to `/api/auth/sessions/` (trailing slash) would produce `/sessions/` which wouldn't match the `/sessions` check on line 779 for DELETE.

- **Impact:** Low -- the handler is typically mounted at a specific prefix, and the edge cases are unlikely in practice. But for a framework library, robustness matters.

- **Recommendation:** Use a proper prefix strip:
  ```ts
  const path = url.pathname.startsWith('/api/auth')
    ? url.pathname.slice('/api/auth'.length) || '/'
    : url.pathname;
  ```

### [LOW] `DELETE /sessions/:id` uses string parsing that could match unexpected paths

- **File:** `packages/server/src/auth/index.ts:761-762`
- **Issue:** The route matching:
  ```ts
  if (method === 'DELETE' && path.startsWith('/sessions/')) {
    const sessionId = path.replace('/sessions/', '');
  ```
  This would match `/sessions/abc/extra/paths` and extract `abc/extra/paths` as the session ID. No validation that the session ID is a UUID or doesn't contain slashes.

- **Impact:** Low -- invalid session IDs will just return 401 (not found). But it's inconsistent with typical REST API routing behavior.

- **Recommendation:** Validate the extracted ID format or use a stricter regex match.

### [LOW] Error responses for CSRF failures don't use `Cache-Control: no-store`

- **File:** `packages/server/src/auth/index.ts:564, 579`
- **Issue:** The CSRF rejection responses at lines 564 and 579 only set `Content-Type: application/json` but don't include security headers. All other error responses include `securityHeaders()`.

- **Impact:** Minor -- CSRF error responses could theoretically be cached, but they don't contain sensitive data.

- **Recommendation:** Add `...securityHeaders()` to CSRF error responses for consistency.

---

## Type Flow Findings

### [HIGH] Type-level tests are structural checks, not flow verification

- **File:** `packages/server/src/auth/__tests__/types.test-d.ts`
- **Issue:** The type-level tests verify that interfaces accept correct shapes (e.g., `InMemorySessionStore` satisfies `SessionStore`), which is useful. However, they don't verify the end-to-end type flow that the TDD rules require:
  - No test that `AuthConfig.sessionStore` flows through to `createAuth` and is used correctly
  - No test verifying `Session.tokens` type flows from `signUp`/`signIn` return to consumer
  - No negative test that `Session.tokens?.jwt` requires optional chaining (the current type makes it optional)
  - No test that `SessionPayload.sid` flows from `createSessionTokens` through to `listSessions` `isCurrent` comparison

  The `.test-d.ts` file has 7 test cases, but none trace a type from definition to consumer across the full API boundary.

- **Impact:** Dead generics or type mismatches could exist without detection. For example, the `SessionPayload` type asserted by `verifyJWT` uses `as unknown as SessionPayload` (line 51 of jwt.ts), which bypasses all type safety -- any malformed JWT payload would be silently cast.

- **Recommendation:** Add type flow tests:
  ```ts
  // Positive: signUp result has tokens
  it('signUp result flows Session type with optional tokens', () => {
    const _check = async (api: AuthApi) => {
      const result = await api.signUp({ email: 'a@b.com', password: '12345678' });
      if (result.ok) {
        const _jwt: string | undefined = result.data.tokens?.jwt;
        const _sid: string = result.data.payload.sid;
      }
    };
  });

  // Negative: Session without required fields
  it('SessionPayload requires sid', () => {
    // @ts-expect-error -- missing sid
    const _p: SessionPayload = { sub: '', email: '', role: '', iat: 0, exp: 0, jti: '' };
  });
  ```

### [MEDIUM] `verifyJWT` uses `as unknown as SessionPayload` -- unsafe cast

- **File:** `packages/server/src/auth/jwt.ts:51`
- **Issue:** The JWT verification returns `payload as unknown as SessionPayload`. This double-cast bypasses TypeScript's structural checks entirely. If the JWT contains unexpected fields or is missing required fields (e.g., `sid` or `jti` were not set during creation), the cast will succeed but the returned object will not match `SessionPayload`.

  The `jose` library's `jwtVerify` returns `JWTPayload` which has index signature `[propName: string]: unknown`. A safe approach would be to validate the shape at runtime.

- **Impact:** If a JWT was created by a different system or a previous version (before `sid`/`jti` were added), `verifyJWT` would return a `SessionPayload` with `undefined` for `sid` and `jti`, but TypeScript would treat them as `string`. This could cause silent failures in session lookup.

- **Recommendation:** Add runtime validation after JWT verification:
  ```ts
  if (typeof payload.sid !== 'string' || typeof payload.jti !== 'string') {
    return null;
  }
  ```

---

## Breaking Changes

### From Phase 1

1. **`Session` type gained `tokens?: AuthTokens` field** -- Additive, not breaking.

2. **`SessionPayload` gained `jti` and `sid` fields** -- These are new required fields. Any code that constructs `SessionPayload` manually (e.g., tests, mocks) will need to include them. The `@ts-expect-error` test in `types.test-d.ts:52-61` correctly validates this.

3. **`getSession` return type changed** -- Previously returned session data directly from a Map. Now returns JWT-verified data. The `Session` type still includes `user` and `expiresAt`, so the shape is compatible. But `getSession` no longer returns `tokens` (only returned by sign-in/sign-up/refresh).

4. **`AuthConfig` gained new optional fields** -- `sessionStore`, `rateLimitStore`, `userStore`, `devSecretPath`, `isProduction`. All optional, so not breaking.

5. **Cookie semantics changed fundamentally** -- Phase 1 used a single long-lived session cookie. Phase 2 uses dual cookies (60s JWT + 7d refresh). This is a runtime behavioral change that affects all clients. Existing sessions from Phase 1 will be invalid after upgrading.

**Assessment:** Breaking changes 1-4 are additive and backward-compatible. Breaking change 5 is a fundamental behavioral change that invalidates all existing sessions. This should be documented in the changeset.

---

## Design Doc Compliance

### Shapes match:
- Dual-token model (60s JWT + 7d refresh): Matches section 4.1
- Cookie names (`vertz.sid`, `vertz.ref`): Match
- Refresh cookie path (`/api/auth/refresh`): Matches section 4.1
- Token rotation with 10s grace period: Matches section 4.4
- Session routes (GET/DELETE `/sessions`, DELETE `/sessions/:id`): Match section 4.6
- Rate limiting defaults (5 sign-in/15m, 3 sign-up/1h, 10 refresh/1m): Match section 11.2
- Max 50 sessions per user: Matches section 11.9

### Deviations:
1. **Security headers incomplete** -- See finding above. Only `Cache-Control: no-store` vs. four headers in the spec.
2. **`emailVerified` missing from JWT claims** -- See finding above.
3. **`SessionInfo` nullability** -- Implementation uses non-nullable strings; design doc uses nullable.
4. **`SessionInfo` missing `userId`** -- Design doc (section 4.5) doesn't include `userId` in `SessionInfo`, but the implementation does. This is a reasonable addition.
5. **Design doc `revokeAllSessions` takes `userId`** -- Section 4.5 shows `revokeAllSessions(userId: string)`. Implementation takes `headers: Headers` and extracts the user from the JWT. The implementation's approach is more secure (prevents revoking another user's sessions), but it deviates from the spec.
6. **Design doc `listSessions` takes `userId`** -- Same pattern as above: design doc passes user ID directly, implementation extracts from JWT.
7. **`previous_refresh_hash` column** -- The design doc's sessions table schema (section 4.3) has only `refresh_hash`. The implementation adds `previousRefreshHash` for grace period support. This is an undocumented deviation needed for the grace period feature described in section 4.4.
8. **JWT algorithm `RS256` available but doc says no RS256** -- `AuthConfig.jwtAlgorithm` accepts `'RS256'` (types.ts line 128), but the design doc section 11.5 says "No RS256 (key size overhead, no benefit over ES256 for new systems)". The type allows what the design explicitly prohibits.

---

## Test Coverage Assessment

### Well-covered:
- Dual-token issuance (cookie names, attributes, Max-Age values)
- Token refresh with rotation
- Grace period idempotency
- Session CRUD (list, revoke single, revoke all)
- CSRF protection (Origin, Referer, X-VTZ-Request)
- Cookie config validation (sameSite + secure)
- JWT secret handling (production vs. dev)
- Rate limit store behavior
- Session store operations
- Device name parsing
- Type-level assertions

### Gaps identified:
1. **No test for concurrent refresh race condition** -- The grace period handles multi-tab refresh, but no test simulates two concurrent refreshes to verify the second gets idempotent tokens.
2. **No test for custom claims** -- `AuthConfig.claims` function is never tested. It's used in `createSessionTokens` but no test verifies custom claims appear in the JWT payload.
3. **No test for `dispose()` actually stopping cleanup intervals** -- The tests call `dispose()` and verify it doesn't throw, but they don't verify that the cleanup interval is actually cleared (e.g., checking that no more cleanup runs after dispose).
4. **No test for the sign-out session revocation path** -- `signOut` calls `getSession` then `revokeSession`, but no test verifies that the session is actually revoked (e.g., that a subsequent refresh with that session's token fails).
5. **No test for `rs256` algorithm rejection** -- If the design says no RS256, there should be a test preventing it.

---

## Verdict: Changes Requested

Three findings must be addressed before merge:

1. **CRITICAL: Missing public exports** -- Store types and implementations are not accessible from `@vertz/server`. External consumers cannot implement custom stores.
2. **CRITICAL: `signUp`/`signIn` API strips context** -- Programmatic API loses IP/UA metadata.
3. **HIGH: Security headers incomplete** -- Missing `X-Content-Type-Options`, `Pragma`, and `Referrer-Policy` as specified in the design doc.

The HIGH findings (AuthContext type mismatch, emailVerified omission, JWT RS256 type) and MEDIUM findings should be addressed but are not merge-blockers given that all packages are pre-v1.
