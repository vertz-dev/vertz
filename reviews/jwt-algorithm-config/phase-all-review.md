# Review: Configurable JWT Signing Algorithm (#1783)

- **Author:** Implementation agent
- **Reviewer:** Claude Opus 4.6 (adversarial review)
- **Commits:** ea01ae22..e594437b (4 commits)
- **Date:** 2026-03-24

## Changes

- `packages/server/src/auth/types.ts` (modified) -- Added `JWTAlgorithm` type, `algorithm` field on `SessionConfig`, updated JSDoc
- `packages/server/src/auth/jwt.ts` (modified) -- Added `algorithm` to `CreateJWTOptions`/`VerifyJWTOptions`
- `packages/server/src/auth/index.ts` (modified) -- Key generation branching, validation, algorithm plumbing, JWKS endpoint, SSR resolver
- `packages/server/src/auth/cloud-jwt-verifier.ts` (modified) -- Added `algorithms` array option, `ERR_JOSE_ALG_NOT_ALLOWED` handling
- `packages/server/src/auth/resolve-session-for-ssr.ts` (modified) -- Added `algorithm` to config, passed to `verifyJWT`
- `packages/server/src/auth/__tests__/test-keys.ts` (modified) -- Added EC key pair helpers
- `packages/server/src/auth/__tests__/jwt.test.ts` (modified) -- ES256 signing/verification tests
- `packages/server/src/auth/__tests__/auth-algorithm.test.ts` (new) -- createAuth plumbing tests
- `packages/server/src/auth/cloud-jwt-verifier.test.ts` (modified) -- ES256 cloud verifier tests
- `packages/server/src/auth/__tests__/cookie-config.test.ts` (modified) -- Updated error message
- `packages/docs/guides/server/auth.mdx` (modified) -- Updated docs
- `.changeset/configurable-jwt-algorithm.md` (new) -- Changeset
- `plans/configurable-jwt-algorithm.md` (new) -- Design doc

## CI Status

- [ ] Quality gates not yet confirmed (review is pre-push)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests written for each behavior)
- [x] Public API changes match design doc
- [ ] No type gaps or missing edge cases (see findings below)
- [x] No security issues (algorithm confusion, key validation)
- [x] Backward compatibility preserved

---

## Verdict: APPROVED WITH FINDINGS

Overall this is a clean, well-structured implementation. The algorithm plumbing is correct, key validation is solid, and backward compatibility is preserved. The design doc is thorough. However, there are a few issues that should be addressed.

---

## Blockers

### B1. Public key is NOT validated against algorithm

**File:** `packages/server/src/auth/index.ts`, line 164

Only the **private key** is validated against the configured algorithm:

```ts
if (configPrivateKey && configPublicKey) {
  privateKey = createPrivateKey(configPrivateKey);
  publicKey = createPublicKey(configPublicKey);
  validateKeyAlgorithmMatch(privateKey, algorithm);  // <-- only privateKey
}
```

A user could pass an EC private key with an RSA public key (or vice versa) and the mismatch would not be caught at startup. It would fail later at JWT verification time with a confusing jose error. The design doc explicitly says "validates that the key type **and curve** match" -- both keys should be validated.

**Fix:** Add `validateKeyAlgorithmMatch(publicKey, algorithm);` on line 165.

### B2. `let privateKey!: KeyObject` definite assignment assertion is unsafe

**File:** `packages/server/src/auth/index.ts`, lines 158-159

```ts
let privateKey!: KeyObject;
let publicKey!: KeyObject;
```

The `!` tells TypeScript "trust me, this will be assigned before first use." But it silences the compiler's uninitialized-variable checks entirely. If a future code change introduces a new branch in the key resolution logic that doesn't assign `privateKey`/`publicKey`, TypeScript won't catch it -- the code would proceed with `undefined` disguised as `KeyObject`, causing a runtime crash deep in jose when trying to sign.

This is effectively the same as `@ts-ignore` for initialization flow. The current branching logic does cover all cases (both keys provided, one key, production, dev), but the assertion removes the safety net for future changes.

**Fix:** Initialize with a sentinel and assert after the branching block:
```ts
let privateKey: KeyObject | undefined;
let publicKey: KeyObject | undefined;

// ... branching logic ...

if (!privateKey || !publicKey) {
  throw new Error('Internal error: key pair was not initialized');
}
```

This preserves the same runtime behavior but keeps TypeScript's flow analysis intact.

---

## Should-Fix

### S1. `JWTAlgorithm` type is not exported from the package barrel

**File:** `packages/server/src/index.ts`

`SessionConfig` is exported (line 149) and it references `JWTAlgorithm`, but `JWTAlgorithm` itself is not in the barrel export. Users who want to type a variable as `JWTAlgorithm` (e.g., to pass it dynamically) cannot import it:

```ts
import type { JWTAlgorithm } from '@vertz/server'; // Error: not exported
```

TypeScript will infer the type from `SessionConfig.algorithm` in most cases, but it's a public type referenced by a public interface -- it should be exported.

**Fix:** Add `JWTAlgorithm` to the type exports in `packages/server/src/index.ts`.

### S2. SSR resolver tests have no coverage for ES256

**File:** `packages/server/src/auth/__tests__/resolve-session-for-ssr.test.ts`

The design doc Phase 3 acceptance criteria explicitly include:

> Given resolveSessionForSSR with ES256 algorithm and EC public key / When request contains an ES256-signed session cookie / Then returns the session payload

