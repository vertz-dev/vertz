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
| Immutability | TypeScript DeepReadonly (compile-time) + Proxy (dev runtime). No freeze in production |
| OpenAPI serving | JSON spec endpoint (`/openapi.json`) in `@vertz/core`. Documentation UI (Swagger/interactive docs) in a separate package |
| Lifecycle hooks | `onInit(deps) → state`, `methods(deps, state)`, `onDestroy(deps, state)` |
| Build toolchain | Bunup (Bun's bundler + Oxc for `.d.ts`). Requires Bun installed to build; output is standard ESM consumable by any runtime |
| Dependencies | Zero runtime deps except `@vertz/schema` (workspace) |

---

## Package Structure

```
packages/core/
├── package.json
├── tsconfig.json
├── bunup.config.ts
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
│   │   ├── env-validator.ts               # Validates env against @vertz/schema, native .env loading
│   │   └── __tests__/
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
│   └── (no testing/ — lives in @vertz/testing package)
```

---

## The `vertz` Namespace Object

Single public API entry point:

```typescript
// src/vertz.ts (@vertz/core)
export const vertz = {
  env:        createEnv,           // vertz.env({ load, schema })
  middleware: createMiddleware,     // vertz.middleware({ inject, requires, provides, handler, ... })
  moduleDef:  createModuleDef,     // vertz.moduleDef({ name, imports, options })
  module:     createModule,        // vertz.module(def, { services, routers, exports })
  app:        createApp,           // vertz.app({ basePath, version, cors, ... })
};
```

The `testing` namespace lives in `@vertz/testing`:

```typescript
// @vertz/testing — direct exports, no namespace re-export
export { createTestApp } from './test-app';
export { createTestService } from './test-service';
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
  // Production: no runtime enforcement — TypeScript's DeepReadonly provides compile-time safety,
  // and the dev proxy catches mutations during development. Skipping deepFreeze in production
  // avoids the overhead of recursively walking and freezing objects on every request.
  return obj as DeepReadonly<T>;
}
```

**Dev Proxy** intercepts `set`/`deleteProperty` and throws with contextual messages:
```
Cannot set property "id" on ctx.params. ctx is immutable.
Middleware should return its contribution instead of mutating ctx.
```

In production, immutability is enforced at two levels: TypeScript's `DeepReadonly<T>` at compile time, and the dev proxy at development time. `Object.freeze()` is not used in production — the dev proxy already catches mutation bugs during development, and freezing objects on the hot path (per-request ctx) would add unnecessary overhead for no practical benefit.

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

**`app.handler` for edge runtimes:** The app builder exposes a `handler` getter that returns the internal `(request: Request) => Promise<Response>` function without starting a listener. This is the connection point for edge/Workers runtimes:

```typescript
// src/app/app-builder.ts
class AppBuilder {
  // ...

  /** Returns the raw fetch handler for edge runtimes (no listener) */
  get handler(): (request: Request) => Promise<Response> {
    // Lazily builds the app (boot executor, trie, middleware chain) on first access
    if (!this._handler) this._handler = this.buildHandler();
    return this._handler;
  }

  /** Starts a listener using the detected adapter (Node/Bun) */
  async listen(port?: number): Promise<ServerHandle> {
    const adapter = detectAdapter();
    return adapter.listen(port ?? 3000, this.handler);
  }
}
```

Usage on edge runtimes:

```typescript
// Cloudflare Workers
import { app } from './app';
export default { fetch: app.handler };

// Deno Deploy
import { app } from './app';
Deno.serve(app.handler);
```

### 4. Route Matching — Radix Trie

Custom zero-dep trie. Key properties:
- Segments split by `/`
- Priority: static > `:param` > `*` wildcard
- Param extraction during traversal (no second pass)
- O(n) where n = number of path segments
- No regex at runtime
- **HEAD**: The router-def exposes `.head()` for explicit HEAD routes (e.g., existence checks, validation endpoints). Additionally, every GET route auto-generates a HEAD handler that runs the same pipeline but strips the response body — so HEAD works out of the box for GET routes, but devs can override with a dedicated `.head()` when they need custom logic.
- **OPTIONS**: Handled entirely by the CORS layer before trie matching. If CORS is disabled, the trie returns a 405 with `Allow` header listing registered methods for that path.

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

**No ctx key collisions (compiler-enforced):** Route handler `ctx` is a flat namespace. The compiler guarantees that all keys are unique across three sources:

1. **Reserved names** — `params`, `body`, `query`, `headers`, `raw`, `options`, `env`. Cannot be used by middleware `provides` or service injection.
2. **Middleware provides keys** — Two middlewares in the same chain providing the same key is a build error. No silent overwrite.
3. **Injected service names** — A service name cannot collide with a middleware `provides` key or a reserved name.

As a runtime safety net, `buildCtx()` also checks against these rules and throws in development mode if a collision is detected.

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
  const accumulated: Record<string, unknown> = {};

  // Single ctx object reused across all middlewares in the chain.
  // Each iteration mutates the same object via Object.assign — no allocation per middleware.
  // Safe because: (1) ctx is internal to this function, (2) middleware receives it as
  // immutable (dev proxy), (3) accumulated is a reference that accumulates contributions.
  const ctx: Record<string, unknown> = {};

  for (const mw of middlewares) {
    // Rebuild ctx: request data + injected services + accumulated middleware contributions.
    // Middleware sees a flat namespace — same access pattern as route handlers (ctx.user, not ctx.state.user).
    Object.assign(ctx, requestCtx, mw.resolvedInject, accumulated);

    // Validate requires schema if present (runtime safety net, compiler validates at build time)
    if (mw.requiresSchema) mw.requiresSchema.parse(accumulated);

    // Validate request schemas if middleware defines them
    if (mw.headersSchema) mw.headersSchema.parse(requestCtx.headers);
    if (mw.paramsSchema) mw.paramsSchema.parse(requestCtx.params);
    if (mw.querySchema) mw.querySchema.parse(requestCtx.query);
    if (mw.bodySchema) mw.bodySchema.parse(requestCtx.body);

    // Execute — returns contribution. Throws VertzException to short-circuit.
    const contribution = await mw.handler(ctx);

    // Validate provides schema if present
    if (mw.providesSchema && contribution !== undefined) mw.providesSchema.parse(contribution);

    // Accumulate contributions flat — no nesting under "state"
    if (contribution && typeof contribution === 'object') {
      Object.assign(accumulated, contribution);
    }
  }

  return accumulated;
}
```

Middleware `inject` resolution happens in the app runner at boot time: for each middleware, the `inject` references are looked up in the service map (populated by the boot executor) and stored as `resolvedInject`. This means the per-request middleware execution only spreads pre-resolved references — no lookup on the hot path.

### 6. DI Boot Executor

Compiler provides a topologically sorted boot sequence as a **JS module with live imports**. The generated boot file imports actual service/module definitions from user code — it is NOT a JSON manifest. This means the runtime receives real references with full type information.

**Boot sequence contract:**

```typescript
// src/types/boot-sequence.ts

