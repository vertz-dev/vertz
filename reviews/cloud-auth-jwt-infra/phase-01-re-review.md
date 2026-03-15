# Phase 1 Re-Review: Cloud Auth E2E Fixes

- **Author:** Phase 1 implementation agent
- **Reviewer:** Re-review agent
- **Date:** 2026-03-15

## Original Findings Status

### B1 (blocker): `cloud-proxy.ts` redefines `OnUserCreatedPayload` and `AuthCallbackContext`

**Status: FIXED.**

`cloud-proxy.ts` no longer contains `OnUserCreatedPayload` or `AuthCallbackContext`. The file is now 146 lines, purely functional: it exports `createAuthProxy()` with one import (`CircuitBreaker` type). No type shadowing risk remains.

---

### B2 (blocker): `create-server.ts` missing cloud mode branching, `auth/index.ts` missing exports

**Status: FIXED.**

1. **`create-server.ts`** now has a `CloudServerConfig` interface (line 65), a function overload `createServer(config: ServerConfig & { cloud: CloudServerConfig }): ServerInstance` (line 185), and a full cloud mode branching block (lines 314-473) that:
   - Validates `projectId` via `validateProjectId()`
   - Resolves cloud auth context via `resolveCloudAuthContext()`
   - Creates JWKS client, cloud JWT verifier, and auth proxy
   - Builds a `cloudAuth: AuthInstance` with stub API methods that throw descriptive errors
   - Implements `resolveSessionForSSR()` using the cloud JWT verifier
   - Wires `requestHandler` to route `/api/auth/*` to the proxy and everything else to the entity handler
   - Warns when both `cloud` and `auth` configs are set
   - Guards against non-`/api` prefixes

2. **`auth/index.ts`** now re-exports (lines 2559-2602):
   - `CloudJWTVerifier` (type), `createCloudJWTVerifier`
   - `createAuthProxy`
   - `CloudAuthContext` (type), `resolveCloudAuthContext`, `validateProjectId`
   - `JWKSClient` (type), `createJWKSClient`

3. **`index.ts`** (package entry) re-exports all cloud types and functions (lines 81-108, 188-233), including `CloudServerConfig` (line 240).

4. **`cloud-create-server.test.ts`** (275 lines) covers all previously untested acceptance criteria:
   - Returns `ServerInstance` without `jwtSecret` or auth config
   - Routes `/api/auth/*` to cloud proxy
   - Sets JWT in `vertz.sid` cookie
   - `resolveSessionForSSR` verifies JWT via cloud JWKS
   - `resolveSessionForSSR` returns null for missing cookie
   - Does not require `clientId`/`clientSecret` on providers
   - Logs which auth source was resolved
   - Warns when both cloud and auth configs are set
   - Throws prescriptive error when no auth context exists
   - Throws on invalid project ID format
   - Routes non-auth requests to entity handler

---

### B3 (blocker): `as unknown as SessionPayload` double-cast in `cloud-jwt-verifier.ts`

**Status: FIXED.**

Line 37-49 now constructs the `SessionPayload` explicitly from validated fields:

```typescript
return {
  sub: payload.sub,
  email: payload.email as string,
  role: payload.role as string,
  jti: payload.jti as string,
  sid: payload.sid as string,
  iat: payload.iat!,
  exp: payload.exp!,
  ...(typeof payload.tenantId === 'string' ? { tenantId: payload.tenantId } : {}),
  ...(payload.claims && typeof payload.claims === 'object'
    ? { claims: payload.claims as Record<string, unknown> }
    : {}),
} satisfies SessionPayload;
```

No `as unknown as` anywhere in the file. The `satisfies` ensures compile-time validation against `SessionPayload`. The explicit field picks prevent unexpected JWT claims from leaking into the session payload.

---

### S1 (should-fix): Missing test for `_lifecycle` stripping

**Status: FIXED.**

`cloud-proxy.test.ts` lines 346-361: test `'strips _lifecycle from response body'` verifies that `_lifecycle` is removed and other fields (`user.id`) are preserved.

