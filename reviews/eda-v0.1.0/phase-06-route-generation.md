# Phase 6: Route Generation and Server Integration -- Adversarial Review

## Summary

Phase 6 implements the HTTP route generation layer (`generateEntityRoutes`), the error handler (`entityErrorHandler`), the `@vertz/server` `createServer` wrapper, and the bridge between `@vertz/core` and `@vertz/server` for entity route registration. The overall approach is reasonable: `@vertz/server` generates `EntityRouteEntry[]` objects that `@vertz/core` registers into its trie without knowing entity internals. However, this review identifies a critical security concern with error detail leakage, several integration bugs between the two packages, type safety issues with unsafe casts, and missing edge case coverage.

**Files reviewed:**
- `packages/server/src/entity/error-handler.ts`
- `packages/server/src/entity/route-generator.ts`
- `packages/server/src/create-server.ts`
- `packages/server/src/entity/__tests__/error-handler.test.ts`
- `packages/server/src/entity/__tests__/route-generator.test.ts`
- `packages/server/src/entity/__tests__/server-integration.test.ts`
- `packages/core/src/types/app.ts`
- `packages/core/src/app/app-runner.ts`
- `packages/core/src/app/app-builder.ts`
- `packages/core/src/types/index.ts`
- `packages/core/src/index.ts`
- `packages/server/src/entity/index.ts`
- `packages/server/src/index.ts`
- `packages/server/src/__tests__/re-exports.test.ts`

**Context files:**
- `packages/server/src/entity/crud-pipeline.ts`
- `packages/server/src/entity/action-pipeline.ts`
- `packages/server/src/entity/access-enforcer.ts`
- `packages/server/src/entity/context.ts`
- `packages/server/src/entity/types.ts`
- `packages/server/src/entity/entity.ts`
- `packages/server/src/entity/entity-registry.ts`
- `packages/server/src/entity/entity-operations.ts`
- `packages/server/src/entity/field-filter.ts`
- `packages/core/src/router/trie.ts`
- `packages/core/src/exceptions/vertz-exception.ts`
- `packages/core/src/exceptions/http-exceptions.ts`

---

## Findings

### [SEC-1] CRITICAL -- `VertzException.details` can leak hidden fields and internal state through error responses

**File:** `packages/server/src/entity/error-handler.ts:48-56`

**Issue:** The error handler passes `error.details` directly into the HTTP response body:

```typescript
const details = error instanceof ValidationException ? error.errors : error.details;

return {
  status: error.statusCode,
  body: {
    error: {
      code,
      message: error.message,
      ...(details !== undefined && { details }),
    },
  },
};
```

`VertzException.details` is typed as `unknown`. Any code that constructs a `VertzException` (or subclass) can pass arbitrary data as `details`, including full database rows containing hidden fields, stack traces, connection strings, or any other sensitive information.

Concrete attack scenario:
1. A before hook or custom action catches a DB error and rethrows it as `new BadRequestException('Failed', { row: fullDbRow })` where `fullDbRow` contains `passwordHash`.
2. The error handler faithfully includes `details: { row: { passwordHash: "..." } }` in the 403/400 response body.
3. The client receives hidden field data in the error response.

Even without malicious intent, this is a footgun. The `details` field is an arbitrary `unknown` that is serialized to JSON with zero sanitization. Since `error.message` is already user-visible, `details` should at minimum be validated or filtered.

**Fix:** Either:
1. Strip `details` from all non-`ValidationException` errors (the safest approach):
```typescript
// Only include structured details for ValidationException
const details = error instanceof ValidationException ? error.errors : undefined;
```
2. Or introduce a `SafeDetails` type/marker that must be explicitly opted into, preventing accidental leakage of arbitrary objects.

The current test at `error-handler.test.ts:73-78` ("includes details when VertzException has details") actually validates the dangerous behavior. That test should be updated to verify details are NOT blindly passed through.

---

### [BUG-1] HIGH -- Entity routes bypass global middleware entirely

**File:** `packages/core/src/app/app-runner.ts:170-179`

**Issue:** When entity routes are registered into the trie, they are wrapped in a `RouteEntry` with `middlewares: []`:

```typescript
if (config._entityRoutes) {
  for (const route of config._entityRoutes) {
    const entry: RouteEntry = {
      handler: route.handler as (ctx: HandlerCtx) => unknown,
      options: {},
      services: {},
      middlewares: [],
    };
    trie.add(route.method, route.path, entry);
  }
}
```

However, the request handler at line 224 runs global middlewares and merges their state into `requestCtx`:

```typescript
const middlewareState = await runMiddlewareChain(resolvedMiddlewares, requestCtx);
```

The middleware chain does run, and `middlewareState` is collected. But the critical problem is how context flows to entity handlers. The entity route handler receives `ctx` (which is `requestCtx` from the trie match), and `buildCtx()` is called at line 249 which combines params, body, `middlewareState`, etc. into a full `HandlerCtx`. But entity route handlers receive raw `Record<string, unknown>` (the `requestCtx` object), not the full `HandlerCtx`.

