# Adversarial Review: Sub-Phases 1-2 (MFA Types + TOTP Core)

**Reviewer:** Adversarial agent
**Date:** 2026-03-08
**Files reviewed:**
- `packages/errors/src/domain/auth.ts` (MFA error section)
- `packages/server/src/auth/types.ts` (MFA types)
- `packages/server/src/auth/mfa-store.ts` (InMemoryMFAStore)
- `packages/server/src/auth/totp.ts` (TOTP core)
- `packages/server/src/auth/__tests__/mfa-store.test.ts`
- `packages/server/src/auth/__tests__/totp.test.ts`
- `packages/errors/src/domain/__tests__/mfa-error.test.ts`

---

## Summary

Sub-phases 1-2 introduce MFA error types, the `MFAStore` interface with an in-memory implementation, and a TOTP core library (base32 codec, HMAC-SHA1 OTP, backup codes). The implementation is generally solid -- the HMAC-SHA1 computation follows RFC 4226 correctly, dynamic truncation is standard, and the base32 codec handles the bit-packing properly. However, there are several security concerns that range from minor (modular bias in backup code generation) to critical (timing leak in the constant-time comparison function), and a significant gap in RFC 6238 test coverage.

---

## Security

### timingSafeEqual early return on length mismatch (CRITICAL)

The `timingSafeEqual` function in `totp.ts` (line 205) returns `false` immediately when lengths differ:

```ts
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;  // <-- timing leak
  ...
}
```

This is a textbook timing side-channel. An attacker who supplies codes of varying length can observe response time differences to determine the length of the expected code. In this specific context, since TOTP codes are always 6 digits and the comparison is between two 6-digit strings (user input vs. generated code), the practical exploit risk is low -- both sides are always 6 characters. However, this function is exported implicitly as an internal and the pattern is dangerous if reused. More importantly, any production security review will flag this as a vulnerability.

**Recommendation:** Either (a) pad both strings to the same length before comparing, (b) use `crypto.subtle.timingSafeEqual` / `crypto.timingsSafeEqual` (Node/Bun built-in), or (c) convert both to fixed-length buffers and use byte comparison. Since user-supplied code is already validated as 6-digit before reaching this point (or at least, it should be), the risk is contained, but the implementation should not set a bad precedent.

### Backup code generation has modular bias (MINOR)

In `generateBackupCodes` (line 139):

```ts
code += BACKUP_CODE_CHARS[bytes[i] % BACKUP_CODE_CHARS.length];
```

`BACKUP_CODE_CHARS` has 36 characters. `256 % 36 = 4`, meaning the first 4 characters (`a`, `b`, `c`, `d`) each appear with probability 8/256 while the remaining 32 appear with probability 7/256. That is a ~14% relative bias for those 4 characters. For an 8-character backup code, this reduces entropy from the theoretical 41.4 bits (log2(36^8)) to approximately 41.1 bits. The practical impact on backup code security is negligible given that codes are bcrypt-hashed and single-use, but it is a well-known cryptographic anti-pattern. The standard fix is rejection sampling: reject bytes >= 252 (the largest multiple of 36 <= 256).

### bcrypt for backup codes is correct but expensive (NIT)

Using bcrypt (12 rounds) for backup code hashing is secure but means verifying a single backup code takes ~250ms. The challenge handler iterates all stored hashes sequentially (up to 10). In the worst case (none match), that is ~2.5 seconds of bcrypt work per MFA challenge attempt. This is a minor DoS vector: an attacker who has a valid MFA challenge cookie can submit wrong backup codes repeatedly, consuming server CPU.

**Recommendation:** This is acceptable for v0.x but worth noting. Argon2id with lower parameters or SHA-256 with a per-user salt would be faster while still resistant to offline attacks (backup codes have ~41 bits of entropy, making offline brute-force infeasible regardless of hash speed).

### TOTP counter only writes lower 32 bits (ACCEPTABLE)

In `hmacOtp` (line 184):

```ts
view.setUint32(4, counter, false); // lower 32 bits
```

