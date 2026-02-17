# @vertz/server

The preferred public API for Vertz HTTP servers. Build type-safe backend services with modules, routing, middleware, authentication, and domain-driven patterns.

## Quickstart

```bash
npm install @vertz/server
```

Create a server, add a route, and start listening:

```typescript
import { createServer, ok, err } from '@vertz/server';

// 1. Create the server
const app = createServer({
  name: 'my-api',
});

// 2. Define a module with a route
const helloModule = {
  name: 'hello',
  routers: [
    {
      prefix: '/hello',
      routes: [
        {
          method: 'GET',
          path: '/:name',
          handler: async ({ params }) => {
            return ok({ message: `Hello, ${params.name}!` });
          },
        },
      ],
    },
  ],
};

// 3. Register the module and start
app.register(helloModule);

const handle = await app.listen(3000);
console.log(`Server running at ${handle.url}`);
```

```bash
curl http://localhost:3000/hello/World
# {"ok":true,"data":{"message":"Hello, World!"}}
```

## Installation

```bash
npm install @vertz/server
```

Requires Node.js 22+.

## Quick Start

### Modules

Modules organize your application logic. Each module defines routers and can inject dependencies:

```typescript
import { createModule, createServer, ok } from '@vertz/server';

const userModule = createModule({
  name: 'users',
  routers: [
    {
      prefix: '/api/users',
      routes: [
        {
          method: 'GET',
          path: '/',
          handler: async () => {
            return ok({ users: [] });
          },
        },
      ],
    },
  ],
});

const app = createServer({ name: 'my-app' });
app.register(userModule);
await app.listen(3000);
```

### Services

Services are injected dependencies available in route handlers via `ctx.deps`:

```typescript
import { createModule, createServer, ok, err } from '@vertz/server';

interface DbService {
  findUser(id: string): Promise<{ id: string; email: string } | null>;
}

const userModule = createModule({
  name: 'users',
  routers: [
    {
      prefix: '/api/users',
      routes: [
        {
          method: 'GET',
          path: '/:id',
          handler: async ({ params, deps }) => {
            const db = deps.db as DbService;
            const user = await db.findUser(params.id);
            if (!user) {
              return err({ code: 'NOT_FOUND', message: 'User not found' });
            }
            return ok(user);
          },
        },
      ],
    },
  ],
  services: {
    db: {
      async create() {
        // Return your database instance
        return { findUser: async () => null };
      },
    },
  },
});
```

### Middleware

Add middleware for cross-cutting concerns like logging, auth, and CORS:

```typescript
import { createServer, createMiddleware, ok } from '@vertz/server';

const logging = createMiddleware({
  name: 'logging',
  handler: async (ctx, next) => {
    const start = Date.now();
    await next();
    console.log(`${ctx.request.method} ${ctx.request.path} - ${Date.now() - start}ms`);
  },
});

const app = createServer({ name: 'my-app' });
app.middlewares([logging]);

// Add routes...
```

### Authentication

Built-in auth module with email/password and JWT sessions:

```typescript
import { createServer, createAuth, ok } from '@vertz/server';

const auth = createAuth({
  session: {
    ttl: '7d',
    secret: process.env.AUTH_JWT_SECRET!,
    cookie: {
      name: 'session',
      secure: true,
    },
  },
  emailPassword: {
    password: {
      minLength: 8,
      requireUppercase: true,
      requireNumbers: true,
    },
  },
});

// Use auth.handler in your fetch handler
// auth.api.signUp(), auth.api.signIn(), etc.
```

### Domain (Experimental)

Define data domains with built-in CRUD and access control:

```typescript
import { createServer, domain } from '@vertz/server';
import { users } from '@vertz/db'; // Your database table

const app = createServer({
  name: 'my-app',
  domains: [
    domain({
      type: 'persisted',
      table: users,
      access: {
        read: (row, ctx) => ctx.user?.role === 'admin',
      },
    }),
  ],
});
```

## API Reference

### Server Creation

#### `createServer(config): AppBuilder`

Creates an HTTP server with the given configuration.

```typescript
import { createServer } from '@vertz/server';

const app = createServer({
  name: 'my-api',
  port: 3000,
  basePath: '/api',
  cors: {
    origin: ['https://myapp.com'],
    credentials: true,
  },
});
```

**Parameters:**
- `config.name` (string) — Application name for logging
- `config.port` (number, optional) — Default: 3000
- `config.basePath` (string, optional) — Base path for all routes
- `config.cors` (CorsConfig, optional) — CORS configuration

### AppBuilder

#### `app.register(module, options?): AppBuilder`

Registers a module with the server.

```typescript
app.register(userModule);
```

#### `app.middlewares(list): AppBuilder`

Applies global middleware to all routes.

```typescript
app.middlewares([authMiddleware, loggingMiddleware]);
```

#### `app.listen(port, options?): Promise<ServerHandle>`

Starts the HTTP server.

```typescript
const handle = await app.listen(3000, {
  logRoutes: true,
});
console.log(`Running at ${handle.url}`);
```

#### `app.handler: (request: Request) => Promise<Response>`

The request handler function. Use with custom servers:

```typescript
// Cloudflare Workers, Bun.serve, etc.
Bun.serve({
  port: 3000,
  fetch: app.handler,
});
```

### Modules

#### `createModule(config): NamedModule`

