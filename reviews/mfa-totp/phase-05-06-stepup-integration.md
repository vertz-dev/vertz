# Adversarial Review: Sub-Phases 5-6 (Step-Up Authentication + Integration)

**Reviewer:** Adversarial review agent
**Date:** 2026-03-08
**Scope:** `fva.ts`, step-up route in `index.ts`, challenge route fva injection, refresh fva preservation, integration tests, exports, changeset

---

## Summary

Sub-Phases 5-6 implement step-up authentication via the `fva` (Factor Verification Age) JWT claim, the `POST /mfa/step-up` route, the `checkFva()` utility, and end-to-end integration tests. The core flow works: MFA challenge sets `fva`, step-up updates it, `checkFva()` validates freshness, and token refresh preserves the existing `fva` by reading it from the session store's cached JWT. The integration tests cover the full lifecycle and use public package imports (`@vertz/server`) as required.

Overall quality is good. There are two issues that could cause real bugs in production (step-up fva lost on refresh, no rate limiting on step-up), several inconsistencies, and a design deviation that is actually an improvement.

---

## Security

### Step-up route has no rate limiting

The step-up route (`POST /mfa/step-up`) accepts TOTP codes without any rate limiting. Sign-in, sign-up, refresh, and OAuth routes all have rate limit checks. The design doc (`unified-auth-system.md` line 1564) specifies step-up should have `15 min | 5 | stepup:{userId}` rate limiting. Without it, an attacker with a stolen session cookie can brute-force TOTP codes (1M possibilities for 6-digit codes) without throttling.

### Step-up does not update session store `currentTokens`

The step-up route (lines 1619-1634) creates a new JWT with updated `fva` and sets it as a cookie, but does NOT call `sessionStore.updateSession()` to update `currentTokens`. The refresh flow (lines 496-508) reads `fva` from `sessionStore.getCurrentTokens()` to preserve it during rotation. This means:

1. User completes step-up -> gets JWT with `fva: T2` (fresh)
2. JWT expires after 60s
3. User triggers refresh -> refresh reads `currentTokens` from session store -> gets the OLD JWT from the challenge route with `fva: T1` (original)
4. New JWT gets `fva: T1` instead of `fva: T2`

The step-up's fva update is silently lost on the next token refresh. An existing unit test (`'token refresh preserves fva value'`) only tests that the CHALLENGE fva is preserved, not the STEP-UP fva. This gap is masked because the test doesn't do step-up followed by refresh.

### No input validation on step-up request body

Line 1610: `const body = (await request.json()) as { code: string }` -- no validation that `code` exists or is a string. If the request body is `{}`, `body.code` is `undefined`, which is passed to `verifyTotpCode()`. There's also no `try-catch` around `request.json()`, so a non-JSON body will throw and be caught by the outer catch at line 1629, returning a generic "Internal server error" 500 instead of a proper 400 validation error. The challenge route has the same issue but is less critical since it's pre-authentication.

### Step-up only accepts TOTP, not backup codes

The step-up route only calls `verifyTotpCode()`, while the challenge route tries TOTP first then falls back to backup codes. This is a defensible design choice (step-up for sensitive operations should require the actual authenticator, not a consumable backup code), but it's not documented anywhere. If a user's authenticator app is unavailable, they can't complete step-up even if they have backup codes.

---

## Design

### Design deviation: `fva` is a timestamp, not an age

The design doc (`unified-auth-system.md` line 593) specifies:
> `effectiveFva = (now - jwt.iat) + jwt.fva`. If `effectiveFva > maxAge`, the step-up is stale.

And line 599: "Server issues new JWT with `fva: 0`"

The implementation uses `fva = Math.floor(Date.now() / 1000)` (Unix timestamp) and `checkFva` computes `now - fva < maxAgeSeconds`. This is actually a better approach than the design because:

- The design's `fva = 0` approach breaks on token refresh: after refresh, `iat` changes to `now`, so `(now - newIat) + 0` is near-zero, making it appear "just verified" even though MFA was done minutes/hours ago.
- The timestamp approach always produces the correct age: `now - fva_timestamp` = actual seconds since verification, regardless of JWT refresh.

This deviation should be documented in the design doc update. The `checkFva` implementation is correct for the timestamp-based approach.

### `checkFva` does not account for `iat`

Given the timestamp-based `fva`, `checkFva()` only checks `now - fva < maxAge`. This is correct. However, `checkFva` receives a `SessionPayload` which includes `iat` -- it could optionally validate that `fva <= iat` (fva timestamp should not be in the future relative to token issuance), but this is a defense-in-depth concern, not a correctness issue.

### Step-up reuses session ID without refresh token rotation

The step-up route reuses `currentSid` (line 1621) and only issues a new JWT cookie -- no new refresh token, no session store update. This is fine for the access token pattern (JWT is stateless, 60s TTL), but creates the fva-lost-on-refresh bug described above.

---

## Test Coverage

### Missing: step-up fva preserved through refresh

There is a test `'token refresh preserves fva value'` but it only tests that the CHALLENGE-issued fva survives refresh. There is no test for:
1. Complete MFA challenge (fva: T1)
2. Do step-up (fva: T2, where T2 >= T1)
3. Refresh the session
4. Assert fva === T2 (not T1)

This test would currently FAIL, exposing the bug in Finding #2.

### Missing: integration test for fva lost on refresh after step-up

