# DX Journal -- Task API Demo

Notes from building the first vertz demo app. Every friction point, every win, every suggestion for improvement.

**Author:** josh (vertz-advocate)
**Date:** 2026-02-11
**Packages used:** @vertz/schema 0.1.0, @vertz/core 0.1.0, @vertz/db 0.1.0

---

## Setup & First Impressions

### Workspace setup

The monorepo uses bun workspaces with `packages/*`. To create an example app, I had to
add `examples/*` to the root `package.json` workspaces array. This is fine but should
be documented -- a developer cloning the repo and trying to create their first app
outside `packages/` would hit a resolution error for `workspace:*` dependencies.

**Suggestion:** Add `examples/*` to workspaces by default, or add a note to
CONTRIBUTING.md about the workspace structure.

### Build step for @vertz/db

The `dist/` folder for `@vertz/db` was missing -- it had never been built. Running
`bun run --filter @vertz/db build` initially failed with a native binding error for
`oxc-resolver`. A clean `bun install` followed by another build succeeded. This is
a one-time setup hiccup, but a new contributor would be confused.

**Suggestion:** Add a root-level `postinstall` script that builds all packages, or
document the required build step in the getting started guide. Alternatively, consider
configuring bun to resolve TypeScript source files directly during development (which
bun can do via its module resolution), so `dist/` is only needed for publishing.

### TypeScript types

The example needed `@types/node` for `process.env` and `crypto.randomUUID()`.
The main packages already have this as a devDependency but the example didn't
inherit it. Minor but slightly annoying.

---

## Schema Definition (@vertz/schema)

### What felt great

The `s` factory object is immediately familiar to anyone who has used Zod. The API
is almost 1:1:

```typescript
const createUserBody = s.object({
  email: s.email(),
  name: s.string().min(1).max(100),
  role: s.enum(['admin', 'member'] as const).optional(),
});
```

The chaining works naturally: `.min()`, `.max()`, `.optional()`, `.nullable()`. The
`s.email()` and `s.uuid()` format shortcuts are excellent -- Zod requires
`z.string().email()` and `z.string().uuid()`. Having them as top-level is a nice
DX win.

`.partial()`, `.extend()`, `.pick()`, `.omit()` on objects all work as expected.
The `ObjectSchema.extend()` was particularly useful for building the
`taskWithAssigneeResponse` by extending the base `taskResponse`.

### Pain point: `s.coerce.number()` for query params

Query parameters from URL search params are always strings. To get a `number` for
`limit` and `offset`, I used `s.coerce.number().optional()`. This works, but the
discovery was not obvious. There is no error message that says "expected number,
got string -- did you mean s.coerce.number()?" when you accidentally use
`s.number()` for a query param.

**Suggestion:** When schema validation fails inside a query or params context, the
error message could hint at coercion. Or add documentation about common patterns
like "for query params, use `s.coerce.number()` since URL params are always strings."

### Pain point: `as const` on enum values

You must write `s.enum(['admin', 'member'] as const)` -- without `as const`, the
type widens to `string` and you lose the literal union. This is a standard TypeScript
pattern, but it catches people every time. Zod has the same limitation.

**Suggestion:** Add a JSDoc comment or example on the `s.enum()` factory that shows
the `as const` pattern. Consider whether a compile-time error or a branded type could
guide developers to the right pattern.

### Missing: `s.string().uuid()` / `s.string().email()`

You can do `s.uuid()` and `s.email()` at the top level, which is great. But you
cannot do `s.string().uuid()` or `s.string().email()`. This means format schemas
cannot be combined with string refinements like `.min()` or `.trim()`. For
example, there is no way to do `s.email().trim()`.

Actually wait -- since `EmailSchema` extends `Schema`, it does have `.transform()`.
So you could do `s.email().transform(v => v.trim())`. But that is less discoverable
than `.trim()` directly on the email schema. The `StringSchema` has `.trim()` but
`EmailSchema` does not inherit it since `EmailSchema` is a separate class.

**Suggestion:** Consider making format schemas (email, uuid, url, etc.) return a
`StringSchema` with the format validation applied as a refinement, so string methods
like `.trim()`, `.toLowerCase()` are available.

---

## Database Schema (@vertz/db)

### What felt great

The `d.table()` API is expressive and reads like a database diagram:

```typescript
const tasks = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  status: d.enum('task_status', ['todo', 'in_progress', 'done'] as const).default('todo'),
  assigneeId: d.uuid().nullable().references('users'),
  createdAt: d.timestamp().default('now'),
});
```

