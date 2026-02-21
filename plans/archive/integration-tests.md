# End-to-End Integration Tests

## Context

All four Vertz packages (`schema`, `core`, `testing`, `compiler`) are stable. We need a true end-to-end test that proves the framework works as a real HTTP server — spin up a server, make real `fetch()` requests, validate responses. No test utilities — this simulates the actual developer experience.

## Prerequisite: Body/Query/Headers Schema Validation

**Gap:** The framework currently only auto-validates `params` schemas in `app-runner.ts`. Body, query, and headers schemas are passed to route config but only used for TypeScript type inference — no runtime validation.

**Fix (separate PR, before this plan):** Extend `RouteEntry` and `buildHandler` in `@vertz/core` to validate body, query, and headers schemas the same way params are validated — call `schema.parse()` before building ctx, throw `BadRequestException` on failure. The same fix must be applied to `@vertz/testing`'s `test-app.ts`.

After this fix, route schemas become runtime contracts, not just type hints:
```typescript
router.post('/', {
  body: s.object({ name: s.string().min(1), email: s.email() }),
  handler: (ctx) => {
    // ctx.body is validated AND typed — no manual parse needed
  },
});
```

---

## Package: `packages/integration-tests/`

A `private: true` workspace package. No build step, no published artifacts. No `@vertz/testing` — this tests the real framework as a developer would use it.

### Config files

**`package.json`**: `private: true`, scripts: `test` (vitest run), `typecheck` (tsc --noEmit). devDependencies on `@vertz/core` and `@vertz/schema` via `workspace:*`.

**`tsconfig.json`**: extends root, includes `src/` (including test files — this package is purely tests). No `outDir`, no `isolatedDeclarations`.

**`vitest.config.ts`**: follows existing package patterns with aliases for `@vertz/schema`, `@vertz/core`, `@vertz/core/internals` pointing to sibling source files.

### File layout

```
packages/integration-tests/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── app/
    │   ├── modules/
    │   │   ├── users.ts          # Users module factory
    │   │   └── todos.ts          # Todos module factory (cross-module DI)
    │   ├── middleware/
    │   │   └── auth.ts           # Auth middleware
    │   └── create-app.ts         # Full app assembly + Bun.serve helper
    └── __tests__/
        ├── crud.test.ts
        ├── validation.test.ts
        ├── middleware.test.ts
        ├── error-handling.test.ts
        ├── cors.test.ts
        └── multi-module.test.ts
```

## How the E2E tests work

Each test file:
1. Calls a factory to build the app (`createApp()` with modules + middleware)
2. Starts a real HTTP server via `Bun.serve({ fetch: app.handler, port: 0 })` (port 0 = OS-assigned random port)
3. Makes real `fetch()` requests to `http://localhost:${server.port}/api/...`
4. Asserts on response status, headers, and JSON body
5. Stops the server in `afterAll` / `afterEach`

No `@vertz/testing`, no `createTestApp()`, no mocks. Just the real framework serving real HTTP.

### Test helper

