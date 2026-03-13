# SSR Session Injection — Design Plan

> **Issue:** [#1204](https://github.com/vertz-dev/vertz/issues/1204)
> **Revision 2** — Addresses review findings from josh (DX), product/scope, and technical reviewers.
> **Goal:** Eliminate the auth loading flash by injecting `window.__VERTZ_SESSION__` during SSR.

## Context

When an authenticated user loads a page, there's a visible loading flash:
1. SSR renders "Loading..." (auth status is `idle`)
2. Client hydrates, calls `refresh()` via `setTimeout(0)`
3. Auth resolves -> page re-renders with authenticated content

The pieces already exist but aren't connected:
- `createSessionScript()` in `ssr-session.ts` (implemented, tested, XSS-safe)
- `AuthProvider` reads `window.__VERTZ_SESSION__` and hydrates immediately (lines 383-396 in `auth-context.ts`)
- `generateSSRPageHtml()` in `bun-dev-server.ts` already injects `__VERTZ_SSR_DATA__`
- `injectIntoTemplate()` in `template-inject.ts` does the same for production

**What's missing:** The SSR render pipeline never reads the request cookie, never validates the JWT, and never includes the session script in the HTML.

## API Surface

### Types

Types are defined in `@vertz/ui-server` (the SSR package owns the SSR injection contract). `@vertz/server` does NOT import these types — it returns a structurally compatible plain object.

```ts
// In @vertz/ui-server/ssr-session.ts

export interface SessionData {
  user: { id: string; email: string; role: string; [key: string]: unknown };
  /** Unix timestamp in milliseconds (JWT exp * 1000). */
  expiresAt: number;
}

/** Resolved session data for SSR injection. */
export interface SSRSessionInfo {
  session: SessionData;
  /**
   * Access set from JWT acl claim.
   * - Present: inline access set (no overflow)
   * - null: access control is configured but the set overflowed the JWT
   * - undefined: access control is not configured
   */
  accessSet?: AccessSet | null;
}

/**
 * Callback that extracts session data from a request.
 * Returns null when no valid session exists (expired, missing, or invalid cookie).
 */
export type SessionResolver = (request: Request) => Promise<SSRSessionInfo | null>;
```

### Dev server integration

```ts
import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  apiHandler: app.handler,
  // NEW: resolves session from request cookies
  sessionResolver: app.auth.resolveSessionForSSR,
});
```

### Production SSR handler integration

```ts
import { createSSRHandler } from '@vertz/ui-server';

const ssrHandler = createSSRHandler({
  module: ssrModule,
  template: htmlTemplate,
  // NEW: resolves session from request cookies
  sessionResolver: app.auth.resolveSessionForSSR,
});
```

### Template injection integration (refactored to options object)

`injectIntoTemplate` is refactored from 6 positional parameters to an options object. This is an internal function (not exported from `@vertz/ui-server`'s barrel), so the change is safe.

```ts
// BEFORE (6 positional params):
injectIntoTemplate(template, appHtml, appCss, ssrData, nonce, headTags);

// AFTER (options object):
injectIntoTemplate({
  template,
  appHtml,
  appCss,
  ssrData,
  nonce,
  headTags,
  sessionScript, // NEW
});
```

### Server-side resolver (provided by `@vertz/server` auth module)

```ts
const auth = createAuth(authConfig);

// auth.resolveSessionForSSR: (request: Request) => Promise<{ session, accessSet? } | null>
// Returns a plain object — no dependency on @vertz/ui-server types.
```

**JWT-only verification (no DB lookup).** The resolver only verifies the JWT signature and decodes the payload — it does NOT query the database to check if the session is revoked or the user deleted. Rationale:

- SSR session injection is a **hydration hint**, not an authorization gate. The client will still call `refresh()` when the JWT nears expiry.
- Adding 2 DB queries per SSR request (session + user lookup) adds 2-10ms latency to every page load.
- Worst case: a revoked session shows authenticated UI for up to 60 seconds (default JWT TTL). The client-side refresh catches this.
- This matches the threat model — the JWT itself is the trust boundary for short-lived session state.

**Allowlist mapping from JWT payload to SessionData.** The resolver constructs `SessionData.user` with an explicit allowlist of fields, NOT a spread of the JWT payload. This prevents custom claims from flowing into client-visible HTML:

```ts
// Inside resolveSessionForSSR:
const session = {
  user: {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    ...(payload.tenantId ? { tenantId: payload.tenantId } : {}),
  },
  expiresAt: payload.exp * 1000, // seconds -> milliseconds
};
```

## Manifesto Alignment

- **"Eliminate invisible state mismatches between SSR and client"** — This feature removes the primary auth state mismatch. SSR and client start with the same auth state.
- **"Server-rendered by default, hydrate on the client"** — Session data is serialized at the SSR boundary, just like query data.
- **"Convention over configuration"** — When auth is configured, session injection happens automatically via CLI auto-wiring. No opt-in flag.
- **Transport-agnostic** — The `sessionResolver` callback keeps auth logic out of `@vertz/ui-server`. Any auth strategy (JWT, opaque tokens, external services) can implement the resolver.

## Non-Goals

- **SSR-side rendering of authenticated content.** This design only injects session metadata so `AuthProvider` starts in `authenticated` status. The actual page content still renders client-side after hydration. SSR-side auth-gated rendering is a separate feature.
- **Refresh token handling.** The injected session includes `expiresAt` for scheduling proactive refresh, but the refresh mechanism itself is unchanged.
- **CSP nonce propagation.** The `createSessionScript()` function already supports nonces. Wiring nonce through the full pipeline is out of scope (tracked separately).
- **Access set recomputation on overflow.** When `acl.overflow` is true, the access set is too large for the JWT. The resolver returns `accessSet: null` so the client knows to fetch it. Live recomputation is a separate concern.
- **Session resolver on nav pre-fetch requests.** The resolver only runs for HTML page requests, NOT for `X-Vertz-Nav: 1` SSE pre-fetch requests (those return query data streams, not HTML).

## Unknowns

None identified. All building blocks exist and are tested. The work is pure integration.

## Type Flow Map

```
Request (cookies)
  -> SessionResolver (app layer, JWT-only verify)
    -> SSRSessionInfo { session: { user, expiresAt }, accessSet? }
      -> createSessionScript(session) + createAccessSetScript(accessSet)
        -> string ("<script>window.__VERTZ_SESSION__=...</script>")
          -> generateSSRPageHtml({ sessionScript }) / injectIntoTemplate({ sessionScript })
            -> HTML string
              -> Response

Client hydration:
  window.__VERTZ_SESSION__ (injected by SSR)
    -> AuthProvider reads it (auth-context.ts:383-396)
      -> statusSignal.value = 'authenticated'
      -> userSignal.value = session.user
      -> tokenRefresh.schedule(session.expiresAt)
        (expiresAt is in milliseconds — matches tokenRefresh.schedule() expectation)
```

No new generics. `SessionData` is an existing interface. `SessionResolver` is a simple function type.

### Script injection ordering

Session and access set scripts MUST appear before any application JavaScript in the HTML. `AuthProvider` reads `window.__VERTZ_SESSION__` synchronously during initialization — if the session script comes after the app bundle, the global won't exist when `AuthProvider` evaluates, defeating the purpose.

Injection order in `<body>`:
1. `<div id="app">` (SSR markup)
2. Session script (`window.__VERTZ_SESSION__`)
3. Access set script (`window.__VERTZ_ACCESS_SET__`)
4. SSR data script (`window.__VERTZ_SSR_DATA__`)
5. App bundle `<script>` tag

## Error Handling

When the session resolver throws (e.g., malformed cookie, unexpected JWT structure), the SSR render must NOT fail. The resolver is called in its own isolated try/catch, separate from the SSR render:

```ts
// Pattern used in both dev server and production handler:
let sessionScript = '';
try {
  const result = await sessionResolver(request);
  if (result) {
    sessionScript = buildSessionScripts(result);
  }
} catch (err) {
  // Visible by default — don't hide behind VERTZ_DEBUG
  console.warn('[Server] Session resolver failed:', err instanceof Error ? err.message : err);
}
// SSR render proceeds normally regardless of resolver outcome
```

In dev mode, resolver errors are also broadcast via the WebSocket error channel as `ssr` category errors, so the error overlay shows them.

## E2E Acceptance Test

```typescript
describe('Feature: SSR session injection', () => {
  describe('Given a user with a valid session cookie', () => {
    describe('When the page is SSR-rendered', () => {
      it('Then the HTML includes a <script> tag setting window.__VERTZ_SESSION__', () => {
        // SSR HTML contains: <script>window.__VERTZ_SESSION__={"user":{"id":"u1",...},"expiresAt":...}</script>
      });

      it('Then AuthProvider hydrates with status "authenticated" (no refresh() call)', () => {
        // Client-side: useAuth().status === 'authenticated' immediately after hydration
      });

      it('Then auth status is never "loading" during the initial render cycle', () => {
        // The auth status transitions directly to 'authenticated', never passing through 'loading'
      });
    });
  });

  describe('Given a user with an expired/invalid session cookie', () => {
    describe('When the page is SSR-rendered', () => {
      it('Then no __VERTZ_SESSION__ script is injected', () => {});

      it('Then AuthProvider hydrates with status "unauthenticated"', () => {});
    });
  });

  describe('Given a request with no session cookie', () => {
    describe('When the page is SSR-rendered', () => {
      it('Then no __VERTZ_SESSION__ script is injected', () => {});
    });
  });

  describe('Given a sessionResolver that also returns accessSet', () => {
    describe('When the page is SSR-rendered', () => {
      it('Then both __VERTZ_SESSION__ and __VERTZ_ACCESS_SET__ scripts are injected', () => {});
    });
  });

  describe('Given a sessionResolver that throws', () => {
    describe('When the page is SSR-rendered', () => {
      it('Then the HTML renders normally without session script (graceful degradation)', () => {});
      it('Then a warning is logged', () => {});
    });
  });
});
```

### Invalid usage (type-level):

```typescript
// @ts-expect-error — sessionResolver must return SSRSessionInfo | null, not a raw user object
createBunDevServer({ entry: './app.tsx', sessionResolver: () => ({ id: '1' }) });

// @ts-expect-error — SessionData requires expiresAt as number, not string
const bad: SessionData = { user: { id: '1', email: 'a@b.c', role: 'user' }, expiresAt: '2025-01-01' };
```

---

## Implementation Plan

### Phase 1: Session resolver type + `resolveSessionForSSR` on auth instance

**Scope:** Define types in `@vertz/ui-server`. Add `resolveSessionForSSR` method to auth instance in `@vertz/server`. The method returns a plain object (no import from `@vertz/ui-server`).

**Changes:**
- `packages/ui-server/src/ssr-session.ts` — Add `SSRSessionInfo` and `SessionResolver` types. Add JSDoc on `expiresAt`: "Unix timestamp in milliseconds".
- `packages/ui-server/src/index.ts` — Export `createSessionScript`, `SessionData`, `SSRSessionInfo`, `SessionResolver`
- `packages/server/src/auth/index.ts` — Add `resolveSessionForSSR(request: Request)` method. JWT-only verification (no DB lookup). Allowlist mapping: `{ id: sub, email, role, tenantId? }`. Uses `getAccessSetForSSR()` from `@vertz/ui-server` for the optional access set extraction.
- `packages/server/src/auth/types.ts` — Add `resolveSessionForSSR` to `AuthInstance` interface. Return type is `Promise<{ session: { user: Record<string, unknown>; expiresAt: number }; accessSet?: unknown } | null>` (plain object, no dependency on `@vertz/ui-server` types).

**Dependency direction:** `@vertz/server` does NOT import `SessionData` or `SSRSessionInfo` from `@vertz/ui-server`. The auth module's return type is a structurally compatible plain object. The CLI layer (Phase 4) or the developer passes it as `SessionResolver` — TypeScript's structural typing makes this seamless.

**Exception:** `getAccessSetForSSR()` is imported from `@vertz/ui-server` because it decodes the JWT `acl` claim into an `AccessSet`. This is a type-only import for the `AccessSet` type + a runtime import for the decoding function. If this dependency is problematic, the function can be duplicated in `@vertz/server`, but since it's a small pure function (20 lines), importing it is pragmatic.

**Acceptance criteria:**
```typescript
describe('Feature: resolveSessionForSSR', () => {
  describe('Given a request with a valid session JWT cookie', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns { session: { user, expiresAt } }', () => {});
      it('Then user contains only id, email, role, tenantId from JWT payload (allowlist)', () => {});
      it('Then expiresAt is the JWT exp claim in milliseconds (exp * 1000)', () => {});
      it('Then custom JWT claims are NOT included in user', () => {});
    });
  });

  describe('Given a request with an expired JWT cookie', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns null', () => {});
    });
  });

  describe('Given a request with no cookie', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns null', () => {});
    });
  });

  describe('Given a request with a malformed cookie value', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns null (does not throw)', () => {});
    });
  });

  describe('Given a request with a valid JWT that has an acl claim (no overflow)', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns { session, accessSet } with decoded access set', () => {});
    });
  });

  describe('Given a request with a valid JWT that has an overflow acl claim', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns { session, accessSet: null }', () => {});
    });
  });

  describe('Given a request with a valid JWT that has no acl claim', () => {
    describe('When resolveSessionForSSR is called', () => {
      it('Then returns { session, accessSet: undefined }', () => {});
    });
  });
});
```

### Phase 2: Inject session script into dev server HTML

**Scope:** Wire `sessionResolver` through `createBunDevServer` -> `generateSSRPageHtml`. The dev server calls the resolver per-request (HTML requests only, not nav pre-fetch), generates the session + access set scripts, and includes them in the HTML.

**Changes:**
- `packages/ui-server/src/bun-dev-server.ts`:
  - Add `sessionResolver?: SessionResolver` to `BunDevServerOptions`
  - Add `sessionScript?: string` to `SSRPageHtmlOptions`
  - In the SSR render handler (`doRender`): call `sessionResolver(request)` in an **isolated try/catch** before the SSR render. Generate scripts via `createSessionScript()` + `createAccessSetScript()`. Pass combined string as `sessionScript` to `generateSSRPageHtml`.
  - In `generateSSRPageHtml`: inject `sessionScript` between `<div id="app">` and `ssrDataScript` (before app bundle).
  - On resolver error: `console.warn` + broadcast via WebSocket error channel as `ssr` category.

**Acceptance criteria:**
```typescript
describe('Feature: dev server session injection', () => {
  describe('Given generateSSRPageHtml', () => {
    describe('When called with a sessionScript', () => {
      it('Then the HTML includes the session script after #app div and before ssrDataScript', () => {});
    });

    describe('When called without a sessionScript', () => {
      it('Then the HTML does not include any session script (backward compatible)', () => {});
    });
  });

  describe('Given the SSR render path in the dev server', () => {
    describe('When a request has a valid session cookie and sessionResolver is set', () => {
      it('Then the response HTML contains window.__VERTZ_SESSION__', () => {});
    });

    describe('When sessionResolver returns both session and accessSet', () => {
      it('Then the response HTML contains both __VERTZ_SESSION__ and __VERTZ_ACCESS_SET__', () => {});
    });

    describe('When sessionResolver returns session with accessSet: null (overflow)', () => {
      it('Then the response HTML contains __VERTZ_SESSION__ but not __VERTZ_ACCESS_SET__', () => {});
    });

    describe('When sessionResolver is not set', () => {
      it('Then the response HTML has no session script (backward compatible)', () => {});
    });

    describe('When sessionResolver returns null (invalid/missing cookie)', () => {
      it('Then the response HTML has no session script', () => {});
    });

    describe('When sessionResolver throws', () => {
      it('Then the error is logged via console.warn', () => {});
      it('Then SSR renders normally without session script (graceful degradation)', () => {});
    });
  });
});
```

### Phase 3: Inject session script into production SSR handler + refactor `injectIntoTemplate`

**Scope:** Refactor `injectIntoTemplate` to options object. Wire `sessionResolver` through `createSSRHandler` -> `injectIntoTemplate`. Same pattern as dev server. Resolver only runs for HTML requests, not nav pre-fetch.

**Changes:**
- `packages/ui-server/src/template-inject.ts`:
  - Refactor `injectIntoTemplate` from 6 positional params to an options object
  - Add optional `sessionScript?: string` field
  - Inject `sessionScript` before `</body>`, before the ssrData script
- `packages/ui-server/src/ssr-handler.ts`:
  - Add `sessionResolver?: SessionResolver` to `SSRHandlerOptions`
  - In `handleHTMLRequest`: call resolver in isolated try/catch, generate scripts, pass to `injectIntoTemplate`
  - Resolver is NOT called for nav pre-fetch requests (they return SSE, not HTML)
- Update all callers of `injectIntoTemplate` to use the new options signature (internal callers only — the function is not exported from the barrel)

**Acceptance criteria:**
```typescript
describe('Feature: production SSR handler session injection', () => {
  describe('Given injectIntoTemplate (refactored to options object)', () => {
    describe('When called with a sessionScript', () => {
      it('Then injects session script before </body>, before ssrData', () => {});
    });

    describe('When called without sessionScript', () => {
      it('Then behaves identically to current behavior (backward compatible)', () => {});
    });
  });

  describe('Given createSSRHandler with sessionResolver', () => {
    describe('When handling an HTML request with valid session cookie', () => {
      it('Then response HTML contains window.__VERTZ_SESSION__', () => {});
    });

    describe('When handling a nav pre-fetch request (X-Vertz-Nav: 1)', () => {
      it('Then sessionResolver is NOT called', () => {});
    });

    describe('When handling an HTML request without session cookie', () => {
      it('Then response HTML has no session script', () => {});
    });

    describe('When sessionResolver throws', () => {
      it('Then returns normal HTML without session script (graceful degradation)', () => {});
    });
  });
});
```

### Phase 4: CLI auto-wiring

**Scope:** The CLI fullstack dev server automatically wires `sessionResolver` when the server module has auth configured. Zero-config for the common case.

**Changes:**
- `packages/cli/src/dev-server/fullstack-server.ts`:
  - After importing the server module (`importServerModule`), duck-type check for `resolveSessionForSSR`:
    ```ts
    const serverMod = await importServerModule(mode.serverEntry);
    apiHandler = serverMod.handler;

    // Auto-wire session resolver if auth is configured
    let sessionResolver: ((req: Request) => Promise<unknown>) | undefined;
    if (
      'auth' in serverMod &&
      serverMod.auth &&
      typeof (serverMod.auth as Record<string, unknown>).resolveSessionForSSR === 'function'
    ) {
      sessionResolver = (serverMod.auth as { resolveSessionForSSR: (req: Request) => Promise<unknown> })
        .resolveSessionForSSR;
    }
    ```
  - Pass `sessionResolver` to `createBunDevServer`
  - The `ServerInstance` returned by `createServer({ db, auth })` already exposes `.auth` (which is the `AuthInstance`). The duck-type check avoids type-level coupling between CLI and the `AuthInstance` interface.

**Acceptance criteria:**
```typescript
describe('Feature: CLI auto-wiring', () => {
  describe('Given a fullstack server module with auth configured', () => {
    describe('When the dev server starts', () => {
      it('Then sessionResolver is automatically wired from serverMod.auth.resolveSessionForSSR', () => {});
    });
  });

  describe('Given a server module without auth', () => {
    describe('When the dev server starts', () => {
      it('Then no sessionResolver is set (no error)', () => {});
    });
  });

  describe('Given a server module with auth but no resolveSessionForSSR', () => {
    describe('When the dev server starts', () => {
      it('Then no sessionResolver is set (graceful fallback)', () => {});
    });
  });
});
```

### Dependencies

```
Phase 1 (types + resolver) -> Phase 2 (dev server) -> Phase 4 (CLI auto-wiring)
Phase 1 (types + resolver) -> Phase 3 (production handler)
Phase 2 and Phase 3 are independent of each other.
```

---

## Review Findings Addressed (Rev 2)

| Finding | Resolution |
|---------|-----------|
| DX-B1, Tech-S2: Contradictory SessionResolver type | Single definition: returns `SSRSessionInfo \| null` throughout |
| DX-B2, Tech-S3: 7 positional params on injectIntoTemplate | Refactored to options object in Phase 3 |
| Tech-B1: JWT-only vs full DB lookup | Explicitly JWT-only. Documented rationale and tradeoff. |
| Tech-B2: Custom claims XSS risk | Allowlist mapping from JWT. Only id, email, role, tenantId. |
| DX-SF2, Product-S1, Tech-S5: Dependency direction | `@vertz/server` returns plain objects, no import from `@vertz/ui-server`. Structural typing bridges the gap. |
| DX-SF1, Tech-S6: CLI auto-wiring underspecified | Concrete duck-type check pseudocode in Phase 4. |
| DX-SF3, Tech-S4: Error handling | Isolated try/catch. console.warn + WebSocket broadcast in dev. |
| Tech-S1: accessSet undefined vs null | `undefined` = not configured, `null` = overflow. Documented in type. |
| Product-N2: Missing "never loading" assertion | Added to E2E acceptance test. |
| DX-N1, Tech-N1: Script ordering + expiresAt unit | Documented injection order rationale. JSDoc on expiresAt. |
| Renamed SSRSessionResult -> SSRSessionInfo | Clearer name (data, not result). |
| Tech-N3: Exclude nav pre-fetch | Explicitly stated in Non-Goals and Phase 3 criteria. |
