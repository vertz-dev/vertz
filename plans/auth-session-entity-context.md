# Auth Session → Entity Context Auto-Wiring

**Issue:** [#1658](https://github.com/vertz-dev/vertz/issues/1658)
**Status:** Design

## Current State

The issue describes five acceptance criteria. Three are already implemented:

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `createServer()` with auth config automatically wires session data into entity context | Done — `createAuthSessionMiddleware` auto-wired in `create-server.ts:505` |
| 2 | Entity handlers receive `ctx.userId`, `ctx.tenantId`, `ctx.roles` from JWT payload | Done — `session-middleware.ts` maps session fields to context |
| 3 | No manual middleware needed by app developers | Done — auto-wired when both `db` and `auth` are provided |
| 4 | Works with both cookie-based sessions and Bearer token auth | **Not done** — `getSession()` only reads cookies |
| 5 | Test: entity handler receives correct userId/tenantId from authenticated request | **Not done** — no integration test for the full flow |

**This design addresses criteria 4 and 5 only.**

## Problem

`getSession()` in `packages/server/src/auth/index.ts` only reads session cookies. It does not check `Authorization: Bearer <token>` headers. This means API clients, mobile apps, CLI tools, and service-to-service calls that use Bearer tokens get `ctx.userId === null`, causing access rules to reject requests.

Additionally, there is no integration test validating the full auth → session middleware → entity handler flow.

## API Surface

### Before (cookie only)

```typescript
// getSession() in packages/server/src/auth/index.ts
async function getSession(headers: Headers): Promise<Result<Session | null, AuthError>> {
  const cookieName = cookieConfig.name || 'vertz.sid';
  const cookieEntry = headers
    .get('cookie')
    ?.split(';')
    .find((c) => c.trim().startsWith(`${cookieName}=`));
  const token = cookieEntry ? cookieEntry.trim().slice(`${cookieName}=`.length) : undefined;

  if (!token) {
    return ok(null); // <-- Bearer token requests silently fail here
  }
  // ... JWT verification
}
```

### After (cookie + Bearer)

```typescript
async function getSession(headers: Headers): Promise<Result<Session | null, AuthError>> {
  const cookieName = cookieConfig.name || 'vertz.sid';

  // 1. Try cookie first (browser-based auth)
  const cookieEntry = headers
    .get('cookie')
    ?.split(';')
    .find((c) => c.trim().startsWith(`${cookieName}=`));
  let token = cookieEntry ? cookieEntry.trim().slice(`${cookieName}=`.length) : undefined;

  // 2. Fall back to Authorization: Bearer <token>
  if (!token) {
    const authHeader = headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) {
    return ok(null);
  }
  // ... JWT verification (unchanged)
}
```

Note: `.trim()` after `slice(7)` handles edge cases like `Bearer  <token>` (extra whitespace).

### Developer experience (unchanged)

```typescript
// No change for app developers — createServer() auto-wires everything
const server = createServer({
  db: createDb({ ... }),
  auth: {
    session: { strategy: 'jwt', ttl: '1h', refreshTtl: '7d' },
    privateKey: PRIVATE_KEY,
    publicKey: PUBLIC_KEY,
  },
  entities: [tasksEntity],
});

// Entity handler automatically receives auth context
// Works with both cookie-based and Bearer token requests
```

## Manifesto Alignment

- **"If it builds, it works"** — No new types or API surface; the change is internal to `getSession()`. Existing type contracts remain identical.
- **"One way to do things"** — Developers don't configure Bearer support; it's automatic. Cookie takes priority (browser), Bearer is the fallback (API clients). One mechanism, two transport layers.
- **"AI agents are first-class users"** — An LLM generating API client code can use `Authorization: Bearer` without special configuration. The obvious approach just works.
- **"Production-ready by default"** — Bearer token auth is table stakes for any production API. Not supporting it creates a foot-gun for any non-browser consumer.

## Non-Goals

- **Custom token extraction strategies** — We won't add pluggable token extractors. Cookie + Bearer covers the standard cases. If someone needs a custom header, they can write a middleware.
- **Token type differentiation** — We won't distinguish between "cookie session" and "bearer session" in the entity context. Both resolve to the same JWT and produce the same `ctx.userId`/`ctx.tenantId`/`ctx.roles`.
- **API key support** — API keys are a different auth mechanism (not JWT-based). Out of scope.
- **Changes to `resolveSessionForSSR`** — SSR session resolution is browser-only in the current browser-rendering model (reads cookies for hydration hints). Bearer tokens don't apply to SSR.
- **HTTP token issuance endpoint** — Bearer support enables server-to-server and programmatic SDK use (where callers have access to `api.signIn()` return values), but this design does not add a dedicated HTTP endpoint that returns raw JWTs in the response body. If needed, that's a separate feature.
- **Refresh tokens for Bearer-only clients** — `refreshSession()` reads from the `vertz.ref` cookie independently. Bearer-only clients (no cookies) cannot refresh sessions via the current HTTP API. This is a known limitation tracked separately.

## Unknowns

### JWT issuer/audience claims (pre-existing)

`createJWT()` does not set an `iss` (issuer) or `aud` (audience) claim, and `verifyJWT()` does not validate them. With cookie-only auth, the cookie's `Domain`/`Path` attributes provide natural scoping. Bearer tokens have no such boundary — a JWT from staging could theoretically be used in production if the same key pair is used.

**This is a pre-existing gap, not introduced by this PR.** However, adding Bearer support increases exposure. A follow-up issue should be filed to add `iss`/`aud` validation. The RS256 key pair still provides strong protection — tokens signed with a different key are rejected.

## Auth Failure Behavior for Bearer Requests

Bearer requests with invalid, expired, or revoked JWTs receive unauthenticated context (`ctx.userId === null`), the same behavior as invalid cookies. The entity access rules then determine the outcome (typically 403).

This means API clients don't get an explicit `401 Unauthorized` from the session middleware — they get a downstream `403 Forbidden` from the access rules. This matches the current cookie behavior and is acceptable for v0.x. Explicit `401` responses for API clients could be added later as a separate concern.

## Type Flow Map

No new generics introduced. The existing flow is unchanged:

```
getSession(headers) → Result<Session | null>
                              ↓
createAuthSessionMiddleware → { userId, tenantId, roles }
                              ↓
extractRequestInfo(ctx) → EntityRequestInfo { userId, tenantId, roles }
                              ↓
createEntityContext(request) → EntityContext { userId, tenantId, authenticated(), ... }
```

The only change is that `getSession()` can now extract the JWT from `Authorization: Bearer` in addition to cookies. The return type is identical.

## E2E Acceptance Test

### Unit: Bearer token extraction in getSession

```typescript
describe('Given a request with Authorization: Bearer header', () => {
  describe('When getSession is called via the session middleware', () => {
    it('Then returns userId, tenantId, and roles from the JWT payload', async () => {
      const mw = createAuthSessionMiddleware(api);
      const result = await mw.handler({
        raw: {
          headers: new Headers({
            Authorization: `Bearer ${validJwt}`,
          }),
        },
      });
      expect(result).toEqual({
        userId: 'user-1',
        tenantId: 'tenant-abc',
        roles: ['user'],
        user: expect.any(Object),
        session: expect.any(Object),
      });
    });
  });
});
```

### Unit: Cookie takes priority over Bearer

```typescript
describe('Given a request with both cookie and Bearer header', () => {
  it('Then cookie session takes priority', async () => {
    const mw = createAuthSessionMiddleware(api);
    const result = await mw.handler({
      raw: {
        headers: new Headers({
          Cookie: `vertz.sid=${cookieJwt}`,
          Authorization: `Bearer ${bearerJwt}`,
        }),
      },
    });
    // Should use cookie user, not bearer user
    expect(result.userId).toBe('cookie-user-id');
  });
});
```

### Runtime: Non-Bearer auth scheme (should NOT authenticate)

```typescript
describe('Given Authorization header without Bearer prefix', () => {
  it('Then returns empty (unauthenticated)', async () => {
    const result = await mw.handler({
      raw: { headers: new Headers({ Authorization: 'Basic abc123' }) },
    });
    expect(result).toEqual({});
  });
});
```

## Implementation Plan

### Phase 1: Bearer token support in `getSession()`

**Files:**
- `packages/server/src/auth/index.ts` — Add Bearer fallback in `getSession()`
- `packages/server/src/auth/__tests__/session-middleware.test.ts` — Add Bearer token tests

**Acceptance criteria:**
```typescript
describe('Feature: Bearer token auth in session middleware', () => {
  describe('Given a valid JWT in Authorization: Bearer header', () => {
    describe('When the session middleware processes the request', () => {
      it('Then returns userId, tenantId, and roles from JWT', () => {});
    });
  });

  describe('Given both a cookie and a Bearer header', () => {
    describe('When the session middleware processes the request', () => {
      it('Then cookie takes priority over Bearer', () => {});
    });
  });

  describe('Given an Authorization header without Bearer prefix', () => {
    describe('When the session middleware processes the request', () => {
      it('Then returns empty object (unauthenticated)', () => {});
    });
  });

  describe('Given an Authorization: Bearer header with an invalid JWT', () => {
    describe('When the session middleware processes the request', () => {
      it('Then returns empty object (unauthenticated)', () => {});
    });
  });

  describe('Given an Authorization: Bearer header with an expired JWT', () => {
    describe('When the session middleware processes the request', () => {
      it('Then returns empty object (unauthenticated)', () => {});
    });
  });

  describe('Given an empty Bearer token (Authorization: Bearer )', () => {
    describe('When the session middleware processes the request', () => {
      it('Then returns empty object (unauthenticated)', () => {});
    });
  });

  describe('Given a whitespace-only Bearer token (Authorization: Bearer   )', () => {
    describe('When the session middleware processes the request', () => {
      it('Then returns empty object (unauthenticated)', () => {});
    });
  });

  describe('Given a Bearer token with extra whitespace before it', () => {
    describe('When the session middleware processes the request', () => {
      it('Then trims and resolves the token correctly', () => {});
    });
  });

  describe('Given a Bearer token for a revoked session', () => {
    describe('When the session middleware processes the request', () => {
      it('Then returns empty object (unauthenticated)', () => {});
    });
  });
});
```

### Phase 2: Integration test — full auth → entity context flow

**Files:**
- `packages/integration-tests/src/__tests__/auth-session-entity-context.test.ts` — New integration test

**Acceptance criteria:**
```typescript
describe('Feature: Auth session auto-wiring into entity context', () => {
  describe('Given a server with auth and a tenant-scoped entity', () => {
    describe('When an authenticated request hits the entity API (cookie)', () => {
      it('Then the entity handler receives correct ctx.userId from session', () => {});
      it('Then the entity handler receives correct ctx.tenantId from session', () => {});
      it('Then tenant-scoped queries filter by ctx.tenantId', () => {});
    });

    describe('When an authenticated request hits the entity API (Bearer token)', () => {
      it('Then the entity handler receives correct ctx.userId from Bearer JWT', () => {});
      it('Then the entity handler receives correct ctx.tenantId from Bearer JWT', () => {});
      it('Then tenant-scoped queries filter by ctx.tenantId (Bearer)', () => {});
    });

    describe('When an unauthenticated request hits a protected entity API', () => {
      it('Then the request is rejected (403)', () => {});
    });

    describe('When a Bearer-authenticated request hits GET /api/auth/session', () => {
      it('Then returns the session data (validates auth routes work with Bearer)', () => {});
    });
  });
});
```
