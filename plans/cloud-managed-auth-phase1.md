# Cloud-Managed Auth — Framework-Side Phase 1

**Issue:** [#1321](https://github.com/vertz-dev/vertz/issues/1321)
**Design Reference:** [Managed Auth Rev 3.4](https://github.com/vertz-dev/backstage/blob/main/plans/cloud/managed-auth.md)
**Status:** Rev 4 — Addresses DX / Product / Technical reviews on Rev 3

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

// ResolvedConfig must also include cloud — resolveConfig() passes it through unchanged
interface ResolvedConfig {
  // ... existing resolved fields ...
  cloud?: CloudConfig;
}
```

```typescript
// packages/server/src/create-server.ts — runtime consumer
// ServerConfig receives cloud config from CLI or directly in tests
interface ServerConfig {
  // ... existing fields ...
  cloud?: CloudConfig;  // Supersedes the reserved cloud?: string from db-backed-auth-stores.md (never implemented)
}
```

**Config flow:** `vertz.config.ts` → CLI loads via Jiti → passes `cloud` to `createServer({ cloud })` → server uses it at runtime. The compiler package defines the type for `defineConfig()` DX but never imports or uses `CloudConfig` itself. For direct `createServer()` usage (no CLI), pass `cloud` explicitly.

**Prior design note:** `db-backed-auth-stores.md` reserved `cloud?: string` on `ServerConfig` as a future API key field. That reservation was never implemented in code and is superseded by `cloud?: CloudConfig`. The structured object shape is needed because cloud mode requires `projectId` for JWKS endpoint construction and proxy routing.

### 2. JWKS Client (thin facade over jose)

```typescript
// packages/server/src/auth/jwks-client.ts
import type { JWTVerifyGetKey } from 'jose';

interface JWKSClient {
  getKey: JWTVerifyGetKey;  // jose-compatible key resolver
  refresh(): Promise<void>; // Maps to jose's reload() — forces re-fetch of JWKS
}

function createJWKSClient(options: {
  url: string;
  cacheTtl?: number;   // Default: 600_000 (10 min) — maps to jose cacheMaxAge
  cooldown?: number;    // Default: 30_000 (30s) — maps to jose cooldownDuration
}): JWKSClient;
```

**Implementation note:** Directly wraps `jose.createRemoteJWKSet`. No custom HTTP, caching, or single-flight logic — jose handles all of this internally, including caching keys and auto-refreshing on unknown `kid`. The `cacheTtl` default of 10 minutes matches jose's default `cacheMaxAge`. The `refresh()` method maps to jose's `reload()` (which is marked `@ignore` in jose types — document this coupling for future jose upgrades).

**No custom `lastKnownGood` layer.** jose's built-in caching already serves as last-known-good during the `cooldownDuration` window. Adding a separate fallback layer would be redundant and could mask real key rotation events.

### 3. Cloud JWT Verifier

```typescript
// packages/server/src/auth/cloud-jwt-verifier.ts
interface CloudJWTVerifier {
  verify(token: string): Promise<SessionPayload | null>;
}

function createCloudJWTVerifier(options: {
  jwksClient: JWKSClient;
  issuer?: string;     // Default: cloudBaseUrl (e.g., 'https://cloud.vtz.app')
  audience?: string;   // Default: projectId — prevents cross-project token reuse
}): CloudJWTVerifier;
```

**JWT claim validation:** Uses jose's `jwtVerify` with `issuer` and `audience` options. If `iss` or `aud` in the JWT don't match, verification returns `null`. This prevents a JWT issued for one project from being accepted by another project's server (even if they share signing keys during early platform development).

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

**Half-open transition:** Request-based, not timer-based. When `execute()` is called and `resetTimeout` has elapsed since the circuit opened, the state transitions to half-open. The first call becomes the probe; concurrent calls during the probe still fail-fast. This avoids dangling `setTimeout` timers.

**5xx counting:** The circuit breaker only sees thrown errors. To count HTTP 5xx as failures, the proxy callback passed to `execute()` must inspect the response status and throw for 5xx. The circuit breaker itself has no HTTP awareness.

**Note:** Circuit breaker is not included in Phase 1's minimal proxy. Phase 1 cloud auth failures result in raw errors. Circuit breaker is added in Phase 2.

### 5. Auth Route Proxy

```typescript
// packages/server/src/auth/cloud-proxy.ts
function createAuthProxy(options: {
  projectId: string;
  cloudBaseUrl?: string;     // Default: 'https://cloud.vtz.app'
  environment?: string;      // Default: process.env.NODE_ENV ?? 'development'
  authToken: string;
  circuitBreaker?: CircuitBreaker;  // Optional — Phase 1 ships without it
  fetchTimeout?: number;     // Default: 10_000 (10s) — AbortSignal.timeout
  maxBodySize?: number;      // Default: 1_048_576 (1MB) — rejects larger request bodies
  onUserCreated?: (payload: OnUserCreatedPayload, ctx: AuthCallbackContext) => Promise<void>;
  onUserAuthenticated?: (payload: SessionPayload) => Promise<void>;
}): (request: Request) => Promise<Response>;
```

**Cookie security in development:** When `environment === 'development'`, the `Secure` flag is omitted from `Set-Cookie` headers so cookies work over HTTP on localhost.

**Error forwarding:** Cloud 4xx responses are forwarded to the client as-is and do NOT count as circuit breaker failures. Cloud 5xx responses are forwarded to the client but DO count as circuit breaker failures — the proxy callback throws inside `execute()` after capturing the response, so the circuit breaker records the failure, then the proxy returns the captured 5xx response. Network errors and timeouts (via `AbortSignal.timeout`) also count as circuit breaker failures.

**Header whitelist:** The proxy forwards only these headers from the client request: `Cookie`, `Content-Type`, `Accept`, `X-Forwarded-For`, `User-Agent`. The proxy sets `Host` to the cloud endpoint host (not forwarded from client), and adds `Authorization: Bearer`, `X-Vertz-Project`, and `X-Vertz-Environment` headers.

**Body size limit:** Request bodies larger than `maxBodySize` are rejected with `413 Payload Too Large` before proxying. Auth requests (signup, signin, OAuth) are small payloads — 1MB is generous.

**Response body handling:** `JSON.parse` of cloud response is wrapped in try/catch — non-JSON responses are passed through unchanged. After stripping `_tokens` and `_lifecycle` from JSON bodies, the proxy removes the `Content-Length` header and lets the runtime use chunked transfer encoding (avoids Content-Length mismatch).

**503 response format:** When the circuit breaker is open, the proxy returns:
```json
{ "error": "auth_service_unavailable", "message": "Auth service temporarily unavailable" }
```
with `Content-Type: application/json` and status `503`.

**`onUserAuthenticated` type:** Receives `SessionPayload` (the JWT claims: `sub`, `email`, `role`, `iat`, `exp`, `jti`, `sid`) — not the full `AuthUser` type, which includes fields (`createdAt`, `emailVerified`, etc.) that are not available from the JWT alone.

### 6. Startup Validation

```typescript
// packages/server/src/auth/cloud-startup.ts
interface CloudAuthContext {
  token: string;
  source: 'developer-session' | 'ci-token';
}

function resolveCloudAuthContext(options: {
  projectId: string;
  sessionPath?: string;  // Default: ~/.vertz/auth.json — override for testing
}): CloudAuthContext;
function validateProjectId(projectId: string): void;
```

**Source labels:** `'developer-session'` for `~/.vertz/auth.json`, `'ci-token'` for `VERTZ_CLOUD_TOKEN` env var. GitHub Actions OIDC exchange (`ACTIONS_ID_TOKEN_REQUEST_URL`) is deferred — Phase 1 does not implement OIDC token exchange. When ready, it will use a distinct `'ci-oidc'` source.

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

**Runtime validation (not compile-time):** The union `OAuthProviderConfig | CloudOAuthProviderConfig` is not discriminated — `CloudOAuthProviderConfig` is a structural subset of `OAuthProviderConfig`. TypeScript cannot distinguish them at the call site. Enforcement happens at runtime: when `cloud.projectId` is absent, `createServer()` validates that all providers have `clientId`/`clientSecret` at startup. This is a known tradeoff — compile-time enforcement would require generics on `defineAuth()` parameterized by cloud mode, which adds type complexity disproportionate to the benefit.

**Cloud mode stubs:** In cloud mode, provider factories return `OAuthProvider` objects with stub implementations for `getAuthorizationUrl()` and `exchangeCode()` that throw `"Not available in cloud mode — OAuth is handled by the cloud proxy"`. These methods are unreachable in normal operation (the proxy handles OAuth routes), but the stubs provide a clear error if internal code paths accidentally call them.

### 8. SSR Session Resolution in Cloud Mode

```typescript
// packages/server/src/auth/resolve-session-for-ssr.ts — modify existing
interface ResolveSessionForSSRConfig {
  // Existing: jwtSecret + jwtAlgorithm (retained for backward compat with self-hosted HS256)
  jwtSecret?: string;
  jwtAlgorithm?: string;
  // New: cloud mode passes the verifier directly — no jose types leaked to developer
  cloudVerifier?: CloudJWTVerifier;
  cookieName?: string;
}
```

**Cloud mode:** When `cloudVerifier` is provided, `resolveSessionForSSR` calls `cloudVerifier.verify(token)` instead of the symmetric `verifyJWT(token, jwtSecret, algorithm)` path. This keeps jose types internal — the developer only sees `CloudJWTVerifier`, which is a Vertz type.

**Backward compat:** The `jwtSecret` path is retained for self-hosted HS256. It will be removed when self-hosted migrates to RS256 (Non-Goal §9).

### 9. createServer — Cloud Mode Branching

When `config.cloud?.projectId` is set, `createServer()` takes a separate code path:

1. **Validates cloud auth context** — calls `resolveCloudAuthContext({ projectId })`. Throws prescriptive error if no token found.
2. **Creates JWKS client** — `createJWKSClient({ url: \`\${cloudBaseUrl}/auth/v1/\${projectId}/.well-known/jwks.json\` })`.
3. **Creates cloud JWT verifier** — `createCloudJWTVerifier({ jwksClient, issuer: cloudBaseUrl, audience: projectId })`.
4. **Skips `jwtSecret` requirement** — the existing `createAuth()` validates `jwtSecret` unconditionally. In cloud mode, `createServer()` either: (a) passes the cloud verifier into `createAuth()` which accepts it as an alternative to `jwtSecret`, or (b) constructs the auth handler and `resolveSessionForSSR` directly, bypassing `createAuth()`. Decision deferred to implementation — both approaches are viable, and the acceptance criteria validate the observable behavior either way.
5. **Wires cloud proxy** — creates `createAuthProxy({ ... })` as the handler for `/api/auth/*` routes, replacing the local auth handler.
6. **Provider validation** — skips `clientId`/`clientSecret` validation on providers. Providers in cloud mode are metadata-only (id, name, scopes).

**What `.auth` exposes in cloud mode:** The `ServerInstance.auth` property in cloud mode exposes `resolveSessionForSSR` (using the cloud verifier) but does NOT expose `api.signUp`, `api.signIn`, etc. — these operations go through the proxy, not local auth. The exact shape is determined during implementation; the acceptance criteria validate the developer-facing behavior.

---

## Manifesto Alignment

### Principles Applied

1. **"If it builds, it works"** — Cloud vs self-hosted mode is determined at the type level. When `cloud.projectId` is set, the compiler config type includes `CloudConfig`, and the server adjusts behavior without runtime mode checks that could fail. Provider credential validation is a runtime check at startup (see Tradeoffs).

2. **"One way to do things"** — Cloud mode activates globally, not per-provider. There's no `cloud: true` flag on individual providers. `cloud.projectId` present = cloud mode. Absent = self-hosted.

3. **"AI agents are first-class users"** — An LLM adding cloud auth just sets `cloud.projectId` in config. No additional wiring. Provider definitions stay the same shape — `github({ scopes: ['repo'] })` works in both modes.

4. **"Production-ready by default"** — Circuit breaker ships with the cloud proxy in Phase 2. JWKS caching prevents thundering herd. Startup validation catches misconfiguration before the first request. Fetch timeout prevents hanging connections.

### Tradeoffs

- **RS256 as target architecture** — RS256 asymmetric key pairs are the target for all modes. Phase 1 delivers RS256 for cloud mode. Self-hosted retains HS256 backward compat during the transition; self-hosted RS256 key management is a follow-up (Non-Goal §9). The verification path is unified now — `resolveSessionForSSR` accepts either `cloudVerifier` (RS256) or `jwtSecret` (HS256).
- **Provider validation is runtime, not compile-time** — The `OAuthProviderConfig | CloudOAuthProviderConfig` union is not discriminated. `createServer()` validates provider credentials at startup in self-hosted mode. This means `github({ scopes: ['read:user'] })` compiles in self-hosted mode but throws at startup. Compile-time enforcement would require generics on `defineAuth()` parameterized by cloud mode — complexity that isn't justified pre-v1.
- **Proxy over redirect** — Auth routes proxy server-to-server instead of redirecting the browser. This keeps cookies on the developer's domain and allows lifecycle callbacks to run locally. Adds latency on auth operations but keeps the security model simple.
- **No offline fallback for auth** — When the circuit breaker trips, auth operations fail with 503. We don't cache sessions or serve stale auth. This is intentional: stale auth data is a security risk.

### What Was Rejected

- **Per-provider cloud config** — `github({ cloud: true })` was considered but rejected. It creates ambiguity and mixed modes that are hard to reason about.
- **Cloud JWT signing locally** — Exposing the private key to the developer's server was rejected. If the key leaks, all sessions are compromised. Asymmetric means the private key never leaves cloud.
- **Better Auth / third-party wrapping** — Vertz builds its own auth. Cloud mode is a first-party extension, not a wrapper around an external service.
- **Symmetric JWT secrets (HS256)** — Rejected as the long-term approach. Symmetric secrets can't be safely exposed for verification by SSR, edge workers, or third parties. RS256 key pairs are the universal target.

---

## Non-Goals

1. **Cloud-side implementation** — Platform API Worker, key generation, JWKS endpoint, Postgres provisioning. These live in `vertz-dev/platform` (owned by the platform team).
2. **Edge permission enforcement** — Deploying serialized rules to KV and evaluating at the edge. This is Phase 2 (deploy pipeline).
3. **`vertz login` / `vertz link` CLI commands** — CLI auth flow is a separate issue. Phase 1 uses `VERTZ_CLOUD_TOKEN` env var for development/testing.
4. **OAuth profile mapping** — `mapProfile` callback is a separate design (plans/archived/oauth-profile-mapping.md). This issue prepares the proxy to forward `_lifecycle.rawProfile` but doesn't implement the mapping pipeline.
5. **MFA through cloud** — Cloud-managed MFA is Phase 3.
6. **Token refresh through cloud** — Refresh flow requires cloud session store integration. Phase 2.
7. **Session management in cloud mode** — `listSessions`, `revokeSession`, `revokeAllSessions` require cloud session store integration. The proxy forwards ALL `/api/auth/*` routes to cloud, including session management routes. If cloud returns a 501 (not implemented), that response is forwarded to the client as-is. Phase 2 delivers the cloud session store + these endpoints.
8. **Rules serialization** — Moved out of this Phase 1 scope. `serializeRule` has no consumer until the deploy pipeline (Phase 2). Will be implemented alongside edge permission enforcement.
9. **Self-hosted RS256 key management** — Self-hosted mode will migrate from HS256 (`jwtSecret`) to RS256 (local key pair generation, local JWKS endpoint). This is a follow-up issue (to be created after Phase 1 merges). This design doc prepares the verification path (unified RS256 via `CloudJWTVerifier`) but does not implement self-hosted key generation or remove `jwtSecret`.
10. **GitHub Actions OIDC exchange** — `ACTIONS_ID_TOKEN_REQUEST_URL` token exchange is not implemented in Phase 1. CI environments use `VERTZ_CLOUD_TOKEN` env var directly.

### Platform API Dependencies

The following cloud endpoints are required for E2E validation (tests mock them, but a demo requires them to exist):

| Endpoint | Status | Owner | Needed for |
|----------|--------|-------|------------|
| `GET /auth/v1/{projectId}/.well-known/jwks.json` | In progress | platform team | JWKS client |
| `POST /auth/v1/signup` | In progress | platform team | Auth proxy |
| `POST /auth/v1/signin` | In progress | platform team | Auth proxy |
| `GET /auth/v1/oauth/initiate` | In progress | platform team | OAuth proxy |
| `POST /auth/v1/oauth/callback` | In progress | platform team | OAuth proxy |

All framework-side tests use mocked HTTP responses — no platform dependency for CI. If platform APIs are not ready when Phase 4 begins, integration tests will use extended mocks; a demo requires the endpoints.

---

## Unknowns

1. **`@vertz/server` access to `VertzConfig`** — Currently, `VertzConfig` lives in `@vertz/compiler` and `AuthConfig` lives in `@vertz/server`. The server needs `cloud.projectId` but doesn't import from `@vertz/compiler`. **Resolution:** Add `cloud?: CloudConfig` to `ServerConfig` in `@vertz/server`. The CLI passes it through when starting the server. For tests, it's passed directly. This avoids a cross-package dependency.

2. **Developer session file location** — Design doc says `~/.vertz/auth.json`. Need to confirm this path works across OS and in CI environments. **Resolution:** Use `~/.vertz/auth.json` for developer sessions. CI uses `VERTZ_CLOUD_TOKEN` env var directly. `resolveCloudAuthContext` accepts an optional `sessionPath` parameter for testing.

3. **`cloud` field shape change** — `db-backed-auth-stores.md` reserved `cloud?: string` on `ServerConfig` as a future API key field. **Resolution:** That reservation was never implemented in code. Superseded by `cloud?: CloudConfig` — the structured object is needed for `projectId`.

---

## POC Results

No POC required. The design is well-specified in the Managed Auth Rev 3.4 design doc. All APIs use standard Web Crypto and `jose` library (already a dependency). JWKS is a standard protocol (RFC 7517).

---

## Type Flow Map

```
VertzConfig.cloud.projectId: string
  → (CLI passes to ServerConfig.cloud — resolveConfig preserves it)
  → resolveCloudAuthContext({ projectId }) → CloudAuthContext { token, source }
  → createJWKSClient({ url: `.../${projectId}/...` }) → JWKSClient
    → .getKey: JWTVerifyGetKey (jose-compatible key resolver)
  → createCloudJWTVerifier({ jwksClient, issuer, audience: projectId }) → CloudJWTVerifier
    → .verify(token: string) → Promise<SessionPayload | null>
      → SessionPayload flows to resolveSessionForSSR (via cloudVerifier)
      → SessionPayload flows to request context (ctx.session)
      → SessionPayload flows to onUserAuthenticated callback
  → createCircuitBreaker() → CircuitBreaker
    → .execute<T>(fn) → Promise<T>   // T flows through unchanged
  → createAuthProxy({ projectId, authToken, circuitBreaker }) → RequestHandler
    → RequestHandler registered on /api/auth/* routes in createServer()

OAuthProviderConfig | CloudOAuthProviderConfig
  → github(config) → OAuthProvider   // factory accepts union
  → cloud mode: proxy handles OAuth, provider methods are stubs
  → self-hosted: clientId + clientSecret required (runtime-validated at startup)
```

No dead generics. The only generic is `CircuitBreaker.execute<T>` which flows from the callback return type to the caller. `SessionPayload` flows from verifier → SSR resolution → request context → developer callbacks.

---

## E2E Acceptance Test

```typescript
describe('Feature: Cloud-managed auth end-to-end', () => {
  describe('Given a server with cloud.projectId and VERTZ_CLOUD_TOKEN set', () => {
    describe('When starting up', () => {
      it('then initializes JWKS client targeting cloud endpoint', () => {
        const config = defineConfig({ cloud: { projectId: 'proj_test123' } });
        // Server creates JWKS client for https://cloud.vtz.app/auth/v1/proj_test123/.well-known/jwks.json
        // No clientId/clientSecret required on providers
      });
    });

    describe('When starting up without VERTZ_CLOUD_TOKEN or auth.json', () => {
      it('then throws with prescriptive error message including vertz login command', () => {});
    });
  });

  describe('Given a cloud JWT signed with RS256', () => {
    // Full roundtrip: generate RS256 key pair → sign JWT → serve public key via mock JWKS → verify
    describe('When verifying through the full JWKS → verifier chain', () => {
      it('then returns SessionPayload with user claims', () => {
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

    describe('When JWT has wrong audience (different projectId)', () => {
      it('then returns null (audience mismatch)', () => {});
    });
  });

  describe('Given cloud mode is inactive (no cloud config)', () => {
    describe('When creating auth', () => {
      it('then providers require clientId and clientSecret', () => {
        // @ts-expect-error — clientId required in self-hosted mode
        const provider: OAuthProviderConfig = { scopes: ['read:user'] };
      });
      it('then auth routes are handled locally (no proxy)', () => {});
    });
  });

  describe('Given cloud auth proxy is active', () => {
    describe('When POST /api/auth/signup hits the proxy', () => {
      it('then cloud receives the request with X-Vertz-Project header', () => {});
      it('then cookies are set on the developers domain from cloud response', () => {});
    });

    describe('When cloud returns a 400 Bad Request', () => {
      it('then the 400 is forwarded to the client as-is', () => {});
    });

    describe('When request body exceeds maxBodySize', () => {
      it('then returns 413 Payload Too Large without proxying', () => {});
    });
  });

  describe('Given cloud JWT verified via JWKS during SSR', () => {
    describe('When resolveSessionForSSR uses the cloud verifier', () => {
      it('then returns SessionPayload using RS256 public key verification', () => {});
    });
  });

  describe('Given session management routes in cloud mode', () => {
    describe('When DELETE /api/auth/sessions/:id hits the proxy', () => {
      it('then forwards to cloud — if cloud returns 501, client sees 501', () => {});
    });
  });
});
```

---

## Developer Walkthrough

A developer adding cloud auth to an existing Vertz app:

```typescript
// 0. Authenticate (Phase 1 uses env var; vertz login ships separately)
// $ export VERTZ_CLOUD_TOKEN=vtk_your_token_here
//
// Without this, the server will fail at startup with:
//   "Cloud auth requires authentication. No developer session or CI token found."
//   The error includes instructions: run vertz login, set VERTZ_CLOUD_TOKEN, or use GitHub Actions.

// 1. Add cloud config — vertz.config.ts
import { defineConfig } from '@vertz/compiler';

export default defineConfig({
  cloud: {
    projectId: 'proj_abc123', // from Vertz Cloud dashboard
  },
});

// 2. Simplify providers — remove credentials (cloud manages them)
import { github } from '@vertz/server/auth';

const auth = defineAuth({
  providers: [
    github({ scopes: ['read:user'] }), // no clientId/clientSecret needed
  ],
  onUserCreated: async (payload, ctx) => {
    // Still runs locally — create tenant, send welcome email, etc.
    await ctx.db.insert(users).values({ id: payload.user.id, email: payload.user.email });
  },
});

// 3. SSR works automatically — resolveSessionForSSR uses cloud verifier
// No jwtSecret needed. Cloud JWT verified via RS256 JWKS.

// 4. Start the server — cloud mode auto-detected from config
// $ vertz dev
// [vertz] Cloud mode active (proj_abc123)
// [vertz] JWKS client initialized: cloud.vtz.app/auth/v1/proj_abc123/.well-known/jwks.json
// [vertz] Auth routes proxied to cloud.vtz.app
```

The walkthrough test is written as a failing integration test in Phase 1 (RED state) using `VERTZ_CLOUD_TOKEN` and goes green by the end of the implementation.

---

## Implementation Plan

### Phase 1: Cloud Auth E2E — Config to Verified JWT

**Dependencies:** None

Thinnest vertical slice delivering working cloud auth end-to-end. A developer sets `cloud.projectId` and `VERTZ_CLOUD_TOKEN`, starts the server, and auth routes proxy to cloud with JWT verification working.

**Files:**
- `packages/compiler/src/config.ts` (modify — add `CloudConfig` type, `cloud?` to `VertzConfig` and `ResolvedConfig`)
- `packages/server/src/auth/jwks-client.ts` (new)
- `packages/server/src/auth/jwks-client.test.ts` (new)
- `packages/server/src/auth/cloud-jwt-verifier.ts` (new)
- `packages/server/src/auth/cloud-jwt-verifier.test.ts` (new)
- `packages/server/src/auth/cloud-startup.ts` (new)
- `packages/server/src/auth/cloud-startup.test.ts` (new)
- `packages/server/src/auth/cloud-proxy.ts` (new — minimal: forwards requests, sets cookies, no circuit breaker yet)
- `packages/server/src/auth/cloud-proxy.test.ts` (new)
- `packages/server/src/create-server.ts` (modify — cloud mode branching per §9)
- `packages/server/src/auth/index.ts` (modify — cloud exports)
- Integration test: developer walkthrough (RED → GREEN by end of phase)

**Phase 1 limitations:** No circuit breaker — cloud failures result in raw errors (502 for network errors). Added in Phase 2. No lifecycle callbacks. No cookie dev/prod distinction. No provider config types.

**Testing approach:** Generate RS256 key pairs with `jose.generateKeyPair('RS256')`. Use `jose.exportJWK` to create mock JWKS responses. Use `Bun.serve()` for mock cloud endpoint. `resolveCloudAuthContext` tests use `sessionPath` override to avoid touching real `~/.vertz/auth.json`.

**Acceptance Criteria:**
```typescript
describe('Feature: Cloud auth E2E — config to verified JWT', () => {
  // --- Cloud Config ---
  describe('Given defineConfig({ cloud: { projectId: "proj_xxx" } })', () => {
    it('then config includes cloud.projectId', () => {});
    it('then resolveConfig preserves cloud config as-is', () => {});
  });

  describe('Given defineConfig({}) with no cloud section', () => {
    it('then config.cloud is undefined', () => {});
  });

  // --- Project ID Validation ---
  describe('Given a valid projectId matching proj_<alphanum>', () => {
    it('then validateProjectId does not throw', () => {});
  });

  describe('Given projectId without proj_ prefix', () => {
    it('then throws with format error including expected pattern', () => {});
  });

  describe('Given empty string projectId', () => {
    it('then throws with format error', () => {});
  });

  // --- Cloud Auth Context ---
  describe('Given auth.json exists with valid token (via sessionPath)', () => {
    describe('When resolveCloudAuthContext() is called', () => {
      it('then returns { token, source: "developer-session" }', () => {});
    });
  });

  describe('Given auth.json exists but is expired/malformed', () => {
    describe('When resolveCloudAuthContext() is called', () => {
      it('then throws with "session expired or corrupted" message', () => {});
      it('then includes "vertz login" command in error', () => {});
    });
  });

  describe('Given VERTZ_CLOUD_TOKEN env var is set (no auth.json)', () => {
    describe('When resolveCloudAuthContext() is called', () => {
      it('then returns { token, source: "ci-token" }', () => {});
    });
  });

  describe('Given both auth.json and VERTZ_CLOUD_TOKEN exist', () => {
    describe('When resolveCloudAuthContext() is called', () => {
      it('then prefers VERTZ_CLOUD_TOKEN (CI takes precedence)', () => {});
    });
  });

  describe('Given no auth.json, no VERTZ_CLOUD_TOKEN', () => {
    describe('When resolveCloudAuthContext() is called', () => {
      it('then throws with prescriptive error listing options', () => {});
      it('then error message includes "vertz login" command', () => {});
      it('then error message includes VERTZ_CLOUD_TOKEN env var', () => {});
      it('then error message includes session file path', () => {});
    });
  });

  // --- JWKS Client ---
  describe('Given a JWKS endpoint URL serving an RS256 public key', () => {
    describe('When getKey is used with jwtVerify for a matching kid', () => {
      it('then resolves the CryptoKey for verification', () => {});
    });

    describe('When getKey is called within cache TTL', () => {
      it('then returns cached key without additional HTTP request', () => {});
    });

    describe('When a JWT has an unknown kid', () => {
      it('then jose triggers auto-refresh of the JWKS', () => {});
      it('then resolves if the key is found after refresh', () => {});
      it('then rejects if kid still not found after refresh', () => {});
    });

    describe('When the JWKS fetch fails and cached keys exist', () => {
      it('then uses cached keys within cooldown window', () => {});
    });

    describe('When the JWKS fetch fails and no cached keys exist', () => {
      it('then throws an error', () => {});
    });

    describe('When refresh() is called explicitly', () => {
      it('then forces a re-fetch of the JWKS', () => {});
    });
  });

  // --- Cloud JWT Verifier ---
  describe('Given a valid RS256-signed JWT with correct issuer and audience', () => {
    describe('When verify() is called', () => {
      it('then returns SessionPayload with sub, email, role, iat, exp', () => {});
    });
  });

  describe('Given an expired JWT', () => {
    describe('When verify() is called', () => {
      it('then returns null', () => {});
    });
  });

  describe('Given a JWT signed with a different private key', () => {
    describe('When verify() is called', () => {
      it('then returns null (signature mismatch)', () => {});
    });
  });

  describe('Given a JWT with wrong audience (different projectId)', () => {
    describe('When verify() is called', () => {
      it('then returns null (audience mismatch)', () => {});
    });
  });

  describe('Given a JWT missing required claims (sub, email, role)', () => {
    describe('When verify() is called', () => {
      it('then returns null', () => {});
    });
  });

  // --- Minimal Proxy ---
  describe('Given cloud mode is active', () => {
    describe('When a POST request hits /api/auth/signup', () => {
      it('then proxies to {cloudBaseUrl}/auth/v1/signup', () => {});
      it('then includes X-Vertz-Project header with projectId', () => {});
      it('then includes Authorization: Bearer header with auth token', () => {});
      it('then only forwards whitelisted headers (Cookie, Content-Type, Accept, X-Forwarded-For, User-Agent)', () => {});
    });

    describe('When cloud returns _tokens in response body', () => {
      it('then sets vertz.sid cookie (HttpOnly, SameSite=Lax)', () => {});
      it('then sets vertz.ref cookie (HttpOnly, SameSite=Lax, Path=/api/auth)', () => {});
      it('then strips _tokens from response body sent to client', () => {});
      it('then removes Content-Length header (uses chunked transfer)', () => {});
    });

    describe('When request body exceeds maxBodySize (1MB)', () => {
      it('then returns 413 Payload Too Large without proxying', () => {});
    });

    describe('When cloud fetch exceeds fetchTimeout (10s)', () => {
      it('then returns 502 Bad Gateway', () => {});
    });
  });

  // --- createServer() Integration ---
  describe('Given ServerConfig with cloud.projectId and VERTZ_CLOUD_TOKEN', () => {
    describe('When createServer() is called', () => {
      it('then resolves cloud auth context from env', () => {});
      it('then creates JWKS client targeting cloud.vtz.app/{projectId}', () => {});
      it('then creates cloud JWT verifier with issuer and audience', () => {});
      it('then creates auth proxy handler for /api/auth/* routes', () => {});
      it('then does NOT require jwtSecret', () => {});
      it('then does NOT require clientId/clientSecret on providers', () => {});
    });
  });

  describe('Given ServerConfig with cloud.projectId but no auth context', () => {
    describe('When createServer() is called', () => {
      it('then throws startup error with prescriptive message', () => {});
    });
  });
});
```

### Phase 2: Resilience + Error Handling

**Dependencies:** Phase 1

Circuit breaker for cloud proxy resilience. Error forwarding for 4xx/5xx responses.

**Files:**
- `packages/server/src/auth/circuit-breaker.ts` (new)
- `packages/server/src/auth/circuit-breaker.test.ts` (new)
- `packages/server/src/auth/circuit-breaker.test-d.ts` (new — type flow for `execute<T>`)
- `packages/server/src/auth/cloud-proxy.ts` (modify — integrate circuit breaker, add error handling)
- `packages/server/src/auth/cloud-proxy.test.ts` (modify — error handling tests)

**Acceptance Criteria:**
```typescript
describe('Feature: Circuit breaker', () => {
  describe('Given a closed circuit', () => {
    describe('When execute() is called with a successful function', () => {
      it('then returns the function result', () => {});
      it('then state remains closed', () => {});
    });
  });

  describe('Given failureThreshold consecutive failures (default: 5)', () => {
    describe('When execute() is called again', () => {
      it('then circuit opens — rejects immediately without calling fn', () => {});
      it('then getState() returns open', () => {});
      it('then rejection error includes "circuit open" message', () => {});
    });
  });

  describe('Given an open circuit', () => {
    describe('When execute() is called before resetTimeout', () => {
      it('then rejects immediately (fail-fast)', () => {});
    });

    describe('When execute() is called after resetTimeout elapses', () => {
      it('then getState() returns half-open (request-based transition)', () => {});
      it('then allows exactly one probe request (atomic flag)', () => {});
      it('then concurrent requests during probe still fail-fast', () => {});
    });

    describe('When the half-open probe succeeds', () => {
      it('then circuit closes — normal operation resumes', () => {});
      it('then failure count resets to 0', () => {});
    });

    describe('When the half-open probe fails', () => {
      it('then circuit re-opens and resetTimeout restarts', () => {});
    });
  });

  describe('Given a custom failureThreshold of 3', () => {
    it('then circuit opens after 3 consecutive failures', () => {});
  });

  describe('Given intermittent failures (success resets count)', () => {
    it('then a success between failures resets the consecutive count', () => {});
  });

  describe('Given reset() is called on an open circuit', () => {
    it('then circuit closes and counters reset', () => {});
  });
});

describe('Feature: Proxy error handling with circuit breaker', () => {
  describe('When cloud returns 400 Bad Request', () => {
    it('then forwards 400 response to client as-is', () => {});
    it('then does NOT count as circuit breaker failure', () => {});
  });

  describe('When cloud returns 401 Unauthorized', () => {
    it('then forwards 401 response to client as-is', () => {});
  });

  describe('When cloud returns 500 Internal Server Error', () => {
    it('then forwards 500 response to client', () => {});
    it('then counts as circuit breaker failure (proxy throws inside execute())', () => {});
  });

  describe('When cloud fetch throws (network error/timeout)', () => {
    it('then counts as circuit breaker failure', () => {});
    it('then returns 502 Bad Gateway', () => {});
  });

  describe('When circuit breaker is open', () => {
    it('then returns 503 with JSON { error: "auth_service_unavailable" }', () => {});
  });

  describe('When cloud returns non-JSON response (HTML error page)', () => {
    it('then passes through raw response without crashing', () => {});
  });

  describe('When Host header is sent to cloud', () => {
    it('then Host is set to cloud endpoint host, not forwarded from client', () => {});
  });
});
```

**Type flow test (`circuit-breaker.test-d.ts`):**
```typescript
import { expectTypeOf } from 'expect-type';
import { createCircuitBreaker } from './circuit-breaker';

const cb = createCircuitBreaker();

// T flows from callback return type to execute() return type
const result = await cb.execute(() => Promise.resolve(42));
expectTypeOf(result).toEqualTypeOf<number>();

const strResult = await cb.execute(() => Promise.resolve('hello'));
expectTypeOf(strResult).toEqualTypeOf<string>();

// @ts-expect-error — execute requires a function returning a Promise
cb.execute('not a function');
```

### Phase 3: Provider Config + Lifecycle + SSR

**Dependencies:** Phase 1, Phase 2 (sequential — both phases modify `cloud-proxy.ts`)

Provider factory union types for cloud mode. Lifecycle callbacks. SSR session resolution with RS256 public key verification.

**Files:**
- `packages/server/src/auth/types.ts` (modify — add `CloudOAuthProviderConfig`)
- `packages/server/src/auth/providers/github.ts` (modify — accept union config, cloud mode stubs)
- `packages/server/src/auth/providers/google.ts` (modify — accept union config, cloud mode stubs)
- `packages/server/src/auth/providers/discord.ts` (modify — accept union config, cloud mode stubs)
- `packages/server/src/auth/cloud-proxy.ts` (modify — lifecycle callbacks, cookie security)
- `packages/server/src/auth/cloud-proxy.test.ts` (modify — lifecycle + cookie tests)
- `packages/server/src/auth/resolve-session-for-ssr.ts` (modify — add `cloudVerifier` for RS256)
- `packages/server/src/auth/resolve-session-for-ssr.test.ts` (modify — RS256 tests)

**Acceptance Criteria:**
```typescript
describe('Feature: Provider config types', () => {
  describe('Given OAuthProviderConfig (self-hosted)', () => {
    it('then clientId is required', () => {});
    it('then clientSecret is required', () => {});
  });

  describe('Given CloudOAuthProviderConfig (cloud mode)', () => {
    it('then clientId is not required', () => {});
    it('then clientSecret is not required', () => {});
    it('then scopes is optional', () => {});
  });

  describe('Given github() factory in cloud mode', () => {
    it('then accepts CloudOAuthProviderConfig without credentials', () => {});
    it('then getAuthorizationUrl() throws "not available in cloud mode"', () => {});
    it('then exchangeCode() throws "not available in cloud mode"', () => {});
  });

  describe('Given github() factory in self-hosted mode', () => {
    it('then requires OAuthProviderConfig with credentials', () => {});
  });
});

describe('Feature: Proxy lifecycle callbacks', () => {
  describe('When cloud returns _lifecycle.isNewUser', () => {
    it('then fires onUserCreated callback with user data', () => {});
    it('then strips _lifecycle from response body', () => {});
  });

  describe('When cloud returns _lifecycle.rawProfile', () => {
    it('then includes raw profile in onUserCreated payload', () => {});
  });

  describe('When onUserAuthenticated callback is provided', () => {
    it('then fires with SessionPayload on every successful auth response', () => {});
  });
});

describe('Feature: Cookie security', () => {
  describe('When environment is "development"', () => {
    it('then cookies omit Secure flag (works over HTTP localhost)', () => {});
  });

  describe('When environment is "production"', () => {
    it('then cookies include Secure flag', () => {});
  });
});

describe('Feature: Proxy request headers', () => {
  describe('When a GET request hits /api/auth/me', () => {
    it('then forwards only whitelisted headers', () => {});
    it('then includes X-Vertz-Environment header', () => {});
  });
});

describe('Feature: SSR session resolution in cloud mode', () => {
  describe('Given resolveSessionForSSR with cloudVerifier', () => {
    describe('When a valid RS256 JWT is in the cookie', () => {
      it('then returns SessionPayload using cloud verifier', () => {});
    });

    describe('When an expired RS256 JWT is in the cookie', () => {
      it('then returns null', () => {});
    });

    describe('When no cookie is present', () => {
      it('then returns null', () => {});
    });
  });

  describe('Given resolveSessionForSSR with jwtSecret (backward compat)', () => {
    describe('When a valid HS256 JWT is in the cookie', () => {
      it('then returns SessionPayload using symmetric verification', () => {});
    });
  });
});
```

### Phase 4: Integration Tests + Documentation

**Dependencies:** Phases 1, 2, 3

Full E2E integration tests, developer walkthrough verification, documentation updates.

**Files:**
- Integration test suite (full E2E — developer walkthrough passing)
- `packages/docs/` (Mintlify — cloud auth guide, config reference, migration notes)
- Changeset

**Acceptance Criteria:**
```typescript
describe('Feature: Cloud mode full integration', () => {
  describe('Given ServerConfig with cloud.projectId and VERTZ_CLOUD_TOKEN', () => {
    describe('When the full auth flow runs end-to-end', () => {
      it('then signup proxies to cloud, cookies set, JWT verifiable', () => {});
      it('then signin proxies to cloud, session payload returned', () => {});
      it('then SSR resolves session via cloud verifier', () => {});
      it('then circuit breaker trips after consecutive cloud failures', () => {});
      it('then lifecycle callbacks fire on new user creation', () => {});
    });
  });

  describe('Given session management routes in cloud mode', () => {
    describe('When DELETE /api/auth/sessions/:id is proxied to cloud', () => {
      it('then forwards 501 from cloud as-is if not implemented', () => {});
    });
  });

  describe('Given ServerConfig without cloud config (backward compat)', () => {
    describe('When createServer() is called', () => {
      it('then requires clientId and clientSecret on OAuth providers', () => {});
      it('then no circuit breaker or JWKS client is created', () => {});
      it('then auth routes are handled locally (no proxy)', () => {});
    });
  });
});

describe('Feature: Developer walkthrough', () => {
  it('then developer sets cloud.projectId in vertz.config.ts', () => {});
  it('then developer sets VERTZ_CLOUD_TOKEN env var', () => {});
  it('then providers accept scopes-only config', () => {});
  it('then server starts with cloud mode active', () => {});
  it('then auth routes proxy to cloud.vtz.app', () => {});
  it('then SSR session resolution works without jwtSecret', () => {});
});
```

**Documentation deliverables:**
- Cloud Auth quickstart guide (packages/docs/)
- `cloud` config reference in defineConfig()
- Provider config changes (CloudOAuthProviderConfig)
- SSR session resolution in cloud mode
- Migration notes: self-hosted → cloud
- Cookie path note: cloud mode uses `Path=/api/auth` for `vertz.ref` (broader than self-hosted's `/api/auth/refresh`) because cloud handles refresh internally on various auth sub-routes

---

## Review Sign-Off Log

### DX Review — Approved (Rev 1)
- should-fix: Config location ambiguity → **Addressed:** Added explicit config flow documentation in API Surface §1
- should-fix: `OAuthProviderConfig` unconditional optionality → **Addressed:** Introduced `CloudOAuthProviderConfig` union — self-hosted keeps required fields
- should-fix: Startup error message format → **Addressed:** Exact error messages specified in API Surface §6

### Product/Scope Review — Changes Requested (Rev 1)
- **blocker:** Session management in cloud mode unaddressed → **Addressed:** Added as Non-Goal §7 — proxy forwards routes, cloud returns 501 if not ready
- should-fix: `OAuthProviderConfig` type safety → **Addressed:** Same as DX finding — union types
- should-fix: Rules serialization has no consumer → **Addressed:** Moved to Non-Goal §8 — will ship with deploy pipeline
- should-fix: Missing proxy error forwarding tests → **Addressed:** Added 4xx/5xx forwarding tests in Phase 2
- should-fix: Platform API dependency status → **Addressed:** Added "Platform API Dependencies" table in Non-Goals
- should-fix: Vague backward compat test → **Addressed:** Phase 4 now has specific backward compat assertions

### Technical Review — Approved (Rev 1)
- should-fix: Use `createRemoteJWKSet` from jose → **Addressed:** JWKS client now wraps jose directly (no custom layer)
- should-fix: Rules serialization keep as typed mapper → **Addressed:** Moved out of scope (Non-Goal §8)
- should-fix: Cookie `Secure` flag in dev → **Addressed:** Added dev/prod cookie tests in Phase 3

### Rev 3 Changes
- Asymmetric-only JWT. Vertical slice restructuring. 5xx contradiction resolved. Developer walkthrough added. SSR gap addressed. Documentation phase added. `.test-d.ts` added. Phase interdependencies marked.

### Rev 4 Changes (from DX / Product / Technical reviews on Rev 3)
- **DX blocker: Walkthrough fictional** → Walkthrough now uses `VERTZ_CLOUD_TOKEN` (available in Phase 1). Shows unauthenticated error state. `vertz login` noted as separate issue.
- **DX should-fix: `verifyKey` leaks jose** → Changed to `cloudVerifier?: CloudJWTVerifier` — no jose types in developer-facing API.
- **DX should-fix: Provider union tradeoff** → Acknowledged as runtime validation. Documented in Manifesto Tradeoffs.
- **DX should-fix: `onUserAuthenticated` type** → Changed from `AuthUser` to `SessionPayload` (only JWT-available fields).
- **Product blocker: `cloud` field shape conflict** → Added Unknown §3 documenting supersession of `db-backed-auth-stores.md` reservation (never implemented).
- **Product blocker: `ci-oidc` mislabel** → Changed to `'ci-token'` for `VERTZ_CLOUD_TOKEN`. GitHub OIDC exchange deferred to Non-Goal §10.
- **Product should-fix: Session 501 underdefined** → Clarified Non-Goal §7 and added 501 pass-through test in Phase 4.
- **Product should-fix: Manifesto premature** → Adjusted to "RS256 as target architecture" — Phase 1 delivers for cloud; self-hosted migration follows.
- **Product should-fix: No CB in Phase 1** → Added explicit "Phase 1 limitations" note.
- **Product should-fix: Platform API ownership** → Added owner column to dependency table.
- **Technical blocker: `createAuth()` jwtSecret bypass** → Added API Surface §9 specifying cloud mode branching in createServer().
- **Technical blocker: No body size limit** → Added `maxBodySize` (1MB) and `fetchTimeout` (10s) to proxy options.
- **Technical should-fix: `lastKnownGood` redundant** → Removed custom wrapper. jose handles caching. Reduced `cacheTtl` to 600_000 (jose default).
- **Technical should-fix: JWT issuer/audience** → Added `issuer` and `audience` parameters to `createCloudJWTVerifier`.
- **Technical should-fix: CB half-open race** → Specified request-based transition with atomic flag. 5xx counted by throwing inside `execute()`.
- **Technical should-fix: Header whitelist** → Added explicit whitelist. Specified Content-Length removal after body manipulation.
- **Technical should-fix: CloudOAuthProviderConfig stubs** → Specified cloud mode stubs that throw if called.
- **Technical should-fix: Fetch timeout** → Added `fetchTimeout` option with `AbortSignal.timeout`.
- **Technical should-fix: `resolveCloudAuthContext` sessionPath** → Added optional `sessionPath` parameter for testing.
- **Technical should-fix: Cookie path** → Documented intentional difference in Phase 4 docs deliverables.
- **Technical should-fix: createServer overload** → Addressed in §9; exact overload shape deferred to implementation.
- **Technical nit: Phase 2/3 parallel conflict** → Phase 3 now depends on Phase 1 AND Phase 2 (sequential).
- **Requires re-review** — structural changes from Rev 3 findings + all Rev 4 refinements.
