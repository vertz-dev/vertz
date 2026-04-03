# Dev-Mode-Aware Error Handling Across Route Handlers

**Issue:** #2232
**Status:** Draft (Rev 2 — addressing DX, Product, and Technical review feedback)
**Author:** viniciusdacal

## Problem

Error handling is inconsistent across the four route handler types and none are dev-mode aware:

| Handler | Location | Current Behavior |
|---------|----------|------------------|
| Entity CRUD | `entity/error-handler.ts` | Always hides unknown errors: "An unexpected error occurred" |
| Auth catch-all | `auth/index.ts:2735` | Always hides: "Internal server error" |
| Service routes | `service/route-generator.ts:199` | Always exposes `error.message` |
| Agent routes | `agent/route-generator.ts:164` | Always exposes `error.message` |

**Entity handler** masks raw `Error` instances (DB driver failures, missing packages, runtime errors) into a generic 500 — correct for production but makes debugging impossible in development.

**Service/agent handlers** do the opposite: they always expose `error.message`, which leaks internals in production.

**Auth catch-all** swallows errors silently with no context at all.

**Error code inconsistency:** Entity handler uses `'InternalError'`, service/agent handlers use `'InternalServerError'`. This PR normalizes to `'InternalError'` everywhere. This is an intentional breaking change to the service/agent response contract, acceptable under the pre-v1 breaking change policy.

## API Surface

### `entityErrorHandler` — add `options` parameter

```ts
export interface ErrorHandlerOptions {
  /** When true, include actual error message and stack trace for unknown errors. */
  devMode?: boolean;
}

// Before:
export function entityErrorHandler(error: unknown): EntityErrorResult;

// After:
export function entityErrorHandler(error: unknown, options?: ErrorHandlerOptions): EntityErrorResult;
```

**Backward compatibility:** Both `entityErrorHandler` and `EntityErrorResult` are public exports of `@vertz/server`. The signature change is backward-compatible — the new `options` parameter is optional, and the new `stack` field on `EntityErrorResult` is optional. No consumer code breaks.

In dev mode, the unknown-error branch changes from:

```ts
// production (default):
{ code: 'InternalError', message: 'An unexpected error occurred' }

// dev mode:
{ code: 'InternalError', message: error.message, stack: error.stack }
```

When `devMode` is true but the error is not an `Error` instance (e.g., `throw 'boom'`), the response uses a generic message since there's no `.message` or `.stack` to expose:

```ts
{ code: 'InternalError', message: 'An unexpected error occurred (non-Error value thrown)' }
```

### Updated `EntityErrorResult`

```ts
export interface EntityErrorResult {
  status: number;
  body: {
    error: {
      code: string;
      message: string;
      details?: unknown;
      /** Stack trace of the original error. Only populated when `devMode` is enabled. */
      stack?: string;
    };
  };
}
```

### Entity route generator — add `devMode` to `EntityRouteOptions`

```ts
export interface EntityRouteOptions {
  apiPrefix?: string;
  tenantChain?: TenantChain | null;
  queryParentIds?: QueryParentIdsFn;
  accessConfig?: CrudAccessConfig;
  tenantResourceType?: string;
  closureStore?: ClosureStore;
  tenantLevels?: readonly TenantLevel[];
  /** When true, unknown errors include real message and stack trace. @default false */
  devMode?: boolean; // NEW
}
```

All 14 `entityErrorHandler()` call sites in `entity/route-generator.ts` must pass `{ devMode: options?.devMode }`. The value is captured once at the top of `generateEntityRoutes` and threaded to each handler closure.

### Service route generator — reuse `entityErrorHandler`

```ts
export interface ServiceRouteOptions {
  apiPrefix?: string;
  /** When true, unknown errors include real message and stack trace. @default false */
  devMode?: boolean; // NEW
}
```

The service catch block replaces its inline error formatting with `entityErrorHandler`:

```ts
catch (error) {
  const result = entityErrorHandler(error, { devMode: options?.devMode });
  return jsonResponse(result.body, result.status);
}
```

This gives service routes proper `VertzException`/`EntityError` handling for free (e.g., a `NotFoundException` thrown in a service handler now correctly returns 404 instead of being wrapped as 500). It also normalizes the error code from `'InternalServerError'` to `'InternalError'`.

**When `devMode` is omitted** (direct callers outside `createServer`): defaults to `false` (production-safe), matching `entityErrorHandler`'s default.

### Agent route generator — reuse `entityErrorHandler`

```ts
export interface AgentRouteOptions {
  apiPrefix?: string;
  /** When true, unknown errors include real message and stack trace. @default false */
  devMode?: boolean; // NEW
}
```