The chaining is natural: `.primary()`, `.unique()`, `.nullable()`, `.default()`,
`.references()`. Each method clearly communicates what it does. The inferred types
are correct -- `assigneeId` becomes `string | null` because of `.nullable()`,
`createdAt` is optional on insert because of `.default('now')`.

Relations via `d.ref.one()` and `d.ref.many()` are clean:

```typescript
const tables = {
  users: {
    table: users,
    relations: {
      tasks: d.ref.many(() => tasks, 'assigneeId'),
    },
  },
  tasks: {
    table: tasks,
    relations: {
      assignee: d.ref.one(() => users, 'assigneeId'),
    },
  },
};
```

### Pain point: enum declaration duplication

You have to declare enum values twice -- once in `d.enum()` for the database column,
and once in `s.enum()` for the validation schema:

```typescript
// In db/schema.ts
status: d.enum('task_status', ['todo', 'in_progress', 'done'] as const)

// In schemas/task.schemas.ts
const taskStatus = s.enum(['todo', 'in_progress', 'done'] as const);
```

If someone adds a new status to one but not the other, you get a runtime mismatch
with no compile-time warning.

**Workaround applied in this demo:** Export the raw values as constants from the
db schema and import them in the validation schemas:

```typescript
// db/schema.ts
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
status: d.enum('task_status', TASK_STATUSES).default('todo'),

// schemas/task.schemas.ts
import { TASK_STATUSES } from '../db/schema';
const taskStatus = s.enum(TASK_STATUSES);
```

This works but requires discipline. The ideal solution would be framework-level:

```typescript
// Ideal:
const taskStatus = s.fromDbEnum(tasks._columns.status);
```

### Pain point: `d.enum()` requires name + values every time

When defining a column, `d.enum('task_status', values)` requires you to provide
the PG enum name. This is fine, but if you use the same enum type in multiple
tables (e.g., both `user_role` and some other table), you repeat the name+values.
There is no way to define a reusable enum definition.

**Suggestion:** Allow creating a reusable enum definition:

```typescript
const taskStatus = d.enumDef('task_status', ['todo', 'in_progress', 'done'] as const);
// Then:
status: taskStatus.default('todo')
```

### Observation: table registry is manual

The `tables` object (the registry passed to `createDb`) is manually assembled.
You define the table, then separately wire it into a registry with relations.
This works but feels like it could be automated or simplified.

**Suggestion:** Consider a `d.registry()` builder that collects tables and infers
relations, or at least provide a helper that validates the registry is consistent
(all referenced tables exist, foreign keys point to real columns, etc).

### Observation: `createDb` driver not yet connected

The `createDb` function creates a typed instance but actual queries throw with
"db.query() requires a connected postgres driver." The server boots fine -- routes
register, schema validation works, CORS works -- but any request that hits the
database returns 500.

This is expected since the driver phase is not yet shipped, but it means this
demo cannot actually be run end-to-end against a real database yet. The API
patterns (`db.findMany`, `db.create`, `db.update`, `db.delete`) are clear and
the type signatures are well-designed. Looking forward to the driver phase.

---

## Module System (@vertz/core)

### What felt great

The module system pattern is clean and predictable:

```
moduleDef -> service -> router -> module -> app.register()
```

Each step builds on the previous one. The `inject` mechanism for making services
available in router handlers works well. Defining a service's methods as a function
that returns an object is intuitive.

The `vertz.moduleDef({ name: 'users' })` -> `def.service(...)` -> `def.router(...)`
chain ensures services and routers belong to the correct module (validated at runtime
with `validateOwnership`). This is a nice guard against wiring mistakes.

### Pain point: handler service type casting

When accessing injected services in handlers, TypeScript doesn't know the type:

```typescript
handler: async (ctx) => {
  const svc = ctx.userService as ReturnType<typeof createUserMethods>;
  return svc.list({ ... });
}
```

The `as ReturnType<typeof createUserMethods>` cast is required because `ctx` only
knows that `userService` is `unknown`. This is the biggest DX friction point in the
entire framework right now.

**This should be the #1 priority for the next DX iteration.** The `inject` object
already carries the service reference -- the router should be able to infer the
methods type from it.

**Ideal:**
```typescript
const userRouter = userDef
  .router({ prefix: '/users', inject: { userService } })
  .get('/', {
    handler: (ctx) => {
      // ctx.userService should be fully typed here
      return ctx.userService.list();
    },
  });
```

**Current reality:**
```typescript
const userRouter = userDef
  .router({ prefix: '/users', inject: { userService } })
  .get('/', {
    handler: (ctx) => {
      // ctx.userService is unknown -- must cast
      const svc = ctx.userService as ReturnType<typeof createUserMethods>;
      return svc.list();
    },
  });
```