/** The compiler generates a module that exports this shape */
export interface BootSequence {
  instructions: BootInstruction[];
  shutdownOrder: string[];  // service IDs in reverse init order
}

export type BootInstruction =
  | ServiceBootInstruction
  | ModuleBootInstruction;

export interface ServiceBootInstruction {
  type: 'service';
  id: string;                      // unique identifier (e.g., 'core.dbService')
  deps: string[];                  // IDs of services this depends on (already instantiated)
  factory: ServiceFactory;         // live reference to the service definition
}

export interface ModuleBootInstruction {
  type: 'module';
  id: string;
  services: string[];              // service IDs belonging to this module
  options?: Record<string, unknown>;
}

/** The shape the runtime expects from a service definition */
export interface ServiceFactory<TDeps = any, TState = any, TMethods = any> {
  inject?: Record<string, unknown>;
  onInit?: (deps: TDeps) => Promise<TState> | TState;
  methods: (deps: TDeps, state: TState) => TMethods;
  onDestroy?: (deps: TDeps, state: TState) => Promise<void> | void;
}
```

**Example compiler output** (generated boot file):

```typescript
// .vertz/boot.ts (compiler-generated)
import { dbService } from '../src/core/db.service';
import { userService } from '../src/user/user.service';
import { coreModule } from '../src/core/core.module';
import { userModule } from '../src/user/user.module';

export const bootSequence: BootSequence = {
  instructions: [
    { type: 'service', id: 'core.dbService', deps: [], factory: dbService },
    { type: 'service', id: 'user.userService', deps: ['core.dbService'], factory: userService },
    { type: 'module', id: 'core', services: ['core.dbService'] },
    { type: 'module', id: 'user', services: ['user.userService'] },
  ],
  shutdownOrder: ['user.userService', 'core.dbService'],
};
```

**Boot executor:**

```typescript
// src/di/boot-executor.ts
export class BootExecutor {
  private instances = new Map<string, ServiceInstance>();
  private shutdownOrder: string[] = [];

