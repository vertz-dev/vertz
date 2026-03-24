# Design: Typed Test Client from Server Instance

**Status:** Draft (Rev 2 — review feedback addressed)
**Author:** Vinicius Dacal
**Date:** 2026-03-24
**Issue:** [#1779](https://github.com/vertz-dev/vertz/issues/1779)
**Priority:** P1

**Revision history:**
- Rev 1: Initial draft
- Rev 2: Addressed DX, Product/Scope, and Technical review feedback. Merged entity+service into Phase 1. Replaced `call()` with direct method access. Added error response handling. Fixed `ServiceDefinition` generic approach (phantom type). Fixed conditional body param type. Removed proxy-level `withHeaders()`.

---

## Problem

`@vertz/testing` provides `createTestApp<TRouteMap>()` for typed HTTP testing, but it creates its own internal router from manually-defined routes. There is no way to create a typed test client from an existing `createServer()` instance.

When testing a full server with registered services and entities, developers fall back to raw `server.handler(new Request(...))` calls, losing type safety on request bodies and response shapes:

```ts
// Current — manual Request construction, manual casts
const response = await server.handler(
  new Request('http://localhost/api/todos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Buy milk' }),
  }),
);
const body = (await response.json()) as TodoResponse; // manual cast, no compile-time check
```

**Consequences:**

1. **No compile-time body checking** — passing `{ titl: 'Buy milk' }` compiles fine but fails at runtime
2. **Manual response casts** — `as TodoResponse` is a lie the compiler can't verify
3. **Boilerplate per request** — `new Request()`, `JSON.stringify`, content-type header, `response.json()` repeated everywhere
4. **Type drift** — when a schema changes, tests silently cast to the old shape

The type information already exists in entity and service definitions (`ModelDef['table']['$response']`, `ServiceActionDef<TInput, TOutput>`). It just isn't threaded to the test layer.

This was discovered while building the Vertz Cloud platform API (`vertz-dev/platform#1`), which is primarily service-based. Every integration test uses raw `server.handler(new Request(...))` with manual response casts.

---

## API Surface

### `createTestClient(server, options?)`

```ts
import { createServer } from '@vertz/server';
import { createTestClient } from '@vertz/testing';

const server = createServer({
  entities: [todosEntity],
  services: [healthService],
  db,
});

const client = createTestClient(server);
```

The client accepts any `AppBuilder` or `ServerInstance`. When given a `ServerInstance` (has auth), it uses `requestHandler` (which routes `/api/auth/*` to the auth handler). Otherwise it uses `handler`. Detection uses `'requestHandler' in server` property check.

### Entity proxy — fully typed CRUD

```ts
const todos = client.entity(todosEntity);

// LIST — response typed as ListResult<TodoResponse>
const result = await todos.list();
if (result.ok) {
  result.body.items[0].title; // string — typed
  result.body.total;          // number
}

// LIST with VertzQL options (sent as query params, JSON-encoded for objects)
const { ok, body } = await todos.list({
  where: { completed: false },
  orderBy: { createdAt: 'desc' },
  limit: 10,
});

// GET — response typed as TodoResponse
const { ok, body: todo } = await todos.get('todo-1');
if (ok) todo.title; // string

// CREATE — body type-checked against $create_input, response typed as TodoResponse
const { status, ok, body: created } = await todos.create({ title: 'Buy milk' });
// @ts-expect-error — 'titl' is not in $create_input
await todos.create({ titl: 'Buy milk' });

// UPDATE — body type-checked against $update_input
const { body: updated } = await todos.update('todo-1', { completed: true });

// DELETE
const { status } = await todos.delete('todo-1');
// status: 204
```

### Service proxy — direct method access

Service actions are accessed directly as methods on the proxy — no `call()` indirection:

```ts
const auth = client.service(authService);

// Direct method — action name is a real method, body/response typed
const { ok, body } = await auth.sign({
  projectId: 'proj-1',
  sub: 'user-1',
});
// body typed as SignResponse

// @ts-expect-error — 'projId' is not in SignInput
await auth.sign({ projId: 'proj-1', sub: 'user-1' });

// Body-less actions — no argument needed
const health = client.service(healthService);
const { body: status } = await health.check();
// body typed as HealthCheckResponse
```

### Error response testing

All proxy methods return `TestResponse<T>`, which uses a discriminated union on `ok`:

```ts
// Testing validation errors
const result = await todos.create({ title: '' });
if (!result.ok) {
  // body is ErrorBody — typed error shape
  expect(result.status).toBe(400);
  expect(result.body.error).toBe('BadRequest');
  expect(result.body.message).toContain('title');
}

// Testing 404
const result = await todos.get('nonexistent');
expect(result.ok).toBe(false);
expect(result.status).toBe(404);

// Raw response access for advanced assertions
expect(result.raw.statusText).toBe('Not Found');
expect(result.raw.headers.get('x-custom')).toBe('value');
```

### Raw HTTP methods — untyped escape hatch

```ts
// For custom paths, edge cases, or routes not covered by proxies
const res = await client.get('/api/custom-path');
const res = await client.post('/api/todos', { body: { title: 'test' } });
const res = await client.delete('/api/todos/id-1');

// res: TestResponse<unknown> — untyped
```

### Default headers — auth context

`withHeaders()` is only on `TestClient` (not on proxies — "one way to do things"). It returns a **new immutable client** with merged headers. The original is unmodified.

```ts
// Set headers for all requests from this client
const authedClient = client.withHeaders({
  authorization: `Bearer ${token}`,
});

const todos = authedClient.entity(todosEntity);
await todos.list(); // request includes Authorization header

// Per-request header override (via options on each method)
await todos.list({ headers: { 'x-tenant-id': 'tenant-1' } });
```

Header precedence: per-request headers > client default headers.

### Options

```ts
interface TestClientOptions {
  /** Default headers sent with every request */
  defaultHeaders?: Record<string, string>;
  /** API prefix — defaults to '/api'. Used for entity/service path resolution fallback. */
  apiPrefix?: string;
}

const client = createTestClient(server, {
  defaultHeaders: { authorization: `Bearer ${token}` },
  apiPrefix: '/api',
});
```

---

## Types

### TestResponse — discriminated union with raw access

```ts
import type { ListResult } from '@vertz/server';

/** Standard error body shape from Vertz error responses */
interface ErrorBody {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

type TestResponse<T = unknown> =
  | { ok: true; status: number; body: T; headers: Record<string, string>; raw: Response }
  | { ok: false; status: number; body: ErrorBody; headers: Record<string, string>; raw: Response };
```

The `raw: Response` property provides escape-hatch access to `statusText`, typed headers, streaming, etc.

### TestClient

```ts
interface TestClient {
  /** Create a typed entity proxy for CRUD operations */
  entity<TModel extends ModelDef>(
    def: EntityDefinition<TModel>,
  ): EntityTestProxy<TModel>;

  /** Create a typed service proxy with direct method access */
  service<TDef extends ServiceDefinition>(
    def: TDef,
  ): ServiceTestProxy<TDef>;

  /**
   * Returns a new immutable client with merged default headers.
   * The original client is unmodified.
   */
  withHeaders(headers: Record<string, string>): TestClient;

  /** Raw HTTP methods — untyped */
  get(path: string, options?: RequestOptions): Promise<TestResponse>;
  post(path: string, options?: RequestOptions): Promise<TestResponse>;
  put(path: string, options?: RequestOptions): Promise<TestResponse>;
  patch(path: string, options?: RequestOptions): Promise<TestResponse>;
  delete(path: string, options?: RequestOptions): Promise<TestResponse>;
  head(path: string, options?: RequestOptions): Promise<TestResponse>;
}
```

### EntityTestProxy

```ts
interface EntityTestProxy<TModel extends ModelDef> {
  list(options?: EntityListOptions): Promise<TestResponse<ListResult<TModel['table']['$response']>>>;
  get(id: string, options?: EntityRequestOptions): Promise<TestResponse<TModel['table']['$response']>>;
  create(
    body: TModel['table']['$create_input'],
    options?: EntityRequestOptions,
  ): Promise<TestResponse<TModel['table']['$response']>>;
  update(
    id: string,
    body: TModel['table']['$update_input'],
    options?: EntityRequestOptions,
  ): Promise<TestResponse<TModel['table']['$response']>>;
  delete(id: string, options?: EntityRequestOptions): Promise<TestResponse<null>>;
}

interface EntityListOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  after?: string;
  select?: Record<string, true>;
  include?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface EntityRequestOptions {
  headers?: Record<string, string>;
}
```

**Wire format for list options:** VertzQL params (`where`, `orderBy`, `select`, `include`) are JSON-encoded into query string parameters on a `GET /{prefix}/{entity}` request. `limit` and `after` are plain query params. This matches the existing entity route handler which parses `ctx.query`.

### ServiceTestProxy — direct method access via mapped type

```ts
/** Extract TActions from a ServiceDefinition (via phantom type) */
type InferActions<TDef> = TDef extends { readonly __actions?: infer A } ? A : Record<string, ServiceActionDef>;

type ExtractInput<T> = T extends ServiceActionDef<infer TInput, any, any> ? TInput : unknown;
type ExtractOutput<T> = T extends ServiceActionDef<any, infer TOutput, any> ? TOutput : unknown;

/**
 * Service proxy with direct method access.
 * Each action becomes a method: `proxy.actionName(body)` → typed response.
 */
type ServiceTestProxy<TDef extends ServiceDefinition> = {
  [K in Extract<keyof InferActions<TDef>, string>]:
    [unknown] extends [ExtractInput<InferActions<TDef>[K]>]
      ? (options?: ServiceCallOptions) => Promise<TestResponse<ExtractOutput<InferActions<TDef>[K]>>>
      : (body: ExtractInput<InferActions<TDef>[K]>, options?: ServiceCallOptions) => Promise<TestResponse<ExtractOutput<InferActions<TDef>[K]>>>;
};

interface ServiceCallOptions {
  headers?: Record<string, string>;
}
```

**Body parameter conditionality:** When a service action has no `body` schema, `TInput` defaults to `unknown`. The `[unknown] extends [ExtractInput<...>]` pattern (wrapped in tuple to prevent distribution) detects this and makes the body parameter optional. When `TInput` is concrete (e.g., `{ projectId: string }`), body is required.

**Runtime implementation:** A `Proxy` object that intercepts property access. When `proxy.sign(body)` is called, the proxy looks up the action name in the service definition, resolves the HTTP method and path from `server.router.routes`, constructs the request, and returns the parsed response.

---

## Key Design Decision: Definition-Based Proxy, Not Path-String Mapping

Two approaches were considered:

**Path-string route map** (like current `TestAppWithRoutes<TRouteMap>`):
```ts
client.post('/api/todos', { body: {...} }); // path string → typed
```
Requires entity/service names at the type level, complex mapped types over string template literals, and fragile coupling to path conventions.

**Definition-based proxy** (chosen):
```ts
client.entity(todosEntity).create({...}); // definition object → typed
client.service(authService).sign({...});  // definition object → typed
```
Uses the entity/service definition as the type carrier directly. No path strings needed at the type level. Path is resolved at runtime from `entityDef.name` + `server.router.routes`.

**Why proxy wins:**
1. **Types already flow** — `EntityDefinition<TModel>` carries `$response`, `$create_input`, `$update_input`. No new type machinery needed for entities.
2. **No name generics** — entity/service names don't need to be string literals in the type system.
3. **Domain-transparent** — paths resolve at runtime by scanning `server.router.routes`, so domain prefixes (`/api/project/todos`) work without extra config.
4. **LLM-friendly** — `client.entity(todosEntity).create(...)` is unambiguous. An LLM doesn't need to know the URL convention.
5. **Raw HTTP escape hatch** — `client.post(path)` is always available for edge cases.

---

## Required Type Changes

### `ServiceDefinition` — phantom type for `TActions` (backward-compatible)

**Problem:** Making `ServiceDefinition.actions` typed as `TActions` directly breaks `ServiceDefinition[]` array assignability. `ServiceActionDef<void, HealthResp>` is not assignable to `ServiceActionDef<unknown, unknown>` due to handler parameter contravariance.

**Solution:** Use a phantom type field. The `actions` field stays as `Record<string, ServiceActionDef>` (unchanged for runtime/assignability). A phantom `__actions` field carries the concrete type for extraction by the test client:

```ts
// Current
export interface ServiceDefinition {
  readonly kind: 'service';
  readonly name: string;
  readonly inject: Record<string, EntityDefinition>;
  readonly access: Partial<Record<string, AccessRule>>;
  readonly actions: Record<string, ServiceActionDef>;
}

// Proposed — phantom type, backward-compatible
export interface ServiceDefinition<
  TActions extends Record<string, ServiceActionDef<any, any, any>> = Record<string, ServiceActionDef>,
> {
  readonly kind: 'service';
  readonly name: string;
  readonly inject: Record<string, EntityDefinition>;
  readonly access: Partial<Record<string, AccessRule>>;
  readonly actions: Record<string, ServiceActionDef>;  // unchanged — preserves array assignability
  /** @internal Phantom type — carries concrete action types for type extraction. Never accessed at runtime. */
  readonly __actions?: TActions;
}
```

And `service()` returns `ServiceDefinition<TActions>`:

```ts
// Current
function service<TInject, TActions>(name: string, config: ServiceConfig<TActions, TInject>): ServiceDefinition;

// Proposed
function service<TInject, TActions>(
  name: string,
  config: ServiceConfig<TActions, TInject>,
): ServiceDefinition<TActions>;
```

**Why this works:**
- `ServiceDefinition<{ sign: ServiceActionDef<SignInput, SignResponse> }>` is assignable to `ServiceDefinition` (default `TActions`) because `actions` is still `Record<string, ServiceActionDef>` and `__actions` is optional.
- `ServiceDefinition[]` arrays work: elements with different `TActions` all satisfy the base constraint.
- The test client extracts `TActions` via conditional type: `TDef extends { __actions?: infer A } ? A : ...`

**Blast radius:** Only 2 files change (`service/types.ts`, `service/service.ts`). All 7 other files that reference `ServiceDefinition` use it without generic args and require zero changes.

---

## Path Resolution Algorithm

The proxy resolves HTTP paths at runtime by scanning `server.router.routes` (an array of `{ method: string; path: string }`).

### Entity path resolution

Given `entityDef.name = 'todos'`:

1. Scan routes for `GET` route ending with `/{entityName}` (e.g., `GET /api/todos` or `GET /api/project/todos`)
2. If found, that's the entity base path (e.g., `/api/todos` or `/api/project/todos`)
3. Derive all CRUD paths from the base:
   - List: `GET {base}`
   - Get: `GET {base}/:id`
   - Create: `POST {base}`
   - Update: `PATCH {base}/:id`
   - Delete: `DELETE {base}/:id`
4. If no route found, fall back to `{apiPrefix}/{entityName}`

### Service path resolution

Given `serviceDef.name = 'auth'` and action `'sign'`:

1. Scan routes for a route whose path contains `/{serviceName}/{actionName}` (e.g., `POST /api/auth/sign`)
2. If found, use that path and method
3. If not found (custom path override on action), iterate all routes looking for the action pattern
4. Fall back to `POST {apiPrefix}/{serviceName}/{actionName}`

### Edge case: ambiguous names

Entity `auth` and service `auth` would both match `/api/auth/...`. The proxies resolve independently — `client.entity(authEntity)` scans for entity CRUD patterns (`GET /api/auth`, `POST /api/auth`), while `client.service(authService)` scans for action patterns (`POST /api/auth/sign`). The different HTTP method + path patterns disambiguate.

---

## Manifesto Alignment

1. **If it builds, it works** — Request body typos are caught at compile time. Response shapes are compiler-verified. No more `as Type` casts that bypass safety.

2. **One way to do things** — `createTestClient(server)` is the single entry point for testing a real server. `createTestApp` remains for unit-testing isolated routes. `withHeaders()` is only on the client (not on proxies). Clear separation, no overlap.

3. **AI agents are first-class users** — `client.entity(todosEntity).create({ ... })` and `client.service(authService).sign({ ... })` are unambiguous. An LLM can generate correct test code on the first prompt without knowing URL conventions or manual cast patterns.

4. **Test what matters, nothing more** — The proxy handles boilerplate (Request construction, JSON parsing, headers). Test code focuses on assertions, not ceremony.

5. **If you can't test it, don't build it** — This feature makes server testing itself more ergonomic, encouraging more tests.

---

## Non-Goals

1. **Not replacing `createTestApp`** — `createTestApp` remains for unit-testing individual routes in isolation. `createTestClient` is for integration-testing real server instances.
2. **Not a full SDK client** — This is a testing utility. No retry logic, no caching, no WebSocket support.
3. **Not typing VertzQL query params deeply** — `where`, `orderBy`, `select` remain `Record<string, unknown>` for Phase 1. Deep VertzQL typing (e.g., only `allowWhere` fields accepted) is a separate feature.
4. **Not handling custom entity actions** — Entity custom actions (`EntityActionDef`) have erased types in `EntityDefinition`. Typed custom action proxies require making `EntityDefinition` generic over `TActions`, which is a larger change deferred to a follow-up.
5. **Not generating OpenAPI from the test client** — This is purely a test-time utility.

---

## Unknowns

### U1. Domain-scoped entity path resolution

**Question:** Entities in a domain have paths like `/api/{domainName}/{entityName}`. How does the proxy resolve the correct path?

**Resolution:** Use `server.router.routes` at runtime. The route list contains the fully-resolved paths (with domain prefix baked in). The proxy matches routes by entity name pattern (see "Path Resolution Algorithm" section). Falls back to `{apiPrefix}/{entityName}` if no match found.

**Status:** Resolved (runtime resolution, no type-level domain support needed).

### U2. `ServerInstance.requestHandler` vs `AppBuilder.handler`

**Question:** Which handler should the test client use?

**Resolution:** Check `'requestHandler' in server` (property existence check). `ServerInstance` has `requestHandler` (added via `Object.defineProperty` only when auth is configured). `AppBuilder` does not. When found, use `requestHandler` (includes auth routing). Otherwise use `handler`.

**Status:** Resolved.

### U3. Service action method and path resolution

**Question:** Service actions can have custom `method` and `path` overrides. How does the proxy resolve them?

**Resolution:** Scan `server.router.routes` for `{apiPrefix}/{serviceName}/{actionName}` pattern. For custom paths, iterate all routes. See "Path Resolution Algorithm" section for details.

**Status:** Resolved (runtime resolution).

---

## Type Flow Map

### Entity proxy type flow

```
EntityDefinition<TModel>
  │
  ├── TModel['table']['$response']      → list response items, get/create/update response body
  ├── TModel['table']['$create_input']   → create() body parameter
  └── TModel['table']['$update_input']   → update() body parameter
         │
         ▼
EntityTestProxy<TModel>
  ├── list()   → Promise<TestResponse<ListResult<TModel['table']['$response']>>>
  ├── get()    → Promise<TestResponse<TModel['table']['$response']>>
  ├── create() → (body: TModel['table']['$create_input']) → Promise<TestResponse<TModel['table']['$response']>>
  ├── update() → (body: TModel['table']['$update_input']) → Promise<TestResponse<TModel['table']['$response']>>
  └── delete() → Promise<TestResponse<null>>

Proven: EntityOperations<TModel> already uses these exact index paths successfully.
No dead generics — TModel flows from entity() → EntityDefinition<TModel> → EntityTestProxy<TModel> → method signatures.
```

### Service proxy type flow

```
service('auth', { actions: { sign: { body: signSchema, response: signRespSchema, handler } } })
  │
  └── TActions = { sign: ServiceActionDef<SignInput, SignResponse, ServiceContext> }
         │
         ▼
ServiceDefinition<TActions>
  ├── actions: Record<string, ServiceActionDef>   (runtime — unchanged, array-assignable)
  └── __actions?: TActions                        (phantom — carries concrete types)
         │
         ▼
ServiceTestProxy<TDef>
  └── InferActions<TDef> extracts TActions from __actions phantom
       │
       ▼
  proxy.sign(body)
    ├── K = 'sign'
    ├── ExtractInput<TActions['sign']> = SignInput  → body parameter type
    └── ExtractOutput<TActions['sign']> = SignResponse → response body type

No dead generics — TActions flows from service() → ServiceDefinition.__actions → InferActions → mapped type → method signatures.
```

---

## E2E Acceptance Test

```ts
import { describe, expect, it } from 'bun:test';
import { createDb, table } from '@vertz/db';
import { createServer, entity, rules, service } from '@vertz/server';
import { createTestClient } from '@vertz/testing';

// --- Setup: entity + service definitions ---

const todosTable = table('todos', {
  id: t.uuid().primaryKey().defaultRandom(),
  title: t.text(),
  completed: t.boolean().default(false),
  createdAt: t.timestamp().default('now'),
});

// Let TypeScript infer — don't annotate as ModelDef (which erases table types)
const todosModel = { table: todosTable, relations: {} } as const;

const todosEntity = entity('todos', {
  model: todosModel,
  access: { list: rules.public, get: rules.public, create: rules.public, update: rules.public, delete: rules.public },
});

const healthService = service('health', {
  access: { check: rules.public },
  actions: {
    check: {
      response: healthResponseSchema,
      handler: async () => ({ status: 'ok', timestamp: Date.now() }),
    },
  },
});

describe('Feature: Typed test client from server instance', () => {
  const db = createDb({ models: { todos: todosModel } });
  const server = createServer({ entities: [todosEntity], services: [healthService], db });
  const client = createTestClient(server);

  describe('Given an entity proxy for todosEntity', () => {
    const todos = client.entity(todosEntity);

    describe('When creating a todo with valid input', () => {
      it('Then returns ok: true, status 201, and typed response body', async () => {
        const result = await todos.create({ title: 'Buy milk' });
        expect(result.ok).toBe(true);
        expect(result.status).toBe(201);
        if (result.ok) {
          expect(result.body.title).toBe('Buy milk');
          expect(result.body.id).toBeDefined();
        }
      });
    });

    describe('When creating a todo with invalid input (empty title)', () => {
      it('Then returns ok: false with ErrorBody', async () => {
        const result = await todos.create({ title: '' });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.status).toBe(400);
          expect(result.body.error).toBe('BadRequest');
        }
      });
    });

    describe('When listing todos', () => {
      it('Then returns ListResult with typed items', async () => {
        const result = await todos.list();
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.body.items).toBeInstanceOf(Array);
          expect(result.body.total).toBeGreaterThanOrEqual(0);
          expect(result.body.hasNextPage).toBe(false);
        }
      });
    });

    describe('When getting a todo by ID', () => {
      it('Then returns the typed entity', async () => {
        const created = await todos.create({ title: 'Test' });
        if (!created.ok) throw new Error('Setup failed');
        const result = await todos.get(created.body.id);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.body.title).toBe('Test');
      });
    });

    describe('When getting a nonexistent todo', () => {
      it('Then returns ok: false with 404', async () => {
        const result = await todos.get('nonexistent-id');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(404);
      });
    });

    describe('When updating a todo', () => {
      it('Then returns the updated typed entity', async () => {
        const created = await todos.create({ title: 'Test' });
        if (!created.ok) throw new Error('Setup failed');
        const result = await todos.update(created.body.id, { completed: true });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.body.completed).toBe(true);
      });
    });

    describe('When deleting a todo', () => {
      it('Then returns status 204', async () => {
        const created = await todos.create({ title: 'Delete me' });
        if (!created.ok) throw new Error('Setup failed');
        const result = await todos.delete(created.body.id);
        expect(result.status).toBe(204);
      });
    });
  });

  describe('Given a service proxy for healthService', () => {
    const health = client.service(healthService);

    describe('When calling the check action directly', () => {
      it('Then returns the typed response via direct method access', async () => {
        const result = await health.check();
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.body.status).toBe('ok');
        }
      });
    });
  });

  describe('Given a client with default headers', () => {
    describe('When using withHeaders()', () => {
      it('Then sends headers on every request', async () => {
        const authedClient = client.withHeaders({
          authorization: 'Bearer test-token',
        });
        const todos = authedClient.entity(todosEntity);
        const result = await todos.list();
        expect(result.status).toBeDefined();
      });
    });

    describe('When the original client is used after withHeaders()', () => {
      it('Then the original client is unmodified (immutable)', async () => {
        client.withHeaders({ authorization: 'Bearer test' });
        // Original client has no auth header — if server requires auth, this returns 401
        const result = await client.entity(todosEntity).list();
        expect(result.status).toBeDefined();
      });
    });
  });

  describe('Given raw HTTP methods on the client', () => {
    describe('When calling client.post() with a path', () => {
      it('Then returns an untyped TestResponse', async () => {
        const result = await client.post('/api/todos', {
          body: { title: 'Raw' },
        });
        expect(result.status).toBe(201);
        // body is unknown — no type inference on raw methods
      });
    });
  });

  describe('Given raw Response access', () => {
    describe('When checking result.raw', () => {
      it('Then provides the original Response object', async () => {
        const result = await client.get('/api/todos');
        expect(result.raw).toBeInstanceOf(Response);
        expect(result.raw.headers.get('content-type')).toContain('application/json');
      });
    });
  });
});
```

### Type-level tests (`.test-d.ts`)

```ts
import { expectTypeOf } from 'expect-type';
import type { ModelDef } from '@vertz/db';
import type { EntityDefinition, ListResult, ServiceActionDef, ServiceDefinition } from '@vertz/server';
import type { EntityTestProxy, ServiceTestProxy, TestClient, TestResponse } from '@vertz/testing';

// --- Entity proxy types ---

declare const todosEntity: EntityDefinition<{
  table: {
    $response: { id: string; title: string; completed: boolean };
    $create_input: { title: string; completed?: boolean };
    $update_input: { title?: string; completed?: boolean };
  };
  relations: {};
}>;

declare const client: TestClient;
const todos = client.entity(todosEntity);

// list() returns discriminated union TestResponse
type ListReturn = Awaited<ReturnType<typeof todos.list>>;
expectTypeOf<ListReturn>().toMatchTypeOf<
  | { ok: true; body: ListResult<{ id: string; title: string; completed: boolean }> }
  | { ok: false; body: { error: string; message: string; statusCode: number } }
>();

// create() accepts $create_input
expectTypeOf(todos.create).parameter(0).toMatchTypeOf<{ title: string; completed?: boolean }>();

// update() accepts $update_input
expectTypeOf(todos.update).parameter(1).toMatchTypeOf<{ title?: string; completed?: boolean }>();

// @ts-expect-error — wrong property name in create
todos.create({ titl: 'wrong' });

// @ts-expect-error — wrong property type in update
todos.update('id', { completed: 'yes' });

// --- Service proxy types — direct method access ---

declare const authService: ServiceDefinition<{
  sign: ServiceActionDef<{ projectId: string; sub: string }, { token: string; expiresAt: number }>;
}>;

const auth = client.service(authService);

// auth.sign is a method (not call())
expectTypeOf(auth.sign).toBeFunction();

// @ts-expect-error — nonexistent action is not a method
auth.nonexistent;

// @ts-expect-error — wrong body shape
auth.sign({ wrong: 'shape' });

// sign() response is typed from action output
expectTypeOf(auth.sign({ projectId: 'p1', sub: 'u1' })).resolves.toMatchTypeOf<
  TestResponse<{ token: string; expiresAt: number }>
>();

// --- Body-less action — parameter is optional ---

declare const healthService: ServiceDefinition<{
  check: ServiceActionDef<unknown, { status: string }>;
}>;

const health = client.service(healthService);

// check() can be called without arguments
expectTypeOf(health.check).toBeCallableWith();

// --- ServiceDefinition array assignability (phantom type safety) ---

declare const svc1: ServiceDefinition<{ a: ServiceActionDef<string, number> }>;
declare const svc2: ServiceDefinition<{ b: ServiceActionDef<void, boolean> }>;

// Both assignable to ServiceDefinition[] — phantom type doesn't break arrays
const arr: ServiceDefinition[] = [svc1, svc2]; // should compile
```

---

## Implementation Plan

### Phase 1: Entity Proxy + Service Proxy + Raw HTTP Client

**Goal:** `createTestClient(server)` with typed entity CRUD, typed service actions (direct method access), and untyped raw HTTP methods. This phase delivers the full typed testing DX for both entities and services.

**Changes:**

1. `packages/server/src/service/types.ts` — add phantom `TActions` generic to `ServiceDefinition`
   - Add `TActions` generic parameter with backward-compatible default
   - Add `readonly __actions?: TActions` phantom field
   - `actions` field stays `Record<string, ServiceActionDef>` (unchanged)

2. `packages/server/src/service/service.ts` — update `service()` return type
   - Return `ServiceDefinition<TActions>` instead of `ServiceDefinition`

3. `packages/testing/src/test-client.ts` — new file
   - `createTestClient(server, options?)` implementation
   - `EntityTestProxy<TModel>` runtime proxy builder
   - `ServiceTestProxy<TDef>` runtime proxy (using `Proxy` for dynamic method dispatch)
   - Raw HTTP methods (`get`, `post`, `put`, `patch`, `delete`, `head`)
   - `withHeaders()` (client-level only, returns new immutable client)
   - Path resolution from `server.router.routes` (see algorithm above)
   - Response parsing with discriminated union (`ok: true` / `ok: false`)

4. `packages/testing/src/test-client-types.ts` — new file
   - `TestClient`, `TestClientOptions` types
   - `EntityTestProxy<TModel>`, `EntityListOptions`, `EntityRequestOptions` types
   - `ServiceTestProxy<TDef>`, `ServiceCallOptions` types
   - `InferActions<TDef>`, `ExtractInput<T>`, `ExtractOutput<T>` utility types
   - `TestResponse<T>` (new discriminated union — separate from existing `test-app.ts` `TestResponse`)
   - `ErrorBody` type
   - `ListResult<T>` re-exported from `@vertz/server`

5. `packages/testing/src/index.ts` — add exports
   - Export `createTestClient` and all new types

6. `packages/server/src/service/__tests__/service.test-d.ts` — type tests for phantom generic preservation and array assignability
7. `packages/testing/src/__tests__/test-client.test.ts` — runtime tests
8. `packages/testing/src/__tests__/test-client.test-d.ts` — type-level tests

**Acceptance criteria:**

```ts
describe('Phase 1: Entity proxy + service proxy + raw HTTP', () => {
  // Entity CRUD
  describe('Given createTestClient(server) with an entity', () => {
    describe('When calling client.entity(todosEntity).create({ title: "test" })', () => {
      it('Then sends POST /api/todos with JSON body and returns typed TestResponse', () => {});
    });
    describe('When calling client.entity(todosEntity).list()', () => {
      it('Then sends GET /api/todos and returns TestResponse<ListResult<TResponse>>', () => {});
    });
    describe('When calling client.entity(todosEntity).list({ where, limit })', () => {
      it('Then sends GET /api/todos with JSON-encoded query params', () => {});
    });
    describe('When calling client.entity(todosEntity).get(id)', () => {
      it('Then sends GET /api/todos/:id and returns typed entity', () => {});
    });
    describe('When calling client.entity(todosEntity).update(id, data)', () => {
      it('Then sends PATCH /api/todos/:id and returns typed entity', () => {});
    });
    describe('When calling client.entity(todosEntity).delete(id)', () => {
      it('Then sends DELETE /api/todos/:id and returns status 204', () => {});
    });
  });

  // Error responses
  describe('Given an error response from the server', () => {
    describe('When the response is 4xx/5xx', () => {
      it('Then result.ok is false and body is ErrorBody', () => {});
    });
    describe('When the response is 2xx', () => {
      it('Then result.ok is true and body is the typed success shape', () => {});
    });
  });

  // Service actions — direct method access
  describe('Given createTestClient(server) with a service', () => {
    describe('When calling client.service(authService).sign({ ... })', () => {
      it('Then sends POST /api/auth/sign with typed body and returns typed response', () => {});
    });
    describe('When calling client.service(healthService).check()', () => {
      it('Then sends request without body for body-less actions', () => {});
    });
  });

  // ServiceDefinition generic preservation
  describe('Given ServiceDefinition phantom type', () => {
    describe('When service() creates a definition with typed actions', () => {
      it('Then __actions phantom preserves TActions type', () => {});
    });
    describe('When assigning typed ServiceDefinitions to ServiceDefinition[]', () => {
      it('Then array assignability is preserved (no type errors)', () => {});
    });
  });

  // Raw HTTP
  describe('Given createTestClient(server) raw HTTP methods', () => {
    describe('When calling client.post(path, { body })', () => {
      it('Then sends the request and returns TestResponse<unknown>', () => {});
    });
  });

  // Headers
  describe('Given client.withHeaders({ authorization: token })', () => {
    describe('When using the returned client for requests', () => {
      it('Then all requests include the authorization header', () => {});
    });
    describe('When checking the original client', () => {
      it('Then the original client is unmodified', () => {});
    });
  });

  // Domain-scoped
  describe('Given a domain-scoped entity', () => {
    describe('When calling client.entity(domainEntity).list()', () => {
      it('Then resolves the correct path including domain prefix from server.router.routes', () => {});
    });
  });

  // Raw Response access
  describe('Given any proxy or raw HTTP response', () => {
    describe('When accessing result.raw', () => {
      it('Then provides the original Response object', () => {});
    });
  });
});
```

### Phase 2: Documentation

**Goal:** Document `createTestClient` and server-side testing patterns in `packages/docs/`. Currently `guides/testing.mdx` only covers E2E/Playwright testing — there is no documentation for `@vertz/testing` or server-side integration testing.

**Depends on:** Phase 1

**Changes:**

1. `packages/docs/guides/testing.mdx` — restructure into a testing hub
   - Keep existing E2E/Playwright content
   - Add a section or link to the new integration testing guide

2. `packages/docs/guides/integration-testing.mdx` — new page
   - **createTestClient** — setup, entity proxy, service proxy, raw HTTP
   - **Entity testing** — typed CRUD operations, list with VertzQL options, error assertions
   - **Service testing** — direct method access, body-less actions, typed responses
   - **Auth context in tests** — `withHeaders()`, `asUser()`, per-request overrides
   - **Error testing** — discriminated union on `ok`, `ErrorBody` shape, 4xx/5xx assertions
   - **TestResponse API** — `ok`, `status`, `body`, `headers`, `raw` reference
   - **Migration from raw handler calls** — before/after comparison showing the old `server.handler(new Request(...))` pattern vs the new typed client

3. `packages/docs/mint.json` (or equivalent nav config) — add integration testing page to sidebar

**Acceptance criteria:**

```ts
describe('Phase 2: Documentation', () => {
  describe('Given the docs site', () => {
    describe('When a developer looks for testing guidance', () => {
      it('Then integration-testing.mdx covers createTestClient, entity proxy, service proxy', () => {});
      it('Then it includes a migration guide from raw handler calls', () => {});
      it('Then it shows error testing patterns with ok discriminant', () => {});
      it('Then it shows auth header injection with withHeaders()', () => {});
    });
  });
});
```

### Phase 3: Auth Helpers

**Goal:** Ergonomic auth context for integration tests with `ServerInstance`.

**Depends on:** Phase 1

**Changes:**

1. `packages/testing/src/test-client.ts` — add auth helper
   - `client.asUser(token)` — shorthand for `client.withHeaders({ authorization: \`Bearer ${token}\` })`
   - Convenience only — no JWT generation, no DB side effects
   - Works with any server type (not limited to `ServerInstance`)

2. `packages/testing/src/test-utils.ts` — optional test JWT utility (if needed)
   - `createTestJWT(claims, signingKey)` — generates a JWT for test purposes
   - Separate from `createTestClient` — explicit, no magic
   - Only useful when the test has access to the signing key

3. `packages/docs/guides/integration-testing.mdx` — update auth section with `asUser()` examples

**Note:** Phase 3 from Rev 1 was simplified. The original `withAuth(userId)` was underspecified and coupled the test client to auth internals. The revised approach is explicit: `asUser(token)` is just header injection, and JWT creation is a separate utility the developer controls.

**Acceptance criteria:**

```ts
describe('Phase 3: Auth helpers', () => {
  describe('Given client.asUser(token)', () => {
    describe('When making requests through the returned client', () => {
      it('Then all requests include Authorization: Bearer <token>', () => {});
    });
  });
});
```

---

## File Map

| File | Status | Phase | Description |
|------|--------|-------|-------------|
| `packages/server/src/service/types.ts` | Modified | 1 | Add phantom `TActions` generic to `ServiceDefinition` |
| `packages/server/src/service/service.ts` | Modified | 1 | Update `service()` return type |
| `packages/testing/src/test-client.ts` | New | 1 | `createTestClient` implementation |
| `packages/testing/src/test-client-types.ts` | New | 1 | All types for TestClient, proxies, TestResponse |
| `packages/testing/src/index.ts` | Modified | 1 | Export new types and function |
| `packages/server/src/service/__tests__/service.test-d.ts` | Modified | 1 | Phantom generic + array assignability tests |
| `packages/testing/src/__tests__/test-client.test.ts` | New | 1 | Runtime tests |
| `packages/testing/src/__tests__/test-client.test-d.ts` | New | 1 | Type-level tests |
| `packages/docs/guides/integration-testing.mdx` | New | 2 | Integration testing guide with createTestClient |
| `packages/docs/guides/testing.mdx` | Modified | 2 | Add link/section for integration testing |

## Validation Targets

- **Vertz Cloud platform** (`vertz-dev/platform`) — Primary motivation. Service-heavy integration tests.
- **Linear clone example** (`examples/linear-clone`) — Entity + service mix. Good end-to-end validation.
- **Entity todo example** (`examples/entity-todo`) — Simple entity-only server.
