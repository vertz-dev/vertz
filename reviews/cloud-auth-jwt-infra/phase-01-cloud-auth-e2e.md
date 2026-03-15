# Phase 1: Cloud Auth E2E — Config to Verified JWT

- **Author:** Phase 1 implementation agent
- **Reviewer:** Adversarial review agent
- **Branch:** `viniciusdacal/cloud-auth-jwt-infra`
- **Date:** 2026-03-15

## Changes

- `packages/compiler/src/config.ts` (modified — added `CloudConfig` interface, `cloud?` on `VertzConfig` and `ResolvedConfig`)
- `packages/compiler/src/__tests__/config.test.ts` (modified — cloud config tests)
- `packages/server/src/auth/cloud-startup.ts` (new — project ID validation, auth context resolution)
- `packages/server/src/auth/cloud-startup.test.ts` (new)
- `packages/server/src/auth/jwks-client.ts` (new — thin jose `createRemoteJWKSet` wrapper)
- `packages/server/src/auth/jwks-client.test.ts` (new)
- `packages/server/src/auth/cloud-jwt-verifier.ts` (new — RS256 JWT verification)
- `packages/server/src/auth/cloud-jwt-verifier.test.ts` (new)
- `packages/server/src/auth/cloud-proxy.ts` (new — auth route proxy with cookies)
- `packages/server/src/auth/cloud-proxy.test.ts` (new)
- `packages/server/src/auth/circuit-breaker.ts` (new — type interface only, Phase 2 placeholder)
- `packages/server/src/auth/cloud-server-integration.test.ts` (new — E2E integration test)

## CI Status

- [ ] `dagger call ci` passed at `<pending>`

---

## Findings

### B1 (blocker): `cloud-proxy.ts` redefines `OnUserCreatedPayload` and `AuthCallbackContext` — type shadowing

**File:** `packages/server/src/auth/cloud-proxy.ts` lines 4–12

`cloud-proxy.ts` defines its own `OnUserCreatedPayload` and `AuthCallbackContext` interfaces that are structurally incompatible with the canonical ones in `packages/server/src/auth/types.ts`:

- **`cloud-proxy.ts` `OnUserCreatedPayload`:** `{ user: { id: string; email: string }; isNewUser: boolean; rawProfile?: Record<string, unknown> }`
- **`types.ts` `OnUserCreatedPayload`:** Discriminated union with `AuthUser` (includes `role`, `createdAt`, `updatedAt`, `emailVerified`) and either `provider` or `signUpData`.

- **`cloud-proxy.ts` `AuthCallbackContext`:** `{ db: unknown }`
- **`types.ts` `AuthCallbackContext`:** `{ entities: Record<string, AuthEntityProxy> }` (entity-level access)

These are incompatible types with the same name in the same package. When Phase 3 wires up lifecycle callbacks, the `onUserCreated` callback signature on `createAuthProxy` will be type-incompatible with the one on `AuthConfig`. The developer cannot reuse the same callback for both self-hosted and cloud modes.

**Fix:** Remove the dead interfaces from `cloud-proxy.ts` now (they are unused in Phase 1). Import from `types.ts` when Phase 3 adds the actual implementation.

---

### B2 (blocker): `create-server.ts` and `auth/index.ts` NOT modified — missing cloud mode wiring

**Files:** `packages/server/src/create-server.ts`, `packages/server/src/auth/index.ts`

The design doc Phase 1 file list explicitly includes:
- `packages/server/src/create-server.ts` (modify — cloud mode branching per §9)
- `packages/server/src/auth/index.ts` (modify — cloud exports)

Neither file was modified. `create-server.ts` has zero mentions of "cloud" anywhere. This means:

1. Cloud mode branching in `createServer()` is not implemented — no code path creates JWKS client, cloud JWT verifier, and auth proxy when `config.cloud?.projectId` is set.
2. Cloud modules are not re-exported from `@vertz/server/auth` — consumers must use deep imports.

The following Phase 1 acceptance criteria are **unmet**:
- "then resolves cloud auth context from env"
- "then creates JWKS client targeting cloud.vtz.app/{projectId}"
- "then creates cloud JWT verifier with issuer and audience"
- "then creates auth proxy handler for /api/auth/* routes"
- "then does NOT require jwtSecret"
- "then does NOT require clientId/clientSecret on providers"
- "then logs which auth source was resolved"

The integration test (`cloud-server-integration.test.ts`) manually wires the chain, proving individual modules work together, but it does NOT test `createServer()` integration.