Looking at line 261: `const result = await entry.handler(ctx)` -- this `ctx` is the built `HandlerCtx`. But the entity handler signature is `(ctx: Record<string, unknown>) => Promise<Response>`, which is cast at line 173: `handler: route.handler as (ctx: HandlerCtx) => unknown`.

The entity handler returns a `Response` object directly. But the app-runner at lines 264-325 tries to process the return value through the Result type system, response validation, and CORS handling. If the entity handler returns a `Response`, it hits line 317: `result instanceof Response ? result : createJsonResponse(result)` and gets returned. However, **CORS headers are NOT applied** to this response because the CORS application at line 321 only runs for non-Result, non-undefined returns -- and it does apply. But response validation at line 303 will also run on the `Response` object, which will fail silently.

The actual bug is more subtle: the `ctx` passed to the entity handler is a `HandlerCtx` (a frozen proxy object from `buildCtx`), but the entity route handler code at `route-generator.ts:108` treats it as a plain `Record<string, unknown>` and accesses `ctx.params`, `ctx.body`, etc. directly. Whether this works depends on how `buildCtx` structures its proxy.

The middleware state (e.g., `userId`, `tenantId`, `roles` set by an auth middleware) IS available because `buildCtx` merges `middlewareState` into the context. But there is a disconnect: `extractRequestInfo` at `route-generator.ts:38-43` accesses `ctx.userId`, `ctx.tenantId`, `ctx.roles` -- these properties will only exist if middleware set them. If no auth middleware runs (or if middleware sets them under different keys), the entity context will have `userId: null`, `roles: []`, which means access rules that check `ctx.authenticated()` will deny access.

This is not a complete bypass (it fails closed -- access is denied rather than granted), but it means entity routes do NOT benefit from auth middleware unless the middleware happens to set exactly `userId`, `tenantId`, and `roles` on the context. There is no type-safe contract ensuring this.

**Fix:** Define an explicit contract between auth middleware and entity routes. Either:
1. Document the required context keys (`userId`, `tenantId`, `roles`) that auth middleware must provide
2. Or inject an `EntityRequestExtractor` function that is configured alongside entities:
```typescript
export interface ServerConfig extends Omit<AppConfig, '_entityDbFactory'> {
  extractRequestInfo?: (ctx: Record<string, unknown>) => EntityRequestInfo;
}
```

---

### [BUG-2] HIGH -- `router.routes` double-registers entity routes (core + server both add to the list)

**File:** `packages/core/src/app/app-builder.ts:79-103` and `packages/core/src/app/app-runner.ts:170-179`

**Issue:** When `createServer` from `@vertz/server` is called, it:
1. Generates `EntityRouteEntry[]` and passes them as `config._entityRoutes` to core's `createApp`
2. Core's `createApp` at line 80 checks `config.entities` and pushes routes to `registeredRoutes[]` (the `router.routes` array)
3. Core's `buildHandler` at line 170 also registers `config._entityRoutes` into the trie

The result: `app.router.routes` contains the entity route paths added by `createApp` at lines 90-101, but these are **dummy entries** -- they have method/path but no handler. The actual working routes are in the trie (added by `buildHandler` from `_entityRoutes`). The `router.routes` array reflects ALL CRUD operations regardless of access rules (it unconditionally registers list, get, create, update, delete), while the trie only contains routes that have access rules defined.

The integration test at `server-integration.test.ts:73-80` asserts:
```typescript
const routes = app.router.routes;
const paths = routes.map((r) => `${r.method} ${r.path}`);
expect(paths).toContain('GET /api/users');
```

This test passes because core's `createApp` always registers all 5 CRUD routes plus actions. But the actual trie may have fewer routes (only those with access rules). Furthermore, the paths may differ: core uses `rawPrefix.endsWith('/') ? rawPrefix : rawPrefix + '/'` logic, while server's `generateEntityRoutes` uses `${prefix}/${def.name}`. If `apiPrefix` is `/api` (default), core generates `/api/users` and server generates `/api/users` -- these match. But if `apiPrefix` is `/api/` (with trailing slash), core generates `/api/users` (deduplicates) while server generates `/api//users` (double slash).

Additionally, if an entity has `access: { list: () => true, get: () => true }` (only list and get), the trie will only have 2 routes, but `router.routes` will show all 5 CRUD routes. This is misleading.

**Fix:** Either:
1. Remove the entity route registration from `createApp` (core should not know about entity routes at all -- let `_entityRoutes` be the sole source), OR
2. Have `createServer` populate `registeredRoutes` from the actual generated routes and pass them as a separate config field, OR
3. At minimum, filter `registeredRoutes` in core based on whether `_entityRoutes` is provided:
```typescript
// In createApp, skip entity route registration if _entityRoutes will handle it
if (config.entities && config.entities.length > 0 && !config._entityRoutes) {
  // ... register route info only
}
```

---