Same pattern. Session errors continue to be handled separately (always 404, regardless of mode):

```ts
catch (error) {
  if (isSessionError(error)) {
    return jsonResponse(
      { error: { code: 'NotFound', message: error.message } },
      404,
    );
  }
  const result = entityErrorHandler(error, { devMode: options?.devMode });
  return jsonResponse(result.body, result.status);
}
```

### Auth catch-all — use existing `isProduction` flag

The auth module already computes `isProduction` (inverted polarity: `isProduction === true` means production, `devMode === true` means development). The catch-all at line 2735 uses it.

**Important:** The production auth response format currently uses `{ error: string }` while all other handlers use `{ error: { code, message } }`. To avoid the auth catch-all having two response shapes depending on environment, we normalize the production path to the structured format too:

```ts
catch (error) {
  if (!isProduction && error instanceof Error) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'InternalError',
          message: error.message,
          ...(error.stack && { stack: error.stack }),
        },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return new Response(
    JSON.stringify({
      error: {
        code: 'InternalError',
        message: 'Internal server error',
      },
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } },
  );
}
```

This is a minor, additive change to the auth production response format (from `{ error: string }` to `{ error: { code, message } }`), but it eliminates the polymorphic response shape problem where consumers would need to handle both `typeof response.error === 'string'` and `typeof response.error === 'object'`.

### `createServer` threading

`createServer` derives `devMode` and passes it through to all route generators:

```ts
export interface ServerConfig extends Omit<AppConfig, '_entityDbFactory' | 'entities'> {
  // ... existing fields ...
  /** Override dev-mode detection for error responses. Defaults to NODE_ENV heuristic. */
  devMode?: boolean; // NEW
}

// in createServer():
const devMode =
  config.devMode ??
  (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test');

// passed to route generators:
generateEntityRoutes(entityDef, registry, entityDb, {
  ...existingOptions,
  devMode,
});

generateServiceRoutes(serviceDef, registry, {
  apiPrefix: serviceApiPrefix,
  devMode,
});

generateAgentRoutes(config.agents, config.agentRunner, {
  apiPrefix,
  devMode,
});
```

The `devMode` flag on `ServerConfig` provides an explicit override for environments where `NODE_ENV` doesn't match the desired behavior (e.g., staging environments where `NODE_ENV=test` but you want production error responses). When omitted, it falls back to the `NODE_ENV` heuristic.

**Design decision:** `NODE_ENV === 'test'` is treated as dev mode because test suites benefit from verbose errors. Users can override via `ServerConfig.devMode` if needed.

Auth already has its own `isProduction` (with a `config.isProduction` override) — no additional threading needed.

### No separate `formatUnknownError` utility

Per DX review feedback, service/agent catch blocks reuse `entityErrorHandler` directly instead of a separate utility. This eliminates a second code path, gives service/agent handlers proper `VertzException`/`EntityError` classification for free, and normalizes the error code everywhere.

## Manifesto Alignment

### Principle 1: "If it builds, it works"
The `devMode` flag is a simple boolean. Type changes are additive (optional `stack` field, optional `devMode` in options). No type-level complexity.

### Principle 2: "One way to do things"
All four handlers converge on the same pattern: dev mode = expose, production = hide. Service and agent handlers reuse `entityErrorHandler` directly — one error handler, one behavior.

### Principle 3: "AI agents are first-class users"
Dev mode surfaces real error messages and stack traces, which is critical for AI agents debugging application code. An agent seeing "An unexpected error occurred" has zero signal; seeing "Cannot read property 'id' of undefined at entity-pipeline.ts:42" is actionable.

### Principle 5: "If you can't test it, don't build it"
Every behavior is testable: dev mode on → message + stack in response, dev mode off → generic message only.

## Non-Goals

- **Error logging/tracing infrastructure** — This issue is about HTTP response bodies, not observability. Logging is a separate concern.
- **Request correlation IDs** — Useful but separate concern.
- **Custom error pages / HTML error responses** — This is JSON API error handling only.

## Unknowns

None identified. The pattern is straightforward — a boolean flag controlling response verbosity. The auth module already implements the `isProduction` detection we'll reuse.

## Type Flow Map

