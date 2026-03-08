# Adversarial Review: Sub-Phases 3-4 (MFA Routes + Challenge Flow)

**Reviewer:** Claude (adversarial)
**Files reviewed:**
- `packages/server/src/auth/index.ts` (lines ~160-1690)
- `packages/server/src/auth/cookies.ts` (buildMfaChallengeCookie)
- `packages/server/src/auth/mfa-store.ts`
- `packages/server/src/auth/crypto.ts` (encrypt/decrypt, HKDF)
- `packages/server/src/auth/totp.ts`
- `packages/server/src/auth/__tests__/mfa-routes.test.ts`
- `packages/server/src/auth/__tests__/mfa-challenge.test.ts`

---

## Summary

Sub-Phases 3-4 implement MFA management routes (setup, verify-setup, disable, backup-codes, status) and the MFA challenge flow (signIn returns MFA_REQUIRED, challenge route verifies TOTP/backup codes and creates session). The implementation is functional and the core flow is correct. However, there are several issues ranging from a critical missing rate limit on the challenge endpoint to architectural concerns with shared encryption keys and missing TTL cleanup for in-memory state.

---

## Singleton/State Leak Analysis

### `pendingMfaSecrets` Map (line 167)

**Verdict: Per-instance, correctly scoped.** The Map is declared inside the `createAuth()` closure (`const pendingMfaSecrets = new Map<string, string>()`), so each `createAuth()` call creates its own isolated instance. Two separate `createAuth()` instances cannot see each other's pending secrets. This is correct.