```typescript
// src/app/create-app.ts
export function startServer(app: AppBuilder) {
  const server = Bun.serve({ fetch: app.handler, port: 0 });
  const baseUrl = `http://localhost:${server.port}`;
  return { server, baseUrl, stop: () => server.stop() };
}
```

## App Design: Users + Todos

### Key design decisions

1. **Factory functions for modules** — each call returns fresh module + services + in-memory store. Ensures test isolation.
2. **Real HTTP server per test suite** — `Bun.serve` with port 0 for random port assignment. Server stopped in `afterAll`.
3. **Router-level inject for cross-module DI** — the framework resolves service inject at router level. Todos router injects `userService` (exported from users module) so handler accesses `ctx.userService`.
4. **Schema validation is automatic** — after the prerequisite fix, body/query/headers schemas are validated by the framework before the handler runs. No manual `parse()` calls in handlers.

### Users module (`users.ts`)

Factory: `createUsersModule()` returns `{ module, userService }`.

In-memory `Map<string, User>` store. Service methods:
- `list()` — all users
- `findById(id)` — throws `NotFoundException` if missing
- `create({ name, email })` — generates UUID, stores, returns user
- `update(id, data)` — throws `NotFoundException` if missing
- `remove(id)` — throws `NotFoundException` if missing

Router (prefix: `/users`, inject: `{ userService }`):
- `GET /` — list, optional `?name=` query filter
- `GET /:id` — params schema: `{ id: s.string() }`
- `POST /` — body schema: `s.object({ name: s.string().min(1), email: s.email() })`
- `PUT /:id` — params + body schemas
- `DELETE /:id` — returns 204

### Todos module (`todos.ts`)

Factory: `createTodosModule(userService)` — takes the users module's exported `userService` def for cross-module inject.

In-memory `Map<string, Todo>` store. Service methods:
- `list(userId?)` — optional filter
- `findById(id)` — throws `NotFoundException`
- `create({ title, userId })` — stores, returns todo
- `toggleComplete(id)` — flips `done` flag
- `remove(id)` — throws `NotFoundException`

Router (prefix: `/todos`, inject: `{ todoService, userService }`):
- `GET /` — list, optional `?userId=` query filter
- `GET /:id`
- `POST /` — body schema validates `{ title, userId }`. Handler calls `ctx.userService.findById(userId)` to verify user exists.
- `PATCH /:id/complete` — toggle
- `DELETE /:id` — 204

### Auth middleware (`auth.ts`)

`createMiddleware({ name: 'auth', handler })`. Reads `Authorization` header, decodes a simple `Bearer <userId>` token, provides `{ user: { id, role: 'user' } }`. Throws `UnauthorizedException` if missing/invalid.

### App assembly (`create-app.ts`)

Helper: `createIntegrationApp()` that calls factory functions, assembles with `createApp({ basePath: '/api', cors: { origins: true } })`, registers both modules, attaches auth middleware. Returns `{ app, handler }`.

`startServer(app)` wraps `Bun.serve({ fetch: app.handler, port: 0 })`, returns `{ server, baseUrl, stop }`.

## Test cases

### `crud.test.ts` — Full CRUD lifecycle

Starts one server in `beforeAll`, stops in `afterAll`. Auth header included on every request.

```
describe('Users CRUD')
  creates a user with POST /api/users
  lists users with GET /api/users
  gets user by ID with GET /api/users/:id
  updates a user with PUT /api/users/:id
  deletes a user with DELETE /api/users/:id
  returns 404 after deleting a user

describe('Todos CRUD')
  creates a todo with POST /api/todos
  lists todos with GET /api/todos
  filters todos by userId with GET /api/todos?userId=...
  toggles todo completion with PATCH /api/todos/:id/complete
  deletes a todo with DELETE /api/todos/:id
```

State persists across requests (in-memory stores live for the server's lifetime).

### `validation.test.ts` — Schema rejection

```
describe('Body validation')
  rejects POST /api/users with missing name (400)
  rejects POST /api/users with invalid email (400)
  rejects POST /api/todos with missing title (400)
  accepts valid body and returns created resource

describe('Params validation')
  validates params schema on GET /api/users/:id

describe('Query validation')
  passes valid query params to handler
```

### `middleware.test.ts` — Auth middleware

```
describe('Auth middleware')
  provides user context when Bearer token is valid
  returns 401 when Authorization header is missing
  returns 401 when token format is invalid
  user data from middleware is accessible in handler
```

### `error-handling.test.ts` — Error responses

```
describe('HTTP errors')
  returns 404 for unknown path
  returns 404 with structured error body { error, message, statusCode }
  returns 405 for wrong method with Allow header

describe('Exception handling')
  returns 404 for NotFoundException thrown by handler
  returns 500 for unhandled errors
  does not leak error details for non-VertzException errors
```

### `cors.test.ts` — CORS headers

```
describe('CORS')
  returns 204 for OPTIONS preflight request
  includes access-control-allow-origin header
  includes access-control-allow-methods header
  adds CORS headers to actual GET/POST responses
```

### `multi-module.test.ts` — Cross-module composition

```
describe('Multi-module')
  both /api/users and /api/todos prefixes respond
  cross-module DI works (todo creation validates user exists via userService)
  creating todo for non-existent user returns 404
  modules are isolated — /api/users routes don't appear under /api/todos
```

## Implementation order (TDD)

0. **Prerequisite**: Fix body/query/headers schema validation in `@vertz/core` (separate PR)
1. Scaffold package (package.json, tsconfig.json, vitest.config.ts) — verify trivial test runs
2. Users module + server helper + `crud.test.ts` users section
3. Todos module + `crud.test.ts` todos section
4. Auth middleware + `middleware.test.ts`
5. `validation.test.ts`
6. `error-handling.test.ts`
7. `cors.test.ts`
8. `multi-module.test.ts`

Quality gates after each green: `bunx biome check --write`, `bun run typecheck`.

## Verification

- `bun test packages/integration-tests/` — all pass
- `bun test` from root — integration-tests included in workspace run
- `bun run typecheck` — no type errors
- `bunx biome check packages/integration-tests/` — no lint issues
- CI (Dagger) picks it up automatically via `bun run --filter '*' test`
