# SSR ProtectedRoute Redirect

**Issue:** [#1248](https://github.com/vertz-dev/vertz/issues/1248)
**Status:** Draft
**Date:** 2026-03-14

## Problem

`ProtectedRoute` currently only redirects on the client side via `domEffect()`. During SSR, auth status stays at `'idle'` (the `AuthProvider` hydration block is guarded by `isBrowser()`), so `ProtectedRoute` renders the fallback. The client hydrates, discovers the user is unauthenticated, and performs a client-side `router.navigate()` — causing a visible flash of fallback content.

## API Surface

### No new public API for application developers

The fix is transparent. If you configure `sessionResolver` on `createBunDevServer()` or `createSSRHandler()`, `ProtectedRoute` SSR redirects happen automatically. No code changes in user apps.

### Internal API changes

#### 1. `SSRRenderContext` — new fields

```ts
// packages/ui/src/ssr/ssr-render-context.ts
export interface SSRRenderContext {
  url: string; // NOTE: changed to include search params (was pathname-only)
  // ... existing fields ...

  /**
   * Auth state resolved from the request before SSR rendering.
   * When present, AuthProvider hydrates from this during SSR
   * instead of staying at 'idle'. Enables ProtectedRoute to
   * determine redirect during SSR.
   *
   * undefined = session resolver not configured or resolver threw (auth unknown)
   */
  ssrAuth?:
    | { status: 'authenticated'; user: { id: string; email: string; role: string; [key: string]: unknown }; expiresAt: number }
    | { status: 'unauthenticated' };

  /** Redirect signal written by ProtectedRoute during SSR. */
  ssrRedirect?: { to: string };
}
```

The `url` field is changed to include the search string (e.g., `/admin?tab=settings` instead of just `/admin`). This ensures `returnTo` preserves query params, matching client-side behavior (`window.location.pathname + window.location.search`).

#### 2. `SSRRenderResult` — new `redirect` field

```ts
// packages/ui-server/src/ssr-render.ts
export interface SSRRenderResult {
  html: string;
  css: string;
  ssrData: Array<{ key: string; data: unknown }>;
  headTags: string;
  discoveredRoutes?: string[];

  /** SSR redirect signal. When present, the server should return a 302 instead of HTML. */
  redirect?: { to: string };
}
```

#### 3. `ssrRenderToString()` — new `ssrAuth` option

```ts
export async function ssrRenderToString(
  module: SSRModule,
  url: string,
  options?: {
    ssrTimeout?: number;
    fallbackMetrics?: Record<string, FontFallbackMetrics>;
    /** Auth state from session resolver, passed to SSRRenderContext. */
    ssrAuth?: SSRRenderContext['ssrAuth'];
  },
): Promise<SSRRenderResult>
```

#### 4. `AuthProvider` — SSR hydration from context

```ts
// packages/ui/src/auth/auth-context.ts — AuthProvider constructor
if (isBrowser()) {
  // ... existing browser hydration ...
} else {
  // SSR — hydrate from request context if available
  const ssrCtx = getSSRContext();
  if (ssrCtx?.ssrAuth) {
    if (ssrCtx.ssrAuth.status === 'authenticated') {
      userSignal.value = ssrCtx.ssrAuth.user;
      statusSignal.value = 'authenticated';
    } else {
      statusSignal.value = 'unauthenticated';
    }
  }
  // If ssrAuth is undefined: session resolver not configured.
  // Status stays 'idle' → ProtectedRoute renders fallback → no SSR redirect.
  // Client-side redirect handles it after hydration.
}
```

#### 5. `ProtectedRoute` — SSR redirect signal

```ts
// packages/ui/src/auth/protected-route.ts
import { getSSRContext } from '../ssr/ssr-render-context';

// After shouldRedirect is computed, before the domEffect:
if (!isBrowser()) {
  // SSR: write redirect to context instead of navigating
  if (shouldRedirect.value) {
    const ssrCtx = getSSRContext();
    if (ssrCtx) {
      const search = returnTo ? `?returnTo=${encodeURIComponent(ssrCtx.url)}` : '';
      ssrCtx.ssrRedirect = { to: `${loginPath}${search}` };
    }
  }
}

// Client: existing domEffect remains as fallback
if (router && isBrowser()) {
  domEffect(() => {
    if (shouldRedirect.value) {
      const search = returnTo
        ? `?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
        : '';
      router.navigate({ to: `${loginPath}${search}`, replace: true });
    }
  });
}
```

#### 6. Server handlers — map session and check redirect

```ts
// Both bun-dev-server.ts and ssr-handler.ts:

