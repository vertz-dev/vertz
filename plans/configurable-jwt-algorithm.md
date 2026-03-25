# feat(auth): Configurable JWT Signing Algorithm

**Issue:** [#1783](https://github.com/vertz-dev/vertz/issues/1783)
**Status:** Draft (Rev 2 — review feedback addressed)

## Problem

The auth system hardcodes RS256 (RSA-PKCS1-v1.5 with SHA-256) as the JWT signing algorithm in 6 locations:

| File | Line | Hardcoded value |
|------|------|-----------------|
| `jwt.ts` | 44 | `.setProtectedHeader({ alg: 'RS256' })` |
| `jwt.ts` | 70 | `algorithms: ['RS256']` |
| `cloud-jwt-verifier.ts` | 22 | `algorithms: ['RS256']` |
| `auth/index.ts` | 144 | `generateKeyPairSync('rsa', ...)` |
| `auth/index.ts` | 2557 | `{ ...jwk, use: 'sig', alg: 'RS256' }` |
| `__tests__/test-keys.ts` | 8 | `generateKeyPairSync('rsa', ...)` |

There is no way to configure the algorithm. This blocks Vertz Cloud (which uses ES256 with per-project EC key pairs) and forces all deployments onto RSA, even when ECDSA would be preferred for performance and key size.

## API Surface

### `SessionConfig` — new `algorithm` field

```ts
interface SessionConfig {
  strategy: SessionStrategy;
  ttl: string | number;
  refreshTtl?: string | number;
  refreshable?: boolean;
  cookie?: CookieConfig;
  refreshName?: string;
  algorithm?: JWTAlgorithm; // NEW — defaults to 'RS256'
}

type JWTAlgorithm = 'RS256' | 'ES256';
```

### User-facing API

```ts
const auth = createAuth({
  session: {
    strategy: 'jwt',
    algorithm: 'ES256', // new option
    ttl: '60s',
  },
  privateKey: ecPrivateKeyPem,
  publicKey: ecPublicKeyPem,
});
```

Default behavior (no breaking change):

```ts
const auth = createAuth({
  session: { strategy: 'jwt', ttl: '60s' },
  // algorithm defaults to 'RS256'
  // Existing RSA key pair works unchanged
});
```

### Key generation in dev mode

```ts
// RS256 (default) — generates RSA 2048 key pair
// ES256 — generates EC P-256 key pair
```

Dev key file names remain `jwt-private.pem` / `jwt-public.pem`. On algorithm change, existing dev keys are detected as the wrong type and auto-regenerated with a warning log:

```
[Auth] Dev key pair is RSA but algorithm is ES256. Regenerating EC (P-256) key pair.
```

First-time generation logs include the algorithm:
```
[Auth] Auto-generated dev EC (P-256) key pair at .vertz. Add this path to .gitignore.
[Auth] Auto-generated dev RSA key pair at .vertz. Add this path to .gitignore.
```

### Key validation

When `privateKey`/`publicKey` PEM strings are provided explicitly, `createAuth()` validates that the key type **and curve** match the configured algorithm:

```ts
// THROWS — RSA key with ES256 algorithm
createAuth({
  session: { strategy: 'jwt', algorithm: 'ES256', ttl: '60s' },
  privateKey: rsaPrivateKeyPem, // ← RSA key, expects EC
  publicKey: rsaPublicKeyPem,
});
// Error: "Key type mismatch: algorithm 'ES256' requires an EC (P-256) key pair, but an RSA key was provided."

// THROWS — EC key with RS256 algorithm
createAuth({
  session: { strategy: 'jwt', algorithm: 'RS256', ttl: '60s' },
  privateKey: ecPrivateKeyPem, // ← EC key, expects RSA
  publicKey: ecPublicKeyPem,
});
// Error: "Key type mismatch: algorithm 'RS256' requires an RSA key pair, but an EC key was provided."

// THROWS — wrong EC curve (P-384 instead of P-256)
createAuth({
  session: { strategy: 'jwt', algorithm: 'ES256', ttl: '60s' },
  privateKey: ecP384PrivateKeyPem,
  publicKey: ecP384PublicKeyPem,
});
// Error: "Key type mismatch: algorithm 'ES256' requires an EC P-256 key pair, but an EC P-384 key was provided."
```

Validation uses `KeyObject.asymmetricKeyType` (`'rsa'` | `'ec'`) and `KeyObject.asymmetricKeyDetails?.namedCurve` (`'prime256v1'` for P-256) to check at startup.

### Cloud JWT verifier

```ts
// createCloudJWTVerifier now accepts algorithm(s)
createCloudJWTVerifier({
  jwksClient,
  issuer: cloudBaseUrl,
  audience: projectId,
  /**
   * Accepted JWT algorithms. Array to allow rotation overlap
   * (e.g., accepting both RS256 and ES256 during a key migration).
   * Defaults to ['RS256'].
   */
  algorithms: ['ES256'], // NEW — defaults to ['RS256']
});
```

### JWKS endpoint

The `/.well-known/jwks.json` endpoint dynamically returns the correct `alg` and `kty`:

```json
// ES256
{ "keys": [{ "kty": "EC", "crv": "P-256", "use": "sig", "alg": "ES256", ... }] }

// RS256 (current behavior)
{ "keys": [{ "kty": "RSA", "use": "sig", "alg": "RS256", ... }] }
```

### Internal functions

```ts
// createJWT — algorithm passed through
createJWT(user, privateKey, ttl, { algorithm: 'ES256', claims, issuer, audience });

// verifyJWT — algorithm passed through
verifyJWT(token, publicKey, { algorithm: 'ES256', issuer, audience });
```

### JSDoc updates

- `AuthConfig.privateKey` — Change from "RSA private key in PKCS#8 PEM format" to "JWT signing private key in PKCS#8 PEM format (RSA for RS256, EC P-256 for ES256)"
- `AuthConfig.publicKey` — Same pattern: "JWT verification public key in SPKI PEM format (RSA for RS256, EC P-256 for ES256)"
- `ResolveSessionForSSRConfig.publicKey` — Change from "RSA public key for RS256 verification" to "Public key for JWT verification (self-hosted mode)"
- Production error message — Change "RSA key pair is required in production" to "Key pair is required in production"

### `algorithm` with non-JWT strategies

When `strategy: 'database'` (no JWTs), the `algorithm` field is silently ignored. The type system communicates this via `SessionConfig` being flat — no runtime warning needed since the field simply has no effect.

## Manifesto Alignment

### One way to do things
The algorithm is configured in ONE place (`session.algorithm`) and flows to every code path. No per-function overrides, no per-endpoint configuration.

### If it builds, it works
Key-algorithm mismatch is caught at startup, not at first JWT sign. Type-level `JWTAlgorithm` union ensures only supported algorithms are passed.

### AI agents are first-class users
Single configuration point with a string literal union. An LLM can configure this correctly on the first prompt: `algorithm: 'ES256'`.

### Production-ready by default
RS256 remains the default — no breaking change. ES256 is opt-in for teams that need it.

## Non-Goals

- **Algorithm negotiation** — We don't support accepting multiple algorithms on verification (except cloud verifier which accepts what the JWKS declares). One algorithm per deployment.
- **PS256, EdDSA, HS256** — Only RS256 and ES256 for now. The `JWTAlgorithm` type can be extended later without breaking changes.
- **Runtime algorithm switching** — Algorithm is fixed at `createAuth()` time. No per-request algorithm selection.
- **Key rotation** — Out of scope. JWKS endpoint serves one key. Key rotation is a separate feature.
- **Symmetric algorithms (HS256)** — Violates our asymmetric-only policy. Never.

## Unknowns

None identified. `jose` already supports ES256 natively. `node:crypto` supports EC P-256 key generation. No POC needed.

## Type Flow Map

```
SessionConfig.algorithm  (user config)
       │
       ├─→ createAuth() stores as local `algorithm` variable
       │      │
       │      ├─→ dev key generation: algorithm → key type selection (rsa vs ec)
       │      ├─→ key validation: algorithm → expected key type + curve check
       │      ├─→ createSessionTokens() → createJWT(user, privateKey, ttl, { algorithm })
       │      │                                    │
       │      │                                    └─→ jose.SignJWT.setProtectedHeader({ alg: algorithm })
       │      │
       │      ├─→ getSession()/verifyJWT(token, publicKey, { algorithm })
       │      │                                    │
       │      │                                    └─→ jose.jwtVerify(token, key, { algorithms: [algorithm] })
       │      │
       │      ├─→ resolveSessionForSSR config: { algorithm } → verifyJWT(token, publicKey, { algorithm })
       │      │
       │      └─→ JWKS endpoint: { ...jwk, use: 'sig', alg: algorithm }
       │
       └─→ (no dead generics — algorithm is a plain string, not a generic type parameter)

CloudJWTVerifier.algorithms  (separate config for cloud mode)
       │
       └─→ jose.jwtVerify(token, jwksClient.getKey, { algorithms })
```

## E2E Acceptance Test

```ts
describe('Feature: Configurable JWT algorithm', () => {
  describe('Given createAuth configured with algorithm: "ES256"', () => {
    describe('When signing up a user', () => {
      it('Then the JWT header contains alg: "ES256"', async () => {
        // Sign up → decode JWT header → assert alg === 'ES256'
      });
      it('Then the JWT is verifiable with the EC public key', async () => {
        // Sign up → verifyJWT with EC public key → assert payload is valid
      });
    });
    describe('When calling GET /.well-known/jwks.json', () => {
      it('Then returns a JWK with kty: "EC" and alg: "ES256"', async () => {
        // GET JWKS → assert key has kty=EC, crv=P-256, alg=ES256
      });
    });
  });

  describe('Given createAuth configured with algorithm: "RS256" (default)', () => {
    describe('When signing up a user', () => {
      it('Then the JWT header contains alg: "RS256"', async () => {
        // Existing behavior unchanged
      });
    });
  });

  describe('Given createAuth with ES256 algorithm but RSA keys', () => {
    it('Then createAuth() throws a key type mismatch error', () => {
      // @ts-expect-error — RSA PEM string is structurally valid but wrong key type
      // Expect runtime error: "Key type mismatch..."
    });
  });

  describe('Given createAuth with default algorithm and no keys (dev mode)', () => {
    it('Then auto-generates RSA key pair', () => {
      // Verify RSA keys are generated
    });
  });

  describe('Given createAuth with ES256 algorithm and no keys (dev mode)', () => {
    it('Then auto-generates EC P-256 key pair', () => {
      // Verify EC keys are generated
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Core JWT functions + types

**Goal:** `createJWT()` and `verifyJWT()` accept an `algorithm` parameter. `JWTAlgorithm` type exported.

**Changes:**
- `types.ts` — Add `JWTAlgorithm` type and `algorithm` field to `SessionConfig`
- `jwt.ts` — Add `algorithm` parameter to `CreateJWTOptions` and `VerifyJWTOptions`, use it in `setProtectedHeader` and `jwtVerify`
- `jwt.test.ts` — Tests for ES256 signing/verification + default RS256 backward compat

**Acceptance Criteria:**

```ts
describe('Feature: JWT algorithm parameter', () => {
  describe('Given an ES256 key pair', () => {
    describe('When creating a JWT with algorithm: "ES256"', () => {
      it('Then the JWT header has alg: "ES256"', () => {});
      it('Then verifyJWT with algorithm: "ES256" returns the payload', () => {});
    });
    describe('When verifying an ES256 JWT with algorithm: "RS256"', () => {
      it('Then returns null (algorithm mismatch)', () => {});
    });
  });
  describe('Given no algorithm specified', () => {
    describe('When creating a JWT', () => {
      it('Then defaults to RS256 (backward compatible)', () => {});
    });
  });
});
```

### Phase 2: `createAuth()` plumbing + key generation + validation

**Goal:** `session.algorithm` flows through `createAuth()` to all internal JWT calls. Dev key generation respects algorithm. Key-algorithm mismatch is detected at startup.

**Changes:**
- `auth/index.ts` — Read `session.algorithm`, pass to `createJWT`/`verifyJWT`, update dev key generation to branch on algorithm, add key type + curve validation, update JWKS endpoint `alg`, update production error messages to be algorithm-agnostic, update dev log messages to include algorithm
- `types.ts` — Update `AuthConfig.privateKey`/`publicKey` JSDoc
- `auth/__tests__/auth-algorithm.test.ts` — Integration tests

**Acceptance Criteria:**

```ts
describe('Feature: createAuth algorithm plumbing', () => {
  describe('Given session.algorithm: "ES256" with EC key pair', () => {
    describe('When signing up a user', () => {
      it('Then the returned JWT has alg: "ES256"', () => {});
    });
    describe('When GET /.well-known/jwks.json', () => {
      it('Then returns JWK with kty: "EC", crv: "P-256", alg: "ES256"', () => {});
    });
  });
  describe('Given session.algorithm: "ES256" with RSA key pair', () => {
    it('Then createAuth() throws key type mismatch error', () => {});
  });
  describe('Given session.algorithm: "RS256" with EC key pair', () => {
    it('Then createAuth() throws key type mismatch error', () => {});
  });
  describe('Given session.algorithm: "ES256" with EC P-384 key pair', () => {
    it('Then createAuth() throws curve mismatch error', () => {});
  });
  describe('Given ES256 algorithm with no keys in dev mode', () => {
    it('Then auto-generates EC P-256 key pair', () => {});
  });
  describe('Given no algorithm (default) with no keys in dev mode', () => {
    it('Then auto-generates RSA key pair (backward compat)', () => {});
  });
  describe('Given ES256 algorithm with stale RSA dev keys on disk', () => {
    it('Then auto-regenerates EC P-256 key pair with warning log', () => {});
  });
});
```

### Phase 3: Cloud JWT verifier + SSR resolver

**Goal:** `createCloudJWTVerifier` accepts configurable algorithm(s). `resolveSessionForSSR` works with both algorithms.

**Changes:**
- `cloud-jwt-verifier.ts` — Add `algorithms` option with JSDoc, default to `['RS256']`
- `cloud-jwt-verifier.test.ts` — Test ES256 verification via JWKS
- `resolve-session-for-ssr.ts` — Add `algorithm` to `ResolveSessionForSSRConfig`, pass to `verifyJWT()` call, update JSDoc
- `auth/index.ts` — Pass `algorithm` to `createSSRResolver()` call inside `createAuth()`
- `create-server.ts` — Pass algorithm from cloud config to cloud verifier

**Acceptance Criteria:**

```ts
describe('Feature: Cloud JWT verifier algorithm support', () => {
  describe('Given a cloud verifier with algorithms: ["ES256"]', () => {
    describe('When verifying an ES256-signed JWT', () => {
      it('Then returns the payload', () => {});
    });
    describe('When verifying an RS256-signed JWT', () => {
      it('Then returns null (algorithm not accepted)', () => {});
    });
  });
  describe('Given a cloud verifier with default algorithms', () => {
    describe('When verifying an RS256-signed JWT', () => {
      it('Then returns the payload (backward compat)', () => {});
    });
  });
});

describe('Feature: SSR session resolver algorithm support', () => {
  describe('Given resolveSessionForSSR with ES256 algorithm and EC public key', () => {
    describe('When request contains an ES256-signed session cookie', () => {
      it('Then returns the session payload', () => {});
    });
  });
  describe('Given resolveSessionForSSR with default algorithm (RS256)', () => {
    describe('When request contains an RS256-signed session cookie', () => {
      it('Then returns the session payload (backward compat)', () => {});
    });
  });
});
```

### Phase 4: Test keys helper + docs + changeset

**Goal:** Test helpers support both algorithm key pairs. Docs updated. Changeset added.

**Changes:**
- `__tests__/test-keys.ts` — Add `generateTestKeyPair(algorithm)` helper that generates RSA or EC keys
- Update any remaining hardcoded RSA key references in other test files
- `packages/mint-docs/` — Update auth configuration docs with `algorithm` option
- Add changeset

**Acceptance Criteria:**
- All tests use `generateTestKeyPair()` or explicit algorithm-aware helpers
- Docs page covers `session.algorithm` with RS256/ES256 examples
- Changeset with `@vertz/server: patch`
