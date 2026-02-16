# Vertz API Conventions

> **Agents: READ THIS before writing ANY code example, doc, or landing page content.**
> This is the canonical reference for how Vertz APIs work. Do NOT guess or hallucinate.

## Core Import

```typescript
import { vertz } from '@vertz/core'
```

`@vertz/server` re-exports from `@vertz/core` and adds server-specific features (domain, auth).

## App Creation

```typescript
const app = vertz
  .app({
    basePath: '/api',
    cors: { origins: true },
  })
  .register(myModule)

app.listen(3000)
```

- `vertz.app(config)` creates the app — NOT `createServer()`
- `.register(module)` adds modules — chainable
- `.listen(port)` starts the server — returns a Promise

## Module System

```typescript
// 1. Define the module
const userDef = vertz.moduleDef({ name: 'users' })

// 2. Define services (business logic)
const userService = userDef.service({
  methods: () => ({
    list: async () => { /* ... */ },
    getById: async (id: string) => { /* ... */ },
    create: async (data: CreateUser) => { /* ... */ },
  }),
})

// 3. Define router (chainable HTTP methods)
const userRouter = userDef
  .router({ prefix: '/users', inject: { userService } })
  .get('/', {
    query: listUsersQuery,
    handler: async (ctx) => {
      return ctx.userService.list({ limit: ctx.query.limit })
    },
  })
  .get('/:id', {
    params: userIdParams,
    handler: async (ctx) => {
      return ctx.userService.getById(ctx.params.id)
    },
  })
  .post('/', {
    body: createUserBody,
    handler: async (ctx) => {
      return ctx.userService.create(ctx.body)
    },
  })

// 4. Wire it together
export const userModule = vertz.module(userDef, {
  services: [userService],
  routers: [userRouter],
  exports: [userService],
})
```

### Key Rules:
- `vertz.moduleDef({ name })` — creates a module definition
- `def.service({ methods })` — defines a service with business logic
- `def.router({ prefix, inject })` — creates a router, returns chainable object
- `.get(path, config)`, `.post(path, config)`, etc. — chainable, returns the router
- **NO callback functions** on router — it's chainable methods
- `vertz.module(def, { services, routers, exports })` — wires everything together
- Handler receives `ctx` with typed `ctx.params`, `ctx.query`, `ctx.body`, `ctx.headers`
- Injected services available on `ctx` (e.g., `ctx.userService`)

## Route Config

```typescript
router.get('/path', {
  params?: schema,      // URL params schema
  query?: schema,       // Query string schema
  body?: schema,        // Request body schema
  response?: schema,    // Response schema
  headers?: schema,     // Required headers schema
  errors?: Record<number, schema>,  // Error response schemas by status code
  middlewares?: [],     // Route-level middleware
  handler: async (ctx) => { /* return response */ },
})
```

## Schema (@vertz/schema)

```typescript
import { s } from '@vertz/schema'

const User = s.object({
  id: s.string().uuid(),
  name: s.string().min(1).max(100),
  email: s.string().email(),
  age: s.number().int().min(0).optional(),
  role: s.enum(['admin', 'user', 'moderator']),
  createdAt: s.date(),
})

// Derive types
type User = s.infer<typeof User>
```

## Domain API (@vertz/server)

```typescript
import { domain } from '@vertz/server'

const UserDomain = domain('User', {
  type: 'persisted',
  table: 'users',
  schema: User,
  expose: {
    list: true,
    get: true,
    create: true,
    update: true,
    delete: true,
  },
  handlers: {
    beforeCreate: async (ctx) => {
      ctx.data.createdAt = new Date()
    },
  },
})
```

### Domain Rules:
- `domain(name, config)` — first arg is string name, second is config
- `type` is required: `'persisted' | 'process' | 'view' | 'session'`
- Unified verbs: `list`, `get`, `create`, `update`, `delete` (NOT findMany/findOne)
- Domain is NOT entity — CTO decided on "domain" naming

## Auth (@vertz/server)

```typescript
import { createAuth, createAccess } from '@vertz/server'

const auth = createAuth({
  jwt: { secret: process.env.AUTH_JWT_SECRET },
  providers: {
    email: { /* email/password config */ },
  },
})

const access = createAccess({
  roles: ['admin', 'user'],
  rules: {
    'admin': { can: ['*'] },
    'user': { can: ['read'] },
  },
})
```

## Errors as Values (Result type)

```typescript
import { ok, err, isOk, isErr } from '@vertz/core'
import type { Result } from '@vertz/core'

function divide(a: number, b: number): Result<number, 'division-by-zero'> {
  if (b === 0) return err('division-by-zero')
  return ok(a / b)
}

const result = divide(10, 2)
if (isOk(result)) {
  console.log(result.value) // 5
}
```

## What Vertz Is

**Vertz is the first TypeScript stack built for LLMs.**

It's not just a framework — it's a complete stack rewritten from scratch:
- Schema validation
- HTTP server & routing  
- Database ORM & codegen
- Authentication & authorization
- Entity/domain system
- CLI tooling

Everything is schema-first, type-safe, and entity-aware. Entities ARE tool definitions — LLMs can understand and interact with your entire app through the same typed API surface.

---

**Last updated:** 2026-02-16
**Source of truth:** This file + `examples/task-api/` for working examples