```
ServerConfig.devMode?: boolean
  └─ createServer()
       └─ devMode = config.devMode ?? (NODE_ENV === 'development' || NODE_ENV === 'test')
          ├─ EntityRouteOptions.devMode
          │    └─ generateEntityRoutes() captures devMode
          │         └─ entityErrorHandler(error, { devMode }) [14 call sites]
          │              └─ EntityErrorResult.body.error.stack?: string
          ├─ ServiceRouteOptions.devMode
          │    └─ generateServiceRoutes() captures devMode
          │         └─ catch: entityErrorHandler(error, { devMode })
          │              └─ jsonResponse(result.body, result.status)
          └─ AgentRouteOptions.devMode
               └─ generateAgentRoutes() captures devMode
                    └─ catch: entityErrorHandler(error, { devMode })
                         └─ jsonResponse(result.body, result.status)

Auth (separate path, already has isProduction):
  └─ config.isProduction ?? NODE_ENV heuristic
       └─ handleAuthRequest catch block
            └─ !isProduction ? { code, message, stack } : { code, message }
```

No generics involved — all types are concrete. The `stack?: string` field is the only addition to the public `EntityErrorResult` type.

## E2E Acceptance Test

```ts
describe('Feature: Dev-mode-aware error handling', () => {
  // ── Entity handler ──

  describe('Given entityErrorHandler receives an unknown Error', () => {
    describe('When devMode is true', () => {
      it('Then includes the real error message in the response', () => {
        const result = entityErrorHandler(
          new Error('pg: connection refused'),
          { devMode: true },
        );
        expect(result.status).toBe(500);
        expect(result.body.error.code).toBe('InternalError');
        expect(result.body.error.message).toBe('pg: connection refused');
      });

      it('Then includes the stack trace in the response', () => {
        const result = entityErrorHandler(
          new Error('pg: connection refused'),
          { devMode: true },
        );
        expect(result.body.error.stack).toBeDefined();
        expect(result.body.error.stack).toContain('Error: pg: connection refused');
      });
    });

    describe('When devMode is true and a non-Error value is thrown', () => {
      it('Then returns a descriptive generic message (no .message/.stack to expose)', () => {
        const result = entityErrorHandler('boom', { devMode: true });
        expect(result.status).toBe(500);
        expect(result.body.error.code).toBe('InternalError');
        expect(result.body.error.message).toBe(
          'An unexpected error occurred (non-Error value thrown)',
        );
        expect(result.body.error.stack).toBeUndefined();
      });
    });

    describe('When devMode is false (default)', () => {
      it('Then returns generic message without stack', () => {
        const result = entityErrorHandler(new Error('pg: connection refused'));
        expect(result.status).toBe(500);
        expect(result.body.error.message).toBe('An unexpected error occurred');
        expect(result.body.error.stack).toBeUndefined();
      });
    });

    describe('When the error is a known VertzException', () => {
      it('Then always includes the real message regardless of devMode', () => {
        const devResult = entityErrorHandler(
          new NotFoundException('User not found'),
          { devMode: true },
        );
        const prodResult = entityErrorHandler(
          new NotFoundException('User not found'),
        );
        expect(devResult.body.error.message).toBe('User not found');
        expect(prodResult.body.error.message).toBe('User not found');
      });
    });
  });

  // ── Service handler ──

  describe('Given a service route handler throws an unknown Error', () => {
    describe('When devMode is true', () => {
      it('Then the 500 response includes the real error message and stack', async () => {
        const routes = generateServiceRoutes(
          throwingServiceDef,
          registry,
          { devMode: true },
        );
        const route = routes.find((r) => r.path.includes('failing'));
        const response = await route!.handler(authenticatedCtx);
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body.error.code).toBe('InternalError');
        expect(body.error.message).toBe('Redis timeout');
        expect(body.error.stack).toBeDefined();
      });
    });

    describe('When devMode is false', () => {
      it('Then the 500 response returns generic message only', async () => {
        const routes = generateServiceRoutes(
          throwingServiceDef,
          registry,
          { devMode: false },
        );
        const route = routes.find((r) => r.path.includes('failing'));
        const response = await route!.handler(authenticatedCtx);
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body.error.code).toBe('InternalError');
        expect(body.error.message).toBe('An unexpected error occurred');
        expect(body.error.stack).toBeUndefined();
      });
    });

    describe('When handler throws a VertzException', () => {
      it('Then returns the proper status code regardless of devMode', async () => {
        // NotFoundException thrown → 404 NotFound (not wrapped as 500)
        const routes = generateServiceRoutes(
          notFoundServiceDef,
          registry,
          { devMode: false },
        );
        const route = routes.find((r) => r.path.includes('missing'));
        const response = await route!.handler(authenticatedCtx);
        const body = await response.json();
        expect(response.status).toBe(404);
        expect(body.error.code).toBe('NotFound');
      });
    });
  });

  // ── Agent handler ──

  describe('Given an agent route handler throws an unknown Error', () => {
    describe('When devMode is true', () => {
      it('Then the 500 response includes the real error message and stack', async () => {
        const routes = generateAgentRoutes(
          [throwingAgent],
          throwingRunner,
          { devMode: true },
        );
        const route = routes[0];
        const response = await route.handler(agentCtx);
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body.error.code).toBe('InternalError');
        expect(body.error.message).toBe('LLM provider timeout');
        expect(body.error.stack).toBeDefined();
      });
    });

    describe('When devMode is false', () => {
      it('Then the 500 response returns generic message only', async () => {
        const routes = generateAgentRoutes(
          [throwingAgent],
          throwingRunner,
          { devMode: false },
        );
        const route = routes[0];
        const response = await route.handler(agentCtx);
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body.error.code).toBe('InternalError');
        expect(body.error.message).toBe('An unexpected error occurred');
        expect(body.error.stack).toBeUndefined();
      });
    });

    describe('When a SessionError is thrown', () => {
      it('Then returns 404 regardless of devMode', async () => {
        const routes = generateAgentRoutes(
          [sessionErrorAgent],
          sessionErrorRunner,
          { devMode: true },
        );
        const route = routes[0];
        const response = await route.handler(agentCtx);
        const body = await response.json();
        expect(response.status).toBe(404);
        expect(body.error.code).toBe('NotFound');
      });
    });
  });

  // ── Auth catch-all ──

  describe('Given the auth catch-all catches an unknown Error', () => {
    describe('When isProduction is false (dev mode)', () => {
      it('Then the 500 response includes the real error message and stack', async () => {
        const auth = createAuth({ ...config, isProduction: false });
        const response = await auth.handler(crashingRequest);
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body.error.code).toBe('InternalError');
        expect(body.error.message).toContain('crash');
        expect(body.error.stack).toBeDefined();
      });
    });

    describe('When isProduction is true', () => {
      it('Then the 500 response returns structured generic message only', async () => {
        const auth = createAuth({ ...config, isProduction: true });
        const response = await auth.handler(crashingRequest);
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body.error.code).toBe('InternalError');
        expect(body.error.message).toBe('Internal server error');
        expect(body.error.stack).toBeUndefined();
      });
    });
  });

  // ── Negative type tests ──

  // @ts-expect-error — devMode must be boolean, not string
  entityErrorHandler(new Error('x'), { devMode: 'yes' });
});
```