**However, there is a TTL/cleanup problem.** If a user calls `/mfa/setup` (which stores the plaintext secret in `pendingMfaSecrets`) but never calls `/mfa/verify-setup`, the entry remains in memory indefinitely. There is no expiration, no cleanup timer, and no maximum size. In a long-running production server, an attacker could repeatedly call `/mfa/setup` for the same user (overwriting the entry, so that's bounded per-user) or for many different authenticated users (one entry per user). The `dispose()` method does call `pendingMfaSecrets.clear()`, but that only runs on shutdown.

The plaintext TOTP secret sitting in memory without a TTL is a security concern. If the process memory is dumped, these secrets are exposed without encryption.

### `mfaStore` (line 165)

**Verdict: Per-instance, correctly scoped.** Created via `config.mfaStore ?? new InMemoryMFAStore()`, so each `createAuth()` gets its own store unless the caller explicitly shares one. The `InMemoryMFAStore` itself uses private instance fields (`this.secrets`, `this.backupCodes`, `this.enabled`) -- no module-level state. No cross-instance leakage.

### MFA Challenge Token (cookie)

**Verdict: Per-user, correctly scoped.** The challenge cookie contains `{ userId, expiresAt }` encrypted with AES-256-GCM. Each encryption uses a fresh random IV (12 bytes), so two users get different ciphertexts even if the content were identical. The userId inside the encrypted payload binds it to a specific user. A user cannot forge a challenge for another user without the encryption key.

### Request Isolation

**Verdict: Correct.** Each request reads its own cookies, creates its own local variables, and writes its own response. There is no shared mutable state between concurrent requests beyond the store Maps, which are keyed by userId and use atomic operations.

---

## Security

### Challenge Token Encryption and Validation

The challenge cookie uses AES-256-GCM with HKDF key derivation. The implementation is sound:
- Fresh 12-byte IV per encryption (line 84 of crypto.ts)
- GCM provides both confidentiality and integrity (tampered tokens fail decryption)
- Expiry is embedded inside the encrypted payload, so it cannot be modified by the client
- Expiry is checked server-side after decryption (line 1220)

**Concern: HKDF salt reuse.** The `deriveKey()` function uses a hardcoded salt `'vertz-oauth-state'` and info `'aes-256-gcm'` (crypto.ts lines 68-69). This same key derivation is used for OAuth state encryption AND MFA challenge token encryption AND TOTP secret encryption at rest. All three use the same `oauthEncryptionKey` passphrase with the same HKDF parameters, meaning they derive the *identical* AES key. While GCM with random IVs prevents direct cross-context attacks, it would be better practice to use domain-separated keys (different salts or info strings for different purposes). If a vulnerability were found in one usage, it could affect all three.

### Replay Protection

**Partial.** The challenge token has a 5-minute expiry (`Date.now() + 300_000`), but there is no server-side invalidation after a successful challenge completion. The `vertz.mfa` cookie is cleared in the response (line 1317), but the browser sets a new cookie -- the old encrypted token is still cryptographically valid until its embedded expiry. An attacker who captures the challenge token (e.g., via XSS or network interception) could replay it within the 5-minute window, even after the legitimate user has completed the challenge. The cookie path restriction (`/api/auth/mfa`) limits exposure but does not prevent replay by an attacker who already has the token value.

A nonce-based approach (store challenge ID server-side, invalidate on use) would provide replay protection. This is a significant gap for a security-critical flow.

### Rate Limiting on `/mfa/challenge`

**Missing entirely.** The `/mfa/challenge` route has no rate limiting. An attacker who obtains a valid challenge cookie can brute-force TOTP codes (6 digits = 1,000,000 combinations, or ~333,333 with drift=1 covering 3 windows). With a 5-minute window and no rate limit, an attacker could try thousands of codes per second. The TOTP verification is fast (HMAC-SHA1), so each attempt is cheap.

The `/mfa/setup` route also has no rate limiting, though the impact is lower since it requires an active session.

### Rate Limiting on `/mfa/disable` and `/mfa/backup-codes`

**Missing.** These routes verify a password but have no rate limit on incorrect attempts. An attacker with a stolen session cookie could brute-force the password via these endpoints without any throttling.

### Password Verification on Disable/Backup-Codes

Password verification uses `bcrypt.compare` which is inherently timing-safe (constant-time comparison after the expensive hash operation). This is correct.

However, the error response for both "user not found" and "wrong password" is the same (`createInvalidCredentialsError()` with 401), which is good for preventing information leakage. But the code path reveals a subtle difference: if the user lookup fails (`!stored || !stored.passwordHash`), no bcrypt comparison happens, making the response measurably faster. In `/mfa/disable` (line 1448), if the stored user has no password hash (OAuth-only user), the response is fast. A timing-attentive attacker could distinguish between "OAuth user trying to disable MFA" and "wrong password." In practice this is low-risk because it requires an active session, but it breaks the pattern established in `signIn()` which explicitly does a dummy hash compare.

### Information Leakage in Error Messages

Generally good. Error responses use structured error codes (`MFA_REQUIRED`, `MFA_INVALID_CODE`, `MFA_ALREADY_ENABLED`, `SESSION_EXPIRED`) without leaking internal details. The `'Internal error'` response at line 1250 for a failed TOTP secret decryption is appropriately vague.

One concern: the response at line 1176 (`'MFA not configured'`) reveals server configuration to unauthenticated callers. The `/mfa/challenge` route checks `!mfaStore || !oauthEncryptionKey` before authentication, telling an attacker whether MFA is configured on this server. This should return a generic error or 404.

### TOTP Secret Exposure in `/mfa/setup` Response

The `/mfa/setup` route returns the raw TOTP secret in the response body (line 1360: `{ secret, uri }`). This is standard for TOTP setup (the user needs the secret to configure their authenticator app). However, the secret is also stored in plaintext in `pendingMfaSecrets` (no encryption until `verify-setup`). Combined with the missing TTL, this means unverified plaintext secrets can sit in memory indefinitely.

---

## Design

### `oauthEncryptionKey` Overloading

The config field `oauthEncryptionKey` is now used for three distinct purposes:
1. Encrypting OAuth state cookies
2. Encrypting MFA challenge tokens
3. Encrypting TOTP secrets at rest in the MFA store

This coupling means:
- MFA features silently fail if `oauthEncryptionKey` is not set, even when OAuth is not used. The guards check `!oauthEncryptionKey` (lines 734, 1187, 1368, 1560) but the config field name gives no indication it's needed for MFA.
- A user could reasonably set `mfa: { enabled: true }` without setting `oauthEncryptionKey` and get confusing 400 errors.
- Key rotation becomes harder -- you can't rotate the MFA encryption key independently of the OAuth encryption key.

A dedicated `mfaEncryptionKey` (or a general-purpose `encryptionKey`) would be clearer.

### Redundant User Lookup in SignIn Handler

In the signIn route handler (line 735), when `MFA_REQUIRED` is returned, the handler does a *second* `userStore.findByEmail()` call to get the userId. The `signIn()` function already looked up the user and verified the password -- it has the userId. But the `MFA_REQUIRED` error carries no userId (just a message string), so the handler must re-query. This is an unnecessary database call that could be avoided by including the userId in the `MFA_REQUIRED` error payload.

### Backup Code Verification is O(n) with Bcrypt

In the `/mfa/challenge` route (lines 1261-1268), when TOTP verification fails, all backup codes are loaded and verified sequentially with `verifyBackupCode()` which calls `bcrypt.compare()`. With 10 backup codes and bcrypt at 12 rounds, this means up to 10 bcrypt comparisons per failed TOTP attempt. This is expensive and could be a DoS vector -- an attacker with a challenge cookie sends many requests with invalid codes, each triggering 10 bcrypt operations.

A hash-based approach (SHA-256 of the backup code, compared with timing-safe equality) would be much faster while still being secure since backup codes have high entropy (8 chars from a 36-char alphabet = ~41 bits of entropy).

### Missing `JSON.parse` Error Handling in Challenge

At line 1217, `JSON.parse(decrypted)` is called on the decrypted challenge token without a try-catch. If the decrypted string is not valid JSON (which shouldn't happen in normal operation since we encrypted valid JSON), this throws and is caught by the outer `try-catch` (line 1629), returning a generic 500. This is acceptable but a targeted error message would be better for debugging.

---

## Test Coverage

### What is Covered

- Setup flow: authenticated, unauthenticated, already-enabled
- Verify-setup: valid code, invalid code, backup codes returned
- Disable: correct password, wrong password
- Backup codes: regeneration with correct/wrong password
- Status: enabled=false, enabled=true with backup code count
- Challenge: MFA_REQUIRED response, challenge cookie set, valid TOTP creates session, session cookies set, MFA cookie cleared, backup code acceptance, invalid code rejection, missing cookie, invalid token

### What is Missing

1. **No test for challenge token expiry.** The test at line 294 admits it can't test expiry without time mocking, and instead tests the missing-cookie case (which is a different code path). The expiry check at line 1220 is untested.

2. **No test for concurrent setup requests.** If a user calls `/mfa/setup` twice before `/mfa/verify-setup`, the second call overwrites the pending secret. The first secret is now orphaned and the code from the first setup will fail verification. This behavior is not tested or documented.

3. **No test for backup code consumption.** After using a backup code in challenge, there is no test verifying the backup code count decremented and that the same code cannot be reused.

4. **No test for TOTP code reuse in challenge.** TOTP codes are valid for the current 30-second window (plus drift). There is no test or protection against using the same TOTP code twice within the window.

5. **No test for the `!oauthEncryptionKey` guard in signIn handler.** If `oauthEncryptionKey` is not set, the signIn handler falls through to the generic error path (line 744) instead of setting the MFA challenge cookie. This path is untested.

6. **No test for challenge with tampered cookie.** A test with a manually crafted (not encrypted) cookie value would verify the GCM integrity check catches tampering.

7. **No test for `/mfa/setup` when not configured.** The `!mfaStore` guard (line 1327) is not tested.

8. **No cross-instance isolation test.** No test verifies that `pendingMfaSecrets` from one `createAuth()` instance is invisible to another.

9. **No test for step-up flow.** The `/mfa/step-up` route has no tests in either file.

---

## Findings

### Critical

1. **[CRITICAL] No rate limiting on `/mfa/challenge` endpoint.** An attacker with a valid challenge cookie can brute-force 6-digit TOTP codes (1M possibilities, reduced to ~333K with drift). With no rate limit and fast HMAC-SHA1 verification, a brute-force attack completes in seconds at scale. This is a fundamental security gap for an authentication endpoint. **Fix: Add rate limiting keyed on the userId from the decrypted challenge token, e.g., 5 attempts per 5 minutes.**

### Major

2. **[MAJOR] No replay protection for challenge tokens.** A captured MFA challenge token can be replayed within its 5-minute window, even after the legitimate user has completed the challenge. There is no server-side nonce to invalidate used tokens. **Fix: Store a challenge nonce server-side (similar to `pendingMfaSecrets`), include it in the encrypted token, and verify + delete on use.**

3. **[MAJOR] No rate limiting on `/mfa/disable` and `/mfa/backup-codes`.** These endpoints verify passwords but have no throttling. An attacker with a stolen session can brute-force passwords. **Fix: Add rate limiting keyed on userId, consistent with the signIn rate limit pattern.**

4. **[MAJOR] `pendingMfaSecrets` has no TTL or max size.** Plaintext TOTP secrets remain in memory indefinitely if `/mfa/verify-setup` is never called. In a long-running server, this is both a memory leak and a security risk (plaintext secrets in memory). **Fix: Add a TTL (e.g., 10 minutes) with a cleanup interval, or use the same encrypt-then-store pattern used by the MFA store.**

5. **[MAJOR] Challenge token expiry is not tested.** The expiry check (line 1220) is a critical security control with zero test coverage. The test file acknowledges this gap but does not address it. **Fix: Use time mocking (`Date.now` override) to test that expired challenge tokens are rejected.**

6. **[MAJOR] Backup code verification in challenge is O(n) with bcrypt.** Up to 10 sequential bcrypt comparisons per invalid TOTP attempt in the challenge flow. This is a DoS amplification vector. **Fix: Use SHA-256 hashing for backup codes instead of bcrypt -- backup codes have sufficient entropy to resist offline attacks even with fast hashing.**

### Minor

7. **[MINOR] `oauthEncryptionKey` is overloaded for MFA purposes.** The config field name is misleading -- it's required for MFA even when OAuth is not used. Users setting `mfa: { enabled: true }` may not realize they also need `oauthEncryptionKey`. **Fix: Add a dedicated `encryptionKey` config field (or at minimum document the dependency).**

8. **[MINOR] HKDF salt `'vertz-oauth-state'` is used for all encryption contexts.** OAuth state, MFA challenge, and TOTP secret encryption all derive the same AES key. Domain separation would be a defense-in-depth improvement. **Fix: Use context-specific info strings in HKDF (e.g., `'mfa-challenge'`, `'mfa-secret'`, `'oauth-state'`).**

9. **[MINOR] Redundant `userStore.findByEmail()` in signIn handler for MFA.** The signIn function already looked up the user, but the MFA_REQUIRED error doesn't carry the userId, forcing a second lookup. **Fix: Include userId in the `MFA_REQUIRED` error data payload.**

10. **[MINOR] Duplicate `timingSafeEqual` implementation.** `totp.ts` has its own private `timingSafeEqual` (line 204) that duplicates `crypto.ts`'s exported version (line 10). **Fix: Import from `crypto.ts` instead.**

11. **[MINOR] `'MFA not configured'` error leaks server configuration.** The `/mfa/challenge` route returns this to unauthenticated callers before any authentication check (line 1188). **Fix: Return a generic 404 or validate the challenge cookie first.**

12. **[MINOR] Missing timing-safe dummy compare in `/mfa/disable` for OAuth-only users.** When `!stored.passwordHash` (OAuth-only user), no bcrypt compare happens, making the response faster than a wrong-password response. **Fix: Add a dummy bcrypt compare like `signIn()` does.**

### Nit

13. **[NIT] Backup code test (mfa-challenge.test.ts lines 200-256) creates a second auth instance.** The test creates `auth2` instead of using the shared `auth` from `beforeEach`. The comment explains why (can't get backup codes after MFA is enabled via signIn), but the workaround is convoluted. The first `signUpWithMfa` call in this test is wasted. A helper that returns backup codes during setup would simplify this.

14. **[NIT] `MfaChallengeData` type (types.ts line 139) has a `sessionId?` field that is never used.** The challenge token only stores `{ userId, expiresAt }`. The type definition is wider than the actual usage.

15. **[NIT] Cookie Max-Age of 300 for MFA challenge is hardcoded in `buildMfaChallengeCookie`.** The challenge data embeds its own expiry (`Date.now() + 300_000`), but the cookie Max-Age is also hardcoded to 300 seconds in `cookies.ts` line 69. These should be derived from the same constant to avoid drift if one is changed.