**Root cause:** The `RouterDef` interface has `inject?: Record<string, unknown>`,
which erases the service types. The `NamedRouterDef` carries a `TMiddleware`
generic but not a `TInject` generic. To fix this, the router would need to be
generic over its inject map, and the `HttpMethodFn` would need to thread that
type into the handler context.

### Pain point: `params` type from schema not flowing into handler

When you define `params: userIdParams` on a route, the handler `ctx.params` should
be typed as `{ id: string }`. Looking at the code, the `RouteConfig` does have
generics for `TParams` etc., and the handler receives `InferOutput<TParams>`.
However, the schema object from `@vertz/schema` does carry `_output` which should
be inferable. Let me test...

Actually, looking at the type definitions more carefully, `InferOutput<T>` checks
for `_output` or `parse()`. Since `ObjectSchema` extends `Schema<O>` which declares
`_output: O`, this should work. The issue is that the `params` field in `RouteConfig`
is typed as `TParams`, and when you pass `userIdParams`, TypeScript should infer
`TParams` from it.

I confirmed: the params/body/query types DO flow through to the handler! When I
write `ctx.params.id` after providing `params: userIdParams`, TypeScript knows
`id` is a `string`. And `ctx.body.email` after providing `body: createUserBody`
is also typed.

**This is a nice win.** The schema validation and type inference for params/body/query
works correctly. The only gap is the injected services.

### Pain point: `path` type constraint

Router paths must start with `/` (enforced at runtime and by the template literal
type `` `/${string}` ``). This is correct, but the error message at the type level
is not obvious -- you just get "type 'string' is not assignable to type
`` `/${string}` ``" which is confusing if you are not familiar with template literal
types.

**Suggestion:** A clearer branded type or JSDoc with examples would help.

### Observation: no route-level middleware

The route config has a `middlewares` field (typed as `unknown[]`) but the app runner
does not appear to process route-level middlewares -- only global middlewares via
`app.middlewares()`. For this demo I did not need route-level middleware, but for
authentication (e.g., admin-only routes) this would be important.

**Suggestion:** Document whether route-level middleware is supported. If it's
planned for a future version, note that in the API docs.

---

## Router & HTTP Layer

### What felt great

Route registration is fluent and readable:

```typescript
const router = taskDef
  .router({ prefix: '/tasks', inject: { taskService } })
  .get('/', { query: listTasksQuery, handler: async (ctx) => { ... } })
  .post('/', { body: createTaskBody, handler: async (ctx) => { ... } })
  .get('/:id', { params: taskIdParams, handler: async (ctx) => { ... } })
  .patch('/:id', { params: taskIdParams, body: updateTaskBody, handler: async (ctx) => { ... } })
  .delete('/:id', { params: taskIdParams, handler: async (ctx) => { ... } });
```

This reads like a route table. Each route is self-contained with its validation
schemas and handler.

### What felt great: error handling

Throwing `NotFoundException` or `ConflictException` from a handler or service
automatically produces the right HTTP response:

```json
{
  "error": "NotFoundException",
  "message": "User with id \"abc\" not found",
  "statusCode": 404,
  "code": "NotFoundException"
}
```

Schema validation errors produce 400 with a descriptive message:

```json
{
  "error": "BadRequestException",
  "message": "Missing required property \"name\" at \"name\"",
  "statusCode": 400
}
```

The UUID validation error is particularly nice:

```json
{
  "error": "BadRequestException",
  "message": "Invalid UUID at \"id\"",
  "statusCode": 400
}
```

This is exactly what a developer building an API wants. No need to manually catch
errors and format responses.

### What felt great: CORS out of the box

```typescript
vertz.app({ cors: { origins: true } })
```

One line. OPTIONS returns 204 with the right headers. Actual responses include
`access-control-allow-origin: *`. No middleware needed.

### What felt great: 204 for void handlers

When a handler returns `undefined`, the framework returns 204 No Content. This
is the right default for DELETE or fire-and-forget endpoints.

### What felt great: 405 Method Not Allowed

If you hit `DELETE /api/users` (which only has GET/POST), you get 405 with an
`Allow: GET, POST` header. Most frameworks return 404 for this case, which is
technically incorrect. vertz gets it right.

### Observation: no response validation

The `response` field in `RouteConfig` exists but does not appear to be used at
runtime -- the response is just serialized as JSON without validation. This is
fine for performance (response validation is expensive), but it means the
`response` schema is documentation-only.

**Suggestion:** Document this clearly. Consider an opt-in response validation
mode for development that catches response shape mismatches early.

---

## Running & Testing

### Server startup