Creates a module with routers and services.

```typescript
import { createModule } from '@vertz/server';

const myModule = createModule({
  name: 'my-module',
  routers: [
    {
      prefix: '/items',
      routes: [
        {
          method: 'GET',
          path: '/',
          handler: async ({ query }) => {
            return ok({ items: [] });
          },
        },
      ],
    },
  ],
  services: {
    db: {
      async create() {
        return { /* db instance */ };
      },
    },
  },
});
```

#### `createModuleDef(config): ModuleDef`

Creates a module definition for type-safe dependency injection.

```typescript
import { createModuleDef } from '@vertz/server';

const userModuleDef = createModuleDef<{
  deps: { db: DbService };
}>({
  name: 'users',
  // ...
});
```

### Middleware

#### `createMiddleware(config): NamedMiddlewareDef`

Creates a middleware function.

```typescript
import { createMiddleware } from '@vertz/server';

const timing = createMiddleware({
  name: 'timing',
  handler: async (ctx, next) => {
    const start = Date.now();
    await next();
    ctx.response.headers.set('X-Response-Time', `${Date.now() - start}ms`);
  },
});
```

### Authentication

#### `createAuth(config): AuthInstance`

Creates an auth instance with email/password and JWT sessions.

```typescript
import { createAuth } from '@vertz/server';

const auth = createAuth({
  session: {
    ttl: '7d',
    secret: process.env.JWT_SECRET!,
  },
  emailPassword: {
    password: {
      minLength: 8,
    },
  },
});

// Use the auth API
const result = await auth.api.signUp({
  email: 'user@example.com',
  password: 'SecurePass123',
});
```

**Auth API Methods:**
- `auth.api.signUp(data)` — Register a new user
- `auth.api.signIn(data)` — Authenticate a user
- `auth.api.signOut(ctx)` — End a session
- `auth.api.getSession(headers)` — Get current session
- `auth.api.refreshSession(ctx)` — Refresh session token
- `auth.handler` — HTTP handler for `/api/auth/*` routes
- `auth.middleware()` — Express-style middleware to populate `ctx.user`

#### `hashPassword(password): Promise<string>`

Hash a password using bcrypt.

```typescript
const hash = await hashPassword('my-password');
```

#### `verifyPassword(password, hash): Promise<boolean>`

Verify a password against a hash.

```typescript
const valid = await verifyPassword('my-password', hash);
```

#### `validatePassword(password, requirements?): AuthError | null`

Validate password requirements.

```typescript
const error = validatePassword('weak', { minLength: 8 });
if (error) {
  console.log(error.message); // "Password must be at least 8 characters"
}
```

#### `createAccess(config): AccessInstance`

Creates an access control instance for entitlement-based authorization.

```typescript
import { createAccess } from '@vertz/server';

const access = createAccess({
  entitlements: {
    admin: {
      resources: {
        '*': { '*': true },
      },
    },
    user: {
      resources: {
        'documents': { read: true, create: true },
      },
    },
  },
});

const can = access.can(ctx.user, 'documents', 'read');
```

### Domain

#### `domain(config): DomainDefinition`

Creates a domain definition for CRUD + access control.

```typescript
import { domain } from '@vertz/server';

const userDomain = domain({
  type: 'persisted',
  table: usersTable,
  access: {
    read: (row, ctx) => ctx.user?.role === 'admin',
    create: (row, ctx) => ctx.user !== null,
  },
});
```

### Exceptions

All HTTP exceptions extend `VertzException`:

```typescript
import { 
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  ValidationException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@vertz/server';

throw new NotFoundException('User not found');
```

### Result Type

The `ok` and `err` helpers implement errors-as-values:

```typescript
import { ok, err, isOk, isErr } from '@vertz/server';

const result = await findUser(id);

if (isOk(result)) {
  console.log(result.data); // typed as User
}

if (isErr(result)) {
  console.log(result.error.code); // typed as Error
}
```

Or use discriminated union:

```typescript
const result = await findUser(id);
if (result.ok) {
  return ok({ user: result.data });
}
return err({ code: 'NOT_FOUND', message: 'User not found' });
```

### Environment

#### `createEnv(schema): EnvConfig`

Validate environment variables at runtime.

```typescript
import { createEnv } from '@vertz/server';

const env = createEnv({
  DATABASE_URL: String,
  PORT: Number,
});

console.log(env.DATABASE_URL);
```

### Immutability Helpers

```typescript
import { createImmutableProxy, deepFreeze, makeImmutable } from '@vertz/server';

// Make an object immutable
const frozen = makeImmutable({ nested: { value: 1 } });
// frozen.nested.value = 2; // TypeScript error + runtime throw

// Create a proxy that enforces immutability
const proxy = createImmutableProxy(obj);
```

### Namespace

#### `vertz`

A namespace with version info and utilities:

```typescript
import { vertz } from '@vertz/server';

console.log(vertz.version); // '0.2.0'
```

## What You Don't Need to Know

- **Internal compiler transforms** — @vertz/server doesn't use code generation. It's pure TypeScript.
- **Build pipeline details** — The package works with any bundler (Vite, Bun, esbuild).
- **Database internals** — Use `@vertz/db` for database access; @vertz/server just expects a compatible table interface.
- **Worker threads** — Handled automatically if needed.

## License

MIT
