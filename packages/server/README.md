# @vertz/server

> The fastest way to build type-safe APIs with Vertz

The `createServer()` API — everything you need to build production-ready APIs with end-to-end type safety.

## Why @vertz/server?

- **Type safety from DB to API** — Define your schema once, get types everywhere
- **Zero boilerplate** — No decorators, no magic, just plain TypeScript
- **Built-in auth** — Sessions, passwords, RBAC out of the box
- **LLM-friendly** — If it builds, it works. No runtime surprises.

## Quick Start

Create a running server in under 5 minutes:

```bash
bun create vertz-app my-api
cd my-api
bun run dev
```

Or add to an existing project:

```bash
bun add @vertz/server @vertz/schema @vertz/db
```

### Your First API

```typescript
import { createServer, createModule } from '@vertz/server';
import { s } from '@vertz/schema';

// 1. Define validation schema
const userSchema = s.object({
  name: s.string().min(1),
  email: s.string().email(),
});

// 2. Create a module
const usersModule = createModule({
  name: 'users',
  // Services for business logic
  services: {
    // In a real app, this would query your database
    list: () => [
      { id: '1', name: 'Alice', email: 'alice@example.com' },
      { id: '2', name: 'Bob', email: 'bob@example.com' },
    ],
    getById: (id: string) => ({ id, name: 'User', email: 'user@example.com' }),
  },
  // HTTP routes
  routes: (users) => ({
    prefix: '/users',
    get: {
      '/': () => users.list(),
      '/:id': (ctx) => users.getById(ctx.params.id),
    },
    post: {
      '/': {
        body: userSchema,
        handler: (ctx) => ({ created: true, user: ctx.body }),
      },
    },
  }),
});

// 3. Start the server
const server = await createServer(usersModule);
await server.listen(3000);
```

Test it:

```bash
curl http://localhost:3000/users
# [{"id":"1","name":"Alice","email":"alice@example.com"},...]

curl http://localhost:3000/users/1
# {"id":"1","name":"User","email":"user@example.com"}
```

## Adding Routes

Routes are defined in the module using the `routes` option. Each route has access to services via dependency injection.

```typescript
const ordersModule = createModule({
  name: 'orders',
  services: {
    // Inject database service here
    findAll: () => [],
    findById: (id: string) => ({ id, total: 99.99 }),
    create: (data: { userId: string; items: any[] }) => ({
      id: 'new-order-id',
      ...data,
    }),
  },
  routes: (orders) => ({
    prefix: '/orders',
    get: {
      '/': () => orders.findAll(),
      '/:id': (ctx) => orders.findById(ctx.params.id),
    },
    post: {
      '/': {
        body: s.object({
          userId: s.string().uuid(),
          items: s.array(s.object({
            productId: s.string().uuid(),
            quantity: s.number().int().min(1),
          })),
        }),
        handler: (ctx) => orders.create(ctx.body),
      },
    },
  }),
});
```

## Adding Middleware

Middleware runs before your routes and can add context:

```typescript
import { createMiddleware } from '@vertz/server';

// Authentication middleware
const auth = createMiddleware({
  name: 'auth',
  handler: (ctx) => {
    const authHeader = ctx.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return { user: null };
    }
    // Validate token and return user
    return { user: { id: '1', role: 'admin' } };
  },
});

// Apply to a module
const protectedModule = createModule({
  name: 'admin',
  middlewares: [auth], // All routes require auth
  routes: (admin) => ({
    prefix: '/admin',
    get: {
      '/dashboard': (ctx) => ({ 
        // ctx.user is typed based on middleware return
        user: ctx.user,
      }),
    },
  }),
});
```

## Full Auth Setup