### [BUG-3] HIGH -- `EntityRegistry` is created but never populated with operations -- `ctx.entities` proxy will always throw

**File:** `packages/server/src/entity/route-generator.ts:73-76` and `packages/server/src/entity/entity-registry.ts`

**Issue:** In `generateEntityRoutes`, the registry is used to create a proxy:

```typescript
const registryProxy = registry.has(def.name)
  ? registry.createProxy()
  : ({} as Record<string, EntityOperations>);
```

But looking at `create-server.ts:52-65`, the `EntityRegistry` is created with `new EntityRegistry()` and never has `register()` called on it:

```typescript
const registry = new EntityRegistry();
// ...
for (const entityDef of config.entities) {
  const db = dbFactory(entityDef as EntityDefinition);
  const routes = generateEntityRoutes(entityDef as EntityDefinition, registry, db, { ... });
  entityRoutes.push(...routes);
}
```

Since `registry.register()` is never called, `registry.has(def.name)` always returns `false`, and the proxy is always `{}` (an empty object). This means:
1. `ctx.entities.someEntity.get(id)` will return `undefined` silently (accessing a property on `{}` returns `undefined`)
2. `ctx.entities.someEntity.get(id)()` will throw `TypeError: Cannot read property 'get' of undefined` at runtime

The `EntityContext.entities` property is supposed to provide cross-entity access (e.g., a user entity action that needs to read from the tasks entity). This is completely broken.

**Fix:** Register each entity's operations into the registry during the route generation loop:

```typescript
const registry = new EntityRegistry();

for (const entityDef of config.entities) {
  const db = dbFactory(entityDef as EntityDefinition);
  // Create operations facade and register it
  const ops = createEntityOperations(entityDef, db);
  registry.register(entityDef.name, ops);
}

for (const entityDef of config.entities) {
  const db = dbFactory(entityDef as EntityDefinition);
  const routes = generateEntityRoutes(entityDef as EntityDefinition, registry, db, { ... });
  entityRoutes.push(...routes);
}
```

This requires a `createEntityOperations` function or needs to be done in two passes (register all, then generate routes).

---

### [BUG-4] HIGH -- `makeEntityCtx` creates a dummy `entityOps` that is unusable

**File:** `packages/server/src/entity/route-generator.ts:81-85`

**Issue:** The `makeEntityCtx` helper creates an `EntityContext` with a dummy entity operations object:

```typescript
function makeEntityCtx(ctx: Record<string, unknown>) {
  const requestInfo = extractRequestInfo(ctx);
  const entityOps = {} as EntityOperations; // Operations are used via crudHandlers directly
  return createEntityContext(requestInfo, entityOps, registryProxy);
}
```

The comment says "Operations are used via crudHandlers directly", but the `EntityContext` is passed to access rules and hooks, which have access to `ctx.entity`. If an access rule or hook calls `ctx.entity.get(id)` or `ctx.entity.list()`, it will call methods on an empty object (`{}`), resulting in `TypeError: ctx.entity.get is not a function`.

The `EntityContext` interface declares:
```typescript
readonly entity: EntityOperations<TModel>;
```

An empty object cast to `EntityOperations` is a lie -- it satisfies the type but has zero runtime functionality.

**Fix:** Either:
1. Create a real `EntityOperations` facade for the current entity backed by the DB adapter:
```typescript
const entityOps = createEntityOperations(def, db);
```
2. Or make `entity` optional on the context and throw a descriptive error if accessed:
```typescript
const entityOps = new Proxy({} as EntityOperations, {
  get(_, prop) {
    throw new Error(`ctx.entity.${String(prop)}() is not available in route handlers. Use the CRUD pipeline directly.`);
  },
});
```

---

### [BUG-5] MEDIUM -- Unsafe `as` casts on entity definitions in `create-server.ts`

**File:** `packages/server/src/create-server.ts:60-61`

**Issue:** The config uses the core `EntityDefinition` type from `@vertz/core` (which is a forward-declared interface with `model: unknown`), but the route generator needs the server's `EntityDefinition` (from `@vertz/server` with `model: ModelDef`). The cast:

```typescript
const db = dbFactory(entityDef as EntityDefinition);
const routes = generateEntityRoutes(entityDef as EntityDefinition, registry, db, { ... });
```

Here `entityDef` is typed as core's `EntityDefinition` (from `AppConfig.entities`), and it is cast to server's `EntityDefinition`. These are structurally different types:
- Core's `EntityDefinition` has `model: unknown`, `access: Record<string, unknown>`, etc.
- Server's `EntityDefinition` has `model: TModel extends ModelDef`, `access: Partial<Record<string, AccessRule>>`, etc.

The `as` cast silences the type checker entirely. If someone passes an object that satisfies core's interface but not server's (e.g., `model` is not a real `ModelDef`), it will compile fine but crash at runtime when `def.model.table._columns` is accessed in `stripHiddenFields`.

**Fix:** Add a runtime validation function:

```typescript
function assertEntityDefinition(def: unknown): asserts def is EntityDefinition {
  // Check that model has a table with _columns
  const d = def as Record<string, unknown>;
  if (!d.model || typeof d.model !== 'object') {
    throw new Error(`Entity "${d.name}" has an invalid model`);
  }
  // ... further checks
}
```

Or narrow the `ServerConfig.entities` type to use `@vertz/server`'s `EntityDefinition` directly instead of inheriting core's.

---

### [BUG-6] MEDIUM -- `as AppConfig` cast in `create-server.ts` hides type mismatches

**File:** `packages/server/src/create-server.ts:68-72`

**Issue:**

```typescript
return coreCreateServer({
  ...config,
  _entityRoutes: entityRoutes,
} as AppConfig);
```

The `as AppConfig` cast is required because `ServerConfig` extends `Omit<AppConfig, '_entityDbFactory'>`, and the spread of `config` (a `ServerConfig`) plus `_entityRoutes` does not naturally satisfy `AppConfig`. The cast hides any structural mismatch. If `ServerConfig` adds fields that conflict with `AppConfig` fields, the compiler will not catch it.

Additionally, `_entityDbFactory` is on `ServerConfig` but is `Omit`-ed from `AppConfig` inheritance. Yet `config._entityDbFactory` still exists at runtime on the spread object. Core's `AppConfig` also defines `_entityDbFactory` with a different type signature (`(entityDef: EntityDefinition) => unknown` vs `(entityDef: EntityDefinition) => EntityDbAdapter`). The spread passes it through to core, which will ignore it, but it pollutes the config object.

**Fix:** Explicitly construct the `AppConfig` to pass to core, excluding server-specific fields:

```typescript
const { _entityDbFactory, ...coreConfig } = config;
return coreCreateServer({
  ...coreConfig,
  _entityRoutes: entityRoutes,
});
```

---

### [BUG-7] MEDIUM -- `getParams(ctx).id as string` can be `undefined` and the cast hides it

**File:** `packages/server/src/entity/route-generator.ts:146,219,253,299`

**Issue:** Multiple handlers do:

```typescript
const id = getParams(ctx).id as string;
```

The `getParams` function returns `Record<string, string>`, and accessing `.id` on it yields `string | undefined` (not `string`). The `as string` cast hides the possibility that `id` is `undefined`. If the trie somehow does not extract the `:id` param (e.g., malformed request), `id` will be `undefined`, and the DB adapter will receive `undefined` as the ID -- behavior depends on the adapter (could return null, throw, or match an `undefined` key).

For the `GET /api/users/:id` route, the trie should always populate `params.id`. But for defense-in-depth, the undefined case should be handled.

**Fix:**

```typescript
const id = getParams(ctx).id;
if (!id) {
  return jsonResponse(
    { error: { code: 'BAD_REQUEST', message: 'Missing required parameter: id' } },
    400,
  );
}
```

---

### [T-1] MEDIUM -- `EntityRouteEntry.handler` type mismatch between core and server

**File:** `packages/core/src/types/app.ts:28` and `packages/core/src/app/app-runner.ts:173`

**Issue:** The `EntityRouteEntry` type in core declares:

```typescript
export interface EntityRouteEntry {
  method: string;
  path: string;
  handler: (ctx: Record<string, unknown>) => Promise<Response>;
}
```

But in `app-runner.ts`, the handler is cast:

```typescript
handler: route.handler as (ctx: HandlerCtx) => unknown,
```

This casts `(ctx: Record<string, unknown>) => Promise<Response>` to `(ctx: HandlerCtx) => unknown`. The issues:
1. `HandlerCtx` is not `Record<string, unknown>` -- it is a frozen immutable proxy. Entity handlers that write to `ctx` will silently fail.
2. The return type changes from `Promise<Response>` to `unknown`. The app-runner then processes this `unknown` through Result type checking, response validation, and CORS. When the entity handler returns a `Response` object, it hits the `result instanceof Response` branch and is returned directly -- this works, but CORS headers ARE applied (line 321-323), meaning entity routes that already set their own headers may get double CORS.
3. The `method: string` on `EntityRouteEntry` accepts any string, not just valid HTTP methods. A typo like `method: 'GETS'` would compile fine and register a route that can never be matched.

**Fix:**
1. Use `HttpMethod` instead of `string` for the method:
```typescript
method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
```
2. Remove the `as` cast in `app-runner.ts` -- either align the types or use a proper adapter function.

---

### [T-2] MEDIUM -- `ServerConfig` extends `Omit<AppConfig, '_entityDbFactory'>` but redeclares `_entityDbFactory` with incompatible type

**File:** `packages/server/src/create-server.ts:12-15`

**Issue:**

```typescript
export interface ServerConfig extends Omit<AppConfig, '_entityDbFactory'> {
  _entityDbFactory?: (entityDef: EntityDefinition) => EntityDbAdapter;
}
```

