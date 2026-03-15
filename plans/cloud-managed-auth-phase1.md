# Cloud-Managed Auth — Framework-Side Phase 1

**Issue:** [#1321](https://github.com/vertz-dev/vertz/issues/1321)
**Design Reference:** [Managed Auth Rev 3.4](https://github.com/vertz-dev/backstage/blob/main/plans/cloud/managed-auth.md)
**Status:** Rev 2 — Updated after DX / Product / Technical reviews

---

## API Surface

### 1. Cloud Config

```typescript
// vertz.config.ts — developer-facing
import { defineConfig } from '@vertz/compiler';

export default defineConfig({
  cloud: {
    projectId: 'proj_abc123',
  },
});
```

```typescript
// packages/compiler/src/config.ts — type addition (pass-through, compiler never reads it)
interface CloudConfig {
  projectId: string;
}

interface VertzConfig {
  strict?: boolean;
  forceGenerate?: boolean;
  compiler?: Partial<CompilerConfig>;
  cloud?: CloudConfig;
}
```

```typescript
// packages/server/src/create-server.ts — runtime consumer
// ServerConfig receives cloud config from CLI or directly in tests
interface ServerConfig {
  // ... existing fields ...
  cloud?: CloudConfig;
}
```

**Config flow:** `vertz.config.ts` → CLI loads via Jiti → passes `cloud` to `createServer({ cloud })` → server uses it at runtime. The compiler package defines the type for `defineConfig()` DX but never imports or uses `CloudConfig` itself. For direct `createServer()` usage (no CLI), pass `cloud` explicitly.

### 2. JWKS Client (thin wrapper over jose)

```typescript
// packages/server/src/auth/jwks-client.ts
// Uses jose's createRemoteJWKSet internally — no custom HTTP/cache/single-flight logic
import type { JWTVerifyGetKey } from 'jose';

interface JWKSClient {
  getKey: JWTVerifyGetKey;  // jose-compatible key resolver
  refresh(): Promise<void>;
}

function createJWKSClient(options: {
  url: string;
  cacheTtl?: number;   // Default: 86_400_000 (24h) — maps to jose cacheMaxAge
  cooldown?: number;    // Default: 30_000 (30s) — maps to jose cooldownDuration
}): JWKSClient;
```

**Implementation note:** Wraps `jose.createRemoteJWKSet` with a thin layer that stores `lastKnownGood` keys for fallback on fetch failure. jose handles single-flight deduplication, caching, and auto-refresh on unknown `kid` internally.

### 3. Cloud JWT Verifier

```typescript
// packages/server/src/auth/cloud-jwt-verifier.ts
interface CloudJWTVerifier {
  verify(token: string): Promise<SessionPayload | null>;
}

function createCloudJWTVerifier(jwksClient: JWKSClient): CloudJWTVerifier;
```

### 4. Circuit Breaker

```typescript
// packages/server/src/auth/circuit-breaker.ts
interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): 'closed' | 'open' | 'half-open';
  reset(): void;
}

function createCircuitBreaker(options?: {
  failureThreshold?: number;   // Default: 5 consecutive failures to trip
  resetTimeout?: number;       // Default: 10_000 (10s for half-open probe)
}): CircuitBreaker;
```

**Simplification from review:** Phase 1 uses consecutive-failure mode only. Error-rate-window mode (sliding window) deferred — consecutive failures cover the primary failure pattern for a single cloud endpoint.

### 5. Auth Route Proxy

```typescript
// packages/server/src/auth/cloud-proxy.ts
function createAuthProxy(options: {
  projectId: string;
  cloudBaseUrl?: string;     // Default: 'https://cloud.vtz.app'
  environment?: string;      // Default: 'development'
  authToken: string;
  circuitBreaker: CircuitBreaker;
  onUserCreated?: (payload: OnUserCreatedPayload, ctx: AuthCallbackContext) => Promise<void>;
  onUserAuthenticated?: (user: AuthUser) => Promise<void>;
}): (request: Request) => Promise<Response>;
```

**Cookie security in development:** When `environment === 'development'`, the `Secure` flag is omitted from `Set-Cookie` headers so cookies work over HTTP on localhost.

**Error forwarding:** Cloud 4xx/5xx responses (that aren't circuit-breaker-level failures) are forwarded to the client as-is. Only network errors and timeouts count as circuit breaker failures.

**Response body handling:** `JSON.parse` of cloud response is wrapped in try/catch — non-JSON responses are passed through unchanged.

### 6. Startup Validation

```typescript
// packages/server/src/auth/cloud-startup.ts
interface CloudAuthContext {
  token: string;
  source: 'developer-session' | 'ci-oidc';
}

function resolveCloudAuthContext(projectId: string): CloudAuthContext;
function validateProjectId(projectId: string): void;
```

**Exact error message format** when no auth context is found:

```
Cloud auth requires authentication. No developer session or CI token found.

To authenticate:
  1. Run: vertz login
  2. Or set VERTZ_CLOUD_TOKEN environment variable
  3. For GitHub Actions, add the vertz-dev/cloud-auth action

Session file expected at: ~/.vertz/auth.json
```

**Expired/malformed session handling:** If `~/.vertz/auth.json` exists but contains expired or unparseable content, throw with a different prescriptive message:

```
Cloud auth session expired or corrupted.

  Run: vertz login
  Session file: ~/.vertz/auth.json
```

### 7. Provider Config — Cloud Mode

**Approach (updated from review):** Do NOT make `clientId`/`clientSecret` optional on `OAuthProviderConfig`. Instead, keep the existing required type for self-hosted mode. In cloud mode, the proxy handles all OAuth — provider factories accept a cloud-specific config shape without credentials:

```typescript
// Self-hosted (unchanged)
interface OAuthProviderConfig {
  clientId: string;      // Required
  clientSecret: string;  // Required
  redirectUrl?: string;
  scopes?: string[];
}

// Cloud mode — provider factories detect cloud config and accept scopes-only
// The proxy routes all OAuth through cloud.vtz.app, so no local credentials needed
interface CloudOAuthProviderConfig {
  scopes?: string[];
}
```

The provider factory functions (`github()`, `google()`, `discord()`) accept a union:

```typescript
function github(config: OAuthProviderConfig | CloudOAuthProviderConfig): OAuthProvider;
```

**Runtime:** When `cloud.projectId` is set, the server ignores provider-level `clientId`/`clientSecret` (cloud handles the exchange). When absent, the server validates that `clientId`/`clientSecret` are provided at startup — preserving "if it builds, it works" for self-hosted.

---

## Manifesto Alignment

### Principles Applied

1. **"If it builds, it works"** — Cloud vs self-hosted mode is determined at the type level. When `cloud.projectId` is set, the compiler config type includes `CloudConfig`, and the server adjusts behavior without runtime mode checks that could fail.

2. **"One way to do things"** — Cloud mode activates globally, not per-provider. There's no `cloud: true` flag on individual providers. `cloud.projectId` present = cloud mode. Absent = self-hosted.

3. **"AI agents are first-class users"** — An LLM adding cloud auth just sets `cloud.projectId` in config. No additional wiring. Provider definitions stay the same shape — `github({ scopes: ['repo'] })` works in both modes.

4. **"Production-ready by default"** — Circuit breaker ships with the cloud proxy from day one. JWKS caching with jitter prevents thundering herd. Startup validation catches misconfiguration before the first request.

### Tradeoffs

- **Asymmetric JWT only for cloud** — Self-hosted keeps symmetric HS256. Adding RS256 everywhere would force key management complexity on self-hosted users. Cloud users get RS256 automatically.
- **Proxy over redirect** — Auth routes proxy server-to-server instead of redirecting the browser. This keeps cookies on the developer's domain and allows lifecycle callbacks to run locally. Adds latency on auth operations but keeps the security model simple.
- **No offline fallback for auth** — When the circuit breaker trips, auth operations fail with 503. We don't cache sessions or serve stale auth. This is intentional: stale auth data is a security risk.

### What Was Rejected

- **Per-provider cloud config** — `github({ cloud: true })` was considered but rejected. It creates ambiguity and mixed modes that are hard to reason about.
- **Cloud JWT signing locally** — Exposing the private key to the developer's server was rejected. If the key leaks, all sessions are compromised. Asymmetric means the private key never leaves cloud.
- **Better Auth / third-party wrapping** — Vertz builds its own auth. Cloud mode is a first-party extension, not a wrapper around an external service.

---

## Non-Goals

1. **Cloud-side implementation** — Platform API Worker, key generation, JWKS endpoint, Postgres provisioning. These live in `vertz-dev/platform`.
2. **Edge permission enforcement** — Deploying serialized rules to KV and evaluating at the edge. This is Phase 2 (deploy pipeline).
3. **`vertz login` / `vertz link` CLI commands** — CLI auth flow is a separate issue.
4. **OAuth profile mapping** — `mapProfile` callback is a separate design (plans/archived/oauth-profile-mapping.md). This issue prepares the proxy to forward `_lifecycle.rawProfile` but doesn't implement the mapping pipeline.
5. **MFA through cloud** — Cloud-managed MFA is Phase 3.
6. **Token refresh through cloud** — Refresh flow requires cloud session store integration. Phase 2.
7. **Session management in cloud mode** — `listSessions`, `revokeSession`, `revokeAllSessions` require cloud session store integration. In Phase 1, these routes are proxied to cloud like all other `/api/auth/*` routes, but the cloud-side session store is not built yet. Phase 2 delivers the cloud session store + these endpoints. For Phase 1, the proxy forwards these routes to cloud — if cloud returns a 501 (not implemented), that response is forwarded as-is.
8. **Rules serialization** — Moved out of this Phase 1 scope. `serializeRule` has no consumer until the deploy pipeline (Phase 2). Will be implemented alongside edge permission enforcement.

### Platform API Dependencies

The following cloud endpoints are required for E2E validation (tests mock them, but a demo requires them to exist):

| Endpoint | Status | Needed for |
|----------|--------|------------|
| `GET /auth/v1/{projectId}/.well-known/jwks.json` | In progress (platform repo) | JWKS client |
| `POST /auth/v1/signup` | In progress | Auth proxy |
| `POST /auth/v1/signin` | In progress | Auth proxy |
| `GET /auth/v1/oauth/initiate` | In progress | OAuth proxy |
| `POST /auth/v1/oauth/callback` | In progress | OAuth proxy |

All framework-side tests use mocked HTTP responses — no platform dependency for CI.

---

## Unknowns

1. **`@vertz/server` access to `VertzConfig`** — Currently, `VertzConfig` lives in `@vertz/compiler` and `AuthConfig` lives in `@vertz/server`. The server needs `cloud.projectId` but doesn't import from `@vertz/compiler`. **Resolution:** Add `cloud?: CloudConfig` to `ServerConfig` in `@vertz/server`. The CLI passes it through when starting the server. For tests, it's passed directly. This avoids a cross-package dependency.

2. **Developer session file location** — Design doc says `~/.vertz/auth.json`. Need to confirm this path works across OS and in CI environments. **Resolution:** Use `~/.vertz/auth.json` for developer sessions. CI uses `ACTIONS_ID_TOKEN_REQUEST_URL` env var (GitHub OIDC). Other CI providers can set `VERTZ_CLOUD_TOKEN` env var directly.

---

## POC Results

No POC required. The design is well-specified in the Managed Auth Rev 3.4 design doc. All APIs use standard Web Crypto and `jose` library (already a dependency). JWKS is a standard protocol (RFC 7517).

---

## Type Flow Map

```
VertzConfig.cloud.projectId: string
  → (CLI passes to ServerConfig.cloud)
  → resolveCloudAuthContext(projectId) → CloudAuthContext { token, source }
  → createJWKSClient({ url: `.../${projectId}/...` }) → JWKSClient
    → .getKey: JWTVerifyGetKey (jose-compatible key resolver)
  → createCloudJWTVerifier(jwksClient) → CloudJWTVerifier
    → .verify(token: string) → Promise<SessionPayload | null>
  → createCircuitBreaker() → CircuitBreaker
    → .execute<T>(fn) → Promise<T>   // T flows through unchanged
  → createAuthProxy({ projectId, authToken, circuitBreaker }) → RequestHandler

OAuthProviderConfig | CloudOAuthProviderConfig
  → github(config) → OAuthProvider   // factory detects config shape
  → cloud mode: proxy handles OAuth, no local credentials needed
  → self-hosted: clientId + clientSecret required (type-enforced)
```

No dead generics. The only generic is `CircuitBreaker.execute<T>` which flows from the callback return type to the caller.

---

## E2E Acceptance Test

```typescript
describe('Feature: Cloud-managed auth end-to-end', () => {
  describe('Given a server with cloud.projectId configured', () => {
    describe('When starting up with valid developer session', () => {
      it('Then initializes JWKS client targeting cloud endpoint', () => {
        const config = defineConfig({ cloud: { projectId: 'proj_test123' } });
        // Server creates JWKS client for https://cloud.vtz.app/auth/v1/proj_test123/.well-known/jwks.json
        // No jwtSecret required
        // No clientId/clientSecret required on providers
      });
    });

    describe('When starting up without developer session or CI token', () => {
      it('Then throws with prescriptive error message including vertz login command', () => {});
    });
  });

  describe('Given a cloud JWT signed with RS256', () => {
    // Full roundtrip: generate RS256 key pair → sign JWT → serve public key via mock JWKS → verify
    describe('When verifying through the full JWKS → verifier chain', () => {
      it('Then returns SessionPayload with user claims', () => {
        // 1. jose.generateKeyPair('RS256') → { publicKey, privateKey }
        // 2. Sign JWT with privateKey, include kid in header
        // 3. Mock JWKS endpoint serves publicKey as JWK
        // 4. createJWKSClient({ url: mockEndpoint }) → jwksClient
        // 5. createCloudJWTVerifier(jwksClient) → verifier
        // 6. verifier.verify(jwt) → SessionPayload
        const payload = await verifier.verify(cloudJwt);
        expect(payload).toEqual({
          sub: 'user_123',
          email: 'test@example.com',
          role: 'user',
          iat: expect.any(Number),
          exp: expect.any(Number),
          jti: expect.any(String),
          sid: expect.any(String),
        });
      });
    });
  });

  describe('Given cloud mode is inactive (no cloud config)', () => {
    describe('When creating auth', () => {
      it('Then requires jwtSecret for JWT strategy', () => {});
      it('Then uses HS256 verification for sessions', () => {});
      it('Then providers require clientId and clientSecret', () => {
        // OAuthProviderConfig type enforces required fields
        // @ts-expect-error — clientId required in self-hosted mode
        const provider: OAuthProviderConfig = { scopes: ['read:user'] };
      });
    });
  });

  describe('Given cloud auth proxy is active', () => {
    describe('When POST /api/auth/signup hits the proxy', () => {
      it('Then cloud receives the request with X-Vertz-Project header', () => {});
      it('Then cookies are set on the developers domain from cloud response', () => {});
    });

    describe('When cloud returns a 400 Bad Request', () => {
      it('Then the 400 is forwarded to the client as-is', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Circuit Breaker

Standalone utility with no external dependencies. Fully testable in isolation.

**Files:**
- `packages/server/src/auth/circuit-breaker.ts` (new)
- `packages/server/src/auth/circuit-breaker.test.ts` (new)

**Acceptance Criteria:**
```typescript
describe('Feature: Circuit breaker', () => {
  describe('Given a closed circuit', () => {
    describe('When execute() is called with a successful function', () => {
      it('Then returns the function result', () => {});
      it('Then state remains closed', () => {});
    });
  });

  describe('Given failureThreshold consecutive failures (default: 5)', () => {
    describe('When execute() is called again', () => {
      it('Then circuit opens — rejects immediately without calling fn', () => {});
      it('Then getState() returns open', () => {});
      it('Then rejection error includes "circuit open" message', () => {});
    });
  });

  describe('Given an open circuit', () => {
    describe('When execute() is called before resetTimeout', () => {
      it('Then rejects immediately (fail-fast)', () => {});
    });

    describe('When resetTimeout elapses', () => {
      it('Then getState() returns half-open', () => {});
      it('Then allows exactly one probe request', () => {});
      it('Then concurrent requests during probe still fail-fast', () => {});
    });

    describe('When the half-open probe succeeds', () => {
      it('Then circuit closes — normal operation resumes', () => {});
      it('Then failure count resets to 0', () => {});
    });

    describe('When the half-open probe fails', () => {
      it('Then circuit re-opens and resetTimeout restarts', () => {});
    });
  });

  describe('Given a custom failureThreshold of 3', () => {
    it('Then circuit opens after 3 consecutive failures', () => {});
  });

  describe('Given intermittent failures (success resets count)', () => {
    it('Then a success between failures resets the consecutive count', () => {});
  });

  describe('Given reset() is called on an open circuit', () => {
    it('Then circuit closes and counters reset', () => {});
  });
});
```

### Phase 2: JWKS Client + Cloud JWT Verifier

Thin wrapper over jose's `createRemoteJWKSet` + RS256 JWT verification.

**Files:**
- `packages/server/src/auth/jwks-client.ts` (new)
- `packages/server/src/auth/jwks-client.test.ts` (new)
- `packages/server/src/auth/cloud-jwt-verifier.ts` (new)
- `packages/server/src/auth/cloud-jwt-verifier.test.ts` (new)

**Testing approach:** Generate RS256 key pairs with `jose.generateKeyPair('RS256')`. Use `jose.exportJWK` to create mock JWKS responses. Serve via `Bun.serve()` in test or mock `fetch`.

**Acceptance Criteria:**
```typescript
describe('Feature: JWKS client', () => {
  describe('Given a JWKS endpoint URL serving an RS256 public key', () => {
    describe('When getKey is used with jwtVerify for a matching kid', () => {
      it('Then resolves the CryptoKey for verification', () => {});
    });

    describe('When getKey is called within cache TTL (cacheMaxAge)', () => {
      it('Then returns cached key without additional HTTP request', () => {});
    });

    describe('When a JWT has an unknown kid', () => {
      it('Then jose triggers auto-refresh of the JWKS', () => {});
      it('Then resolves if the key is found after refresh', () => {});
      it('Then rejects if kid still not found after refresh', () => {});
    });

    describe('When the JWKS fetch fails and lastKnownGood keys exist', () => {
      it('Then falls back to last known good keys', () => {});
    });

    describe('When the JWKS fetch fails and no previous keys exist', () => {
      it('Then throws an error', () => {});
    });

    describe('When refresh() is called explicitly', () => {
      it('Then forces a re-fetch of the JWKS', () => {});
    });
  });
});

describe('Feature: Cloud JWT verifier', () => {
  // Full RS256 roundtrip test setup:
  // 1. jose.generateKeyPair('RS256') → { publicKey, privateKey }
  // 2. Sign JWT with privateKey using jose.SignJWT, include kid in header
  // 3. Serve publicKey as JWK via mock JWKS endpoint
  // 4. createJWKSClient → createCloudJWTVerifier → verify

  describe('Given a valid RS256-signed JWT', () => {
    describe('When verify() is called', () => {
      it('Then returns SessionPayload with sub, email, role, iat, exp', () => {});
    });
  });

  describe('Given an expired JWT', () => {
    describe('When verify() is called', () => {
      it('Then returns null', () => {});
    });
  });

  describe('Given a JWT signed with a different private key', () => {
    describe('When verify() is called', () => {
      it('Then returns null (signature mismatch)', () => {});
    });
  });

  describe('Given a JWT with unknown kid that appears after JWKS refresh', () => {
    describe('When verify() is called', () => {
      it('Then succeeds after auto-refresh finds the key', () => {});
    });
  });

  describe('Given a JWT missing required claims (sub, email, role)', () => {
    describe('When verify() is called', () => {
      it('Then returns null', () => {});
    });
  });
});
```

### Phase 3: Cloud Config + Startup Validation

Add `cloud` to config types, implement startup validation, resolve developer auth context.

**Files:**
- `packages/compiler/src/config.ts` (modify — add `CloudConfig` type and `cloud?` to `VertzConfig`)
- `packages/server/src/auth/cloud-startup.ts` (new)
- `packages/server/src/auth/cloud-startup.test.ts` (new)

**Acceptance Criteria:**
```typescript
describe('Feature: Cloud config', () => {
  describe('Given defineConfig({ cloud: { projectId: "proj_xxx" } })', () => {
    it('Then config includes cloud.projectId', () => {});
    it('Then resolveConfig preserves cloud config as-is', () => {});
  });

  describe('Given defineConfig({}) with no cloud section', () => {
    it('Then config.cloud is undefined', () => {});
    it('Then resolveConfig returns cloud as undefined', () => {});
  });
});

describe('Feature: Project ID validation', () => {
  describe('Given a valid projectId matching proj_<alphanum>', () => {
    it('Then validateProjectId does not throw', () => {});
  });

  describe('Given projectId without proj_ prefix', () => {
    it('Then throws with format error including expected pattern', () => {});
  });

  describe('Given empty string projectId', () => {
    it('Then throws with format error', () => {});
  });
});

describe('Feature: Cloud auth context resolution', () => {
  describe('Given ~/.vertz/auth.json exists with valid token', () => {
    describe('When resolveCloudAuthContext() is called', () => {
      it('Then returns { token: "<token>", source: "developer-session" }', () => {});
    });
  });

  describe('Given ~/.vertz/auth.json exists but is expired/malformed', () => {
    describe('When resolveCloudAuthContext() is called', () => {
      it('Then throws with "session expired or corrupted" message', () => {});
      it('Then includes "vertz login" command in error', () => {});
    });
  });

  describe('Given VERTZ_CLOUD_TOKEN env var is set (no auth.json)', () => {
    describe('When resolveCloudAuthContext() is called', () => {
      it('Then returns { token: "<env-value>", source: "ci-oidc" }', () => {});
    });
  });

  describe('Given both auth.json and VERTZ_CLOUD_TOKEN exist', () => {
    describe('When resolveCloudAuthContext() is called', () => {
      it('Then prefers VERTZ_CLOUD_TOKEN (CI takes precedence)', () => {});
    });
  });

  describe('Given no auth.json, no VERTZ_CLOUD_TOKEN, no ACTIONS_ID_TOKEN_REQUEST_URL', () => {
    describe('When resolveCloudAuthContext() is called', () => {
      it('Then throws with prescriptive error listing all 3 options', () => {});
      it('Then error message includes "vertz login" command', () => {});
      it('Then error message includes VERTZ_CLOUD_TOKEN env var', () => {});
      it('Then error message includes session file path', () => {});
    });
  });
});
```

### Phase 4: Auth Route Proxy + Provider Config

The main cloud integration: proxy auth routes to cloud, handle cookies, lifecycle callbacks, error forwarding. Update provider config types for cloud mode.

**Files:**
- `packages/server/src/auth/cloud-proxy.ts` (new)
- `packages/server/src/auth/cloud-proxy.test.ts` (new)
- `packages/server/src/auth/types.ts` (modify — add `CloudOAuthProviderConfig`)
- `packages/server/src/auth/providers/github.ts` (modify — accept union config)
- `packages/server/src/auth/providers/google.ts` (modify — accept union config)
- `packages/server/src/auth/providers/discord.ts` (modify — accept union config)

**Testing approach:** Use `Bun.serve()` to spin up a mock cloud endpoint in tests. Verify headers, cookies, body manipulation, error forwarding.

**Acceptance Criteria:**
```typescript
describe('Feature: Auth route proxy', () => {
  describe('Given cloud mode is active', () => {
    describe('When a POST request hits /api/auth/signup', () => {
      it('Then proxies to {cloudBaseUrl}/auth/v1/signup', () => {});
      it('Then includes X-Vertz-Project header with projectId', () => {});
      it('Then includes X-Vertz-Environment header', () => {});
      it('Then includes Authorization: Bearer header with auth token', () => {});
      it('Then forwards Content-Type header and request body', () => {});
    });

    describe('When a GET request hits /api/auth/me', () => {
      it('Then forwards Cookie header from original request', () => {});
      it('Then forwards X-Forwarded-For header', () => {});
    });

    describe('When cloud returns _tokens in response body', () => {
      it('Then sets vertz.sid cookie (HttpOnly, SameSite=Lax)', () => {});
      it('Then sets vertz.ref cookie (HttpOnly, SameSite=Lax, Path=/api/auth)', () => {});
      it('Then strips _tokens from response body sent to client', () => {});
    });

    describe('When environment is "development"', () => {
      it('Then cookies omit Secure flag (works over HTTP localhost)', () => {});
    });

    describe('When environment is "production"', () => {
      it('Then cookies include Secure flag', () => {});
    });

    describe('When cloud returns _lifecycle.isNewUser', () => {
      it('Then fires onUserCreated callback with user data', () => {});
      it('Then strips _lifecycle from response body', () => {});
    });

    describe('When cloud returns _lifecycle.rawProfile', () => {
      it('Then includes raw profile in onUserCreated payload', () => {});
    });

    describe('When onUserAuthenticated callback is provided', () => {
      it('Then fires on every successful auth response', () => {});
    });

    describe('When cloud returns 400 Bad Request', () => {
      it('Then forwards 400 response to client as-is', () => {});
      it('Then does NOT count as circuit breaker failure', () => {});
    });

    describe('When cloud returns 401 Unauthorized', () => {
      it('Then forwards 401 response to client as-is', () => {});
    });

    describe('When cloud returns 500 Internal Server Error', () => {
      it('Then forwards 500 response to client', () => {});
      it('Then counts as circuit breaker failure', () => {});
    });

    describe('When cloud fetch throws (network error/timeout)', () => {
      it('Then counts as circuit breaker failure', () => {});
      it('Then returns 502 Bad Gateway', () => {});
    });

    describe('When circuit breaker is open', () => {
      it('Then returns 503 Service Unavailable without calling cloud', () => {});
      it('Then response body includes "Auth service temporarily unavailable"', () => {});
    });

    describe('When cloud returns non-JSON response (HTML error page)', () => {
      it('Then passes through raw response without crashing', () => {});
    });

    describe('When Host header is sent to cloud', () => {
      it('Then Host is set to cloud endpoint host, not forwarded from client', () => {});
    });
  });
});

describe('Feature: Provider config types', () => {
  describe('Given OAuthProviderConfig (self-hosted)', () => {
    it('Then clientId is required', () => {});
    it('Then clientSecret is required', () => {});
  });

  describe('Given CloudOAuthProviderConfig (cloud mode)', () => {
    it('Then clientId is not required', () => {});
    it('Then clientSecret is not required', () => {});
    it('Then scopes is optional', () => {});
  });

  describe('Given github() factory in cloud mode', () => {
    it('Then accepts CloudOAuthProviderConfig without credentials', () => {});
  });

  describe('Given github() factory in self-hosted mode', () => {
    it('Then requires OAuthProviderConfig with credentials', () => {});
  });
});
```

### Phase 5: Integration + Exports

Wire everything together in `createServer()`, update exports, backward compatibility verification.

**Files:**
- `packages/server/src/auth/index.ts` (modify — add cloud exports)
- `packages/server/src/create-server.ts` (modify — cloud mode wiring)
- Integration tests

**Acceptance Criteria:**
```typescript
describe('Feature: Cloud mode integration', () => {
  describe('Given ServerConfig with cloud.projectId and valid auth context', () => {
    describe('When createServer() is called', () => {
      it('Then resolves cloud auth context from env/session file', () => {});
      it('Then creates JWKS client targeting cloud.vtz.app/{projectId}', () => {});
      it('Then creates cloud JWT verifier using the JWKS client', () => {});
      it('Then creates circuit breaker with default thresholds', () => {});
      it('Then creates auth proxy handler for /api/auth/* routes', () => {});
      it('Then does NOT require jwtSecret in auth config', () => {});
      it('Then does NOT require clientId/clientSecret on providers', () => {});
    });
  });

  describe('Given ServerConfig with cloud.projectId but no auth context', () => {
    describe('When createServer() is called', () => {
      it('Then throws startup error with prescriptive message', () => {});
    });
  });

  describe('Given ServerConfig without cloud config (backward compat)', () => {
    describe('When createServer() is called', () => {
      it('Then requires jwtSecret for JWT session strategy', () => {});
      it('Then uses HS256 symmetric verification', () => {});
      it('Then requires clientId and clientSecret on OAuth providers', () => {});
      it('Then no circuit breaker or JWKS client is created', () => {});
      it('Then auth routes are handled locally (no proxy)', () => {});
    });
  });
});
```

---

## Review Sign-Off Log

### DX Review — Approved (Rev 1)
- should-fix: Config location ambiguity → **Addressed:** Added explicit config flow documentation in API Surface §1
- should-fix: `OAuthProviderConfig` unconditional optionality → **Addressed:** Introduced `CloudOAuthProviderConfig` union — self-hosted keeps required fields
- should-fix: Startup error message format → **Addressed:** Exact error messages specified in API Surface §7

### Product/Scope Review — Changes Requested (Rev 1)
- **blocker:** Session management in cloud mode unaddressed → **Addressed:** Added as Non-Goal §7 — proxy forwards routes, cloud returns 501 if not ready
- should-fix: `OAuthProviderConfig` type safety → **Addressed:** Same as DX finding — union types
- should-fix: Rules serialization has no consumer → **Addressed:** Moved to Non-Goal §8 — will ship with deploy pipeline
- should-fix: Missing proxy error forwarding tests → **Addressed:** Added 4xx/5xx forwarding tests in Phase 4
- should-fix: Platform API dependency status → **Addressed:** Added "Platform API Dependencies" table in Non-Goals
- should-fix: Vague backward compat test → **Addressed:** Phase 5 now has 5 specific backward compat assertions

### Technical Review — Approved (Rev 1)
- should-fix: Use `createRemoteJWKSet` from jose → **Addressed:** JWKS client now wraps jose with thin lastKnownGood layer
- should-fix: Rules serialization keep as typed mapper → **Addressed:** Moved out of scope (Non-Goal §8)
- should-fix: Cookie `Secure` flag in dev → **Addressed:** Added dev/prod cookie tests in Phase 4