But the existing test file has zero mentions of `algorithm`. All tests use the default RS256 path. The SSR resolver does thread `algorithm` through to `verifyJWT`, but this path is untested. If someone accidentally removes the `algorithm` forwarding, no test would catch it.

**Fix:** Add at least one test that creates an ES256 JWT, configures the resolver with `algorithm: 'ES256'` and an EC public key, and verifies it returns the session.

### S3. Stale comment in `resolve-session-for-ssr.ts`

**File:** `packages/server/src/auth/resolve-session-for-ssr.ts`, line 105

```ts
// Verify JWT -- cloud verifier (RS256 via JWKS) or local public key (RS256)
```

This comment still hardcodes "RS256" twice even though the code now supports ES256. Should be updated to reflect the configurable algorithm.

**Fix:** Update comment to something like:
```ts
// Verify JWT -- cloud verifier (via JWKS) or local public key
```

### S4. `create-server.ts` cloud verifier does not forward algorithm

**File:** `packages/server/src/create-server.ts`, lines 545-549

```ts
const cloudVerifier = createCloudJWTVerifier({
  jwksClient,
  issuer: cloudBaseUrl,
  audience: projectId,
  // No algorithms option -- defaults to ['RS256']
});
```

When running in cloud mode, the cloud verifier always defaults to `['RS256']`. If Vertz Cloud migrates to ES256 (which the design doc's Problem section says is the motivation), this would reject ES256 tokens from the cloud. The `createCloudJWTVerifier` now supports an `algorithms` array, but `create-server.ts` doesn't forward it.

This is likely intentional (cloud hasn't migrated yet), but it should be documented with a TODO comment so it's not forgotten. The design doc's non-goals mention "No runtime algorithm switching" for self-hosted, but cloud mode is a different story since the cloud controls the algorithm.

**Fix:** Add a TODO comment at the call site:
```ts
// TODO(#XXXX): Forward algorithm from cloud config when Vertz Cloud migrates to ES256
```

### S5. `validateKeyAlgorithmMatch` uses non-null assertion on potentially undefined `keyType`

**File:** `packages/server/src/auth/index.ts`, lines 118, 131

```ts
`...but an ${keyType!.toUpperCase()} key was provided.`
```

`KeyObject.asymmetricKeyType` is typed as `string | undefined` in Node's typings. The `!` assertion assumes it's always defined for asymmetric keys, which is true in practice, but if someone passes a symmetric key (which `createPrivateKey` can create from certain PEM formats), `keyType` would be undefined and `.toUpperCase()` would throw `TypeError: Cannot read properties of undefined`.

The risk is low (symmetric PEM parsing is unusual), but a defensive fallback costs nothing:

```ts
`...but an ${(keyType ?? 'unknown').toUpperCase()} key was provided.`
```

---

## Nits

### N1. `generateTestKeyPair` always returns the same pre-generated keys

**File:** `packages/server/src/auth/__tests__/test-keys.ts`

The function name `generateTestKeyPair` implies it generates a fresh key pair each call, but it returns the module-level singletons. This is fine for test performance, but the name is misleading. Consider renaming to `getTestKeyPair` or adding a JSDoc note that it returns pre-generated keys.

### N2. `jwt.test.ts` generates its own EC key pair instead of using `test-keys.ts`

**File:** `packages/server/src/auth/__tests__/jwt.test.ts`, lines 13-19

The test file generates a fresh EC key pair at the top, but `test-keys.ts` now exports `TEST_EC_PRIVATE_KEY` and `TEST_EC_PUBLIC_KEY` for exactly this purpose. The existing RSA tests already use `test-keys.ts`. Using the shared helpers would be more consistent and avoid redundant key generation.

### N3. Design doc lists 6 hardcoded locations but `resolve-session-for-ssr.ts` was also hardcoded

The design doc's Problem section lists 6 hardcoded RS256 references but misses the comment in `resolve-session-for-ssr.ts` line 105 (the stale comment from S3). Minor -- the comment was technically not a functional hardcoding, but it shows the audit wasn't exhaustive.

### N4. Changeset description is well-written

No issues with the changeset. Patch level is correct per project policy.

---

## Summary

| Category | Count | Items |
|----------|-------|-------|
| Blockers | 2 | B1 (public key not validated), B2 (definite assignment assertion) |
| Should-fix | 5 | S1 (barrel export), S2 (SSR test coverage), S3 (stale comment), S4 (cloud TODO), S5 (non-null assertion) |
| Nits | 4 | N1-N4 |

The core security architecture is sound: algorithm confusion attacks are prevented by `jose`'s `algorithms` allow-list on the verification side, and key-algorithm validation catches mismatches at startup. The backward compatibility story is clean -- RS256 remains the default everywhere. The main gap is B1 (public key validation) which is a real defense-in-depth miss.

## Resolution

All findings addressed:

- **B1** — Fixed: added `validateKeyAlgorithmMatch(publicKey, algorithm)` after public key creation.
- **B2** — Fixed: replaced `let privateKey!: KeyObject` with `let _privateKey: KeyObject | undefined`, guard, then `const privateKey: KeyObject = _privateKey`. TypeScript sees `const KeyObject` in all closures.
- **S1** — Fixed: `JWTAlgorithm` exported from `packages/server/src/index.ts`.
- **S2** — Fixed: added ES256 test to `resolve-session-for-ssr.test.ts`.
- **S3** — Fixed: stale "RS256 via JWKS" comment updated.
- **S4** — Fixed: TODO comment added in `create-server.ts`.
- **S5** — Already handled: `keyType` uses `?? 'unknown'` fallback on line 114.
- **N1-N4** — Acknowledged; no changes made (nits).