Core's `AppConfig._entityDbFactory` is typed as `(entityDef: EntityDefinition) => unknown`. Server's version narrows the return type to `EntityDbAdapter`. The `Omit` + redeclare pattern works, but:
1. The `EntityDefinition` in the parameter type refers to **different** types -- core's forward-declared version vs. server's full version. This means the factory function signature is subtly different.
2. The `createNoopDbAdapter` function (line 21-39) ignores the `entityDef` parameter entirely (it is a function that takes zero arguments). But the factory type expects one argument. The default is set as `config._entityDbFactory ?? createNoopDbAdapter`, where `createNoopDbAdapter` has signature `() => EntityDbAdapter` but is assigned to a slot expecting `(entityDef: EntityDefinition) => EntityDbAdapter`. TypeScript allows this (extra params are ignored), but it is misleading.

**Fix:** Make `createNoopDbAdapter` accept the entity def parameter for signature consistency:

```typescript
function createNoopDbAdapter(_entityDef: EntityDefinition): EntityDbAdapter {
  return { ... };
}
```

---

### [T-3] MEDIUM -- `extractRequestInfo` uses three separate unsafe `as` casts

**File:** `packages/server/src/entity/route-generator.ts:37-43`

**Issue:**

```typescript
function extractRequestInfo(ctx: Record<string, unknown>): EntityRequestInfo {
  return {
    userId: (ctx.userId as string | null | undefined) ?? null,
    tenantId: (ctx.tenantId as string | null | undefined) ?? null,
    roles: (ctx.roles as string[] | undefined) ?? [],
  };
}
```

Each property is cast from `unknown` to a specific type. If middleware sets `ctx.userId` to a number or `ctx.roles` to a string (not an array), the cast hides the mismatch and the code proceeds with wrong types. The `roles.includes(r)` call in `EntityContext.role()` would throw if `roles` is not an array.

**Fix:** Add runtime type narrowing:

```typescript
function extractRequestInfo(ctx: Record<string, unknown>): EntityRequestInfo {
  const userId = typeof ctx.userId === 'string' ? ctx.userId : null;
  const tenantId = typeof ctx.tenantId === 'string' ? ctx.tenantId : null;
  const roles = Array.isArray(ctx.roles) ? (ctx.roles as string[]) : [];
  return { userId, tenantId, roles };
}
```

---

### [SEC-2] MEDIUM -- `VertzException.message` may contain sensitive info and is passed through to error responses

**File:** `packages/server/src/entity/error-handler.ts:55`

**Issue:** The error handler includes `error.message` in all `VertzException` responses:

```typescript
message: error.message,
```

Exception messages throughout the codebase include entity names and IDs:
- `NotFoundException`: `"users with id \"abc123\" not found"` (from `crud-pipeline.ts:62`)
- `ForbiddenException`: `"Access denied: no access rule for operation \"create\""` (from `access-enforcer.ts:22`)
- `ForbiddenException`: `"Operation \"delete\" is disabled"` (from `access-enforcer.ts:27`)

While these are not catastrophic leaks, they reveal:
1. Internal entity names (which may differ from public API names in the future)
2. Which operations are disabled vs. having no access rule (helps enumerate the API)
3. The exact ID queried (could be used for enumeration attacks)

**Fix:** For 403/404 responses, use generic messages:
```typescript
if (error.statusCode === 403) {
  return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Access denied' } } };
}
if (error.statusCode === 404) {
  return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Resource not found' } } };
}
```

Log the detailed message server-side for debugging.

---

### [EDGE-1] MEDIUM -- Entity name used directly in URL path without encoding or validation

**File:** `packages/server/src/entity/route-generator.ts:71`

**Issue:**

```typescript
const basePath = `${prefix}/${def.name}`;
```

The entity name comes from `entity('users', ...)` which validates against `/^[a-z][a-z0-9-]*$/` (in `entity.ts:5`). However, `generateEntityRoutes` does not re-validate this. If `EntityDefinition` is constructed without going through `entity()` (e.g., directly in tests or from deserialization), `def.name` could contain:
- Slashes: `def.name = "foo/bar"` would create path `/api/foo/bar` which changes the trie structure
- URL-encoded chars: `def.name = "foo%2Fbar"` could cause path traversal after decoding
- Dots: `def.name = ".."`could theoretically interact with path resolution

The `entity()` function's validation prevents this for normal usage, but `generateEntityRoutes` accepts any `EntityDefinition` -- it does not verify the name is safe for URL use.

**Fix:** Add a path-safety check in `generateEntityRoutes`:

```typescript
if (!/^[a-z][a-z0-9-]*$/.test(def.name)) {
  throw new Error(`Entity name "${def.name}" is not safe for URL use`);
}
```

---

### [EDGE-2] MEDIUM -- `apiPrefix` double-slash or trailing slash inconsistency

**File:** `packages/server/src/entity/route-generator.ts:70-71` and `packages/core/src/app/app-builder.ts:82-88`

**Issue:** The default `apiPrefix` logic differs between the two code paths:

In `route-generator.ts`:
```typescript
const prefix = options?.apiPrefix ?? '/api';
const basePath = `${prefix}/${def.name}`;
```

