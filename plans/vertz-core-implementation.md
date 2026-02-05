# @vertz/core — Implementation Plan

## Overview

Complete rewrite of `@vertz/core` from scratch. The legacy implementation (decorator-based, class-oriented, Fastify-dependent) is replaced with a functional, zero-dependency approach using Web Standard APIs.

All code is new. The legacy package serves as reference for patterns only.

See also: [Core API Design](./vertz-core-api-design.md), [Schema Design](./vertz-schema-design.md), [Testing Design](./vertz-testing-design.md), [Compiler Design](./vertz-compiler-design.md).

---

## Architectural Decisions

| Decision | Choice |
|----------|--------|
| HTTP Server | Custom thin layer, Web Standard APIs (Request/Response), zero deps |
| Runtime adapters | Node.js (node:http), Bun (Bun.serve), Edge/Workers (native fetch) |
| DI | Compiler-driven — boot sequence from compiler, runtime just executes |
| Middleware | No `next()`. Handler returns contribution. Short-circuit via exceptions |
| Context | Two contexts: `deps` (startup) and `ctx` (per-request). Both flat and immutable |
| API surface | `vertz` namespace object (`vertz.app()`, `vertz.env()`, etc.) |
| Exceptions | Full hierarchy from start. Middleware short-circuits by throwing |
| Immutability | Three layers: TypeScript DeepReadonly + Object.freeze (prod) + Proxy (dev) |
| OpenAPI serving | Separate package, NOT in @vertz/core |
| Lifecycle hooks | `onInit(deps) → state`, `methods(deps, state)`, `onDestroy(deps, state)` |
| Dependencies | Zero runtime deps except `@vertz/schema` (workspace) |

---

## Package Structure