  async execute(sequence: BootSequence): Promise<Map<string, unknown>> {
    for (const instruction of sequence.instructions) {
      switch (instruction.type) {
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
  user: { id: '1', role: 'admin' }, // middleware contribution (flat, not nested under "state")
  userService: { findById, ... },   // injected services (flat)
  options: { ... },                 // module options
  env: { ... },                     // environment variables
}
```

Both are immutable via `makeImmutable()`. Compiler prevents naming collisions between services, middleware contributions, and reserved request properties.

Middleware handlers receive the same flat structure — `ctx.user`, not `ctx.state.user`. One access pattern everywhere.

**No `AsyncLocalStorage`:** Services receive request-scoped data exclusively through function arguments. If a service method needs request context (e.g., current user, request ID), the route handler passes it explicitly:

```typescript
// Route handler passes request-scoped data to service via arguments
handler: async (ctx) => {
  const result = await ctx.orderService.create(ctx.body, ctx.user.id);
  return result;
}
```

This is an intentional design choice — implicit request context (via `AsyncLocalStorage`) creates hidden coupling between services and the HTTP layer, making services harder to test and reason about. Services should be request-agnostic; the route handler is the bridge between request context and business logic.

### 9. Request Lifecycle

```
Request
  → detectAdapter() [Node/Bun/Edge]
  → parseRequest() [URL, path, query, headers]
  → CORS preflight check
  → trie.match(method, path) [route + params extraction]
  → parseBody() [lazy, only if route or any middleware in the chain has a body schema]
  → validate params/query/headers/body against route schemas
  → runMiddlewareChain() [global → router → route middlewares]
  → buildCtx() [flat, immutable]
  → route handler(ctx)
  → validate response (dev and test modes — NODE_ENV is 'development' or 'test')
  → createJsonResponse()
  → CORS headers
  → Response
```

Error handling at each stage:
- Schema validation failure → `ValidationException` (422)
- `VertzException` thrown → serialized with `toJSON()` at correct status code
- Unexpected error → 500 with stack in dev, generic message in prod

### 10. Environment Validation

`vertz.env()` executes eagerly at import time — not deferred to the boot sequence. The env object is fully validated and frozen before any module or service initializes. This means `env` is NOT a boot instruction; it's a resolved value that modules import directly.

```typescript
// vertz.env() implementation
export function createEnv(config: { load?: string[]; schema: Schema<any> }) {
  // 1. Load .env files using native runtime support:
  //    - Node.js 22+: process.loadEnvFile() or --env-file flag
  //    - Bun: native .env loading (automatic or via Bun.env)
  //    No custom parser — minimum Node version is 22+.
  // 2. Read from process.env (already populated by runtime's native loader)
  // 3. Validate with schema.safeParse()
  // 4. On failure: throw with formatted error listing all issues
  // 5. On success: return validated, frozen env object
}
```

`.env` loading uses native runtime support exclusively. Node.js 22+ and Bun both load `.env` files natively into `process.env` — no custom parser needed. Minimum supported Node version is 22.

**Hot-reload in `vertz dev`:** When a `.env` file changes, the CLI triggers a full app reboot (kill process → re-run). Since `vertz.env()` is eager, the new process picks up the changed values automatically. Similarly, when `vertz.config.ts` changes, the CLI triggers a full reboot — the config affects compilation settings, so a clean restart is required. This is handled by the CLI's file watcher, not by the core runtime.

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

Testing support lives in `@vertz/testing` as a separate package (`packages/testing/`). Users import directly:

```typescript
import { createTestApp } from '@vertz/testing';

const app = createTestApp()
  .env({ DATABASE_URL: '...', JWT_SECRET: '...' })
  .mock(dbService, mockDb)
  .mockMiddleware(authMiddleware, { user: { id: '1', role: 'admin' } })
  .register(coreModule)
  .register(userModule, { requireEmailVerification: false });

const res = await app.get('/users/:id', { params: { id: '123' } });
```

`@vertz/testing` depends on `@vertz/core` (workspace dependency). All packages are released with linked versions, so there's no version drift concern. Keeping testing separate means:
- Users who don't test don't pull in test builder code
- `@vertz/testing` is a devDependency, not a production dependency
- Clear separation of concerns — test utilities don't bloat the core package

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
    "bunup": "...",
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

- `createEnv()`: native .env loading (Node 22+ / Bun), schema validation, process.env merge, formatted error on failure

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
- `createRouterDef()`: captures prefix, inject, route registrations via `.get()/.post()/.head()` etc.
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
- `buildCtx()`: params + body + query + headers + raw + middleware contributions + services (all flat), immutable

### Phase 10: App Composition and Full Integration

**Files:** `app/`

- `createApp()` builder: config, middleware, module registration
- `buildApp()`: full wiring — boot executor + trie router + middleware + schema validation + response
- Integration tests: full request lifecycle, error handling, CORS

### Phase 11: Testing Support

**Package:** `@vertz/testing` (`packages/testing/`)

- `createTestApp()`: mock services, mock middleware, env overrides
- Test request execution: GET, POST with body, response parsing
- Per-request overrides via `.mockMiddleware()` on request builder
- Re-exports `vertz` from core with `testing` namespace attached

### Phase 12: Entry Point and Public API

**Files:** `index.ts`, `vertz.ts`

- Wire everything in `vertz` namespace
- Verify all exports
- Full test suite pass
- Package builds with bunup

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
11. **Build output**: bunup produces clean ESM with `.d.ts` (requires `isolatedDeclarations: true` in tsconfig)
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
