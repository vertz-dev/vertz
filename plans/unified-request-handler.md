# Unified Request Handler

**Issue:** [#1203](https://github.com/vertz-dev/vertz/issues/1203)

## Problem

Every app with auth must manually route between auth and entity handlers:

```ts
apiHandler: async (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/auth')) {
    return app.auth.handler(req);
  }
  return app.handler(req);
},
```

This is boilerplate that `createServer()` already has enough context to eliminate — it knows about both handlers.

## API Surface

### Before (current)

```ts
const app = createServer({ db, auth: authConfig, entities: [todos] });

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  apiHandler: async (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/auth')) {
      return app.auth.handler(req);
    }
    return app.handler(req);
  },
});
```

### After

```ts
const app = createServer({ db, auth: authConfig, entities: [todos] });

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  apiHandler: app.requestHandler,
});
```

The `requestHandler` property is added to `ServerInstance` (the return type when `db + auth` are both provided). It routes requests internally:

- Paths matching `/api/auth` exactly or `/api/auth/*` (with trailing slash) → `auth.handler`
- All other paths → entity `handler`

### Type Signature

```ts
// packages/server/src/create-server.ts
export interface ServerInstance extends AppBuilder {
  auth: AuthInstance;
  initialize(): Promise<void>;
  /** Routes auth requests (/api/auth/*) to auth.handler, everything else to entity handler */
  readonly requestHandler: (request: Request) => Promise<Response>;
}
```

`requestHandler` is implemented as a getter (consistent with `handler` on `AppBuilder`) so it always references the current `handler` and `auth.handler`.

### Routing logic

The routing check uses an **exact-or-slash boundary**, not a bare `startsWith`:

```ts
const authPrefix = '/api/auth';
const isAuthRoute = pathname === authPrefix || pathname.startsWith(authPrefix + '/');
```

This prevents false positives: `/api/authorize` and `/api/authentication` are NOT routed to the auth handler. Only `/api/auth` and `/api/auth/session`, `/api/auth/oauth/github`, etc. are matched.

### API prefix constraint

The auth handler internally hardcodes `url.pathname.replace('/api/auth', '')` to extract the sub-path (line 824 of `auth/index.ts`). This means `requestHandler` **only works correctly with the default `apiPrefix: '/api'`**.

If a custom `apiPrefix` is configured, `createServer()` throws at construction time:

```ts
if (apiPrefix !== '/api') {
  throw new Error(
    `requestHandler requires apiPrefix to be '/api' (got '${apiPrefix}'). ` +
    `Custom API prefixes are not yet supported with auth.`
  );
}
```

Making the auth prefix configurable is a separate, larger effort tracked outside this issue.

### skipSSRPaths interaction

The dev server's `skipSSRPaths` option (defaults to `['/api/']`) determines which paths bypass SSR and go to `apiHandler`. Auth routes under `/api/auth/*` are already covered by the default `['/api/']` prefix. No changes to `skipSSRPaths` are needed.

### Composition with custom middleware

Users who need custom middleware can still compose manually:

```ts
apiHandler: async (req: Request) => {
  // Custom logging, rate limiting, etc.
  myLogger(req);
  return app.requestHandler(req);
},
```

### Non-auth apps (AppBuilder return type)

When `createServer()` returns a plain `AppBuilder` (no auth), there is no `requestHandler`. The existing `handler` property handles everything. No changes needed for apps without auth.

## Manifesto Alignment

- **One way to do things** — Eliminates the boilerplate pattern every auth app currently duplicates. One handler, one call.
- **AI agents are first-class users** — An LLM can now use `app.requestHandler` directly instead of generating the if/else routing pattern. `requestHandler` is a universally understood name (Express, Hono, etc.) — an LLM will reach for it without documentation.
- **Production-ready by default** — Auth routing shouldn't require manual wiring. It should just work.
- **Explicit over implicit** — The handler is a separate property (`requestHandler`), not silently merged into `handler`. Users opt in by passing it to `apiHandler`.

### What was rejected

**`unifiedHandler` as a name:** Framework jargon. Tells you HOW it works (unifies handlers), not WHAT it does (handles requests). `requestHandler` is universally understood across HTTP frameworks.

**Option B (pass `app` directly to `createBunDevServer`):** This couples `@vertz/ui-server` to `@vertz/server`'s `ServerInstance` type. The dev server should remain handler-agnostic — it just needs a `(req: Request) => Promise<Response>` function. Adding the routing logic to `ServerInstance` keeps concerns separated.

**Making `handler` auto-route auth:** This would be a breaking change. Existing apps using `app.handler` for entity-only routing would unexpectedly start handling auth requests. A separate property is backward compatible.

## Non-Goals

- Changing `createBunDevServer` to accept a `ServerInstance` directly
- Adding configurable auth prefix — it's hardcoded to `/api/auth` in the auth module; a runtime guard prevents misuse with custom `apiPrefix`
- Middleware composition DSL — manual wrapping is sufficient and explicit
- Adding `requestHandler` to `AppBuilder` (non-auth apps don't need it)
- Cloudflare handler integration — the `createHandler` in `@vertz/cloudflare` has its own routing concerns. A follow-up issue should address unifying auth routing for Cloudflare deployments. This PR focuses on the `ServerInstance` level, which both Bun dev server and Cloudflare handler can consume.

## Unknowns

None identified. The routing logic is straightforward — the auth module hardcodes its prefix, and both handlers share the same `(request: Request) => Promise<Response>` signature.

## POC Results

N/A — no POC needed. The implementation is a simple conditional check added to `ServerInstance`.

## Type Flow Map

```
createServer(config: { db, auth })
  → returns ServerInstance
    → .requestHandler: (request: Request) => Promise<Response>  [new — routes auth + entities]
    → .handler: (request: Request) => Promise<Response>  [unchanged — entities only]
    → .auth.handler: (request: Request) => Promise<Response>  [unchanged — auth only]
```

No generics involved. The handler signature is `(request: Request) => Promise<Response>` throughout. No dead generics possible.

## E2E Acceptance Test

```ts
describe('Feature: Unified request handler', () => {
  describe('Given a ServerInstance with auth and entities configured', () => {
    describe('When a request to /api/auth/session is made via requestHandler', () => {
      it('Then delegates to auth.handler and returns auth response', async () => {
        const response = await app.requestHandler(
          new Request('http://localhost/api/auth/session'),
        );
        // Auth handler responds (401 without session, 200 with session)
        expect([200, 401]).toContain(response.status);
      });
    });

    describe('When a request to /api/todos is made via requestHandler', () => {
      it('Then delegates to entity handler and returns entity response', async () => {
        const response = await app.requestHandler(
          new Request('http://localhost/api/todos'),
        );
        expect(response.status).toBe(200);
      });
    });

    describe('When a request to /api/auth/oauth/github is made via requestHandler', () => {
      it('Then delegates to auth.handler (nested auth path)', async () => {
        const response = await app.requestHandler(
          new Request('http://localhost/api/auth/oauth/github'),
        );
        // Auth handler responds (redirect or error — depends on provider config)
        expect(response.status).not.toBe(404);
      });
    });

    describe('When a request to /api/authorize is made via requestHandler', () => {
      it('Then delegates to entity handler, NOT auth handler (no false prefix match)', async () => {
        const response = await app.requestHandler(
          new Request('http://localhost/api/authorize'),
        );
        // Entity handler returns 404 (no such entity), NOT auth handler
        expect(response.status).toBe(404);
      });
    });
  });

  describe('Given a createServer call without auth (plain AppBuilder)', () => {
    it('Then requestHandler is not available on the return type', () => {
      const noAuthApp = createServer({ entities: [todos], db });
      // @ts-expect-error — requestHandler does not exist on AppBuilder
      noAuthApp.requestHandler;
    });
  });
});
```

## Implementation Plan

### Phase 1: Add `requestHandler` to `ServerInstance`

**Files changed:**
- `packages/server/src/create-server.ts` — add `requestHandler` getter to `ServerInstance` interface and implementation

**Acceptance criteria:**

```ts
describe('Feature: Unified request handler', () => {
  describe('Given a ServerInstance with auth and entities', () => {
    describe('When calling requestHandler with /api/auth/* path', () => {
      it('Then routes to auth.handler', async () => {
        // POST /api/auth/signup → auth handler responds
      });
    });

    describe('When calling requestHandler with /api/<entity> path', () => {
      it('Then routes to entity handler', async () => {
        // GET /api/todos → entity handler responds
      });
    });

    describe('When calling requestHandler with /api/auth/oauth/:provider path', () => {
      it('Then routes to auth.handler (nested auth path)', async () => {
        // GET /api/auth/oauth/github → auth handler responds
      });
    });

    describe('When calling requestHandler with /api/authorize (false prefix)', () => {
      it('Then routes to entity handler, not auth handler', async () => {
        // GET /api/authorize → entity handler (404), not auth
      });
    });

    describe('When calling requestHandler with /api/auth (exact match, no trailing slash)', () => {
      it('Then routes to auth.handler', async () => {
        // GET /api/auth → auth handler responds
      });
    });
  });

  describe('Given a createServer call without auth', () => {
    it('Then the return type does not include requestHandler', () => {
      // @ts-expect-error — property does not exist on AppBuilder
    });
  });
});
```

### Phase 2: Update examples

**Files changed:**
- Update example `dev-server.ts` files that use manual auth/entity routing to use `requestHandler`

**Acceptance criteria:**
- Examples compile and work with `requestHandler`
- No manual auth/entity routing in example dev servers