```
packages/core/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts                           # Public API: exports vertz namespace + exceptions + types
│   ├── vertz.ts                           # The vertz namespace object
│   │
│   ├── types/
│   │   ├── index.ts                       # Re-exports all types
│   │   ├── deep-readonly.ts               # DeepReadonly<T> utility type
│   │   ├── context.ts                     # Deps<T>, Ctx<T>, RawRequest
│   │   ├── schema-infer.ts               # InferSchema<T> helper
│   │   ├── http.ts                        # HTTP method literals, status codes
│   │   ├── module.ts                      # ModuleDef, Module, ServiceDef, RouterDef types
│   │   ├── middleware.ts                  # MiddlewareDef, requires/provides types
│   │   ├── app.ts                         # AppConfig, AppBuilder types
│   │   ├── env.ts                         # EnvConfig type
│   │   ├── server-adapter.ts             # ServerAdapter, ServerHandle, ListenOptions
│   │   ├── boot-sequence.ts              # BootInstruction, BootSequence types
│   │   └── __tests__/
│   │       └── deep-readonly.test.ts      # Type-level tests (expectTypeOf)
│   │
│   ├── exceptions/
│   │   ├── index.ts
│   │   ├── vertz-exception.ts             # Base VertzException class
│   │   ├── http-exceptions.ts             # BadRequest, Unauthorized, Forbidden, NotFound, Conflict, Validation, InternalServerError, ServiceUnavailable
│   │   └── __tests__/
│   │       └── exceptions.test.ts
│   │
│   ├── immutability/
│   │   ├── index.ts                       # makeImmutable() — picks strategy by NODE_ENV
│   │   ├── freeze.ts                      # deepFreeze() for production
│   │   ├── dev-proxy.ts                   # createImmutableProxy() for development
│   │   └── __tests__/
│   │       ├── freeze.test.ts
│   │       └── dev-proxy.test.ts
│   │
│   ├── env/
│   │   ├── index.ts
│   │   ├── env-loader.ts                  # .env file parser (zero deps)
│   │   ├── env-validator.ts               # Validates env against @vertz/schema
│   │   └── __tests__/
│   │       ├── env-loader.test.ts
│   │       └── env-validator.test.ts
│   │
│   ├── server/
│   │   ├── index.ts
│   │   ├── request-utils.ts               # Parse URL, query, headers, body from Request
│   │   ├── response-utils.ts              # Build Response from handler result
│   │   ├── cors.ts                        # Built-in CORS (zero dep)
│   │   └── __tests__/
│   │       ├── request-utils.test.ts
│   │       ├── response-utils.test.ts
│   │       └── cors.test.ts
│   │
│   ├── adapters/
│   │   ├── index.ts                       # detectAdapter() — auto-detect Bun vs Node
│   │   ├── node-adapter.ts               # node:http → Request/Response bridge
│   │   ├── bun-adapter.ts                # Bun.serve adapter
│   │   ├── web-adapter.ts                # toFetchHandler() for edge/Workers
│   │   └── __tests__/
│   │       ├── node-adapter.test.ts
│   │       └── bun-adapter.test.ts
│   │
│   ├── router/
│   │   ├── index.ts
│   │   ├── trie.ts                        # Radix trie for route matching
│   │   ├── route-matcher.ts               # Match request, extract params
│   │   └── __tests__/
│   │       ├── trie.test.ts
│   │       └── route-matcher.test.ts
│   │
│   ├── middleware/
│   │   ├── index.ts
│   │   ├── middleware-def.ts              # vertz.middleware() factory
│   │   ├── middleware-runner.ts            # Execute chain, accumulate state
│   │   └── __tests__/
│   │       ├── middleware-def.test.ts
│   │       └── middleware-runner.test.ts
│   │
│   ├── di/
│   │   ├── index.ts
│   │   ├── boot-executor.ts               # Execute compiler-generated boot sequence
│   │   └── __tests__/
│   │       └── boot-executor.test.ts
│   │
│   ├── module/
│   │   ├── index.ts
│   │   ├── module-def.ts                  # vertz.moduleDef() factory
│   │   ├── module.ts                      # vertz.module() assembly
│   │   ├── service.ts                     # moduleDef.service() with lifecycle
│   │   ├── router-def.ts                 # moduleDef.router() + .get/.post chains
│   │   └── __tests__/
│   │       ├── module-def.test.ts
│   │       ├── module.test.ts
│   │       ├── service.test.ts
│   │       └── router-def.test.ts
│   │
│   ├── app/
│   │   ├── index.ts
│   │   ├── app-builder.ts                # vertz.app() and builder chain
│   │   ├── app-runner.ts                 # Internal: wire everything, build request handler
│   │   └── __tests__/
│   │       ├── app-builder.test.ts
│   │       └── app-runner.test.ts
│   │
│   ├── context/
│   │   ├── index.ts
│   │   ├── deps-builder.ts               # Build module-level deps
│   │   ├── ctx-builder.ts                # Build per-request ctx
│   │   └── __tests__/
│   │       ├── deps-builder.test.ts
│   │       └── ctx-builder.test.ts
│   │
│   └── testing/
│       ├── index.ts                       # vertz.testing namespace
│       ├── test-app.ts                   # createApp() test builder
│       ├── test-request.ts               # Simulated request execution
│       └── __tests__/
│           └── test-app.test.ts
```

---

## The `vertz` Namespace Object

Single public API entry point:

```typescript
// src/vertz.ts
export const vertz = {
  env:        createEnv,           // vertz.env({ load, schema })
  middleware: createMiddleware,     // vertz.middleware({ inject, requires, provides, handler, ... })
  moduleDef:  createModuleDef,     // vertz.moduleDef({ name, imports, options })
  module:     createModule,        // vertz.module(def, { services, routers, exports })
  app:        createApp,           // vertz.app({ basePath, version, cors, ... })
  testing: {
    createApp:     createTestApp,     // vertz.testing.createApp()
    createService: createTestService, // vertz.testing.createService(serviceDef)
  },
};
```

```typescript
// src/index.ts
export { vertz } from './vertz';
export type { ... } from './types';
export { VertzException, BadRequestException, ... } from './exceptions';
```

---

## Key Implementation Details

### 1. Exception System

```typescript
// src/exceptions/vertz-exception.ts
export class VertzException extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code?: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code ?? this.name;
    this.details = details;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      ...(this.details !== undefined && { details: this.details }),
    };
  }
}
```

Subclasses: `BadRequestException` (400), `UnauthorizedException` (401), `ForbiddenException` (403), `NotFoundException` (404), `ConflictException` (409), `ValidationException` (422, with `errors` array from schema validation), `InternalServerErrorException` (500), `ServiceUnavailableException` (503).

