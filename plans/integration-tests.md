# Integration Tests Package

## Context

All four Vertz packages (`schema`, `core`, `testing`, `compiler`) are stable. We need a comprehensive end-to-end integration test that exercises all framework primitives together, simulating a real app. This validates the framework works as a whole and runs in CI.

## Package: `packages/integration-tests/`

A `private: true` workspace package. Tests only — no build step, no published artifacts.

### Config files

**`package.json`**: `private: true`, scripts: `test` (vitest run), `typecheck` (tsc --noEmit). devDependencies on `@vertz/core`, `@vertz/schema`, `@vertz/testing` via `workspace:*`.

**`tsconfig.json`**: extends root, includes `src/` (including test files — this package is purely tests). No `outDir`, no `isolatedDeclarations`.

**`vitest.config.ts`**: follows `packages/core/vitest.config.ts` pattern with aliases for `@vertz/schema`, `@vertz/core`, `@vertz/core/internals`, `@vertz/testing` pointing to sibling source files.

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
    │   └── create-app.ts         # Full app assembly helper
    └── __tests__/
        ├── crud.test.ts
        ├── validation.test.ts
        ├── middleware.test.ts
        ├── error-handling.test.ts
        ├── cors.test.ts
        └── multi-module.test.ts
```

## App Design: Users + Todos

### Key design decisions

1. **Factory functions for modules** — each call returns fresh module + services + in-memory store. Ensures test isolation.
2. **`createApp()` for stateful CRUD tests** — its handler caches services, so in-memory state persists across requests within a test. `createTestApp()` re-instantiates services per request, so it can't test create-then-read flows.
3. **`createTestApp()` for single-request tests** — validation, error handling, mocking, response schema checks.
4. **Router-level inject for cross-module DI** — the framework resolves service inject at router level, not service level. Todos router injects `userService` (exported from users module) so handler can access `ctx.userService`.
5. **Handlers validate body explicitly** — the framework only auto-validates `params` schemas. Body/query schemas provide TypeScript types but not runtime validation. Handlers call `schema.parse(ctx.body)` and throw on failure.

### Users module (`users.ts`)

Factory: `createUsersModule()` returns `{ module, userService }`.

In-memory `Map<string, User>` store. Service methods:
- `list()` — all users
- `findById(id)` — throws `NotFoundException` if missing
- `create({ name, email })` — generates UUID, stores, returns user
- `update(id, data)` — throws `NotFoundException` if missing
- `remove(id)` — throws `NotFoundException` if missing

Router (prefix: `/users`, inject: `{ userService }`):
- `GET /` — list, optional `?name=` filter via handler
- `GET /:id` — params schema: `{ id: s.string() }`
- `POST /` — handler validates body with `s.object({ name: s.string().min(1), email: s.email() })`
- `PUT /:id` — params + body validation
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
- `GET /` — list, optional `?userId=` filter
- `GET /:id`
- `POST /` — handler validates body, calls `ctx.userService.findById(userId)` to verify user exists
- `PATCH /:id/complete` — toggle
- `DELETE /:id` — 204

### Auth middleware (`auth.ts`)

`createMiddleware({ name: 'auth', handler })`. Reads `Authorization` header, decodes a simple `Bearer <userId>` token, provides `{ user: { id, role: 'user' } }`. Throws `UnauthorizedException` if missing/invalid.

### App assembly (`create-app.ts`)

Helper: `createIntegrationApp()` that calls factory functions, assembles with `createApp({ basePath: '/api', cors: { origins: true } })`, registers both modules, attaches auth middleware. Returns `{ app, userService, todoService }` for mocking.

## Test cases

### `crud.test.ts` — Full lifecycle (uses `createApp().handler`)

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

Uses `createApp().handler` directly with raw `Request` objects and auth header. Services are cached once so in-memory state persists across requests.

### `validation.test.ts` — Schema rejection (uses `createTestApp()`)

```
describe('Body validation')
  rejects POST /users with missing name
  rejects POST /users with invalid email
  rejects POST /todos with missing title
  accepts valid body

describe('Params validation')
  returns 404 for non-matching param patterns
```

### `middleware.test.ts` — Auth middleware (mixed)

```
describe('Auth middleware')
  provides user context on valid token (createApp + real middleware)
  returns 401 on missing Authorization header (createApp + real middleware)
  returns 401 on invalid token (createApp + real middleware)

describe('Middleware mocking')
  mockMiddleware overrides real middleware (createTestApp)
  per-request mockMiddleware overrides app-level mock (createTestApp)
```

### `error-handling.test.ts` — Error responses (uses `createTestApp()`)

```
describe('HTTP errors')
  returns 404 for unknown path
  returns 404 with structured error body
  returns 405 for wrong method with Allow header

describe('Exception handling')
  returns 401 for UnauthorizedException
  returns 404 for NotFoundException from handler
  returns 500 for unhandled errors
  does not leak error details for non-VertzException
```

### `cors.test.ts` — CORS (uses `createApp().handler` directly)

```
describe('CORS')
  returns 204 for OPTIONS preflight
  includes access-control-allow-origin
  includes access-control-allow-methods
  adds CORS headers to actual responses
```

### `multi-module.test.ts` — Cross-module (uses `createTestApp()` + `createApp()`)

```
describe('Multi-module')
  both module prefixes respond
  cross-module service injection works (todo creation validates user exists)
  creating todo for non-existent user returns 404
  services can be mocked at app level
```

## Implementation order (TDD)

1. Scaffold package (package.json, tsconfig.json, vitest.config.ts) — verify trivial test runs
2. Users module + `crud.test.ts` users section
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