The integration test `'Step-up auth: signIn with MFA -> step-up -> updated fva'` verifies step-up updates fva but does not verify the fva survives a subsequent token refresh.

### Missing: step-up with invalid/missing body

No test for:
- `POST /mfa/step-up` with empty body
- `POST /mfa/step-up` with non-JSON body
- `POST /mfa/step-up` with `{ code: 123 }` (number instead of string)

### Missing: step-up for user without MFA enabled

The step-up route returns `MFA_NOT_ENABLED` if the user doesn't have MFA set up. There is no test verifying this behavior.

### Existing test quality

The existing tests are well-structured:
- `fva.test.ts`: Clean, covers fresh/stale/missing -- 3 cases for a 3-branch function. Good.
- `step-up.test.ts`: Covers valid code, invalid code, unauthenticated, fva-present-after-challenge, fva-absent-without-MFA, and fva-on-refresh. The helper `signUpMfaAndSignIn` is clean.
- `auth-mfa.test.ts` (integration): Comprehensive lifecycle coverage. Uses public imports correctly. The `generateTotpCode` relative import is properly documented as a test-only utility.

### Integration test import compliance

All integration test imports from `@vertz/server` are correct. The single relative import (`generateTotpCode` from `../../../server/src/auth/totp`) is acceptable and documented with a comment explaining why: users would use an authenticator app, so there's no public TOTP code generation API.

---

## Findings

### Critical

1. **[CRITICAL] Step-up fva lost on token refresh.** The step-up route does not update `sessionStore.currentTokens` after issuing a new JWT with updated `fva`. When the JWT expires and the client refreshes, the refresh flow reads `fva` from the session store's cached JWT (the original challenge JWT), discarding the step-up's updated timestamp. This means step-up authentication has a maximum effective lifetime of 60 seconds (one JWT TTL), after which it reverts to the original challenge fva.
   - **File:** `/packages/server/src/auth/index.ts` lines 1619-1634
   - **Fix:** After creating the new tokens, call `sessionStore.updateSession(currentSid, { currentTokens: { jwt: tokens.jwt, refreshToken: <existing> } })` to persist the updated JWT. The refresh token should be preserved from the existing session.

### Major

2. **[MAJOR] No rate limiting on step-up route.** An authenticated attacker can attempt unlimited TOTP codes against `POST /mfa/step-up`. With 6-digit TOTP codes (1,000,000 possibilities) and 30-second windows, this is brute-forceable without throttling. The design doc specifies `5 attempts / 15 min` rate limiting.
   - **File:** `/packages/server/src/auth/index.ts` lines 1570-1635
   - **Fix:** Add `rateLimitStore.check(`stepup:${userId}`, 5, 15 * 60 * 1000)` before TOTP verification.

3. **[MAJOR] `MFA_NOT_ENABLED` error uses raw object instead of factory function.** Three occurrences at lines 1251, 1402, and 1594 use `{ code: 'MFA_NOT_ENABLED', message: '...' }` instead of the existing `createMfaNotEnabledError()` factory from `@vertz/errors`. The factory is defined and tested but not imported in `index.ts`. This is inconsistent with how `createMfaInvalidCodeError` and `createMfaRequiredError` are used, and the raw objects may have different structure than the factory output.
   - **File:** `/packages/server/src/auth/index.ts` lines 1251, 1402, 1594
   - **Fix:** Import `createMfaNotEnabledError` from `@vertz/errors` and use it consistently.

### Minor

4. **[MINOR] No input validation on step-up request body.** `request.json()` is called without try-catch, and `body.code` is not validated as a string. Non-JSON body throws an unhandled error (caught by outer catch, returns generic 500). Missing `code` field passes `undefined` to `verifyTotpCode`.
   - **File:** `/packages/server/src/auth/index.ts` line 1610
   - **Fix:** Wrap `request.json()` in try-catch, validate `typeof body.code === 'string'`, return 400 with proper error.

5. **[MINOR] Missing test: step-up fva survives refresh cycle.** The test `'token refresh preserves fva value'` only validates challenge-issued fva, not step-up-issued fva. Adding this test would immediately reveal Finding #1.
   - **File:** `/packages/server/src/auth/__tests__/step-up.test.ts`

6. **[MINOR] Missing test: step-up for user without MFA.** The step-up route returns `MFA_NOT_ENABLED` when the user has no MFA configured, but this path is untested.
   - **File:** `/packages/server/src/auth/__tests__/step-up.test.ts`

7. **[MINOR] Design deviation not documented.** The `fva` implementation uses Unix timestamps instead of the design doc's age-based approach (`fva: 0`). The implementation is better (see Design section), but the deviation should be noted in the design doc or plan to keep them in sync.

### Nit

8. **[NIT] `checkFva` boundary condition.** `now - payload.fva < maxAgeSeconds` uses strict less-than. At exactly `maxAgeSeconds`, the check returns `false`. This is correct (expired at the boundary), but there's no test for the exact boundary value (`fva = now - maxAge`).

9. **[NIT] Step-up route comment says "Issue new session" but it only issues a new JWT.** The session record in the store is not updated, which is misleading. Should say "Issue new JWT with updated fva" instead.
   - **File:** `/packages/server/src/auth/index.ts` line 1619

10. **[NIT] Changeset description could mention the fva-on-refresh preservation.** The changeset mentions step-up and `checkFva()` but doesn't mention that fva is preserved across token refresh, which is a notable implementation detail.
