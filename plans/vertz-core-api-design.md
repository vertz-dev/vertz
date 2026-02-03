# Vertz Core API Design Plan

## Overview

Vertz is a TypeScript-first backend framework with functional patterns, type-safe dependency injection, and schema validation. This document defines the core API design decisions.

---

## File Structure

```
src/
├── env.ts
├── app.ts
├── middlewares/
│   ├── request-id.middleware.ts
│   ├── error-handler.middleware.ts
│   └── auth.middleware.ts
└── modules/
    ├── core/
    │   ├── core.module-def.ts
    │   ├── core.module.ts
    │   └── db.service.ts
    ├── user/
    │   ├── user.module-def.ts
    │   ├── user.module.ts
    │   ├── user.service.ts
    │   ├── auth.service.ts
    │   └── user.router.ts
    └── order/
        ├── order.module-def.ts
        ├── order.module.ts
        ├── order.service.ts
        └── order.router.ts
```

---

## Environment Variables

Validated with schema, auto-loads `.env` files.

```tsx
// env.ts
import { vertz } from '@vertz/core';
import { s } from '@vertz/schema';

export const env = vertz.env({
  load: ['.env', '.env.local', `.env.${process.env.NODE_ENV}`],
  schema: s.object({
    NODE_ENV: s.enum(['development', 'staging', 'production']),
    PORT: s.number().default(3000),
    DATABASE_URL: s.string().url(),
    JWT_SECRET: s.string().min(32),
    CORS_ORIGINS: s.string().transform((v) => v.split(',')),
    LOG_LEVEL: s.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
});
```

**Validation on startup:**

```
$ vertz dev

✗ Environment validation failed:

  DATABASE_URL: Required
  JWT_SECRET: Must be at least 32 characters (got 12)
  LOG_LEVEL: Must be one of: debug, info, warn, error (got "verbose")
```

**Usage:** Both standalone import and injectable into modules.

---

## Middlewares

Middlewares use generics to define `Requires` and `Provides` types for typed state composition.
The `handler` returns what it provides — TypeScript enforces the return type matches the `Provides` generic.
There is no `next()` — the framework handles execution order.

```tsx
// middlewares/request-id.middleware.ts
import { vertz } from '@vertz/core';

export const requestIdMiddleware = vertz.middleware<
  {}, // requires nothing
  { requestId: string } // provides
>({
  handler: async (ctx) => {
    return { requestId: crypto.randomUUID() };
  },
});
```

```tsx
// middlewares/auth.middleware.ts
import { vertz } from '@vertz/core';
import { User } from '../types';

export const authMiddleware = vertz.middleware<
  { requestId: string }, // requires
  { user: User } // provides
>({
  handler: async (ctx) => {
    const token = ctx.raw.headers.get('authorization');
    return { user: await verifyToken(token) };
  },
});
```

```tsx
// middlewares/admin.middleware.ts
import { vertz } from '@vertz/core';
import { User } from '../types';

export const adminMiddleware = vertz.middleware<
  { user: User }, // requires
  { isAdmin: boolean } // provides
>({
  handler: async (ctx) => {
    return { isAdmin: ctx.state.user.role === 'admin' };
  },
});
```

**Type errors on wrong ordering:**

```tsx
// ✗ Type error: authMiddleware requires { requestId }
middlewares: [authMiddleware] // Error!

// ✓ Works
middlewares: [requestIdMiddleware, authMiddleware]
```

**State composes through levels:** Global → Router → Route

---

## Module Definition

The "contract" file defining imports, options schema, and factories for services/routers.

```tsx
// user.module-def.ts
import { vertz } from '@vertz/core';
import { s } from '@vertz/schema';
import { env } from '../../env';
import { coreModuleDef } from '../core/core.module-def';
import { dbService } from '../core/db.service';

export const userModuleDef = vertz.moduleDef({
  name: 'user',
  imports: {
    env,
    dbService: coreModuleDef.exports.dbService,
  },
  options: s.object({
    requireEmailVerification: s.boolean().default(false),
    maxLoginAttempts: s.number().default(5),
  }),
});
```