// Map sessionResult to ssrAuth (inside the existing session resolver try/catch):
// - sessionResult present → authenticated (JWT verified)
// - sessionResult null → unauthenticated (no cookie or invalid JWT)
// - resolver threw → ssrAuth stays undefined (auth unknown, graceful degradation)
let ssrAuth: SSRRenderContext['ssrAuth'] | undefined;
if (sessionResolver) {
  try {
    const sessionResult = await sessionResolver(request);
    ssrAuth = sessionResult
      ? { status: 'authenticated', user: sessionResult.session.user, expiresAt: sessionResult.session.expiresAt }
      : { status: 'unauthenticated' };
    // ... existing sessionScript logic unchanged ...
  } catch {
    // ssrAuth stays undefined → auth unknown during SSR → no redirect
  }
}

const result = await ssrRenderToString(ssrMod, pathname + search, {
  ssrTimeout: 300,
  ssrAuth,
});

if (result.redirect) {
  return new Response(null, {
    status: 302,
    headers: { Location: result.redirect.to },
  });
}

// ... existing HTML response logic ...
```

## Manifesto Alignment

- **"If it builds, it works"** — No new types for users to learn. The redirect is a transparent optimization.
- **"One way to do things"** — ProtectedRoute stays the single mechanism for route protection. No separate server middleware, no route metadata files.
- **"Performance is not optional"** — Eliminates a full SSR render + client hydration + client-side redirect for unauthenticated users. Single 302 response instead.
- **"AI agents are first-class users"** — No configuration changes needed. An LLM setting up `ProtectedRoute` + `sessionResolver` gets SSR redirects automatically.

## Non-Goals

- **SSR entitlement checking** — `ProtectedRoute`'s `requires` prop checks entitlements via `AccessContext`. Making `AccessContext` available during SSR is out of scope. Entitlement checks only run client-side. **Known limitation:** an authenticated user who lacks required entitlements will see the SSR-rendered content briefly before the client-side `allAllowed` check swaps to the `forbidden` fallback. This is acceptable — entitlement-based SSR rendering is a separate feature.
- **Server-side route protection middleware** — Route protection stays component-driven. No `protectedPaths: ['/admin']` configuration on the server.
- **Custom redirect status codes** — Always 302. 307/308 are not useful for auth redirects.
- **Auth state for non-ProtectedRoute SSR rendering** — We're not making `useAuth()` return real state during SSR for arbitrary components. Only `ProtectedRoute` uses `ssrAuth` for its redirect decision.
- **Redirect optimization for nav pre-fetch** — `ssrDiscoverQueries` and `ssrStreamNavQueries` run Pass 1 but don't check for redirects. Nav pre-fetch is for SPA navigation where auth is already established client-side, so this is not needed.

## Unknowns

### Resolved

**Q: Should we skip Pass 2 (render) when redirect is detected after Pass 1 (discovery)?**

A: Yes. After Pass 1, if `ctx.ssrRedirect` is set, we skip query resolution and Pass 2 entirely. No point rendering HTML we'll discard. This is a performance optimization — not correctness-critical, since even with Pass 2 the redirect would still be returned. But skipping is trivial (one `if` check) and avoids wasted work.

**Q: Does `domEffect` running during SSR cause a double-redirect?**

A: No. The `isBrowser()` guard is **lifted** from inside the `domEffect` callback to wrapping the entire `domEffect` registration. Previously, `domEffect` registered and ran during SSR (calling the no-op `router.navigate()`). After this change, the `domEffect` is not registered at all during SSR — the SSR path writes to `ctx.ssrRedirect` instead. This is a behavioral change but safe: the old SSR `domEffect` was a no-op anyway (`router.navigate()` returns `Promise.resolve()` during SSR), and no other code depends on this `domEffect` running during SSR for DOM population.

**Q: Does `ctx.isAuthenticated as boolean` in `shouldRedirect` work correctly during SSR?**

A: Yes. The `AuthContext.Provider` calls `wrapSignalProps()` which replaces signal properties (like `isAuthenticated`) with getters that read `.value`. So `ctx.isAuthenticated` returns the unwrapped boolean value, not the signal object. The `as boolean` cast is harmless. This pattern is consistent with how the signal-api works — Provider wraps, useContext returns unwrapped.

**Q: What happens when `ssrAuth` sets status to 'unauthenticated' but ProtectedRoute is not in the component tree?**

A: Nothing bad. `ssrAuth` just sets auth signals. If no ProtectedRoute reads `shouldRedirect`, no redirect is written to the context. The SSR render proceeds normally.

## Type Flow Map

No new generic type parameters. The changes are at the value level:

```
Server:     sessionResult (SSRSessionResult | null)
  ↓ map to
