# Full-Stack Tutorial

Build a complete CRUD API with authentication in 15 minutes.

## Prerequisites

- **Bun** 1.0+ (or Node.js 22+)
- **TypeScript** 5.0+

## What We're Building

A blog API with:
- Users (signup, signin)
- Posts (CRUD)
- Authentication via sessions

## Step 1: Create Project

```bash
bun create vertz-app my-blog
cd my-blog
```

This creates a project with `@vertz/server`, `@vertz/db`, and `@vertz/schema` pre-configured.

## Step 2: Define Database Schema

Open `src/db/schema.ts` and define your tables:

```typescript
import { d } from '@vertz/db';

export const db = d.database({
  users: d.table('users', {
    id: d.uuid().primaryKey(),
    email: d.email().notNull().unique(),
    name: d.text().notNull(),
    passwordHash: d.text().notNull(),
    createdAt: d.timestamp().notNull().default('now'),
  }),

  posts: d.table('posts', {
    id: d.uuid().primaryKey(),
    title: d.text().notNull(),
    content: d.text(),
    published: d.boolean().notNull().default(false),
    authorId: d.uuid().references('users.id'),
    createdAt: d.timestamp().notNull().default('now'),
    updatedAt: d.timestamp().notNull().default('now'),
  }),
});
```

## Step 3: Set Up Database Migration

In development, use `migrateDev()` to sync your schema:

```typescript
// src/index.ts
import { migrateDev } from '@vertz/db';
import { db } from './db/schema';

await migrateDev(db);
```

Run it once:

```bash
bun run src/index.ts
```

This creates the tables in your local database.

## Step 4: Create Authentication

Create `src/modules/auth.ts`:

```typescript
import { createAuth, createModule, s } from '@vertz/server';
import { db } from '../db/schema';
import { hashPassword, verifyPassword } from '@vertz/server/auth';

export const auth = createAuth({
  secret: process.env.AUTH_SECRET || 'dev-secret-change-in-prod',
  session: {
    cookie: { name: 'session', httpOnly: true, secure: false },
  },
  password: {
    hash: async (password) => hashPassword(password),
    verify: async (password, hash) => verifyPassword(password, hash),
  },
  user: {
    findByEmail: async (email: string) => db.users.findFirst({ where: { email } }),
    create: async (data: { email: string; passwordHash: string; name: string }) => 
      db.users.create(data),
  },
});

export const authModule = createModule({
  name: 'auth',
  services: { auth },
  routes: (a) => ({
    prefix: '/auth',
    post: {
      '/signup': {
        body: s.object({
          email: s.string().email(),
          password: s.string().min(8),
          name: s.string().min(1),
        }),
        handler: async (ctx) => {
          const { email, password, name } = ctx.body;
          const user = await a.auth.signUp({ email, password, name });
          return { user: { id: user.id, email: user.email, name: user.name } };
        },
      },
      '/signin': {
        body: s.object({
          email: s.string().email(),
          password: s.string(),
        }),
        handler: async (ctx) => {
          const { email, password } = ctx.body;
          const session = await a.auth.signIn({ email, password });
          return { session };
        },
      },
      '/signout': {
        handler: async (ctx) => {
          await a.auth.signOut(ctx);
          return { ok: true };
        },
      },
    },
  }),
});
```

## Step 5: Create Posts Module

Create `src/modules/posts.ts`:

```typescript
import { createModule, s } from '@vertz/server';
import { db } from '../db/schema';

export const postsModule = createModule({
  name: 'posts',
  services: { db },
  routes: (p) => ({
    prefix: '/posts',
    // Public: list all published posts
    get: {
      '/': async () => {
        return p.db.posts.findMany({
          where: { published: true },
          orderBy: { createdAt: 'desc' },
        });
      },
      '/:id': async (ctx) => {
        return p.db.posts.findFirst({ where: { id: ctx.params.id } });
      },
    },
    // Protected: create, update, delete posts
    post: {
      '/': {
        body: s.object({
          title: s.string().min(1),
          content: s.string().optional(),
          published: s.boolean().optional(),
        }),
        middleware: [/* require auth */], // See Step 6
        handler: async (ctx) => {
          const post = await p.db.posts.create({
            ...ctx.body,
            authorId: ctx.user.id, // from auth middleware
          });
          return { post };
        },
      },
    },
    patch: {
      '/:id': {
        body: s.object({
          title: s.string().min(1).optional(),
          content: s.string().optional(),
          published: s.boolean().optional(),
        }),
        handler: async (ctx) => {
          const post = await p.db.posts.update({
            where: { id: ctx.params.id },
            data: ctx.body,
          });
          return { post };
        },
      },
    },
    delete: {
      '/:id': {
        handler: async (ctx) => {
          await p.db.posts.delete({ where: { id: ctx.params.id } });
          return { deleted: true };
        },
      },
    },
  }),
});
```

## Step 6: Wire It All Together

Update `src/index.ts`:

```typescript
import { createServer } from '@vertz/server';
import { migrateDev } from '@vertz/db';
import { db } from './db/schema';
import { authModule } from './modules/auth';
import { postsModule } from './modules/posts';

// Run migrations in development
await migrateDev(db);

// Create and start server
const server = await createServer(authModule, postsModule);

await server.listen(3000);
console.log('Server running on http://localhost:3000');
```

## Step 7: Run and Test

Start the server:

```bash
bun run dev
```

### Test Signup

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123","name":"Alice"}'
```

Response:
```json
{
  "user": {
    "id": "...",
    "email": "alice@example.com",
    "name": "Alice"
  },
  "session": {
    "id": "...",
    "userId": "..."
  }
}
```

The session cookie is automatically set.

### Test Create Post (authenticated)

```bash
curl -X POST http://localhost:3000/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello World","content":"My first post","published":true}'
```

### Test List Posts

```bash
curl http://localhost:3000/posts
```

## What's Next?

### Add Role-Based Access Control

```typescript
import { createAccess } from '@vertz/server';

const access = createAccess({
  resources: {
    post: {
      roles: {
        author: ['read', 'create', 'update'],
        editor: ['read', 'create', 'update', 'delete'],
        admin: ['*'],
      },
    },
  },
});

// In routes
patch: {
  '/:id': {
    body: schema,
    access: { resource: 'post', action: 'update' }, // Requires 'update' permission
    handler: async (ctx) => { /* ... */ },
  },
}
```

### Add Frontend

Use `@vertz/ui` for a reactive frontend:

```typescript
// src/ui/App.tsx
import { html } from '@vertz/ui';

export function App() {
  return html`
    <div class="app">
      <h1>My Blog</h1>
      <p>Welcome to my blog!</p>
    </div>
  `;
}
```

See the `@vertz/ui` and `@vertz/ui-server` packages for SSR setup.

### Deployment

Build for production:

```bash
bun run build
```

Start production server:

```bash
bun run ./dist/index.js
```

## Full Example

See `packages/server/examples/full-blog/` for a complete working example.

## Troubleshooting

### "Cannot read property 'id' of undefined"

Make sure the auth middleware is applied to protected routes.

### "Validation failed"

Check that your request body matches the schema exactly. Use `s.string().optional()` for optional fields.

### Database connection errors

Ensure your database URL is set in `DATABASE_URL` env var.

## Learn More

- [API Conventions](../core/API_CONVENTIONS.md)
- [Schema Reference](../schema/README.md)
- [Database Guide](../db/README.md)
- [Testing Guide](../testing/README.md)