---

### S2 (should-fix): Missing test for Host header set to cloud endpoint

**Status: FIXED.**

`cloud-proxy.test.ts` lines 365-376: test `'sets Host header to cloud endpoint host, not client Host'` sends a request with `Host: my-local-app.dev` and verifies `lastRequest.headers['host']` equals the cloud server's host.

---

### S3 (should-fix): Missing JWKS failure scenario tests

**Status: FIXED.**

`jwks-client.test.ts` now includes:
- Line 86-97: `'rejects when kid is not found after refresh'` — unknown kid test
- Line 99-109: `'throws when JWKS endpoint is unreachable and no cached keys exist'` — uses `http://127.0.0.1:1` (port 1 is guaranteed to refuse connections)
- Line 111-152: `'resolves key after refresh when a new kid appears on the JWKS endpoint'` — key rotation test with a rotating mock server
- Line 154-187: `'forces a re-fetch on next verification after refresh() is called'` — verifies `requestCount` increases after `refresh()`

---

### S4 (should-fix): Missing test for query string preservation

**Status: FIXED.**

`cloud-proxy.test.ts` lines 380-389: test `'preserves query parameters in proxied URL'` sends a request to `/api/auth/oauth/callback?code=abc123&state=xyz` and verifies `lastRequest.url` is `/auth/v1/oauth/callback` with `lastRequest.search` being `?code=abc123&state=xyz`.

---

### S5 (should-fix): Silent null return loses error context in JWT verifier

**Status: FIXED.**

`cloud-jwt-verifier.ts` lines 50-57 now differentiate between validation errors and infrastructure errors:

```typescript
} catch (error: unknown) {
  if (isJwtValidationError(error)) {
    return null;
  }
  throw error;
}
```

The `isJwtValidationError()` helper (lines 63-74) checks for jose error codes: `ERR_JWT_EXPIRED`, `ERR_JWS_SIGNATURE_VERIFICATION_FAILED`, `ERR_JWT_CLAIM_VALIDATION_FAILED`, `ERR_JWK_NOT_FOUND`. Infrastructure errors (JWKS endpoint down, network errors) are re-thrown.

---

### S6 (should-fix): `as unknown as` double-cast in `jwks-client.ts`

**Status: FIXED.**

`jwks-client.ts` lines 25-27 now use duck-typing without double-cast:

```typescript
if ('reload' in jwks && typeof (jwks as { reload: unknown }).reload === 'function') {
  (jwks as { reload: () => void }).reload();
}
```

No `as unknown as` anywhere in the file. The `as { reload: unknown }` and `as { reload: () => void }` are single-level casts, which the `no-double-cast` rule permits.

---

### S7 (should-fix): `expiresAt` validation does not check type

**Status: FIXED.**

`cloud-startup.ts` line 42:

```typescript
if (typeof data.expiresAt === 'number' && data.expiresAt < Date.now()) {
```

The `typeof` guard ensures string timestamps (which would produce `NaN < Date.now()` = `false`) are not evaluated. A test confirms this (line 149-161 in `cloud-startup.test.ts`): `'treats string expiresAt as non-expired (type guard rejects non-number)'`.

---

### N1 (nit): Integration test file name is misleading

**Status: NOT ADDRESSED (acceptable).**

`cloud-server-integration.test.ts` still exists with its original name. However, the new `cloud-create-server.test.ts` now tests the actual `createServer()` integration, making the naming distinction clear: "integration" = module chain test, "create-server" = `createServer()` wiring test. This is acceptable.

---

### N2 (nit): `validateProjectId` has no max length

**Status: NOT ADDRESSED (acceptable).**

The regex `/^proj_[a-zA-Z0-9]+$/` still has no upper bound. This is a nit and the risk is minimal — the project ID comes from the developer's config, not from user input.

---

### N3 (nit): Missing test for `auth.json` with valid JSON but missing `token` field

**Status: FIXED.**

`cloud-startup.test.ts` lines 163-170: test `'throws when auth.json has valid JSON but missing token field'` writes `{ expiresAt: ... }` (no `token` field) and verifies it throws with `session expired or corrupted`.