SSR opts:   ssrAuth ({ status, user?, expiresAt? } | { status: 'unauthenticated' } | undefined)
  ↓ stored on
Context:    SSRRenderContext.ssrAuth
  ↓ read by
AuthProvider: sets statusSignal.value + userSignal.value
  ↓ derived by
ProtectedRoute: shouldRedirect (computed)
  ↓ writes to
Context:    SSRRenderContext.ssrRedirect ({ to: string })
  ↓ read by
ssrRenderToString: returns in SSRRenderResult.redirect
  ↓ checked by
Server:     returns Response(302) instead of Response(html)
```

## E2E Acceptance Test

```typescript
describe('Feature: SSR redirect for ProtectedRoute', () => {
  describe('Given an unauthenticated request to a protected route', () => {
    describe('When the session resolver is configured and returns null', () => {
      it('Then ssrRenderToString returns redirect to /login', () => {
        // ssrAuth: { status: 'unauthenticated' }
        // ProtectedRoute writes ssrRedirect
        // result.redirect.to === '/login?returnTo=%2Fadmin'
      });

      it('Then no HTML body is rendered (pass 2 skipped)', () => {
        // result.html === '' (or minimal)
        // result.css === ''
      });
    });
  });

  describe('Given an authenticated request to a protected route', () => {
    describe('When the session resolver returns a valid session', () => {
      it('Then ssrRenderToString returns HTML with no redirect', () => {
        // ssrAuth: { status: 'authenticated', user: {...}, expiresAt: ... }
        // result.redirect === undefined
        // result.html contains rendered children
      });
    });
  });

  describe('Given no session resolver configured (ssrAuth undefined)', () => {
    describe('When a request hits a protected route', () => {
      it('Then ssrRenderToString returns fallback HTML with no redirect', () => {
        // ssrAuth: undefined
        // Auth status stays 'idle', ProtectedRoute renders fallback
        // result.redirect === undefined
        // Client-side redirect handles it after hydration
      });
    });
  });

  describe('Given a ProtectedRoute with returnTo=false', () => {
    describe('When an unauthenticated request hits the route', () => {
      it('Then redirect URL has no ?returnTo= query parameter', () => {
        // result.redirect.to === '/login' (no query string)
      });
    });
  });

  describe('Given a ProtectedRoute with custom loginPath="/auth/signin"', () => {
    describe('When an unauthenticated request hits the route', () => {
      it('Then redirect URL uses the custom loginPath', () => {
        // result.redirect.to === '/auth/signin?returnTo=%2Fadmin'
      });
    });
  });

  describe('Given a request with query params to a protected route', () => {
    describe('When the user is unauthenticated', () => {
      it('Then returnTo preserves the full path including query string', () => {
        // Request to /admin?tab=settings
        // result.redirect.to === '/login?returnTo=%2Fadmin%3Ftab%3Dsettings'
      });
    });
  });

  describe('Given multiple nested ProtectedRoute components', () => {
    describe('When the user is unauthenticated', () => {
      it('Then the first ProtectedRoute to evaluate writes ssrRedirect', () => {
        // The outermost ProtectedRoute writes ssrRedirect
        // Inner ProtectedRoutes may also write (last-write-wins) but
        // all redirect to login so the result is the same
      });
    });
  });

  describe('Given an authenticated request to a non-protected route', () => {
    describe('When ssrAuth is set to authenticated', () => {
      it('Then server renders HTML normally (ssrAuth does not interfere)', () => {
        // No ProtectedRoute in the tree → no ssrRedirect written
        // result.redirect === undefined
      });
    });
  });

  describe('Given a redirect result from ssrRenderToString', () => {
    it('Then result.ssrData is empty (no queries resolved)', () => {
      // result.ssrData === []
    });
  });
});
```

## Implementation Plan

### Phase 1: SSR auth context plumbing

Add `ssrAuth` and `ssrRedirect` to `SSRRenderContext`. Wire `ssrAuth` from `ssrRenderToString()` options into the context. Add `redirect` to `SSRRenderResult`.

**Redirect check insertion point:** Immediately after `createApp()` (Pass 1, line ~195 in `ssr-render.ts`), check `ctx.ssrRedirect`. If set, return early — skip lazy route resolution, query awaiting, and Pass 2 render entirely. Return `{ html: '', css: '', ssrData: [], headTags: '', redirect: ctx.ssrRedirect }`.

Also update `createRequestContext()` to accept the full URL (pathname + search) and pass through to `ctx.url`. Both `bun-dev-server.ts` and `ssr-handler.ts` currently pass only `pathname` — change to include the search string.

**Acceptance criteria:**

```typescript
describe('Given ssrRenderToString called with ssrAuth option', () => {
  describe('When ssrAuth is { status: "unauthenticated" }', () => {
    it('Then the SSRRenderContext has ssrAuth set', () => {});
  });
  describe('When ssrAuth is { status: "authenticated", user, expiresAt }', () => {
    it('Then the SSRRenderContext has ssrAuth set', () => {});
  });
  describe('When ssrAuth is undefined', () => {
    it('Then the SSRRenderContext has ssrAuth undefined', () => {});
  });
  describe('When ctx.ssrRedirect is set after Pass 1', () => {
    it('Then Pass 2 is skipped and result.redirect is populated', () => {});
    it('Then result.html, result.css, and result.ssrData are empty', () => {});
  });
  describe('When url includes search params', () => {
    it('Then ctx.url includes the full path with search string', () => {});
  });
});
```

**Files changed:**
- `packages/ui/src/ssr/ssr-render-context.ts` — add `ssrAuth` and `ssrRedirect` fields
- `packages/ui-server/src/ssr-render.ts` — accept `ssrAuth` option, store on context, check redirect after Pass 1, add `redirect` to result, pass full URL to context

### Phase 2: AuthProvider SSR hydration + ProtectedRoute SSR redirect

AuthProvider reads `ssrAuth` from context during SSR and sets auth signals. ProtectedRoute writes `ssrRedirect` to context when `shouldRedirect` is true during SSR.

**Acceptance criteria:**

```typescript
describe('Given AuthProvider running during SSR', () => {
  describe('When ssrAuth is { status: "authenticated", user, expiresAt }', () => {
    it('Then statusSignal is "authenticated"', () => {});
    it('Then userSignal has the user data', () => {});
  });
  describe('When ssrAuth is { status: "unauthenticated" }', () => {
    it('Then statusSignal is "unauthenticated"', () => {});
    it('Then userSignal is null', () => {});
  });
  describe('When ssrAuth is undefined', () => {
    it('Then statusSignal stays "idle"', () => {});
  });
});

