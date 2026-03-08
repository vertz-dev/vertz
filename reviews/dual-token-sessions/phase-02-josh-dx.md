# Phase 2: Dual-Token Sessions -- DX Review

- **Author:** ben
- **Reviewer:** josh (vertz-advocate)
- **Date:** 2026-03-08
- **Scope:** All auth commits on `feat/dual-token-sessions` (7 commits, #1016)

---

## Developer Experience Findings

### [CRITICAL] Store types and implementations are not exported from `@vertz/server`

- **Context:** A developer wants to implement a PostgreSQL-backed `SessionStore` or `UserStore`. They import from `@vertz/server` (the public API surface).
- **Issue:** `SessionStore`, `UserStore`, `RateLimitStore`, `StoredSession`, `AuthTokens`, `SessionInfo`, `InMemorySessionStore`, `InMemoryUserStore`, and `InMemoryRateLimitStore` are exported from `packages/server/src/auth/index.ts` but are **not re-exported** from `packages/server/src/index.ts`. The integration test at `packages/integration-tests/src/__tests__/auth-dual-token.test.ts` imports `SessionInfo` from `@vertz/server` -- this only works because of TypeScript path resolution through the package's barrel export, but the explicit re-export is missing from the server's `index.ts`.

  Specifically, `packages/server/src/index.ts` exports `AuthConfig` (which references `SessionStore`, `UserStore`, `RateLimitStore` in its type), but does not export those interfaces themselves. A developer seeing `sessionStore?: SessionStore` in their IDE cannot navigate to or import that type.

- **Impact:** Developers who want to implement custom stores -- the primary extensibility point of this auth system -- cannot import the interfaces they need to implement. This is a blocker for anyone using a real database.
- **Recommendation:** Add all store-related types and implementations to the re-export block in `packages/server/src/index.ts`:
  ```typescript
  // Types
  export type { SessionStore, UserStore, RateLimitStore, StoredSession, AuthTokens, SessionInfo } from './auth';
  // Implementations
  export { InMemorySessionStore, InMemoryUserStore, InMemoryRateLimitStore } from './auth';
  ```

### [CRITICAL] `AuthApi.signUp` / `signIn` API drops request context (IP + User-Agent)

- **Context:** A developer calls `auth.api.signUp(data)` programmatically (not via the HTTP handler) -- e.g., in a custom route handler, a seed script, or server-side testing.
- **Issue:** The `AuthApi` type definition says:
  ```typescript
  signUp: (data: SignUpInput) => Promise<Result<Session, AuthError>>;
  signIn: (data: SignInInput) => Promise<Result<Session, AuthError>>;
  ```
  And the implementation wraps the internal functions to explicitly drop the `ctx` parameter:
  ```typescript
  signUp: (data: SignUpInput) => signUp(data),  // ctx never forwarded
  signIn: (data: SignInInput) => signIn(data),
  ```
  This means sessions created via the programmatic API **always have empty `ipAddress` and `userAgent`**. The session list will show blank IPs and "Unknown device" for every session created this way. There is no way for a developer to pass request context through the programmatic API.

- **Impact:** Any developer using the programmatic API (rather than the HTTP handler) loses session tracking data. This is silent -- no error, no warning, just empty fields. A developer building a custom auth flow (e.g., OAuth callback that calls `signUp` internally) will wonder why their sessions page shows no device info.
- **Recommendation:** Either:
  (a) Add an optional second parameter: `signUp: (data: SignUpInput, ctx?: { headers: Headers }) => ...` and thread it through, or
  (b) Document clearly that the programmatic API does not capture request context and the HTTP handler is the recommended path.

### [HIGH] `AuthContext` type requires `request: Request` but it is never used

- **Context:** A developer calls `auth.api.refreshSession(ctx)` or `auth.api.signOut(ctx)`.
- **Issue:** The `AuthContext` type requires both `headers: Headers` and `request: Request`. But the implementation of `refreshSession` and `signOut` only uses `ctx.headers` -- `ctx.request` is never accessed. This forces developers to construct a dummy `Request` object for no reason:
  ```typescript
  // Developer has to do this even though request is unused:
  await auth.api.refreshSession({
    headers: new Headers({ cookie: '...' }),
    request: new Request('http://dummy'),  // Why?
  });
  ```
  The unit tests confirm this -- every test constructs a throwaway `Request` just to satisfy the type.

- **Impact:** Unnecessary boilerplate, confusing API -- developer wonders "does it matter what URL I pass?"
- **Recommendation:** Change `AuthContext` to make `request` optional, or split into separate parameter types: `refreshSession(ctx: { headers: Headers }) => ...`. The type should reflect what the function actually uses.

### [HIGH] `signOut` silently succeeds even when the session cookie is missing/invalid

- **Context:** A developer calls sign-out without a valid session cookie.
- **Issue:** `signOut` calls `getSession(ctx.headers)` and if it returns no session (no cookie, expired JWT, invalid JWT), it silently returns `ok(undefined)`. The HTTP handler then clears both cookies and returns 200.

  From a DX perspective this is defensible (idempotent sign-out), but the problem is that `getSession` returns `Result<Session | null, AuthError>` and the code checks `sessionResult.ok && sessionResult.data`. If `getSession` returns an error (not just null), that error is silently swallowed. There is no logging, no distinction between "user was already signed out" and "something went wrong with session verification."

- **Impact:** Silent error swallowing makes debugging harder. A developer investigating why sign-out "isn't working" (e.g., session not being revoked in the store) has no signal to work with.
- **Recommendation:** Log a debug-level message when sign-out is called without a valid session, and consider returning the underlying error when `sessionResult.ok` is false (even if the HTTP response is still 200).

### [HIGH] Grace period window (10s) is hardcoded with no config or documentation

- **Context:** A developer's multi-tab app sends concurrent refresh requests and some fail.
- **Issue:** The 10-second grace period for previously-rotated refresh tokens is hardcoded at line 386:
  ```typescript
  if (storedSession && storedSession.lastActiveAt.getTime() + 10_000 > Date.now()) {
  ```
  This is not configurable and not documented in any comment explaining *why* 10 seconds. If a developer's infrastructure has higher latency (e.g., CDN, mobile networks), 10 seconds may not be enough. If they want tighter security, they can't reduce it.

- **Impact:** No visibility into why refresh sometimes works with an "old" token and sometimes doesn't. When it fails after 10s, the error is just "Invalid refresh token" with no mention of the grace period.
- **Recommendation:**
  (a) Add a `refreshGracePeriod` config option (default `'10s'`) to `SessionConfig`.
  (b) When a grace period lookup fails because the time window expired, include that information in the error: "Refresh token was rotated and the grace period (10s) has expired."

### [MEDIUM] `session.strategy` is required but only `'jwt'` works

- **Context:** A developer sees `SessionConfig.strategy` with type `'jwt' | 'database' | 'hybrid'` and tries to use `'database'`.
- **Issue:** The type advertises three strategies, but only `'jwt'` is implemented. Passing `'database'` or `'hybrid'` produces no error at config time -- the code just ignores the strategy field entirely and always uses JWT. The developer won't know their chosen strategy isn't active until they investigate runtime behavior.
- **Impact:** False advertising in the type system. A developer trusts TypeScript to guide them, and the type says three options exist.
- **Recommendation:** Either:
  (a) Remove `'database'` and `'hybrid'` from the union type until they're implemented (breaking changes are encouraged pre-v1), or
  (b) Throw at `createAuth` time: `"Strategy 'database' is not yet supported. Use 'jwt'."`

### [MEDIUM] Rate limit defaults are scattered and inconsistent

- **Context:** A developer wants to understand rate limiting behavior.
- **Issue:** Rate limit defaults are spread across multiple locations with no single source of truth:
  - Sign-in: `emailPassword?.rateLimit?.maxAttempts || 5` (line 256) and window from config
  - Sign-up: `emailPassword?.rateLimit?.maxAttempts || 3` (line 182) and `parseDuration('1h')` hardcoded (line 111)
  - Refresh: `10` attempts per `parseDuration('1m')` hardcoded (lines 112, 355-359)

  Sign-up uses `maxAttempts` from `emailPassword.rateLimit` but a *different* window (`'1h'` hardcoded vs the configured window). Sign-in uses the configured window. Refresh uses completely hardcoded values. A developer setting `rateLimit: { window: '15m', maxAttempts: 5 }` would reasonably expect those to apply to sign-up too, but sign-up uses `maxAttempts: 3` and `window: '1h'` regardless.

- **Impact:** Confusing behavior that contradicts what the config suggests. A developer setting strict rate limits may be surprised that sign-up and refresh have their own hidden defaults.
- **Recommendation:** Document the actual rate limit behavior per endpoint, or expose per-endpoint rate limit config. At minimum, the inconsistency between sign-up using `maxAttempts || 3` (not the configured `5`) should be intentional and documented, not accidental.

### [MEDIUM] `parseDuration` error message is unhelpful

- **Context:** A developer passes `ttl: '2w'` (2 weeks) or `ttl: '500ms'`.
- **Issue:** `parseDuration` only supports `s`, `m`, `h`, `d` suffixes. The error message is:
  ```
  Error: Invalid duration: 2w
  ```
  This tells the developer *what* failed but not *how to fix it*. They have to guess which units are valid.

- **Impact:** Minor friction, but every developer will hit this at least once. The fix is trivial.
- **Recommendation:** Change to: `Invalid duration: "2w". Expected format: <number><unit> where unit is s (seconds), m (minutes), h (hours), or d (days). Examples: "60s", "15m", "7d".`

### [MEDIUM] `UserTableEntry` and `RoleAssignmentTableEntry` use `any`

- **Context:** Type definitions in `types.ts`.
- **Issue:** Both types use `ModelEntry<any, any>`:
  ```typescript
  export interface UserTableEntry extends ModelEntry<any, any> { ... }
  export interface RoleAssignmentTableEntry extends ModelEntry<any, any> { ... }
  ```
  The project convention is "no `as any`" for full type safety. While these aren't `as any` casts, they're `any` type parameters that weaken type safety.

- **Impact:** These types cannot provide type-safe validation of user table schemas. Any table definition would be accepted.
- **Recommendation:** Either use proper generic type parameters or use `unknown` instead of `any` (more restrictive, forces the consumer to narrow).

---

## Naming & Discoverability

### [MEDIUM] `createSessionWithId` vs `createSession` -- confusing dual API

- **Context:** A developer implementing a custom `SessionStore`.
- **Issue:** The `SessionStore` interface requires implementing both `createSession` (auto-generates ID) and `createSessionWithId` (caller provides ID). The core `createAuth` code only ever calls `createSessionWithId`. `createSession` exists on the interface but is never called by the framework.

  A developer implementing a PostgreSQL `SessionStore` would implement both methods, but `createSession` would be dead code. Worse, if they only implement `createSessionWithId` (the one actually used), TypeScript would error because `createSession` is required by the interface.

- **Impact:** Implementors do unnecessary work. The interface contract is misleading about what the framework actually needs.
- **Recommendation:** Remove `createSession` from the `SessionStore` interface. If only `createSessionWithId` is used, only that should be in the contract. The `InMemorySessionStore` can keep both as internal convenience, but the interface should be minimal.

### [LOW] `vertz.sid` / `vertz.ref` cookie names use dots

- **Context:** Cookie names.
- **Issue:** While dots in cookie names are technically valid per RFC 6265, they can cause issues with some cookie parsing libraries and proxy configurations. More importantly, `vertz.sid` could be confused with a Java-style package hierarchy. Dash-separated names (`vertz-sid`, `vertz-ref`) or underscore (`vertz_sid`) are more conventional for cookies.
- **Impact:** Minor -- unlikely to cause real issues, but worth noting for discoverability.
- **Recommendation:** Nit only. The current names work fine. If they're ever changed, it should be before v1.

### [LOW] `jti` and `sid` in `SessionPayload` are cryptic

- **Context:** A developer inspecting JWT claims or `session.payload`.
- **Issue:** `jti` (JWT ID) and `sid` (session ID) are standard JWT claim abbreviations, but developers who aren't JWT experts won't know what they mean. The type has JSDoc comments (`/** JWT ID */`, `/** Session ID */`), which helps, but the field names themselves are opaque.
- **Impact:** Minor DX friction. Developers will need to read the type docs or look up JWT specs.
- **Recommendation:** Keep `jti` and `sid` for JWT standard compliance, but consider adding accessor properties like `session.payload.sessionId` (getter that returns `sid`) for discoverability. Low priority.

---

## Error Message Quality

### [HIGH] Error codes are inconsistent with HTTP semantics for session management

- **Context:** A developer gets a 401 when trying to delete a session that doesn't exist.
- **Issue:** When `DELETE /sessions/:id` targets a non-existent session (or one owned by another user), the code returns `SESSION_EXPIRED` error with status 401. But the session wasn't expired -- it just doesn't exist or doesn't belong to the requesting user.

  The test at `session-management.test.ts:164` even has a comment acknowledging the mismatch:
  ```typescript
  // Session not found returns 401 (SESSION_EXPIRED error code maps to 401)
  ```
  And the cross-user test expects either 401 or 403:
  ```typescript
  expect([401, 403]).toContain(deleteRes.status);
  ```

  This is a confusing signal for frontend developers building session management UIs. Getting 401 when trying to revoke someone else's session could trigger a "you've been logged out" flow on the client, when really the user is still authenticated -- they just don't have access to that specific session.

- **Impact:** Frontend developers will misinterpret the error. 401 means "your authentication is invalid" -- not "that resource doesn't exist" or "you don't have access."
- **Recommendation:**
  - Session not found: 404 with `SESSION_NOT_FOUND` error code
  - Session belongs to another user: 403 with `PERMISSION_DENIED` error code
  - Session truly expired: 401 with `SESSION_EXPIRED`

### [MEDIUM] Rate limit error messages don't include retry timing

- **Context:** A developer's client gets rate limited on sign-in.
- **Issue:** The error message is just `"Too many sign in attempts"`. The `RateLimitResult` has a `resetAt` field, but it's never included in the error response. The developer (and their client code) has no way to know *when* to retry.
- **Impact:** Client-side code can't show "try again in 5 minutes" -- it can only show "too many attempts."
- **Recommendation:** Include `retryAfter` in the error response (seconds until window resets) and set the `Retry-After` HTTP header. This is standard HTTP practice for 429 responses.

### [MEDIUM] "User not found" during refresh is misleading

- **Context:** A user's account is deleted while they have an active session, then they try to refresh.
- **Issue:** `refreshSession` returns `createSessionExpiredError('User not found')` when the user store lookup fails. From the developer's perspective, "session expired" and "user not found" are very different situations -- one is normal, the other suggests data corruption or account deletion.
- **Impact:** Developers investigating auth issues can't distinguish between expired sessions and deleted users.
- **Recommendation:** Use a distinct error: `createInvalidCredentialsError('Account no longer exists')` or a new `ACCOUNT_DELETED` code.

### [LOW] Internal server error handler swallows exception details

- **Context:** The HTTP handler's catch-all at line 799.
- **Issue:** The catch block returns `{ error: 'Internal server error' }` without logging the actual error. The `_error` variable is captured but unused. In development, developers need the actual stack trace.
- **Impact:** Debugging auth issues requires adding custom logging. The framework should help here.
- **Recommendation:** In non-production mode, include the error message in the response. In all modes, log the error to console.error.

---

## Integration Test as Example

### Does the test serve as documentation?

The integration test at `packages/integration-tests/src/__tests__/auth-dual-token.test.ts` is **good but incomplete as a learning resource**:

**Strengths:**
- Uses public package imports (`@vertz/server`) correctly
- Covers the full lifecycle: signup -> refresh -> getSession -> listSessions -> revoke -> refresh fails
- Demonstrates grace period behavior
- Shows session management (list, revoke all)
- Cookie parsing helpers are reusable

**Weaknesses:**
- Does not show the minimal setup -- the `createTestAuth` helper obscures what's required vs optional
- Does not show how to wire `auth.handler` into a real server (the test calls the handler directly)
- Does not demonstrate the middleware (`auth.middleware()`) -- how does a developer protect their routes?
- Does not show custom store implementation
- Does not show the `claims` config option
- No example of error handling from the client's perspective (what does the response body look like on failure?)
- The CSRF bypass (no `origin` or `x-vtz-request` headers) works only because `isProduction: false` -- a developer copying this pattern for production would be confused when it breaks

### Would a developer understand how to use the API from reading the test?

Partially. They'd understand the HTTP contract (routes, cookies, status codes) but not how to integrate auth into their vertz server. The gap between "I can call `auth.handler` with a Request" and "I have a working protected API" is not bridged.

---

## "5-Minute Test" Assessment

### Can a developer go from zero to working auth in 5 minutes?

**Likely no.** Here is what a developer needs to figure out:

**Step 1: Minimum config (30 seconds)** -- this part is good:
```typescript
const auth = createAuth({
  session: { strategy: 'jwt', ttl: '60s' },
});
// jwtSecret auto-generated in dev -- nice!
```

**Step 2: Wire the handler (???)** -- this is where it gets unclear:
- How does `auth.handler` integrate with `vertz()` / `createServer()`?
- The handler expects requests at `/api/auth/*` -- does the developer mount it manually?
- There's no example of this in any test or doc.

**Step 3: Protect routes with middleware (???)** -- also unclear:
- `auth.middleware()` returns a function, but how does it integrate with vertz middleware?
- The middleware type is `(ctx: Record<string, unknown>, next: () => Promise<void>) => Promise<void>` -- a developer using typed vertz routes won't have `Record<string, unknown>` as their context type. How does `ctx.user` get typed?

**Step 4: CSRF setup (gotcha)** -- in production, every POST needs:
- `Origin` header matching the request URL
- `X-VTZ-Request: 1` header
- Neither of these is documented or mentioned in any example

**Step 5: Client-side refresh (???)**:
- When does the client refresh? When it gets a 401?
- Is there a recommended client-side pattern?
- The JWT expires in 60 seconds -- does the developer need to set up a timer?

### What will they struggle with?

1. **Wiring `auth.handler` into their server** -- no example exists
2. **Understanding CSRF requirements** -- will silently break in production
3. **Client-side token refresh** -- no guidance on when/how to call `/api/auth/refresh`
4. **Middleware typing** -- `ctx.user` is typed as `unknown` via `Record<string, unknown>`
5. **Custom stores** -- store interfaces not importable from `@vertz/server`

---

## Store Interface Clarity

### [MEDIUM] `SessionStore` interface is large -- hard to implement correctly

The `SessionStore` interface has 8 methods. For a developer implementing a PostgreSQL backend, that's 8 SQL queries to write. Some methods have subtle contracts:

- `findByRefreshHash` must check `revokedAt IS NULL AND expiresAt > NOW()`
- `findByPreviousRefreshHash` must do the same plus is used for grace period
- `createSession` must enforce max sessions (but is never called by the framework)
- `updateSession` must update both current and previous hash atomically
- `getCurrentTokens` stores raw tokens in memory for grace period idempotency -- for a DB-backed store, this means storing encrypted tokens in a column

None of these contracts are documented on the interface. A developer implementing a custom store would need to read the `InMemorySessionStore` source to understand the expected behavior.

**Recommendation:** Add JSDoc to every method on the `SessionStore` interface explaining the contract, edge cases, and expected behavior. Consider providing a base class or test suite that custom store implementations can run against to verify correctness.

---

## Verdict: Changes Requested

The auth system's core design is sound -- dual-token with rotation, grace period, session management, pluggable stores. The security posture is strong (HttpOnly cookies, CSRF, timing-safe comparison, rate limiting). But from a DX perspective, there are several issues that would frustrate developers trying to adopt this:

**Must fix before merge (CRITICAL):**
1. Export store types and implementations from `@vertz/server` -- without this, custom stores are impossible
2. Fix or document the `signUp`/`signIn` API losing request context

**Should fix before merge (HIGH):**
3. Fix `AuthContext` requiring unused `request` field
4. Fix error codes for session management (401 for "not found" is wrong)
5. Make grace period configurable or at least document it

**Consider fixing (MEDIUM):**
6. Remove unimplemented session strategies from the type union
7. Improve `parseDuration` error message
8. Add retry timing to rate limit errors
9. Remove `createSession` from `SessionStore` interface (only `createSessionWithId` is used)
10. Add JSDoc to `SessionStore` interface methods