---

## New Findings

### N4 (nit): `payload.iat!` and `payload.exp!` non-null assertions in `cloud-jwt-verifier.ts`

**File:** `packages/server/src/auth/cloud-jwt-verifier.ts` lines 43-44

```typescript
iat: payload.iat!,
exp: payload.exp!,
```

These non-null assertions assume `iat` and `exp` are always present in the verified JWT payload. While `jwtVerify` from jose does not guarantee `iat` or `exp` unless you set `requireAudience`/`requiredClaims`, the `exp` claim IS validated by default (jose rejects expired tokens), so `exp` will always be present if verification succeeds. The `iat` claim is set by `setIssuedAt()` in the signing code, but jose does not validate its presence.

In practice, the cloud-issued JWTs will always have both claims, and the `algorithms: ['RS256']` option ensures the token structure is well-formed. The risk is theoretical: a cloud-issued JWT without `iat` would produce `iat: undefined` which becomes `NaN` in the SessionPayload. This is low-risk since the cloud controls token issuance.

**Recommendation:** Consider adding `typeof payload.iat === 'number'` and `typeof payload.exp === 'number'` to the required claims validation (lines 26-34), next to the existing `sub`/`email`/`role`/`jti`/`sid` checks. This would make the non-null assertions safe by construction. Not a blocker.

---

### N5 (nit): No test for `isJwtValidationError` re-throw behavior in `cloud-jwt-verifier.test.ts`

**File:** `packages/server/src/auth/cloud-jwt-verifier.test.ts`

The S5 fix adds differentiated error handling: validation errors return `null`, infrastructure errors are re-thrown. The existing tests cover validation errors (expired, wrong signature, wrong audience, missing claims all return `null`). However, there is no test verifying that an infrastructure error (e.g., JWKS endpoint unreachable) is actually re-thrown from `verifier.verify()`.

The `jwks-client.test.ts` does cover JWKS endpoint unreachability (line 99-109), but that tests the JWKS client in isolation, not through the verifier's `catch` branch. The verifier's error classification logic (`isJwtValidationError`) is the code that needs coverage — the test should verify that a network error thrown during key resolution propagates as a thrown error, not a silent `null`.

**Recommendation:** Add a test that creates a verifier with a JWKS client pointing to an unreachable URL and verifies `verifier.verify(jwt)` rejects (throws), not resolves to `null`. Not a blocker for Phase 1, but should be added before Phase 2.

---

### N6 (nit): `resolveSessionForSSR` does not propagate `tenantId` test coverage

**File:** `packages/server/src/auth/cloud-create-server.test.ts`

The `resolveSessionForSSR` implementation in `create-server.ts` (lines 426-428) conditionally includes `tenantId` on the user object:

```typescript
if (payload.tenantId) {
  user.tenantId = payload.tenantId;
}
```

There is no test in `cloud-create-server.test.ts` that signs a JWT with a `tenantId` claim and verifies it appears on `result.session.user.tenantId`. The cloud JWT verifier correctly extracts `tenantId` (line 45 in `cloud-jwt-verifier.ts`), but the end-to-end flow through `resolveSessionForSSR` is untested for this field.

**Recommendation:** Add a test that signs a JWT with `tenantId: 'tenant_abc'` and verifies it flows through to the session user. Not a blocker.

---

## Resolution

**Approved.** All 3 blockers (B1, B2, B3) and all 7 should-fix items (S1-S7) are properly addressed. The fixes are well-implemented:

- Type safety is maintained throughout (no double-casts, explicit field construction with `satisfies`)
- Error handling is properly differentiated (validation vs infrastructure errors)
- Test coverage is comprehensive for the new `createServer()` cloud mode branching
- Re-exports are correctly wired through `auth/index.ts` and `index.ts`

The 3 new nits (N4, N5, N6) are minor and do not block Phase 1. N5 (infrastructure error re-throw test) should be prioritized in Phase 2 since it validates a security-relevant code path.