describe('Given ProtectedRoute running during SSR', () => {
  describe('When auth status is "unauthenticated"', () => {
    it('Then ssrRedirect is set with loginPath', () => {});
    it('Then ssrRedirect includes ?returnTo= with the SSR URL', () => {});
  });
  describe('When auth status is "authenticated"', () => {
    it('Then ssrRedirect is not set', () => {});
  });
  describe('When auth status is "idle" (no ssrAuth)', () => {
    it('Then ssrRedirect is not set', () => {});
  });
  describe('When returnTo is false', () => {
    it('Then ssrRedirect has no ?returnTo= query', () => {});
  });
  describe('When loginPath is custom', () => {
    it('Then ssrRedirect uses the custom loginPath', () => {});
  });
});
```

**Files changed:**
- `packages/ui/src/auth/auth-context.ts` — add SSR hydration branch in AuthProvider
- `packages/ui/src/auth/protected-route.ts` — add SSR redirect logic, guard domEffect with `isBrowser()`

### Phase 3: Server handler integration

Both `bun-dev-server.ts` and `ssr-handler.ts` pass `ssrAuth` to `ssrRenderToString()` and check `result.redirect` to return 302 instead of HTML.

**Acceptance criteria:**

```typescript
describe('Given bun-dev-server with sessionResolver configured', () => {
  describe('When unauthenticated request hits a ProtectedRoute path', () => {
    it('Then server returns HTTP 302 with Location header', () => {});
    it('Then no HTML body is returned', () => {});
  });
  describe('When authenticated request hits a ProtectedRoute path', () => {
    it('Then server returns HTTP 200 with rendered HTML', () => {});
  });
  describe('When session resolver throws', () => {
    it('Then server falls back to normal SSR (no redirect)', () => {});
  });
});