### 2. Immutability — Three Layers

```typescript
// src/immutability/index.ts
export function makeImmutable<T extends object>(obj: T, contextName: string): DeepReadonly<T> {
  if (process.env.NODE_ENV === 'development') {
    return createImmutableProxy(obj, contextName);  // Proxy with helpful error messages
  }
  return deepFreeze(obj);  // Object.freeze() recursive
}
```

**Dev Proxy** intercepts `set`/`deleteProperty` and throws with contextual messages:
```
Cannot set property "id" on ctx.params. ctx is immutable.
Middleware should return its contribution instead of mutating ctx.
```

### 3. HTTP Server — Web Standard APIs

**Core interface:**

```typescript
// src/types/server-adapter.ts
export interface ServerAdapter {
  listen(
    port: number,
    handler: (request: Request) => Promise<Response>,
    options?: ListenOptions
  ): Promise<ServerHandle>;
}

export interface ServerHandle {
  port: number;
  hostname: string;
  close(): Promise<void>;
}
```

**Auto-detection:** `detectAdapter()` checks `typeof Bun !== 'undefined'` → Bun adapter, else Node adapter.

**Node adapter:** Uses `node:http`, converts `IncomingMessage` → `Request`, writes `Response` → `ServerResponse`.

**Bun adapter:** Uses `Bun.serve({ fetch: handler })` — native Request/Response.

**Edge adapter:** `toFetchHandler()` — identity wrapper, returns the handler directly.

### 4. Route Matching — Radix Trie

Custom zero-dep trie. Key properties:
- Segments split by `/`
- Priority: static > `:param` > `*` wildcard
- Param extraction during traversal (no second pass)
- O(n) where n = number of path segments
- No regex at runtime

```typescript
// src/router/trie.ts
interface TrieNode {
  staticChildren: Map<string, TrieNode>;
  paramChild: { name: string; node: TrieNode } | null;
  wildcardChild: TrieNode | null;
  handlers: Map<string, RouteHandler>;  // keyed by HTTP method
}

interface MatchResult {
  handler: RouteHandler;
  params: Record<string, string>;
}
```

### 5. Middleware Execution

No `next()`. Handler returns contribution. State accumulates via spread.

**`ResolvedMiddleware`** — the middleware definition with its `inject` dependencies already resolved from the service map. The app runner resolves these once at boot time, not per-request:

```typescript
// src/middleware/middleware-runner.ts

interface ResolvedMiddleware {
  name: string;
  handler: (ctx: Record<string, unknown>) => Promise<unknown> | unknown;
  resolvedInject: Record<string, unknown>;  // pre-resolved from service map at boot
  headersSchema?: Schema<any>;
  paramsSchema?: Schema<any>;
  querySchema?: Schema<any>;
  bodySchema?: Schema<any>;
  requiresSchema?: Schema<any>;
  providesSchema?: Schema<any>;
}

export async function runMiddlewareChain(
  middlewares: ResolvedMiddleware[],
  requestCtx: Record<string, unknown>,  // params, body, query, headers, raw
): Promise<Record<string, unknown>> {
  let state: Record<string, unknown> = {};

  for (const mw of middlewares) {
    // Build the ctx this middleware sees:
    // request data + injected services (from mw.inject) + accumulated state
    const ctx = {
      ...requestCtx,
      ...mw.resolvedInject,  // ← injected services (e.g., ctx.tokenService)
      state: { ...state },
    };

    // Validate requires schema if present (runtime safety net, compiler validates at build time)
    if (mw.requiresSchema) mw.requiresSchema.parse(state);

    // Validate request schemas if middleware defines them
    if (mw.headersSchema) mw.headersSchema.parse(requestCtx.headers);
    if (mw.paramsSchema) mw.paramsSchema.parse(requestCtx.params);
    if (mw.querySchema) mw.querySchema.parse(requestCtx.query);
    if (mw.bodySchema) mw.bodySchema.parse(requestCtx.body);

    // Execute — returns contribution. Throws VertzException to short-circuit.
    const contribution = await mw.handler(ctx);

    // Validate provides schema if present
    if (mw.providesSchema && contribution !== undefined) mw.providesSchema.parse(contribution);

    // Accumulate state
    if (contribution && typeof contribution === 'object') {
      state = { ...state, ...contribution };
    }
  }

  return state;
}
```