**Validations:**
- `imports` must be from another module's `exports`
- `options` schema validated at app registration time
- Circular dependency detection at startup

---

## Services

Business logic with typed dependency injection via `ctx`.

```tsx
// user.service.ts
import { userModuleDef } from './user.module-def';

export const userService = userModuleDef.service({
  inject: { dbService },
  methods: (ctx) => {
    // Private - not exposed on the service
    const hashPassword = (password: string) => {
      return bcrypt.hash(password, 10);
    };

    const sendWelcomeEmail = async (user: User) => {
      // internal helper
    };

    // Public - returned methods are the service API
    return {
      findById: async (id: string) => {
        const [user] = await ctx.dbService.query<User>(
          'SELECT * FROM users WHERE id = $1',
          [id]
        );
        return user ?? null;
      },
      create: async (data: CreateUserDto) => {
        const hashed = await hashPassword(data.password);
        const user = await ctx.dbService.query<User>(
          'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
          [data.name, data.email, hashed]
        );
        if (ctx.options.requireEmailVerification) {
          await sendWelcomeEmail(user);
        }
        return user;
      },
    };
  },
});
```

Private methods live in the closure — `hashPassword` and `sendWelcomeEmail` are invisible outside.
Only the returned object defines the public service API.

**`ctx` provides (module context):**
- `ctx.options` - typed module options
- `ctx.env` - typed environment variables
- `ctx.dbService` - injected services
- `ctx.[serviceName]` - other injected services

**Validations:**
- Services must be created from the module definition they belong to
- Injected services must be declared in module's `imports`

---

## Routers

HTTP route definitions with schema validation.

```tsx
// user.router.ts
import { s } from '@vertz/schema';
import { userModuleDef } from './user.module-def';
import { userService } from './user.service';
import { authService } from './auth.service';
import { authMiddleware } from '../../middlewares/auth.middleware';

export const userRouter = userModuleDef.router({
  prefix: '/users',
  inject: { userService, authService },
});

// GET /users/:id
userRouter.get('/:id', {
  params: s.object({ id: s.string().uuid() }),
  middlewares: [authMiddleware],
  handler: async (ctx) => {
    return ctx.userService.findById(ctx.params.id);
  },
});

// POST /users
userRouter.post('/', {
  body: s.object({
    name: s.string().min(1).max(100),
    email: s.string().email(),
    password: s.string().min(8),
  }),
  handler: async (ctx) => {
    return ctx.userService.create(ctx.body);
  },
});

// POST /users/login
userRouter.post('/login', {
  body: s.object({
    email: s.string().email(),
    password: s.string(),
  }),
  handler: async (ctx) => {
    return ctx.authService.login(ctx.body.email, ctx.body.password);
  },
});

// POST /users/:id/activate (no body needed)
userRouter.post('/:id/activate', {
  params: s.object({ id: s.string().uuid() }),
  middlewares: [authMiddleware],
  handler: async (ctx) => {
    return ctx.userService.activate(ctx.params.id);
  },
});
```

**Route `ctx` provides (request context):**
- `ctx.params` - typed path parameters
- `ctx.body` - typed request body
- `ctx.query` - typed query parameters
- `ctx.state` - immutable state composed from middleware return values (typed)
- `ctx.raw` - raw request object
- `ctx.userService` - injected services
- `ctx.options` - module options
- `ctx.env` - environment variables

**Schema placement:**
- `params` - path parameters (required if path has `:paramName`)
- `body` - request body (always optional, regardless of HTTP method)
- `query` - query string parameters

---

## Module Assembly

Wires services and routers together.

```tsx
// user.module.ts
import { vertz } from '@vertz/core';
import { userModuleDef } from './user.module-def';
import { userService } from './user.service';
import { authService } from './auth.service';
import { userRouter } from './user.router';

export const userModule = vertz.module(userModuleDef, {
  services: [userService, authService],
  routers: [userRouter],
  exports: [userService, authService],
});
```

**Validations:**
- `exports` must be subset of `services` (cannot export routers)
- `services` must be created from this module's definition
- Warning if orphan service exists (created but not registered)

---

## App Composition

Entry point with builder pattern.