In `app-builder.ts` (core):
```typescript
const rawPrefix = config.apiPrefix === undefined ? '/api/' : config.apiPrefix;
const entityPath = rawPrefix === ''
  ? `/${entity.name}`
  : (rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}/`) + entity.name;
```

If `apiPrefix` is `/api/` (with trailing slash), the route generator produces `/api//users` (double slash), while core produces `/api/users`. The trie's `splitPath` function splits by `/` and filters empty strings, so `/api//users` resolves to segments `['api', 'users']` which matches. But the `router.routes` path strings will differ from the actual trie paths, causing confusion in tests and logging.

If `apiPrefix` is empty string `""`, the route generator produces `/users` (correct), but core produces `/users` too -- this case works.

If `apiPrefix` has no leading slash (e.g., `api`), the route generator produces `api/users` (no leading slash), which is invalid for URL matching. The trie would register segments `['api', 'users']` which works, but the path string in `router.routes` would be `/api/users` vs the trie's `api/users`.

**Fix:** Normalize the prefix in one place:

```typescript
function normalizePrefix(prefix: string): string {
  // Ensure leading slash, no trailing slash
  const p = prefix.startsWith('/') ? prefix : `/${prefix}`;
  return p.endsWith('/') ? p.slice(0, -1) : p;
}
```

---

### [EDGE-3] MEDIUM -- No test for entity with empty `actions: {}` -- `Object.entries` on frozen empty object

**File:** `packages/server/src/entity/route-generator.ts:271`

**Issue:** When an entity has `actions: {}` (the default from `entity()`), the code does:

```typescript
for (const [actionName, actionDef] of Object.entries(def.actions)) {
```

The `def.actions` is a deeply frozen object (from `entity()` which calls `deepFreeze`). `Object.entries` on a frozen empty object is fine, but there is no test verifying this edge case. The route generator test's `buildEntityDef` defaults to `actions: {}` which covers it implicitly, but there should be an explicit test that verifying zero action routes are generated.

More importantly, if `def.actions` were `undefined` (possible if `EntityDefinition` is constructed outside of `entity()`), `Object.entries(undefined)` would throw `TypeError`. The `entity()` function defaults `actions` to `{}`, but `generateEntityRoutes` does not guard against this.

**Fix:** Add a guard:

```typescript
for (const [actionName, actionDef] of Object.entries(def.actions ?? {})) {
```

---

### [EDGE-4] MEDIUM -- No test for `create` handler with `undefined`/`null` body

**File:** `packages/server/src/entity/route-generator.ts:182`

**Issue:**

```typescript
const data = (ctx.body ?? {}) as Record<string, unknown>;
```

If the request has no body (e.g., `POST /api/users` with no `Content-Type` header), `ctx.body` is `undefined` and `data` becomes `{}`. This empty object passes to `crudHandlers.create(entityCtx, {})`, which will:
1. Strip readOnly fields from `{}` -- returns `{}`
2. Run before hook on `{}` -- may or may not be a problem
3. Call `db.create({})` -- creates a record with no fields

There is no validation that required fields are present. The `model.table` has column definitions with `.unique()`, etc., but no runtime schema validation happens in the CRUD pipeline for create/update input.

**Fix:** Add input validation using the model's schema. At minimum, throw a `BadRequestException` when the body is empty for POST/PATCH:

```typescript
const data = ctx.body as Record<string, unknown> | undefined;
if (!data || Object.keys(data).length === 0) {
  return jsonResponse(
    { error: { code: 'BAD_REQUEST', message: 'Request body is required' } },
    400,
  );
}
```

---

### [EDGE-5] LOW -- Custom action routes always use POST -- no support for GET/PUT/DELETE actions

**File:** `packages/server/src/entity/route-generator.ts:277,293`

**Issue:** All custom actions are registered as `POST`:

```typescript
routes.push({
  method: 'POST',
  path: `${basePath}/:id/${actionName}`,
  ...
});
```

This is a reasonable default (actions are commands that change state). However, some custom actions are idempotent queries (e.g., `generateReport`, `calculateScore`) that semantically should be GET requests. There is no way to configure the HTTP method for custom actions.

**Fix:** Add an optional `method` field to `EntityActionDef`:

```typescript
export interface EntityActionDef<TInput, TOutput, TResponse> {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly input: SchemaLike<TInput>;
  // ...
}
```

Default to `POST`. This is a minor DX improvement -- not a bug.

---

### [EDGE-6] LOW -- `createNoopDbAdapter` silently loses data -- dangerous default

**File:** `packages/server/src/create-server.ts:21-39`

**Issue:** The no-op DB adapter is used when no `_entityDbFactory` is provided:

```typescript
function createNoopDbAdapter(): EntityDbAdapter {
  return {
    async get() { return null; },
    async list() { return []; },
    async create(data) { return data; },
    async update(_id, data) { return data; },
    async delete() { return null; },
  };
}
```

