# Entity Todo Demo — Implementation Spec

**Goal:** Minimal full-stack demo showing: schema → d.model() → entity() → auto-CRUD → createServer → running API

This proves the entity-first architecture works end-to-end.

## Scope

Create `examples/entity-todo/` — a simple task API using ONLY entity primitives (no modules, no routers, no services).

## Files to Create

### `examples/entity-todo/package.json`
```json
{
  "name": "entity-todo-example",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@vertz/db": "workspace:*",
    "@vertz/server": "workspace:*",
    "@vertz/schema": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "vitest": "^4.0.0"
  }
}
```

### `examples/entity-todo/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### `examples/entity-todo/src/schema.ts`
Define tables and models using @vertz/db:
```typescript
import { d } from '@vertz/db';

// Tables
export const todosTable = d.table('todos', {
  id: d.uuid().primary(),
  title: d.text(),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now'),
  updatedAt: d.timestamp().default('now'),
});

// Models
export const todosModel = d.model(todosTable);
```

### `examples/entity-todo/src/entities.ts`
Define entities using @vertz/server:
```typescript
import { entity } from '@vertz/server';
import { todosModel } from './schema';

export const todos = entity('todos', {
  model: todosModel,
  access: {
    list: true,
    get: true,
    create: true,
    update: true,
    delete: true,
  },
});
```

Note: `access: true` for all ops is effectively the same as omitting access entirely (default is open). We include it for explicitness — "always explicit, no magic".

### `examples/entity-todo/src/index.ts`
Server entry point:
```typescript
import { createServer } from '@vertz/server';
import { todos } from './entities';

const PORT = Number(process.env.PORT) || 3000;

const app = createServer({
  basePath: '/api',
  entities: [todos],
});

app.listen(PORT).then((handle) => {
  console.log(`Entity Todo API running at http://localhost:${handle.port}/api`);
  console.log('');
  console.log('Endpoints (auto-generated from entity):');
  console.log('  GET    /api/todos');
  console.log('  GET    /api/todos/:id');
  console.log('  POST   /api/todos');
  console.log('  PATCH  /api/todos/:id');
  console.log('  DELETE /api/todos/:id');
});
```

### `examples/entity-todo/src/__tests__/api.test.ts`
Integration test that proves the full loop works:
```typescript
import { describe, it, expect } from 'vitest';
import { createServer } from '@vertz/server';
import { todos } from '../entities';

function createTestApp() {
  return createServer({
    basePath: '/api',
    entities: [todos],
  });
}

describe('Entity Todo API', () => {
  it('creates a todo via POST /api/todos', async () => {
    const app = createTestApp();
    const res = await app.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Buy milk', completed: false }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Buy milk');
    expect(body.id).toBeDefined();
  });

  it('lists todos via GET /api/todos', async () => {
    const app = createTestApp();
    // Create one first
    await app.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test todo' }),
    });
    const res = await app.request('/api/todos');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
  });

  it('gets a todo by ID via GET /api/todos/:id', async () => {
    const app = createTestApp();
    const createRes = await app.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Get me' }),
    });
    const created = await createRes.json();
    const res = await app.request(`/api/todos/${created.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Get me');
  });

  it('updates a todo via PATCH /api/todos/:id', async () => {
    const app = createTestApp();
    const createRes = await app.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Update me', completed: false }),
    });
    const created = await createRes.json();
    const res = await app.request(`/api/todos/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completed).toBe(true);
  });

  it('deletes a todo via DELETE /api/todos/:id', async () => {
    const app = createTestApp();
    const createRes = await app.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Delete me' }),
    });
    const created = await createRes.json();
    const res = await app.request(`/api/todos/${created.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 for non-existent todo', async () => {
    const app = createTestApp();
    const res = await app.request('/api/todos/non-existent-id');
    expect(res.status).toBe(404);
  });
});
```

### `examples/entity-todo/README.md`
```markdown
# Entity Todo — vertz Demo

A minimal CRUD API built with vertz's entity-first architecture.

**3 files. Zero boilerplate. Full CRUD.**

## The Code

```
src/
  schema.ts     — define your data (14 lines)
  entities.ts   — define your API (12 lines)
  index.ts      — start the server (15 lines)
```

That's it. No modules, no routers, no services, no controllers.
vertz generates typed CRUD endpoints from your entity definition.

## Run it

\`\`\`bash
bun run dev
\`\`\`

## Endpoints

All auto-generated from `entity('todos', { model: todosModel })`:

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/todos | List all todos |
| GET | /api/todos/:id | Get a todo by ID |
| POST | /api/todos | Create a todo |
| PATCH | /api/todos/:id | Update a todo |
| DELETE | /api/todos/:id | Delete a todo |

## What This Proves

This demo shows the full vertz entity pipeline:

1. **Schema** → `d.table()` defines your data model
2. **Model** → `d.model()` creates a typed model with CRUD schemas
3. **Entity** → `entity()` generates routes, access rules, and hooks
4. **Server** → `createServer({ entities })` wires everything up

Zero configuration. Type-safe end-to-end. One way to build things.
```

## Key Constraints
- Do NOT use modules, routers, or services — entity-only
- Do NOT import from @vertz/core directly — use @vertz/server
- The app.request() API may need to be adapted to match the actual createServer return type — check the integration tests for the correct pattern
- Tests use the in-memory noop adapter (no real DB needed)
- Keep it minimal — this is a demo, not a production app

## Quality Gates
- `bun install` in examples/entity-todo succeeds
- Tests pass via `bun run test` in the example directory
- `bun run ci` (full pipeline) still green
- No TypeScript errors