Middleware `inject` resolution happens in the app runner at boot time: for each middleware, the `inject` references are looked up in the service map (populated by the boot executor) and stored as `resolvedInject`. This means the per-request middleware execution only spreads pre-resolved references — no lookup on the hot path.

### 6. DI Boot Executor

Compiler provides a topologically sorted boot sequence. Runtime executes it linearly.

```typescript
// src/di/boot-executor.ts
export class BootExecutor {
  private instances = new Map<string, ServiceInstance>();
  private shutdownOrder: string[] = [];

  async execute(sequence: BootSequence): Promise<Map<string, unknown>> {
    for (const instruction of sequence.instructions) {
      switch (instruction.type) {
        case 'env':    await this.executeEnv(instruction); break;
        case 'service': await this.executeService(instruction); break;
        case 'module':  await this.executeModule(instruction); break;
      }
    }
    this.shutdownOrder = sequence.shutdownOrder;
    return this.getServiceMap();
  }

  private async executeService(instr: ServiceBootInstruction): Promise<void> {
    // 1. Resolve deps (already instantiated, guaranteed by topological sort)
    const deps = this.resolveDeps(instr.deps);

    // 2. Run onInit if defined → capture state
    const state = instr.factory.onInit
      ? await instr.factory.onInit(makeImmutable(deps, 'deps'))
      : undefined;

    // 3. Call methods(deps, state) → capture public API
    const methods = instr.factory.methods(makeImmutable(deps, 'deps'), state);

    // 4. Store instance + onDestroy reference
    this.instances.set(instr.id, {
      id: instr.id,
      instance: methods,
      onDestroy: instr.factory.onDestroy
        ? () => instr.factory.onDestroy!(makeImmutable(deps, 'deps'), state)
        : undefined,
    });
  }

  async shutdown(): Promise<void> {
    // Call onDestroy in reverse initialization order
    for (const id of this.shutdownOrder) {
      const svc = this.instances.get(id);
      if (svc?.onDestroy) await svc.onDestroy();
    }
    this.instances.clear();
  }
}
```

### 7. Service Lifecycle Hooks

`onInit` returns **state** that flows as second parameter to `methods` and `onDestroy`:

```typescript
const dbService = coreModuleDef.service({
  inject: { env },

  onInit: async (deps) => {
    const client = new PrismaClient({ datasourceUrl: deps.env.DATABASE_URL });
    await client.$connect();
    return client;  // ← TypeScript infers TState = PrismaClient
  },

  onDestroy: async (deps, client) => {
    await client.$disconnect();  // client is typed as PrismaClient
  },

  methods: (deps, client) => ({
    user: {
      findUnique: (args) => client.user.findUnique(args),  // client is typed
      findMany: (args) => client.user.findMany(args),
    },
  }),
});
```

Services without lifecycle are unchanged:

```typescript
const userService = userModuleDef.service({
  inject: { dbService },
  methods: (deps) => ({
    findById: async (id: string) => deps.dbService.user.findUnique({ where: { id } }),
  }),
});
```

**Type inference:** `TState` is inferred from `onInit` return type and threads through `methods` and `onDestroy`. When `onInit` is absent, `methods` receives only `deps`.

### 8. Two Contexts: `deps` vs `ctx`

**deps** — module-level, created once at startup:
```typescript
// Built by deps-builder.ts
{
  options: { requireEmailVerification: false },  // module options
  env: { DATABASE_URL: '...', JWT_SECRET: '...' },
  dbService: { user: { findUnique, findMany, ... } },  // injected services
}
```

**ctx** — per-request, flat structure:
```typescript
// Built by ctx-builder.ts
{
  params: { id: '123' },           // validated path params
  body: { name: 'Jane', ... },     // validated request body
  query: { page: 1, limit: 20 },   // validated query params
  headers: { authorization: '...' }, // validated headers
  raw: { request, headers, url, method }, // raw Request
  state: { user: { id: '1', role: 'admin' } }, // middleware state
  user: { id: '1', role: 'admin' }, // flattened middleware state
  userService: { findById, ... },   // flattened injected services
  options: { ... },                 // module options
  env: { ... },                     // environment variables
}
```

