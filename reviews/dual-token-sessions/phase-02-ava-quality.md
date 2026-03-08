# Phase 2: Dual-Token Sessions -- Adversarial Review

- **Author:** ben
- **Reviewer:** ava (vertz-dev-dx)
- **Date:** 2026-03-08
- **Branch:** `feat/dual-token-sessions`
- **Issue:** #1016

---

## Security Findings

### [HIGH] S1: Sign-in missing dummy bcrypt on unknown email -- timing-based user enumeration

- **File:** `/packages/server/src/auth/index.ts:263-266`
- **Issue:** When `findByEmail` returns `null` (user does not exist), the code returns `INVALID_CREDENTIALS` immediately without performing a dummy `bcrypt.compare()`. The design doc (Section 3.1) explicitly requires: "Timing-safe unknown email handling: When a sign-in attempt uses an email that does not exist in the database, the server performs a dummy `bcrypt.compare()` against a pre-computed hash before returning `INVALID_CREDENTIALS`." The bcrypt call takes ~250ms; skipping it when the user does not exist creates a measurable timing difference (~250ms vs <1ms) that allows an attacker to enumerate valid email addresses.
- **Impact:** An attacker can determine whether an email is registered by measuring response times. This is a well-documented attack vector. The design doc calls it out as a required mitigation.
- **Recommendation:** Pre-compute a dummy bcrypt hash at module initialization (e.g., `const DUMMY_HASH = await hashPassword('dummy-password-never-matches');`). When `findByEmail` returns null, call `verifyPassword(password, DUMMY_HASH)` before returning the error. This equalizes timing.

### [HIGH] S2: `timingSafeEqual` early-returns on length mismatch -- leaks hash length