`create(data)` returns the input `data` without an `id` field. `get()` always returns `null`. `list()` always returns `[]`. This means:
1. Creating an entity succeeds silently but the data is lost
2. Getting or listing always returns empty
3. The response to a create request will include whatever the user sent, but with no `id` -- not a valid entity

The noop adapter is a footgun: a developer who forgets to configure a DB adapter will get a "working" server that silently loses all data. No error, no warning.

**Fix:** Either:
1. Throw an error if no DB factory is provided and entities are configured:
```typescript
if (config.entities && config.entities.length > 0 && !config._entityDbFactory) {
  throw new Error('createServer: entities require a _entityDbFactory. Install @vertz/db for database integration.');
}
```
2. Or log a warning at startup: `console.warn('[vertz] No DB adapter configured. Entity operations will use a no-op adapter that does not persist data.')`

---

### [EDGE-7] LOW -- Error handler test does not test VertzException with unmapped status code

**File:** `packages/server/src/entity/__tests__/error-handler.test.ts`

**Issue:** The `STATUS_TO_CODE` map covers status codes 400, 401, 403, 404, 405, 409, 422, 500, 503. But `VertzException` accepts any `statusCode` number. If a custom exception uses status code 429 (Too Many Requests), the error handler returns:

```typescript
const code = STATUS_TO_CODE[429] ?? 'INTERNAL_ERROR';
// code = 'INTERNAL_ERROR' -- wrong semantic for 429
```

The status code is preserved correctly, but the `code` field defaults to `INTERNAL_ERROR` which is misleading. A 429 response with `code: 'INTERNAL_ERROR'` will confuse API consumers.

There is no test for this edge case.

**Fix:** Add 429 to the map:

```typescript
429: 'RATE_LIMITED',
```

And add a test:
```typescript
it('maps VertzException with unmapped status code to correct status with INTERNAL_ERROR code', () => {
  const result = entityErrorHandler(new VertzException('Rate limited', 429));
  expect(result.status).toBe(429);
  expect(result.body.error.code).toBe('RATE_LIMITED');
});
```

---

### [DX-1] MEDIUM -- `@vertz/server` and `@vertz/core` both export `EntityRouteEntry` type but from different sources

**File:** `packages/core/src/index.ts:59` and `packages/server/src/index.ts` (implicit via core re-exports)

**Issue:** `@vertz/core` exports `EntityRouteEntry` from its types. `@vertz/server` re-exports everything from `@vertz/core`. But `@vertz/server` also exports `EntityRouteOptions` and `generateEntityRoutes` from its own entity module. A developer importing from `@vertz/server` gets `EntityRouteEntry` (from core) and `EntityRouteOptions` (from server) -- both are entity-related types but come from different layers.

If a developer needs to use `EntityRouteEntry` with `generateEntityRoutes`, they must know that `EntityRouteEntry` comes from core's types while `generateEntityRoutes` is in server. This is not a bug but a DX papercut -- the type should live near its consumer.

**Fix:** Consider re-exporting `EntityRouteEntry` from `@vertz/server`'s entity module (even if it is just a re-export) so all entity-related types are discoverable from one place.

---

### [DX-2] LOW -- Test file `route-generator.test.ts` imports `d` from `@vertz/db` but does not test the integration with core's `createApp`

**File:** `packages/server/src/entity/__tests__/route-generator.test.ts`

**Issue:** The test creates routes using `generateEntityRoutes` and calls handlers directly, but never tests the integration with core's trie. The `server-integration.test.ts` covers some of this, but the route generator tests should verify:
1. That generated routes can be registered in a trie without errors
2. That method/path combinations are unique (no duplicates)
3. That custom action routes do not conflict with the `:id` parameter route

For example, if an entity has an action named with the same pattern as a CRUD operation, the trie registration could fail or produce unexpected behavior.

**Fix:** Add a test that registers all generated routes in a `Trie` instance:

```typescript
it('generated routes can be registered in a Trie without conflicts', () => {
  const trie = new Trie();
  const routes = generateEntityRoutes(def, registry, db);
  for (const route of routes) {
    expect(() => trie.add(route.method, route.path, route.handler)).not.toThrow();
  }
});
```

---

### [DX-3] LOW -- `re-exports.test.ts` does not verify entity-related exports

**File:** `packages/server/src/__tests__/re-exports.test.ts`

**Issue:** The re-exports test verifies that `createServer`, `createEnv`, `createMiddleware`, etc. are exported, and that `createApp` is NOT exported. But it does not verify any of the new entity-related exports:
- `entity`, `entityErrorHandler`, `generateEntityRoutes`
- `EntityRegistry`, `createCrudHandlers`, `createEntityContext`
- `enforceAccess`, `stripHiddenFields`, `stripReadOnlyFields`

If a future refactor accidentally removes one of these exports, there would be no test to catch it.

**Fix:** Add assertions for entity exports:

```typescript
it('exports entity API', () => {
  expect(server.entity).toBeTypeOf('function');
  expect(server.entityErrorHandler).toBeTypeOf('function');
  expect(server.generateEntityRoutes).toBeTypeOf('function');
  expect(server.EntityRegistry).toBeTypeOf('function');
  expect(server.createCrudHandlers).toBeTypeOf('function');
  expect(server.enforceAccess).toBeTypeOf('function');
});
```

---

### [DX-4] LOW -- No test for `createServer` with empty entities array

**File:** `packages/server/src/entity/__tests__/server-integration.test.ts`

**Issue:** The test file covers entities with CRUD routes but never tests `createServer({ entities: [] })` or `createServer({})` (no entities at all). The `createServer` function has a guard:

```typescript
if (config.entities && config.entities.length > 0) {
```

If `entities` is `[]`, this guard correctly skips route generation. If `entities` is `undefined`, it also skips. But there is no test ensuring these edge cases produce a working server with zero entity routes.

**Fix:** Add edge case tests:

```typescript
it('createServer with no entities produces a working server', () => {
  const app = createServer({});
  expect(app.router.routes).toHaveLength(0);
});

it('createServer with empty entities array produces a working server', () => {
  const app = createServer({ entities: [] });
  expect(app.router.routes).toHaveLength(0);
});
```

---

### [DX-5] LOW -- `jsonResponse` does not set `Content-Length` header

**File:** `packages/server/src/entity/route-generator.ts:22-27`

**Issue:**

```typescript
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
```

The response sets `content-type` but not `content-length`. Most runtimes (Bun, Node) will auto-calculate this, but explicitly setting it is best practice for HTTP compliance. More importantly, `JSON.stringify(data)` can throw if `data` contains circular references. This is unlikely in normal operation but possible if a before/after hook returns a circular object.

**Fix:** Wrap in try/catch:

```typescript
function jsonResponse(data: unknown, status = 200): Response {
  let body: string;
  try {
    body = JSON.stringify(data);
  } catch {
    body = JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Response serialization failed' } });
    status = 500;
  }
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
```

---

## Severity Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 1 | SEC-1 |
| HIGH | 4 | BUG-1, BUG-2, BUG-3, BUG-4 |
| MEDIUM | 10 | BUG-5, BUG-6, BUG-7, T-1, T-2, T-3, SEC-2, EDGE-1, EDGE-2, DX-1 |
| LOW | 7 | EDGE-3, EDGE-4, EDGE-5, EDGE-6, EDGE-7, DX-2, DX-3, DX-4, DX-5 |

### Recommended Priority

1. **SEC-1** (error details leakage) -- most actionable security issue, can leak hidden fields through error responses
2. **BUG-3** (EntityRegistry never populated) -- `ctx.entities` is completely broken
3. **BUG-4** (dummy entityOps) -- `ctx.entity` is completely broken
4. **BUG-1** (entity routes bypass middleware) -- needs documented contract or explicit integration
5. **BUG-2** (double route registration) -- causes confusion in testing and route inspection
6. **BUG-7** (undefined ID cast) -- defense in depth for param extraction
7. **T-3** (unsafe casts in extractRequestInfo) -- runtime type narrowing prevents silent failures
8. Everything else

---

## Resolution

### Fixed

**SEC-1 (CRITICAL) — Error details leakage**
Fixed. `entityErrorHandler` now only includes `details` for `ValidationException` (structured, safe error data). Generic `VertzException.details` is no longer passed through to HTTP responses. Test updated to verify details are stripped.

**BUG-2 (HIGH) — Double route registration**
Fixed. `createApp` in core now checks for `_entityRoutes` first — when provided (by `@vertz/server`), uses those as the source of truth for `router.routes`. Falls back to unconditional registration only when `_entityRoutes` is not present.

### Accepted for v0.1.0

**BUG-1 (HIGH) — Entity routes and middleware contract**
By design. Entity routes DO run through the global middleware chain — `buildCtx` merges `middlewareState` into the handler context. `extractRequestInfo` reads `userId`, `tenantId`, `roles` from the context. This works correctly when auth middleware provides these keys. The review correctly notes there's no type-safe contract ensuring middleware provides these keys — this is a documentation task, not a code bug. Will document the expected middleware contract.

**BUG-3 (HIGH) — EntityRegistry never populated**
Known limitation of v0.1.0. Cross-entity access (`ctx.entities`) requires a two-pass registration approach. For v0.1.0, entity routes use `crudHandlers` directly and don't need cross-entity access. Will be addressed when cross-entity features are needed.

**BUG-4 (HIGH) — Dummy entityOps**
Same as BUG-3. `ctx.entity` self-CRUD is a v0.2 feature. Route handlers use `crudHandlers` directly. Access rules and hooks that reference `ctx.entity` will get a runtime error — this is acceptable since no v0.1.0 features require it.

### Deferred

All MEDIUM and LOW findings are deferred to incremental improvement. The type safety casts (T-1, T-2, T-3) exist at the core/server package boundary and are inherent to the two-package architecture. The unsafe `as` casts are documented and intentional.
