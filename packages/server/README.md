# @vertz/server

Type-safe REST APIs from entity definitions. Define your schema, set access rules, get production-ready CRUD endpoints.

## Installation

```bash
bun add @vertz/server @vertz/db
```

## Quick Start

```typescript
import { d } from '@vertz/db';
import { createServer, entity } from '@vertz/server';

// 1. Define schema
const todosTable = d.table('todos', {
  id: d.uuid().primary(),
  title: d.text(),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

const todosModel = d.model(todosTable);

// 2. Define entity with access control
const todos = entity('todos', {
  model: todosModel,
  access: {
    list: () => true,
    get: () => true,
    create: (ctx) => ctx.authenticated(),
    update: (ctx) => ctx.authenticated(),
    delete: (ctx) => ctx.role('admin'),
  },
});

// 3. Start server — CRUD routes auto-generated
const app = createServer({
  entities: [todos],
});

app.listen(3000);
```

This generates 5 REST endpoints:

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/todos` | List all |
| `GET` | `/api/todos/:id` | Get by ID |
| `POST` | `/api/todos` | Create |
| `PATCH` | `/api/todos/:id` | Update |
| `DELETE` | `/api/todos/:id` | Delete |

## Entities

### Defining Entities

An entity connects a `@vertz/db` model to the server with access control, hooks, and custom actions:

```typescript
import { entity } from '@vertz/server';

const users = entity('users', {
  model: usersModel,
  access: { /* ... */ },
  before: { /* ... */ },
  after: { /* ... */ },
  actions: { /* ... */ },
});
```

### Access Control

Operations without an access rule are **denied by default**. Set `false` to explicitly disable (returns 405), or provide a function:

```typescript
const posts = entity('posts', {
  model: postsModel,
  access: {
    // Public read
    list: () => true,
    get: () => true,

    // Authenticated write
    create: (ctx) => ctx.authenticated(),

    // Owner-only update (row-level access)
    update: (ctx, row) => row.authorId === ctx.userId,

    // Admin-only delete
    delete: (ctx) => ctx.role('admin'),
  },
});
```

### EntityContext

Access rules, hooks, and actions receive an `EntityContext`:

```typescript
interface EntityContext {
  userId: string | null;
  authenticated(): boolean;     // true if userId !== null
  tenant(): boolean;            // true if tenantId !== null
  role(...roles: string[]): boolean;  // check user roles

  entity: EntityOperations;     // typed CRUD on the current entity
  entities: Record<string, EntityOperations>;  // CRUD on any entity
}
```

### Before Hooks

Transform data before it reaches the database:

```typescript
const posts = entity('posts', {
  model: postsModel,
  access: { create: (ctx) => ctx.authenticated() },
  before: {
    create: (data, ctx) => ({
      ...data,
      authorId: ctx.userId,  // inject current user
      slug: slugify(data.title),
    }),
    update: (data, ctx) => ({
      ...data,
      // strip fields users shouldn't control
    }),
  },
});
```

### After Hooks

Run side effects after database writes. After hooks receive already-stripped data (hidden fields removed) and their return value is ignored:

```typescript
const users = entity('users', {
  model: usersModel,
  access: { create: () => true, delete: (ctx) => ctx.role('admin') },
  after: {
    create: async (result, ctx) => {
      await sendWelcomeEmail(result.email);
    },
    update: async (prev, next, ctx) => {
      await logChange(prev, next);
    },
    delete: async (row, ctx) => {
      await cleanupUserData(row.id);
    },
  },
});
```

### Custom Actions

Add business logic beyond CRUD:

```typescript
import { s } from '@vertz/schema';

const orders = entity('orders', {
  model: ordersModel,
  access: {
    list: () => true,
    cancel: (ctx, row) => row.customerId === ctx.userId,
  },
  actions: {
    cancel: {
      input: s.object({ reason: s.string().min(1) }),
      output: s.object({ cancelled: s.boolean() }),
      handler: async (input, ctx, row) => {
        await ctx.entity.update(row.id, { status: 'cancelled' });
        await notifyCustomer(row.customerId, input.reason);
        return { cancelled: true };
      },
    },
  },
});
```

Custom actions create a `POST /api/orders/:id/cancel` endpoint.

### Field Stripping

Column annotations from `@vertz/db` are automatically enforced:

- **`.hidden()`** fields are never sent in API responses
- **`.readOnly()`** fields are stripped from create/update request bodies
- **`.primary()`** fields are automatically read-only

```typescript
const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  passwordHash: d.text().hidden(),   // never in responses
  createdAt: d.timestamp().default('now').readOnly(),  // can't be set by client
});
```

## Server Configuration

```typescript
const app = createServer({
  entities: [users, posts, comments],
  basePath: '/api',           // API prefix (default: '/api')
});
```

## Authentication

```typescript
import { createAuth } from '@vertz/server';

const auth = createAuth({
  session: {
    cookie: { name: 'session', httpOnly: true },
  },
  jwtSecret: process.env.AUTH_SECRET!,
  emailPassword: {
    // password requirements, rate limits
  },
});
```

Auth generates endpoints:

| Method | Path | Operation |
|---|---|---|
| `POST` | `/api/auth/signup` | Create account |
| `POST` | `/api/auth/signin` | Authenticate |
| `POST` | `/api/auth/signout` | Invalidate session |
| `GET` | `/api/auth/session` | Get current session |
| `POST` | `/api/auth/refresh` | Refresh JWT |

Server-side API:

```typescript
const result = await auth.api.signUp({
  email: 'alice@example.com',
  password: 'secure-password',
});

if (result.ok) {
  console.log(result.data); // session
}
```

## Error Handling

Entity routes return consistent error responses:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

| Status | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid request |
| 401 | `UNAUTHORIZED` | Not authenticated |
| 403 | `FORBIDDEN` | Access denied |
| 404 | `NOT_FOUND` | Resource not found |
| 405 | `METHOD_NOT_ALLOWED` | Operation disabled (`access: false`) |
| 409 | `CONFLICT` | Unique/FK constraint violation |
| 422 | `VALIDATION_ERROR` | Schema validation failed |
| 500 | `INTERNAL_ERROR` | Unexpected error |

Validation errors include details:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "path": ["title"], "message": "Required" }
    ]
  }
}
```

## Full Example

```typescript
import { d, createRegistry } from '@vertz/db';
import { createServer, entity } from '@vertz/server';
import { s } from '@vertz/schema';

// Schema
const todosTable = d.table('todos', {
  id: d.uuid().primary(),
  title: d.text(),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

const todosModel = d.model(todosTable);

// Entity
const todos = entity('todos', {
  model: todosModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
});

// Server
const app = createServer({
  entities: [todos],
});

app.listen(3000).then((handle) => {
  console.log(`API running at http://localhost:${handle.port}/api`);
});
```

## License

MIT