`bun run src/index.ts` starts in under 100ms. The startup message lists all
endpoints, which is a nice touch -- though this is from the demo code, not the
framework. The framework itself just starts a Bun server on the given port.

**Suggestion:** Consider adding a startup log to `app.listen()` that lists
registered routes. Many frameworks do this (Fastify, NestJS) and it helps
with debugging route registration issues.

### Testing story

I did not use `@vertz/testing` for this demo since it is focused on showing the
framework APIs rather than testing patterns. However, the `app.handler` property
being directly accessible is excellent for testing:

```typescript
const res = await app.handler(new Request('http://localhost/api/users'));
```

No need to start a real server or use supertest. You can test routes as pure
functions. This is a significant DX advantage.

**Suggestion:** Document this pattern prominently in the testing guide. Also
consider adding a helper that creates a test client:

```typescript
import { createTestClient } from '@vertz/testing';
const client = createTestClient(app);
const res = await client.get('/api/users');
```

---

## Summary: Top Issues

Ranked by impact on developer experience:

1. **Injected service types are erased** -- handlers require manual type casting
   for injected services (`ctx.userService as ...`). This is the biggest DX gap.
   Every handler in every route needs this cast. Fix: make router generic over
   its inject map.

2. **Enum value duplication** between @vertz/db and @vertz/schema -- no way to
   share or derive enum values between the database schema and validation schema.
   Risk of runtime mismatch with no compile-time warning.

3. **@vertz/db driver not yet connected** -- the ORM API is well-designed but
   queries throw at runtime. This means the demo cannot run end-to-end. Not a DX
   issue per se (it's a known roadmap item), but it limits what we can show.

4. **`s.coerce.number()` discoverability** -- no hint when `s.number()` fails on
   a string query param. New developers will hit this on their first endpoint with
   pagination.

5. **Format schemas (email/uuid/url) don't inherit string methods** -- cannot
   call `.trim()` or `.toLowerCase()` on `s.email()`.

## Summary: What Felt Great

1. **Schema validation just works** -- define a schema, put it on a route, get
   automatic 400 errors with precise messages including field paths. Zero
   boilerplate.

2. **Error handling is automatic** -- throw a typed exception from anywhere in the
   handler or service chain, get the right HTTP status code and JSON error body.
   No try/catch wrappers needed.

3. **The module system is clean** -- moduleDef -> service -> router -> module is
   a clear progression. Each step builds on the previous. Ownership validation
   catches wiring mistakes early.

4. **`app.handler` for testing** -- being able to test routes without starting a
   server is a killer feature for DX.

5. **CORS, 405, 204** -- these "boring" HTTP behaviors are handled correctly out
   of the box. Most frameworks get at least one of these wrong.

6. **`d.table()` column builder** -- reads like a database diagram. The chaining
   API is intuitive and the inferred types are correct.

7. **The `s` factory** -- immediately familiar to Zod users. Format shortcuts like
   `s.email()` and `s.uuid()` are a nice upgrade.

8. **Params/body/query type inference** -- schema types flow through to handler
   `ctx`. You get autocomplete on `ctx.params.id` and `ctx.body.email`.

---

## Raw Notes (Chronological)

- First attempt to build db package: `oxc-resolver` native binding error. Fixed by
  `bun install` then retry. Cost me ~5 minutes of confusion.

- Tried to use `vertz.moduleDef({ name: 'users' })` -- works exactly as documented.
  The frozen object prevents accidental mutation. Good.

- The `inject: { userService }` pattern is natural -- destructuring to name the
  service in the context. But the type is lost.

- Schema `s.enum([...] as const)` -- forgot `as const` first time, got a confusing
  type error about `string[]` not assignable to `readonly [string, ...string[]]`.
  Adding `as const` fixed it. The error message does not hint at the solution.

- Query param coercion: initially used `s.number().optional()` for `limit` query
  param. Got `400: Expected number, received string`. Searched the schema source
  to find `s.coerce.number()`. Works, but took a minute to discover.

- `NotFoundException` from handler: confirmed it returns 404 with clean JSON.
  Did not need to catch it or format it. Just throw and the framework handles it.

- The `db.findManyAndCount` returns `{ data, total }` which is exactly what you
  need for paginated list endpoints. No need to run two separate queries.

- `db.findOne` with `include: { assignee: true }` is the right pattern for loading
  relations. The include API mirrors Prisma's, which developers will recognize.

- Confirmed that `app.handler` is a plain `(Request) => Promise<Response>` function.
  This means you can test routes without starting a server. Huge DX win.

- Server boots in <100ms with bun. No compilation step needed. `bun run src/index.ts`
  just works. This is the bun advantage, not specifically vertz, but worth noting
  for the dev experience story.