- **File:** `/packages/server/src/auth/crypto.ts:11`
- **Issue:** `timingSafeEqual(a, b)` returns `false` immediately when `a.length !== b.length`. Since both inputs are SHA-256 hex strings (always 64 chars), this is not exploitable in the current usage. However, the function is exported as a general-purpose utility and its name promises timing-safe behavior. If any future caller uses it with variable-length inputs, the early return leaks information. Node's `crypto.timingSafeEqual` also requires equal-length buffers, but it throws an error rather than returning false, which makes the misuse obvious. Additionally, a truly timing-safe implementation should still XOR the full shorter buffer before returning, or throw on length mismatch.
- **Impact:** Low in current usage (all inputs are 64-char hex). Medium risk if the function is reused elsewhere with variable-length strings.
- **Recommendation:** Either (a) throw an error on length mismatch (like Node's `crypto.timingSafeEqual`), or (b) rename to `timingSafeEqualFixedLength` to signal the constraint, or (c) use Node/Bun's built-in `crypto.timingSafeEqual` directly.

### [HIGH] S3: Refresh token stored in plaintext in `currentTokens` Map

- **File:** `/packages/server/src/auth/session-store.ts:13`, `/packages/server/src/auth/index.ts:232,423`
- **Issue:** The `currentTokens` Map stores `{ jwt, refreshToken }` in plaintext. The refresh token is the raw opaque token, not its hash. This is stored for the grace period idempotent return. If server memory is dumped (core dump, memory leak to logs, debugging), all active refresh tokens are exposed in plaintext. The `refreshTokenHash` field correctly stores the hash, but the grace period mechanism stores the raw token alongside it.
- **Impact:** An attacker with read access to server memory (or a memory dump) can extract valid refresh tokens and hijack sessions. This undermines the benefit of hashing refresh tokens in the session store.
- **Recommendation:** For the grace period, return the same tokens by storing only the hashed values or by having the client re-send its current tokens. Alternatively, accept that the JWT is also stored in plaintext (which is inherently short-lived) and document this as a known tradeoff for the in-memory store. At minimum, ensure the database-backed store in a future phase does NOT store raw tokens.

### [MEDIUM] S4: Refresh rate limit keyed by spoofable `X-Forwarded-For` header

- **File:** `/packages/server/src/auth/index.ts:356`
- **Issue:** The refresh rate limit key uses `ctx.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'default'`. The `X-Forwarded-For` header is trivially spoofable by any client. An attacker can bypass the rate limit by rotating the header value on each request. Additionally, if no header is present, all unauthenticated refresh attempts share the key `'default'`, which means a single attacker can exhaust the rate limit for ALL clients not behind a proxy.
- **Impact:** Rate limiting on refresh is effectively unenforced. The `'default'` fallback key means attackers without X-Forwarded-For can deny refresh to all similarly-situated clients.
- **Recommendation:** (1) Key by the session ID (from the refresh token hash) rather than IP for refresh rate limiting -- this ties the limit to the session being refreshed. (2) For IP-based rate limiting, require a trusted proxy configuration that strips/overrides X-Forwarded-For. (3) At minimum, don't use `'default'` as a shared fallback key -- use the raw socket IP if available, or skip rate limiting when no IP is available.

### [MEDIUM] S5: Sign-up rate limit uses `maxAttempts` from `signIn` config

- **File:** `/packages/server/src/auth/index.ts:182`
- **Issue:** `emailPassword?.rateLimit?.maxAttempts || 3` uses the rateLimit config from `emailPassword`, which the plan document says is for sign-in (5 attempts per 15 minutes). Sign-up should have its own rate limit (the plan says 3 per hour). If the user configures `emailPassword.rateLimit.maxAttempts: 5` for sign-in, sign-up inherits this higher limit. The sign-up window is correctly separate (`signUpWindowMs = parseDuration('1h')`), but the attempt count is shared with the sign-in config.
- **Impact:** Sign-up rate limiting may be weaker or stronger than intended depending on sign-in config. Not a critical issue, but deviates from the spec.
- **Recommendation:** Use a separate hardcoded value or a dedicated config field for sign-up max attempts: `const signUpMaxAttempts = 3;`

### [MEDIUM] S6: `getSession` looks up user by email from JWT payload -- user email change breaks sessions

- **File:** `/packages/server/src/auth/index.ts:339`
- **Issue:** `getSession` verifies the JWT, then calls `userStore.findByEmail(payload.email)` to get the user. If a user changes their email (a common operation in full apps), all existing JWTs contain the old email. Every `getSession` call for those JWTs will fail to find the user, effectively logging them out. The `sid` (session ID) and `sub` (user ID) claims are already in the JWT -- the user should be looked up by ID, not email.
- **Impact:** Email changes silently invalidate all active sessions within the 60-second JWT window. Since JWTs are short-lived, the impact is bounded, but it creates a confusing UX where the user appears logged out immediately after changing their email. The `refreshSession` correctly uses `userStore.findById(storedSession.userId)`.
- **Recommendation:** Change `getSession` to use `userStore.findById(payload.sub)` instead of `userStore.findByEmail(payload.email)`. The `sub` claim contains the user ID and is immutable.

### [LOW] S7: Cookie value not URL-encoded

- **File:** `/packages/server/src/auth/cookies.ts:33,52`
- **Issue:** The JWT value is set directly in the cookie without URL-encoding. JWTs use base64url encoding which is cookie-safe, so this works. The refresh token is also base64url (with `+`/`/`/`=` replaced). However, if the custom claims function returns values that produce non-cookie-safe characters in the JWT, the cookie could be malformed. This is unlikely but worth noting.
- **Impact:** Very low risk in practice. Base64url encoding is cookie-safe by design.
- **Recommendation:** No action needed. Document that custom claims should not produce excessively large JWTs (cookie size limit ~4KB).

---

## Type Safety Findings

### [MEDIUM] T1: `as unknown as SessionPayload` cast in `verifyJWT`

- **File:** `/packages/server/src/auth/jwt.ts:51`
- **Issue:** The jose library returns `JWTPayload` which has optional standard claims. The cast `payload as unknown as SessionPayload` skips validation that the required fields (`sub`, `email`, `role`, `jti`, `sid`) are actually present. If a JWT is crafted with missing fields (or if the createJWT function changes), the cast will succeed but the returned object will have `undefined` for required fields, causing runtime errors downstream.
- **Impact:** If a JWT is somehow issued without `sid` or `jti` (e.g., by an older version of the code or a misconfigured custom claims function that overrides them), `getSession` will return a session with `payload.sid` as `undefined`, which will silently break session management operations.
- **Recommendation:** Add a runtime guard after verification: check that `payload.sub`, `payload.email`, `payload.role`, `payload.jti`, and `payload.sid` are all present and of the correct type before returning. Return `null` if any are missing.

### [MEDIUM] T2: `ModelEntry<any, any>` in `UserTableEntry` and `RoleAssignmentTableEntry`

- **File:** `/packages/server/src/auth/types.ts:278,291`
- **Issue:** Both `UserTableEntry` and `RoleAssignmentTableEntry` extend `ModelEntry<any, any>`. The codebase rule is "No `as any`". While these are interfaces used for future DB integration and aren't consumed yet, the `any` type parameters create a loophole where any model entry could satisfy the constraint, defeating the purpose of the type.
- **Impact:** Low currently (these types appear unused in runtime code). Will become a type safety issue when the DB backend is implemented.
- **Recommendation:** Replace with `ModelEntry<string, string>` or the appropriate concrete types, or add a comment explaining why `any` is necessary here as a placeholder.

### [LOW] T3: `AuthUser` index signature `[key: string]: unknown` weakens type safety

- **File:** `/packages/server/src/auth/types.ts:164`
- **Issue:** The `[key: string]: unknown` index signature on `AuthUser` means any property access returns `unknown`, even for defined properties like `email`. This interacts poorly with TypeScript's excess property checking and makes it possible to pass arbitrary data through the user object without type validation. The `SignUpInput` has the same issue (line 211).
- **Impact:** Low -- this is a deliberate design choice for extensibility. But it means `user.email` has type `string | unknown` (resolved to `unknown` in some TS contexts), which can require unnecessary type narrowing.
- **Recommendation:** Consider whether a generic parameter (e.g., `AuthUser<TExtra extends Record<string, unknown> = Record<string, unknown>>`) would provide better type safety while still allowing extensibility. Or accept the tradeoff and document it.

---

## Edge Case / Logic Findings

### [HIGH] E1: Grace period falls through to token rotation when `currentTokens` JWT is expired

- **File:** `/packages/server/src/auth/index.ts:399-413`
- **Issue:** During the grace period, the code retrieves `currentTokens` and verifies the JWT (`verifyJWT(currentTokens.jwt, ...)`). If the JWT has expired (which it will after 60 seconds), `verifyJWT` returns `null`, and the code falls through to generate NEW tokens. This means the grace period is only truly idempotent for 60 seconds (the JWT TTL), not 10 seconds (the grace window). After the JWT expires but within the 10-second grace window, the old refresh token will generate NEW tokens instead of returning the existing ones. This could cause issues: two tabs using the old token get different new tokens, and only the last one's refresh token will be current.
- **Impact:** After the JWT expires, grace period requests generate new tokens instead of returning the cached ones. This breaks the idempotency guarantee for the ~10 second window. In practice, the 60s JWT TTL means the JWT will almost always be valid during the 10s grace window, but the logic is fragile -- if someone configures a very short JWT TTL (e.g., `5s`), the grace period breaks.
- **Recommendation:** Don't re-verify the JWT during grace period -- just return the cached `currentTokens` directly. The grace period is specifically about returning the same tokens that were just issued. The JWT's validity is irrelevant here; it was valid when it was issued seconds ago. Alternatively, skip JWT verification and just validate that `currentTokens` exists.

### [HIGH] E2: Missing `switch-org` endpoint from Sub-Phase 4

- **File:** `/packages/server/src/auth/index.ts` (missing), `plans/phase2-dual-token-sessions.md:128`
- **Issue:** Sub-Phase 4 of the implementation plan specifies: "`POST /api/auth/switch-org` -- re-issue JWT with new `tenantId`, same session". This endpoint is not implemented. The plan also calls for `switch-org.test.ts` tests. Neither `tenantId` nor switch-org appear anywhere in the auth implementation. The integration test plan also lists "switch-org: re-issues JWT with tenantId" as a required test.
- **Impact:** The implementation is incomplete per the plan. The `tenantId` claim referenced in the design doc (Section 4.2) is not supported.
- **Recommendation:** Either implement `switch-org` or update the plan to explicitly defer it to a future phase with a rationale. If deferred, add a note to the PR description.

### [MEDIUM] E3: `signUp` via API does not pass request context (IP/User-Agent always empty)

- **File:** `/packages/server/src/auth/index.ts:837`
- **Issue:** `signUp: (data: SignUpInput) => signUp(data)` -- the API binding drops the second `ctx` parameter. When using `auth.api.signUp(...)`, the session is created with `ipAddress: ''` and `userAgent: ''`. The HTTP handler correctly passes `{ headers: request.headers }`, but the programmatic API does not. Same applies to `signIn` (line 838).
- **Impact:** Sessions created via the programmatic API have empty IP and User-Agent. The session management UI (list sessions) will show empty device names. This is a DX issue -- developers using the API directly get degraded session metadata.
- **Recommendation:** Either (1) update `AuthApi.signUp` to accept optional headers/context, or (2) document that the programmatic API does not capture request metadata and the HTTP handler should be used for full session tracking.

### [MEDIUM] E4: Session cleanup removes revoked sessions -- breaks grace period audit trail

- **File:** `/packages/server/src/auth/session-store.ts:179-187`
- **Issue:** The cleanup interval removes sessions where `revokedAt` is set. Once cleaned, there is no record that the session ever existed. If a revoked session's refresh token is replayed after cleanup, `findByRefreshHash` and `findByPreviousRefreshHash` both return `null`, and the error is `'Invalid refresh token'` rather than a more specific `'Session revoked'`. This is acceptable for the in-memory store but worth noting for the future DB store.
- **Impact:** Low for security (the token is rejected regardless). Loss of audit trail for revoked sessions.
- **Recommendation:** For the in-memory store, this is acceptable (memory is finite). For the future DB store, consider keeping revoked sessions for audit purposes with a separate cleanup policy.

### [MEDIUM] E5: `signOut` silently succeeds even without a valid session

- **File:** `/packages/server/src/auth/index.ts:307-314`
- **Issue:** `signOut` calls `getSession`, and if the session is not found (expired JWT, no cookie), it silently returns `ok(undefined)`. The HTTP handler still clears cookies. This is arguably correct behavior (you want sign-out to always clear cookies), but the `signOut` API never returns an error, making it impossible for the caller to know whether a session was actually revoked.
- **Impact:** Low -- sign-out is primarily about clearing client state (cookies). The silent success is defensible.
- **Recommendation:** Acceptable as-is. Consider adding a return value like `{ revoked: boolean }` if the caller needs to know.

### [LOW] E6: Email validation is minimal (`email.includes('@')`)

- **File:** `/packages/server/src/auth/index.ts:170`
- **Issue:** The email validation only checks for the presence of `@`. Values like `@`, `@.`, `user@`, or `user@.` would pass. RFC 5322 compliant validation is complex and often overkill, but the current check is extremely permissive.
- **Impact:** Low -- the email will fail at the SMTP level when verification emails are sent. But invalid emails could accumulate in the user store.
- **Recommendation:** Consider a slightly stricter check: `email.includes('@') && email.indexOf('@') > 0 && email.indexOf('@') < email.length - 1 && email.includes('.', email.indexOf('@'))`. Or use a small regex. Don't go full RFC 5322 -- it's not worth the complexity.

### [LOW] E7: `parseDuration` does not support weeks (`w`) or combined units

- **File:** `/packages/server/src/auth/jwt.ts:11`
- **Issue:** `parseDuration` only supports `s`, `m`, `h`, `d`. Values like `'2w'` (two weeks) or `'1h30m'` will throw. The design doc references `'7d'` which works, but developers might naturally try `'1w'`.
- **Impact:** Low -- throws a clear error message. Developers can use `'7d'` instead of `'1w'`.
- **Recommendation:** Minor DX improvement. Consider adding `w` support (weeks are common in session TTLs).

---

## Test Coverage Findings

### [HIGH] TC1: No test for refresh token reuse AFTER grace period expires

- **File:** `/packages/server/src/auth/__tests__/token-refresh.test.ts`
- **Issue:** The test "old token within 10s grace period returns current (idempotent) tokens" verifies grace period success, but there is no test verifying that the old token is REJECTED after the 10-second grace period expires. The "expired session returns 401 on refresh" test uses a 1-second `refreshTtl` to test session expiry, which is different from the grace period. There is no test that rotates, waits 11+ seconds, then tries the old token and expects failure.
- **Impact:** The 10-second grace period boundary is untested. If the grace period logic has an off-by-one error, no test would catch it.
- **Recommendation:** Add a test that rotates tokens, waits >10 seconds, then attempts refresh with the old token and asserts failure. This is the negative case for the grace period.

### [HIGH] TC2: No test for concurrent refresh requests (the primary grace period motivation)

- **File:** All test files
- **Issue:** The design doc explains that the grace period exists for the "multi-tab race condition: two tabs firing their refresh timer simultaneously both send the same token." There is no test that simulates this -- firing two concurrent refresh requests with the same token and verifying both succeed. The existing grace period test is sequential (first refresh, then second refresh with old token).
- **Impact:** The primary use case motivating the grace period feature is untested.
- **Recommendation:** Add a test that sends two refresh requests concurrently (using `Promise.all`) with the same refresh token and verifies both succeed with consistent tokens.

### [MEDIUM] TC3: No test for max sessions enforcement via the integration test

- **File:** `/packages/integration-tests/src/__tests__/auth-dual-token.test.ts`
- **Issue:** The integration test plan (Sub-Phase 5) lists "Max 50 sessions enforcement" as a required integration test. This test is missing from the integration test file. The unit test in `session-management.test.ts` tests with 4 sessions (default max 50), which confirms sessions are NOT evicted, but doesn't actually test the overflow behavior.
- **Impact:** The max sessions enforcement is only tested at the store level (`session-store.test.ts` with `maxSessionsPerUser: 2`). There is no end-to-end test proving the behavior works through the full auth stack.
- **Recommendation:** Add an integration test (or at minimum a unit test) that creates auth with a low max session count and verifies overflow eviction through the `createAuth` API.

### [MEDIUM] TC4: `switch-org` tests missing

- **File:** Missing `switch-org.test.ts`
- **Issue:** The plan specifies `switch-org.test.ts` with tests for "re-issues JWT with tenantId, preserves session, 401/400 edge cases". No such file or tests exist.
- **Impact:** Untested missing feature (see E2).
- **Recommendation:** Implement the feature or update the plan to defer.

### [MEDIUM] TC5: Integration test does not verify cookie security attributes comprehensively

- **File:** `/packages/integration-tests/src/__tests__/auth-dual-token.test.ts`
- **Issue:** The integration test checks `Max-Age` and `Path` but does not verify `HttpOnly`, `Secure`, or `SameSite` attributes on cookies. The unit test (`dual-token.test.ts:166-180`) checks `HttpOnly` but not `Secure` or `SameSite`. Cookie security attributes are critical for the dual-token model's security guarantees.
- **Impact:** A regression that removes `HttpOnly` or `Secure` from cookies would not be caught by the integration test.
- **Recommendation:** Add assertions for `HttpOnly`, `Secure`, and `SameSite=Lax` on both cookies in the integration test.

### [LOW] TC6: No negative type test for `SessionPayload` without `sid`

- **File:** `/packages/server/src/auth/__tests__/types.test-d.ts`
- **Issue:** There is a negative test for `SessionPayload` without `jti` (line 51-61), but no equivalent test for missing `sid`. Both `jti` and `sid` are new claims added in Phase 2.
- **Impact:** If `sid` is accidentally made optional, no test catches it.
- **Recommendation:** Add a `@ts-expect-error` test for `SessionPayload` without `sid`.

### [LOW] TC7: `timingSafeEqual` tests don't test empty strings or different-length strings

- **File:** `/packages/server/src/auth/__tests__/crypto.test.ts`
- **Issue:** Only two cases are tested: matching and non-matching strings of the same length. No test for empty strings, different-length strings, or the early return behavior.
- **Impact:** Edge cases in `timingSafeEqual` are untested.
- **Recommendation:** Add tests: `timingSafeEqual('', '')` returns `true`, `timingSafeEqual('abc', 'ab')` returns `false`, `timingSafeEqual('', 'a')` returns `false`.

---

## Design Doc Compliance

### Implementation matches design doc

1. **Dual-token model**: Correctly implements 60s JWT (`vertz.sid`) + 7d opaque refresh (`vertz.ref`). Cookie attributes match spec (HttpOnly, Secure, SameSite=Lax, Path restrictions).

2. **JWT claims**: `sub`, `email`, `role`, `iat`, `exp`, `jti`, `sid` are all present. The `emailVerified`, `tenantId`, and `acl` claims from the full spec are NOT included, but these are scoped to future phases.

3. **Refresh flow**: Correctly implements SHA-256 hashing, session lookup, rotation, grace period (10s), and cookie clearing on failure.

4. **Session management**: `GET /sessions`, `DELETE /sessions/:id`, `DELETE /sessions` all implemented per spec.

5. **Session schema**: `schema.ts` defines the sessions table using `@vertz/db` builder, matching the SQL schema in the design doc.

### Deviations from design doc

1. **Missing `switch-org`**: Sub-Phase 4 specifies `POST /api/auth/switch-org` -- not implemented.

2. **Missing timing-safe user enumeration protection**: Section 3.1 specifies dummy bcrypt on unknown email -- not implemented.

3. **Missing auto-revocation triggers**: Section 4.5 specifies "Password change: revoke all sessions except current (configurable)" -- Sub-Phase 4 lists this but it's not implemented.

4. **`getSession` uses email lookup instead of ID lookup**: The design doc says JWT contains `sub` (user ID) for identification. The implementation uses `email` for the user lookup, which is fragile (see S6).

5. **Integration test missing max-50-sessions and switch-org tests**: The plan specifies both; neither is present.

---

## Summary

| Severity | Count | Key Items |
|----------|-------|-----------|
| CRITICAL | 0 | -- |
| HIGH | 5 | S1 (timing enumeration), S2 (timingSafeEqual), S3 (plaintext refresh in memory), E1 (grace period JWT expiry fallthrough), E2 (missing switch-org), TC1 (no grace period expiry test), TC2 (no concurrent refresh test) |
| MEDIUM | 8 | S4 (spoofable rate limit key), S5 (signup rate limit config), S6 (email-based user lookup), E3 (API missing context), E4 (cleanup loses audit trail), TC3-TC5 (missing tests) |
| LOW | 6 | S7, T3, E5-E7, TC6-TC7 |

## Verdict: Changes Requested

The dual-token architecture is solid and well-structured. The separation into pluggable stores, the cookie security defaults, the CSRF protection, and the grace period mechanism are all well-designed. The code is clean, well-tested at the unit level, and the integration test correctly uses public package imports.

However, there are several items that should be addressed before merge:

**Must fix (HIGH):**
1. **S1**: Add dummy bcrypt on unknown email in sign-in (design doc requirement, security)
2. **E1**: Fix grace period to not re-verify JWT (return cached tokens directly)
3. **S6**: Change `getSession` to look up user by ID (`payload.sub`) instead of email
4. **TC1/TC2**: Add grace period expiry negative test and concurrent refresh test

**Should fix or explicitly defer with rationale:**
5. **E2/TC4**: Implement `switch-org` or update plan to defer
6. **S4**: Fix refresh rate limit key (at least avoid shared `'default'` key)
7. **TC5**: Add cookie security attribute assertions to integration test