**Fix:** Implement cloud mode branching in `create-server.ts` and add re-exports in `auth/index.ts`. Add tests for `createServer({ cloud: { projectId: 'proj_xxx' } })`.

---

### B3 (blocker): `as unknown as` double-cast in `cloud-jwt-verifier.ts` violates `no-double-cast` Biome rule

**File:** `packages/server/src/auth/cloud-jwt-verifier.ts` line 36

```typescript
return payload as unknown as SessionPayload;
```

The project's Biome config includes the `no-double-cast` GritQL plugin (`biome-plugins/no-double-cast.grit`). The project rules state: "Never skip linting rules — fix the code, not the rule."

Beyond the lint violation, this double-cast is a type safety gap: it maps ALL jose JWT payload fields into `SessionPayload` without filtering, meaning unexpected claims could leak into the session payload object.

**Fix:** Construct the `SessionPayload` explicitly from validated fields:

```typescript
return {
  sub: payload.sub,
  email: payload.email as string,
  role: payload.role as string,
  jti: payload.jti as string,
  sid: payload.sid as string,
  iat: payload.iat!,
  exp: payload.exp!,
} satisfies SessionPayload;
```

---

### S1 (should-fix): Missing test for `_lifecycle` stripping in proxy response

**File:** `packages/server/src/auth/cloud-proxy.test.ts`

`cloud-proxy.ts` lines 136–138 strip `_lifecycle` from the response body:

```typescript
if (responseBody && '_lifecycle' in responseBody) {
  delete responseBody._lifecycle;
}
```

There is no test for this behavior. While lifecycle processing is Phase 3, the stripping is implemented in Phase 1 code and should be tested to prevent regression.

**Fix:** Add a test:

```typescript
it('strips _lifecycle from response body', async () => {
  mockResponse = {
    status: 200,
    body: { user: { id: 'u1' }, _lifecycle: { isNewUser: true } },
  };
  const proxy = createProxy();
  const req = new Request(`${cloudBaseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const res = await proxy(req);
  const body = await res.json();
  expect(body._lifecycle).toBeUndefined();
  expect(body.user.id).toBe('u1');
});
```

---

### S2 (should-fix): Missing test for Host header set to cloud endpoint

**File:** `packages/server/src/auth/cloud-proxy.test.ts`

`cloud-proxy.ts` lines 77–78 set the `Host` header to the cloud endpoint host:

```typescript
const cloudHost = new URL(cloudBaseUrl).host;
headers.set('Host', cloudHost);
```

The design doc acceptance criteria explicitly require: "Host is set to cloud endpoint host, not forwarded from client." This code is implemented in Phase 1 and has no test.

**Fix:** Add a test verifying `lastRequest.headers['host']` equals the cloud server's host, not the client's original `Host` header.

---

### S3 (should-fix): Missing JWKS acceptance criteria tests — fetch failure scenarios

**File:** `packages/server/src/auth/jwks-client.test.ts`

The design doc Phase 1 acceptance criteria include:

- "When the JWKS fetch fails and cached keys exist — then uses cached keys within cooldown window"
- "When the JWKS fetch fails and no cached keys exist — then throws an error"
- "When a JWT has an unknown kid — then resolves if the key is found after refresh"

None of these are tested. The JWKS client test covers happy path (key resolution, caching, refresh) but does not cover failure modes. The jose library handles these internally, but since the JWKS client is a critical security component, these behaviors should have explicit tests.

**Fix:** Add tests that:
1. Stop the mock server mid-test, verify verification still works with cached keys within cooldown.
2. Create a client pointing at a non-existent URL, verify it throws.
3. Rotate the key on the JWKS endpoint and verify auto-refresh resolves the new key.

---

### S4 (should-fix): Missing test for query string preservation in proxy URL construction

**File:** `packages/server/src/auth/cloud-proxy.ts` line 63, `packages/server/src/auth/cloud-proxy.test.ts`

The proxy constructs the cloud URL as:

```typescript
const cloudUrl = `${cloudBaseUrl}/auth/v1${authPath}${url.search}`;
```

The `url.search` preserves query parameters (e.g., `/api/auth/oauth/callback?code=xxx&state=yyy`). This is critical for OAuth callback flows. There is no test for query string preservation.

**Fix:** Add a test that includes query parameters in the request URL and verifies they arrive at the cloud endpoint via `lastRequest.url` or by inspecting the full URL.

---

### S5 (should-fix): `cloud-jwt-verifier.ts` silent null return loses error context

**File:** `packages/server/src/auth/cloud-jwt-verifier.ts` line 37

```typescript
} catch {
  return null;
}
```

All verification errors (expired, wrong signature, wrong audience, wrong issuer, network failure, JWKS endpoint unreachable) are silently mapped to `null`. This makes debugging production issues extremely difficult. There is no way for the caller to distinguish "invalid token" (expected, user error) from "JWKS endpoint down" (infrastructure failure, needs alerting).

**Fix:** Catch specific jose error types. Return `null` for `JWSSignatureVerificationFailed`, `JWTExpired`, `JWTClaimValidationFailed`. Re-throw or log for infrastructure errors (`JWKSTimeout`, `JWKSNoMatchingKey` after exhausting refresh, network errors).

---

### S6 (should-fix): `as unknown as` double-cast in `jwks-client.ts`

**File:** `packages/server/src/auth/jwks-client.ts` line 25

```typescript
const jwksAny = jwks as unknown as { reload?: () => void };
```

Same `no-double-cast` Biome rule concern as B3. The design doc acknowledges this jose `@ignore` coupling and recommends the runtime type check approach.

**Fix:** Use duck-typing without double-cast:

```typescript
if ('reload' in jwks && typeof (jwks as { reload: unknown }).reload === 'function') {
  (jwks as { reload: () => void }).reload();
}
```

---

### S7 (should-fix): `cloud-startup.ts` — `expiresAt` validation does not check type

**File:** `packages/server/src/auth/cloud-startup.ts` line 42

```typescript
if (data.expiresAt && data.expiresAt < Date.now()) {
```

If `data.expiresAt` is a string (e.g., ISO date like `"2026-03-01T00:00:00Z"`), JavaScript's `<` comparison coerces the string to a number. `"2026-03-01T00:00:00Z" < Date.now()` evaluates `NaN < <number>` which is `false` — meaning an expired session with a string timestamp would be treated as valid. A corrupted or hand-edited `auth.json` could bypass expiration.

**Fix:** Add a type check: `if (typeof data.expiresAt === 'number' && data.expiresAt < Date.now())`. Or validate that `expiresAt` is a number and throw if it is not.

---

### N1 (nit): Integration test file name is misleading

**File:** `packages/server/src/auth/cloud-server-integration.test.ts`

The name "cloud-server-integration" suggests it tests `createServer()` integration, but it only tests the module-level chain (JWKS client + verifier + proxy wired together manually). Consider renaming to `cloud-auth-chain.test.ts` or `cloud-auth-e2e.test.ts` to reflect what it actually tests.

---

### N2 (nit): `validateProjectId` has no max length

**File:** `packages/server/src/auth/cloud-startup.ts` line 10

The regex `/^proj_[a-zA-Z0-9]+$/` has no upper bound on length. A very large string matching the pattern would pass validation. Adding a max length (e.g., 128 chars) would be defensive.

---

### N3 (nit): Missing test for `auth.json` with valid JSON but missing `token` field

**File:** `packages/server/src/auth/cloud-startup.test.ts`

There is a test for malformed JSON (`'not json {{{'`) but no test for valid JSON without a `token` field, e.g., `{ "expiresAt": 9999999999999 }`. This exercises the `throw new Error('missing token')` path on line 39 of `cloud-startup.ts`, caught by the outer catch on line 47. The behavior would work, but it is not explicitly tested.

---

## Acceptance Criteria Coverage

### Phase 1 design doc criteria — TESTED (34 criteria):

All individual module behaviors: config pass-through, project ID validation, auth context resolution (all 8 scenarios), JWKS key resolution + caching + refresh + unknown kid rejection, JWT verification (valid / expired / wrong-sig / wrong-aud / missing-claims), proxy routing + headers + cookies + cookie security + body size limit + timeout + non-JSON passthrough + 4xx forwarding + Content-Length removal + _tokens stripping, backward compat (tree-shakeability), E2E integration chain.

### Phase 1 design doc criteria — NOT TESTED (12 criteria):

- `createServer()` cloud mode branching (7 sub-criteria) — **B2**
- `createServer()` with both auth sources — CI precedence + warning log
- `createServer()` without auth context — startup error
- JWKS fetch failure with cached keys (cooldown fallback) — **S3**
- JWKS fetch failure without cached keys (throws) — **S3**
- JWKS auto-refresh on unknown kid that resolves after refresh — **S3**
- `_lifecycle` stripping from response body — **S1**
- Host header set to cloud endpoint — **S2**
- Query string preservation in proxy URL — **S4**

---

## Resolution

**Changes requested.** Three blockers (B1, B2, B3) and seven should-fix items (S1–S7) must be addressed before this phase can proceed to review sign-off.