describe('Given production SSR handler with sessionResolver configured', () => {
  describe('When unauthenticated request hits a ProtectedRoute path', () => {
    it('Then handler returns HTTP 302 with Location header', () => {});
  });
  describe('When authenticated request hits a ProtectedRoute path', () => {
    it('Then handler returns HTTP 200 with rendered HTML', () => {});
  });
});
```

**Files changed:**
- `packages/ui-server/src/bun-dev-server.ts` — map sessionResult to ssrAuth, pass to render, check redirect
- `packages/ui-server/src/ssr-handler.ts` — same pattern

### Phase 4: Integration test + existing test verification

End-to-end integration test covering the full request → session resolve → SSR → redirect flow. Verify existing ProtectedRoute client-side tests still pass.

**Acceptance criteria:**

```typescript
describe('Feature: SSR redirect for ProtectedRoute (integration)', () => {
  describe('Given a full SSR app with AuthProvider + ProtectedRoute', () => {
    describe('When ssrRenderToString is called with unauthenticated ssrAuth', () => {
      it('Then returns redirect to /login with returnTo', () => {});
      it('Then html is empty (pass 2 skipped)', () => {});
    });
    describe('When ssrRenderToString is called with authenticated ssrAuth', () => {
      it('Then returns HTML with rendered children, no redirect', () => {});
    });
    describe('When ssrRenderToString is called without ssrAuth', () => {
      it('Then returns fallback HTML, no redirect', () => {});
    });
  });
});
```

**Files changed:**
- New test file in `packages/ui-server/src/__tests__/` or `packages/ui/src/auth/__tests__/`