The upper 32 bits of the 8-byte counter buffer are left as zeros. The TOTP counter at current timestamps is ~59 million, well within 32-bit range. The counter will not exceed 2^32 until approximately year 6053. This is acceptable, but a comment explaining why the upper 32 bits are zeroed would prevent future confusion.

### TOTP secret stored encrypted with oauthEncryptionKey (DESIGN CONCERN)

The TOTP secret is encrypted using the same `oauthEncryptionKey` used for OAuth state cookies. This is a dual-purpose key. If the OAuth encryption key is compromised (e.g., via a state cookie attack), all TOTP secrets are also compromised. A dedicated MFA encryption key would provide defense in depth. This is not a bug in the reviewed code (the key reuse happens in `index.ts`, not in the TOTP module), but it is worth noting as a design concern for the MFA feature as a whole.

---

## Design

### MFAStore interface naming inconsistency (MINOR)

The interface is `MFAStore` (all-caps MFA) but the config type is `MfaConfig` (title-case). The error types use `Mfa` prefix (`MfaRequiredError`, `MfaInvalidCodeError`). The store interface should follow the same convention: `MfaStore`. This inconsistency appears in `types.ts`, `mfa-store.ts`, and `AuthConfig.mfaStore`.

### MfaSetupData.secret is plaintext (ACCEPTABLE)

`MfaSetupData.secret` holds the raw base32 TOTP secret. This is correct for the setup flow (the user needs to see it for QR scanning), but the type name does not indicate that this is a sensitive transient value that must never be stored directly. A JSDoc comment on the field would help.

### MfaChallengeData lacks method field (MINOR)

`MfaChallengeData` has `userId`, `sessionId?`, and `expiresAt`. It does not include a field for which MFA method is required (e.g., `'totp'`). Currently only TOTP exists, so this is fine. If future methods are added (WebAuthn, SMS), the challenge data should specify which method(s) are acceptable. This is a forward-compatibility concern, not a bug.

### MFAStore.consumeBackupCode takes hashedCode, not plaintext (GOOD)

The interface correctly expects the hashed form, not the raw code. The caller in `index.ts` iterates all stored hashes, runs `verifyBackupCode(plaintext, hash)` for each, and passes the matching hash to `consumeBackupCode`. This is the correct pattern -- the store never sees plaintext codes.

### MfaConfig.enabled default is unclear (MINOR)

`MfaConfig.enabled` is `boolean | undefined`. The jsdoc and the `AuthConfig` type do not document what happens when `mfa` is present but `enabled` is undefined. The consumer (`index.ts`) appears to check `config.mfa?.enabled`, so `undefined` means disabled. A `@default false` annotation would clarify.

### InMemoryMFAStore enabled/secrets redundancy (NIT)

`InMemoryMFAStore` maintains both a `secrets` Map and an `enabled` Set. A user is "MFA-enabled" iff they have a secret. The `enabled` Set is redundant -- `isMfaEnabled` could check `this.secrets.has(userId)`. However, for a persistent store implementation (e.g., database), having an explicit `enabled` flag makes sense (you might want to disable MFA without deleting the secret). The in-memory version is modeling the persistent version's schema, which is acceptable.

---

## Test Coverage

### No RFC 6238 test vectors (MAJOR)

The TOTP test suite does not validate against the RFC 6238 Appendix B test vectors. The tests verify internal consistency (generate then verify) but not correctness against the standard. A TOTP implementation that produces consistent-but-wrong codes would pass all current tests but fail interop with Google Authenticator, Authy, 1Password, etc.

The RFC 6238 SHA-1 test vectors use secret "12345678901234567890" (ASCII, not base32) with specific timestamps. The implementation expects a base32-encoded secret, so the test would need to base32-encode "12345678901234567890" first. At minimum, one test should verify a known secret+timestamp produces a known code.

**Example missing test:**

```ts
it('matches RFC 6238 SHA-1 test vector', async () => {
  // RFC 6238 Appendix B: secret = "12345678901234567890" (ASCII 20 bytes)
  const secretBytes = new TextEncoder().encode('12345678901234567890');
  const secret = base32Encode(secretBytes);
  // T = 59, counter = floor(59/30) = 1 => code should be 287082
  const code = await generateTotpCode(secret, 59 * 1000);
  expect(code).toBe('287082');
});
```