Both are immutable via `makeImmutable()`. Compiler prevents naming collisions between flattened services, middleware state, and request properties.

### 9. Request Lifecycle

```
Request
  → detectAdapter() [Node/Bun/Edge]
  → parseRequest() [URL, path, query, headers]
  → CORS preflight check
  → trie.match(method, path) [route + params extraction]
  → parseBody() [lazy, only if route has body schema]
  → validate params/query/headers/body against route schemas
  → runMiddlewareChain() [global → router → route middlewares]
  → buildCtx() [flat, immutable]
  → route handler(ctx)
  → validate response (dev mode only)
  → createJsonResponse()
  → CORS headers
  → Response
```

Error handling at each stage:
- Schema validation failure → `ValidationException` (422)
- `VertzException` thrown → serialized with `toJSON()` at correct status code
- Unexpected error → 500 with stack in dev, generic message in prod

### 10. Environment Validation

```typescript
// vertz.env() implementation
export function createEnv(config: { load?: string[]; schema: Schema<any> }) {
  // 1. Parse .env files (zero-dep parser: KEY=value, quotes, comments)
  // 2. Merge with process.env (process.env wins)
  // 3. Validate with schema.safeParse()
  // 4. On failure: throw with formatted error listing all issues
  // 5. On success: return validated, frozen env object
}
```

The `.env` parser handles: `KEY=value`, quoted values (`"..."`, `'...'`), comments (`#`), blank lines, inline comments. File reading uses runtime detection: `Bun.file()` first, fallback to `node:fs/promises`.

### 11. CORS (Built-in, Zero Deps)

```typescript
interface CorsConfig {
  origins?: string | string[] | boolean;  // true = '*'
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
  exposedHeaders?: string[];
}
```

Handles OPTIONS preflight → 204. Adds headers to actual responses. Supports origin allowlisting, credentials, exposed headers, max-age.

### 12. Testing Support

`vertz.testing.createApp()` returns a builder with the same patterns as the testing design plan:

```typescript
const app = vertz.testing
  .createApp()
  .env({ DATABASE_URL: '...', JWT_SECRET: '...' })
  .mock(dbService, mockDb)
  .mockMiddleware(authMiddleware, { user: { id: '1', role: 'admin' } })
  .register(coreModule)
  .register(userModule, { requireEmailVerification: false });

const res = await app.get('/users/:id', { params: { id: '123' } });
```

Internally: builds a real app with mocked services/middleware, creates synthetic `Request`, passes through the same handler pipeline, returns `{ status, body, headers, ok }`.

---

## package.json

```json
{
  "name": "@vertz/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./adapters/node": { "import": "./dist/adapters/node-adapter.js", "types": "./dist/adapters/node-adapter.d.ts" },
    "./adapters/bun": { "import": "./dist/adapters/bun-adapter.js", "types": "./dist/adapters/bun-adapter.d.ts" }
  },
  "dependencies": {
    "@vertz/schema": "workspace:*"
  },
  "devDependencies": {
    "tsup": "...",
    "typescript": "...",
    "vitest": "..."
  }
}
```

Zero runtime deps other than `@vertz/schema`. No Fastify. No reflect-metadata.

---

## Implementation Phases (TDD)

### Phase 1: Foundation Types and Exceptions

**Files:** `types/`, `exceptions/`

- Type-level tests for `DeepReadonly` using `expectTypeOf`
- `DeepReadonly`, `Deps`, `Ctx`, `RawRequest`, `InferSchema` types
- Full exception hierarchy with `toJSON()`, status codes, `instanceof` checks
- `ValidationException` with errors array

### Phase 2: Immutability

**Files:** `immutability/`

- `deepFreeze()`: nested objects, arrays, no-op on primitives
- `createImmutableProxy()`: set throws with helpful message, delete throws, nested proxy
- `makeImmutable()`: picks strategy by `NODE_ENV`

### Phase 3: Environment

**Files:** `env/`

- `.env` file parser: key=value, quotes, comments, blank lines
- `createEnv()`: schema validation, process.env merge, formatted error on failure