```typescript
import { createServer, createModule, createAuth } from '@vertz/server';
import { s } from '@vertz/schema';

// Set up authentication
const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  session: {
    cookie: { name: 'session', httpOnly: true },
  },
  password: {
    hash: async (password) => { /* hash with bcrypt */ },
    verify: async (password, hash) => { /* compare */ },
  },
});

const authModule = createModule({
  name: 'auth',
  services: { auth },
  routes: (a) => ({
    prefix: '/auth',
    post: {
      '/signup': {
        body: s.object({
          email: s.string().email(),
          password: s.string().min(8),
        }),
        handler: async (ctx) => {
          const result = await a.auth.api.signUp({ 
            email: ctx.body.email, 
            password: ctx.body.password 
          });
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          return { user: result.data.user };
        },
      },
      '/signin': {
        body: s.object({
          email: s.string().email(),
          password: s.string(),
        }),
        handler: async (ctx) => {
          const result = await a.auth.api.signIn({ 
            email: ctx.body.email, 
            password: ctx.body.password 
          });
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          return { session: result.data };
        },
      },
    },
  }),
});

// Protected module with access control
const apiModule = createModule({
  name: 'api',
  services: { auth },
  middlewares: [auth.middleware()], // Adds ctx.user to context
  routes: (api) => ({
    prefix: '/api',
    get: {
      '/me': {
        handler: (ctx) => {
          // Auth middleware populates ctx.user if session exists
          if (!ctx.user) {
            throw new Error('Unauthorized');
          }
          return ctx.user;
        },
      },
    },
  }),
});

const server = await createServer(authModule, apiModule);
await server.listen(3000);
```

## Database Integration

Connect to a database with `@vertz/db`:

```typescript
import { createServer, createModule } from '@vertz/server';
import { d } from '@vertz/db';

// Define your schema
const db = d.database({
  users: d.table('users', {
    id: d.uuid().primaryKey(),
    email: d.email().notNull().unique(),
    name: d.text().notNull(),
    createdAt: d.timestamp().notNull().default('now'),
  }),
  posts: d.table('posts', {
    id: d.uuid().primaryKey(),
    title: d.text().notNull(),
    content: d.text(),
    authorId: d.uuid().references('users.id'),
  }),
});

const usersModule = createModule({
  name: 'users',
  services: { db },
  routes: (users) => ({
    prefix: '/users',
    get: {
      '/': async () => {
        // Fully typed query builder
        return users.db.users.findMany();
      },
      '/:id': async (ctx) => {
        return users.db.users.findFirst({
          where: { id: ctx.params.id },
        });
      },
    },
  }),
});

const server = await createServer(usersModule);
await server.listen(3000);
```

## Full-Stack Tutorial

For a complete walkthrough from setup to deployment, see the **[Full-Stack Tutorial](../../docs/tutorials/full-stack.md)**.

Topics covered:
- Project setup
- Database schema and migrations
- Building CRUD APIs
- Adding authentication
- Frontend integration
- Deployment

## API Reference

### `createServer(...modules)`

Creates and starts a Vertz server with one or more modules.

```typescript
const server = await createServer(usersModule, ordersModule, authModule);
await server.listen(3000);
```

**Parameters:**
- `...modules: Module[]` — Modules to register

**Returns:** `Promise<ServerHandle>`

### `createModule(config)`

Creates a module that bundles services, routes, and middleware.

```typescript
const module = createModule({
  name: 'users',
  services: { /* service methods */ },
  routes: (services) => ({ /* route definitions */ }),
  middlewares: [/* middleware */],
});
```

### `createAuth(config)`

Creates an auth instance with session management.

```typescript
const auth = createAuth({
  secret: 'your-secret',
  session: { cookie: { name: 'session', httpOnly: true } },
});
```

### `createMiddleware(config)`

Creates reusable middleware.

```typescript
const logging = createMiddleware({
  name: 'logging',
  handler: (ctx) => {
    console.log(`${ctx.method} ${ctx.path}`);
    return {};
  },
});
```

## Migration from Express

If you're coming from Express, here's the pattern:

| Express | Vertz |
|---------|-------|
| `app.get('/path', handler)` | `routes: { get: { '/path': handler } }` |
| `app.use(middleware)` | `middlewares: [middleware]` |
| `req.params.id` | `ctx.params.id` |
| `req.body` | `ctx.body` |
| `req.query` | `ctx.query` |

## Related Packages

- **[@vertz/schema](./docs/schema.md)** — Schema validation (`s.object()`, `s.string().email()`, etc.)
- **[@vertz/db](./docs/db.md)** — Type-safe database ORM
- **[@vertz/testing](./docs/testing.md)** — Testing utilities
- **[@vertz/ui](./docs/ui.md)** — Reactive UI framework

## License

MIT
