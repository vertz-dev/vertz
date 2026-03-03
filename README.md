<p align="center">
  <a href="https://github.com/vertz-dev/vertz">
    <img src="https://avatars.githubusercontent.com/u/254937586?s=200" alt="Vertz" width="120" />
  </a>
</p>

<h1 align="center">Vertz</h1>

<p align="center">
  <strong>If it builds, it works.</strong><br />
  The TypeScript stack where types flow from database to browser — and LLMs get it right on the first try.
</p>

<p align="center">
  <a href="https://github.com/vertz-dev/vertz/actions/workflows/ci.yml"><img src="https://github.com/vertz-dev/vertz/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://codecov.io/gh/vertz-dev/vertz"><img src="https://codecov.io/gh/vertz-dev/vertz/branch/main/graph/badge.svg" alt="Coverage" /></a>
  <a href="https://github.com/vertz-dev/vertz/blob/main/LICENSE"><img src="https://img.shields.io/github/license/vertz-dev/vertz" alt="License" /></a>
  <a href="https://github.com/vertz-dev/vertz"><img src="https://img.shields.io/github/stars/vertz-dev/vertz?style=social" alt="Stars" /></a>
</p>

---

Define your schema. Get a typed API, a typed SDK, and a typed UI — no glue code, no type duplication, no runtime surprises.

```
d.table()  →  entity()  →  createServer()  →  vertz codegen  →  query() / form()
 schema        CRUD API       serve it          typed SDK          use it in UI
```

## See It in Action

**1. Define the schema** — `src/api/schema.ts`

Table and model live together. The model is what you pass around — it carries the table's types everywhere.

```typescript
import { d } from '@vertz/db';

export const todosTable = d.table('todos', {
  id: d.uuid().primary({ generate: 'uuid' }),
  title: d.text(),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
});

export const todosModel = d.model(todosTable);
```

**2. Create the entity** — `src/api/entities/todos.ts`

One entity = a full CRUD API. Access control is required, not optional.

```typescript
import { entity } from '@vertz/server';
import { todosModel } from '../schema';

export const todos = entity('todos', {
  model: todosModel,
  access: { list: () => true, get: () => true, create: () => true },
});
```

**3. Wire up the database and serve** — `src/api/server.ts`

```typescript
import { createDb } from '@vertz/db';
import { createServer } from '@vertz/server';
import { todosModel } from './schema';
import { todos } from './entities/todos';

const db = createDb({
  url: process.env.DATABASE_URL!,
  models: { todos: todosModel },
});

createServer({ entities: [todos], db }).listen(3000);
// POST /api/todos, GET /api/todos, GET /api/todos/:id — done.
```

**4. Generate a typed SDK**

```bash
bun vertz codegen
```

**5. Use it in the UI — fully typed, zero glue code**

```tsx
import { query } from '@vertz/ui';
import { api } from './generated/client';

export function TodoApp() {
  const todos = query(api.todos.list());

  return (
    <div>
      <ul>
        {todos.data?.items.map((todo) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

Change `d.text()` to `d.integer()` on a column — `tsc` lights up red in your entity, your server, your SDK, and your UI. Across packages, in a single typecheck. That's the point.

## Try It

```bash
bunx @vertz/create-vertz-app my-app
cd my-app
bun install
bun run dev
```

Or clone the [entity-todo example](./examples/entity-todo) for a full-stack app with SSR, dark mode, and a shadcn-style theme.

## What You Get

| Layer | What | Package |
|-------|------|---------|
| **Schema** | 40+ column types, runtime validation, JSON Schema output | `@vertz/schema` |
| **Database** | Typed queries, migrations, PostgreSQL + SQLite + D1 | `@vertz/db` |
| **Server** | Entity CRUD, actions, access control, CORS, env validation | `@vertz/server` |
| **UI** | Signals, JSX, router, `query()`, `form()`, scoped CSS, SSR | `@vertz/ui` |
| **Primitives** | Headless a11y components — Dialog, Select, Tabs, Menu, etc. | `@vertz/ui-primitives` |
| **Tooling** | Dev server, build, codegen, static analysis | `@vertz/cli` |
| **Deploy** | Cloudflare Workers adapter | `@vertz/cloudflare` |
| **Testing** | `createTestApp()` with service mocking | `@vertz/testing` |
| **HTTP** | Type-safe client with retries, streaming, auth strategies | `@vertz/fetch` |

Install everything with one dependency:

```bash
bun add vertz
```

Then import what you need: `vertz/server`, `vertz/db`, `vertz/ui`, `vertz/schema`, `vertz/testing`.

## Custom Endpoints

Need business logic beyond CRUD? Use `action()`:

```typescript
import { action, createServer } from '@vertz/server';
import { s } from '@vertz/schema';

const reports = action('reports', {
  inject: { todos: todosEntity },
  actions: {
    summary: {
      method: 'GET',
      path: '/reports/summary',
      response: s.object({ total: s.integer(), completed: s.integer() }),
      handler: async (ctx) => {
        const all = await ctx.entities.todos.list({});
        return {
          total: all.items.length,
          completed: all.items.filter((t) => t.completed).length,
        };
      },
    },
  },
});

createServer({ entities: [todosEntity], actions: [reports] }).listen(3000);
```

Entities and actions compose. Types flow. The codegen picks up everything.

## Deploy Anywhere

```typescript
app.listen(3000);                           // Bun, Node
export default { fetch: app.handler };      // Cloudflare Workers
Deno.serve(app.handler);                    // Deno
```

## Why Vertz?

**The problem:** LLMs write code fast — but they can't run it. They can't see the runtime error. They can't know the DI container will fail until you tell them. Every wrong guess costs tokens, time, and patience.

**The fix:** Move failures to compile time. If the types are right, the code works. One way to do things, so the LLM (and your team) never guesses wrong.

This isn't a slogan. It's an architectural decision:

- **Functions over decorators** — types flow through functions. Decorators break inference.
- **One way to do things** — ambiguity is a tax on LLMs and teams alike.
- **Compile-time over runtime** — if `tsc` says it's good, it runs.
- **Explicit over implicit** — dependencies are declared, never discovered.

## Built by LLMs

This entire codebase is written with [Claude Code](https://claude.ai/claude-code). Not scaffolded by AI and finished by hand — written, tested, and iterated by an LLM from first commit to last. Vertz is both the product and the proof that it works.

Strict TDD. Design docs before code. Every behavior has a failing test first. Read the [Manifesto](./MANIFESTO.md) and [Vision](./VISION.md) to understand the philosophy.

## Status

Pre-release. APIs will change. The architecture and philosophy are stable. We're building in public.

- [Vision](./VISION.md) — the 8 principles behind every decision
- [Manifesto](./MANIFESTO.md) — what we believe and why
- [Design docs](./plans/) — how features are planned before they're built
- [@viniciusdacal](https://x.com/viniciusdacal) on X — build-in-public updates

## Contributing

> Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/vertz-dev/vertz.git
cd vertz
bun install
bun test
```

## License

[MIT](./LICENSE)

---

<p align="center">
  <em>Type-safe. LLM-native. The whole stack.</em>
</p>