### No test for timingSafeEqual edge cases (MINOR)

No direct test for `timingSafeEqual`. Since it is a private function, it is tested indirectly through `verifyTotpCode`. However, there is no test that exercises the length-mismatch branch or verifies constant-time behavior. At minimum, a test with a wrong-length code (e.g., `'12345'` or `'1234567'`) should exist.

### verifyTotpCode rejection test uses magic string (NIT)

The test "rejects wrong code" uses `'000000'`:

```ts
expect(await verifyTotpCode(secret, '000000', 1700000000000)).toBe(false);
```

This is a valid test but there is a tiny probability (~3/1000000) that the generated code actually is `000000` for that secret and timestamp. The test uses a random secret, making it non-deterministic. Use a fixed secret and pre-computed expected code to make it reliable.

### No test for generateBackupCodes with custom count (NIT)

`generateBackupCodes` accepts a `count` parameter but only the default (10) is tested.

### No test for base32 with known test vectors (MINOR)

The base32 tests only check round-trip consistency. They do not verify against known base32 encodings (e.g., `base32Encode(new TextEncoder().encode('Hello!'))` should equal `'JBSWY3DPEE'` or similar known value). A round-trip test can pass even if both encode and decode are wrong in complementary ways.

### MFA store test: no test for consumeBackupCode on unknown user (NIT)

`consumeBackupCode` for a non-existent user is silently a no-op. This is tested implicitly (the code just filters a potentially-undefined array), but an explicit test documents the expected behavior.

### MFA store test: no test for enableMfa overwriting existing secret (MINOR)

If `enableMfa` is called twice for the same user with different secrets, the second call should overwrite the first. This behavior is tested implicitly (Map.set overwrites) but not documented by a test. For a persistent store implementation, this might be an INSERT vs UPDATE distinction, and the interface contract should be explicit.

---

## Findings

1. **CRITICAL** -- `timingSafeEqual` has an early return on length mismatch (line 205 of `totp.ts`). While the practical risk is low because TOTP codes are always 6 characters, this is a timing side-channel that any security audit will flag. Use `crypto.timingSafeEqual` from Node/Bun runtime or pad to equal length before comparing.

2. **MAJOR** -- No RFC 6238 test vectors. The TOTP tests verify self-consistency but not interoperability with authenticator apps. A single test against the RFC 6238 Appendix B SHA-1 test vector (secret "12345678901234567890", T=59, expected code "287082") would validate the entire HMAC-SHA1 + dynamic truncation + counter pipeline against the standard.

3. **MINOR** -- Modular bias in backup code generation. `bytes[i] % 36` biases the first 4 characters of the alphabet by ~14% relative. Use rejection sampling (`if (byte >= 252) resample`) to eliminate the bias.

4. **MINOR** -- Naming inconsistency: `MFAStore` (all-caps) vs `MfaConfig`, `MfaRequiredError`, `MfaSetupData` (title-case). Standardize on `MfaStore`.

5. **MINOR** -- No base32 test against known vectors. Round-trip only tests do not catch complementary encode/decode bugs.

6. **MINOR** -- No test for `enableMfa` overwriting an existing secret. The MFAStore contract should explicitly define and test overwrite behavior.

7. **MINOR** -- `MfaChallengeData` lacks a `method` field for forward compatibility with non-TOTP MFA methods.

8. **MINOR** -- `verifyTotpCode` rejection test uses random secret with `'000000'`, making it technically non-deterministic.

9. **NIT** -- TOTP secret reuses `oauthEncryptionKey`. A dedicated MFA encryption key would provide better security isolation.

10. **NIT** -- `MfaConfig.enabled` default is undocumented. Add `@default false` to the interface.

11. **NIT** -- bcrypt for 10 backup codes means worst-case ~2.5s CPU per failed backup code attempt. Acceptable for v0.x but worth documenting as a known limitation.

12. **NIT** -- No test for `generateBackupCodes(5)` (custom count parameter).

13. **NIT** -- No test for `consumeBackupCode` on unknown user (silent no-op behavior should be documented by a test).