## Security Considerations

- **Known exceptions (VertzException, EntityError) always pass through their message** — these are developer-authored messages, safe in all modes.
- **Unknown errors are only exposed in dev mode** — the `devMode` flag defaults to `false`, maintaining the current secure-by-default behavior.
- **Stack traces in dev mode only** — stack traces reveal file paths and internal structure. Acceptable in development, never in production.
- **SEC-1 (details stripping) unchanged** — `VertzException.details` continues to be stripped in all modes. Only `ValidationException.errors` and `EntityValidationError.errors` are passed through.
- **Default-safe for direct callers** — `entityErrorHandler` without options defaults to production behavior. Service/agent generators without `devMode` also default to production behavior.

## Breaking Changes

- **Error code normalization:** Service and agent route handlers change from `'InternalServerError'` to `'InternalError'` for 500 responses. Consumers matching on this code string will need to update. Acceptable under pre-v1 policy.
- **Auth catch-all response format:** Production auth error responses change from `{ error: string }` to `{ error: { code, message } }`. Consumers matching on `typeof error === 'string'` will need to update. This is a minor improvement that eliminates a polymorphic response shape.
- **Service/agent VertzException handling:** Service and agent handlers now properly classify `VertzException` subclasses (e.g., `NotFoundException` → 404 instead of 500). This is a behavior improvement, not a regression.

## Review Sign-offs

### DX (Rev 1) — Changes Requested
- [x] Normalize `InternalError` vs `InternalServerError` → addressed in Rev 2
- [x] `formatUnknownError` bare boolean → eliminated, reuse `entityErrorHandler`
- [x] Auth response shape divergence → normalized to structured format in both modes
- [x] Document default behavior when `devMode` omitted → added
- [x] JSDoc on `stack` field → added
- [x] Flesh out service/agent tests → done
- [x] Note `devMode`/`isProduction` polarity → added in auth section

### Product/Scope (Rev 1) — Approved
- [x] Non-Error test case → added

### Technical (Rev 1) — Changes Requested
- [x] `EntityRouteOptions` + 14 call sites not shown → added to API Surface
- [x] Public export backward compat → added note
- [x] `ServerConfig.devMode` override → added
- [x] Error code normalization → called out as breaking change
- [x] Auth catch-all format divergence → normalized
- [x] Non-Error test case → added