```tsx
// app.ts
import { vertz } from '@vertz/core';
import { env } from './env';
import { requestIdMiddleware } from './middlewares/request-id.middleware';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware';
import { coreModule } from './modules/core/core.module';
import { userModule } from './modules/user/user.module';
import { orderModule } from './modules/order/order.module';

const app = vertz
  .app({
    basePath: '/api',
    version: 'v1',
    cors: {
      origins: env.CORS_ORIGINS,
      credentials: true,
    },
    https: {
      cert: './certs/cert.pem',
      key: './certs/key.pem',
    },
    logging: {
      level: env.LOG_LEVEL,
    },
  })
  .middlewares([requestIdMiddleware, errorHandlerMiddleware])
  .register(coreModule)
  .register(userModule, {
    requireEmailVerification: true,
    maxLoginAttempts: 3,
  })
  .register(orderModule, {
    maxItemsPerOrder: 50,
  });

app.listen(env.PORT);
```

**App config options:**
- `basePath` - base path for all routes
- `version` - API versioning
- `cors` - CORS configuration
- `https` - TLS certificates
- `logging` - log levels and format

---

## Context Immutability

**All of ctx is immutable:**
- `ctx.params`
- `ctx.body`
- `ctx.query`
- `ctx.options`
- `ctx.env`
- `ctx.state` - composed from middleware return values
- `ctx.[serviceName]`

Middlewares do not mutate `ctx.state` directly — they return their contribution and the framework composes the state.

**Enforcement:**
- TypeScript: `DeepReadonly<T>` on ctx types
- Runtime (prod): `Object.freeze()`
- Runtime (dev): Proxy with helpful error messages

```tsx
// ✗ TypeScript error + runtime error
ctx.params.id = 'hacked';
ctx.state.user = someUser;

// ✓ Middleware provides state by returning it
handler: async (ctx) => {
  return { user: await verifyToken(ctx.raw.headers.get('authorization')) };
}
```

---

## Summary

| File | Purpose |
|---|---|
| `env.ts` | Validated environment variables |
| `*.middleware.ts` | State composition, typed requires/provides |
| `*.module-def.ts` | Contract: imports, options schema, service/router factory |
| `*.service.ts` | Business logic, accesses ctx (env, options, injected services) |
| `*.router.ts` | Routes, schema validation, handlers with typed ctx |
| `*.module.ts` | Assembly: wires services + routers |
| `app.ts` | Entry: config, global middlewares, register modules |

---

## Integration Testing

Type-safe, unambiguous, LLM-friendly testing. Global mocks overridable per-test.

```tsx
// user.router.test.ts
import { vertz } from '@vertz/core';
import { userModule } from './user.module';

describe('GET /users/:id', () => {
  const app = vertz.testing.createApp({
    modules: [userModule],
    mocks: {
      dbService: vertz.testing.mockService(dbService, {
        query: async () => [{ id: '123', name: 'John', email: 'john@example.com' }],
      }),
    },
  });

  it('returns user by id', async () => {
    const res = await app.get('/users/:id', {
      params: { id: '123' },
      state: { user: { id: 'auth-user', role: 'admin' } },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: '123',
      name: 'John',
      email: 'john@example.com',
    });
  });

  it('returns 404 when user not found', async () => {
    app.mock(dbService, { query: async () => [] });

    const res = await app.get('/users/:id', {
      params: { id: 'not-found' },
      state: { user: { id: 'auth-user', role: 'admin' } },
    });

    expect(res.status).toBe(404);
  });
});
```

**Principles:**
- `app.get('/users/:id', { params })` — typed, matches router definition
- `params: { id: '123' }` — type error if param doesn't exist in route
- `state: { user }` — type error if middleware hasn't provided it
- `app.mock(dbService, { ... })` — override mock per test
- Global mocks at app level, overridable per-test

---

## Open Items

- [ ] Guards (authentication/authorization patterns)
- [ ] Error handling and exceptions
- [ ] Response types and transformations
- [ ] Testing: auto-mock vs explicit mocks tradeoffs
- [ ] OpenAPI generation
- [ ] WebSocket support
- [ ] Background jobs / queues