### Phase 4: Route Matching (Trie)

**Files:** `router/`

- Static routes, param routes (`:id`), wildcard routes
- Priority: static > param > wildcard
- Param extraction during traversal
- Nested params: `/users/:userId/posts/:postId`
- 404 no match, method routing

### Phase 5: HTTP Server Layer

**Files:** `server/`, `adapters/`

- `parseRequest()`: method, path, query, headers
- `parseBody()`: JSON, form-urlencoded, text
- Response utilities: `createJsonResponse()`, `createErrorResponse()`
- CORS: preflight, header injection, credentials
- Node adapter: `IncomingMessage` ↔ `Request`/`Response`
- Bun adapter: `Bun.serve({ fetch })`

### Phase 6: Middleware Definition and Chain

**Files:** `middleware/`

- `createMiddleware()` factory: captures inject, headers, params, query, body, requires, provides, handler
- Empty chain → empty state
- Single/multiple middlewares accumulate state
- Injected services resolved and available on middleware ctx
- Exception short-circuits chain
- Schema validation on requires/provides

### Phase 7: Module/Service/Router Factories

**Files:** `module/`

- `createModuleDef()`: captures name, imports, options schema
- `createServiceDef()`: captures inject, methods, lifecycle hooks
- `createRouterDef()`: captures prefix, inject, route registrations via `.get()/.post()`
- `createModule()`: validates service ownership, export subset

### Phase 8: DI Boot Executor

**Files:** `di/`

- Execute linear dependency chain
- Execute diamond dependency
- Lifecycle hooks: onInit returns state → methods receives state → onDestroy receives state
- Shutdown in reverse module order

### Phase 9: Context Building

**Files:** `context/`

- `buildDeps()`: options + env + injected services, immutable
- `buildCtx()`: params + body + query + headers + state + raw + services (flat), immutable

### Phase 10: App Composition and Full Integration

**Files:** `app/`

- `createApp()` builder: config, middleware, module registration
- `buildApp()`: full wiring — boot executor + trie router + middleware + schema validation + response
- Integration tests: full request lifecycle, error handling, CORS

### Phase 11: Testing Support

**Files:** `testing/`

- `createTestApp()`: mock services, mock middleware, env overrides
- Test request execution: GET, POST with body, response parsing
- Per-request overrides via `.mockMiddleware()` on request builder

### Phase 12: Entry Point and Public API

**Files:** `index.ts`, `vertz.ts`

- Wire everything in `vertz` namespace
- Verify all exports
- Full test suite pass
- Package builds with tsup

---

## Verification

1. **Zero deps**: Only `@vertz/schema` in dependencies
2. **ESM only**: `"type": "module"`, all ESM imports
3. **Tests pass**: `vitest run` exits cleanly
4. **Types pass**: `tsc --noEmit` with strict mode
5. **Immutability**: Setting properties on deps/ctx throws in both dev (Proxy) and prod (freeze)
6. **Request lifecycle**: Request → route match → middleware → validation → handler → response
7. **Exceptions**: Correct HTTP status codes and JSON serialization
8. **Env validation**: Missing/invalid vars produce clear error messages
9. **Lifecycle hooks**: onInit at startup, onDestroy at shutdown, state flows correctly
10. **No legacy code**: No decorators, no reflect-metadata, no Fastify
11. **Build output**: tsup produces clean ESM with `.d.ts`
12. **Adapters**: Both Node and Bun work with the same core handler

---

## Open Items

- [ ] **Graceful shutdown signals** — How does `app.listen()` handle SIGTERM/SIGINT? Auto-register signal handlers or leave to user?
- [ ] **Streaming responses** — Support for `ReadableStream` responses (SSE, file downloads)
- [ ] **WebSocket/SSE** — API shape TBD (route methods vs separate construct). Deferred to later phase.
- [ ] **Request ID** — Should the framework auto-generate request IDs or leave to middleware?
- [ ] **Logging** — Structured logging integration. Separate package or built-in minimal logger?
- [ ] **Static file serving** — Separate package or built-in?
- [ ] **Rate limiting** — Middleware pattern or built-in?
- [ ] **Content negotiation** — Support for Accept header beyond JSON?
