<p align="center">
  <a href="https://github.com/vertz-dev/vertz">
    <img src="https://avatars.githubusercontent.com/u/254937586?s=200" alt="Vertz" width="120" />
  </a>
</p>

<h1 align="center">Vertz</h1>

<p align="center">
  <strong>The TypeScript stack for LLMs.</strong><br />
  Built by LLMs, for LLMs. Designed by humans (so far...).

</p>

<p align="center">
  <a href="https://github.com/vertz-dev/vertz/actions/workflows/ci.yml"><img src="https://github.com/vertz-dev/vertz/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://codecov.io/gh/vertz-dev/vertz"><img src="https://codecov.io/gh/vertz-dev/vertz/branch/main/graph/badge.svg" alt="Coverage" /></a>
  <a href="https://github.com/vertz-dev/vertz/blob/main/LICENSE"><img src="https://img.shields.io/github/license/vertz-dev/vertz" alt="License" /></a>
  <a href="https://github.com/vertz-dev/vertz"><img src="https://img.shields.io/github/stars/vertz-dev/vertz?style=social" alt="Stars" /></a>
</p>

---

We watched LLMs get NestJS wrong for months. Decorators in the wrong order. OpenAPI specs that didn't match the types. DTOs that looked right but broke at runtime. Every mistake meant more tokens, more iterations, more "actually, that's not quite right."

So we built Vertz — a TypeScript stack designed so that an LLM can nail it on the first try. Server, database, UI, compiler, CLI — everything you need, one philosophy.

**This entire codebase is written with [Claude Code](https://claude.ai/claude-code).** Not scaffolded by AI and finished by hand — written, tested, and iterated by an LLM from first commit to last. Vertz is both the product and the experiment.

**1. Define your model**

```typescript
import { d } from 'vertz/db';

const todos = d.table('todos', {
  id: d.uuid().primary(),
  title: d.text(),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
});
```

**2. Create the entity — get a full CRUD API**

```typescript
import { entity, createServer } from 'vertz/server';
// d and todos from step 1

const todosEntity = entity('todos', {
  model: d.model(todos),
  access: { list: () => true, get: () => true, create: () => true },
});

createServer({ entities: [todosEntity] }).listen(3000);
// POST /api/todos, GET /api/todos, GET /api/todos/:id — done.
```

**3. Generate a typed SDK**

```bash
bun vertz codegen
```

**4. Use it in the UI — fully typed, no glue code**

```tsx
import { query, form } from 'vertz/ui';
import { api } from './generated/client';

export function TodoApp() {
  const todos = query(() => api.todos.list(), { key: 'todos' });

  const todoForm = form(api.todos.create, {
    onSuccess: () => todos.refetch(),
  });

  return (
    <div>
      <form onSubmit={todoForm.onSubmit}>
        <input name="title" placeholder="What needs to be done?" />
        <button type="submit" disabled={todoForm.submitting}>Add</button>
      </form>
      <ul>
        {todos.data?.map((todo) => (
          <li>{todo.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

Types flow from the database column definition through the server, SDK, and into the UI component — no manual wiring, no type duplication. The compiler catches the rest.

## Quickstart

```bash
npx create-vertz-app my-app --example
cd my-app
bun install
bun run dev
```

Install `vertz` to get all packages via subpath imports (`vertz/server`, `vertz/db`, `vertz/ui`), or install individual `@vertz/*` packages if you prefer.

## Why Vertz?

### Designed for how software is actually written now

LLMs write code alongside us. They're fast and capable — but they can't run your code. They can't see that runtime error. They can't know the DI container will fail until you tell them.

Vertz moves those failures to compile time. If the LLM writes code that builds, it works. That's not a slogan — it's an architectural decision baked into every layer.

### One way to do things

Ambiguity is the enemy of LLMs — and of teams. When there are three ways to do something, you'll find all three in your codebase. Vertz has strong opinions. Not because we think we're always right, but because predictability matters more than flexibility.

### Type safety that actually flows

Define a column as `d.text()` — it's `string` in your entity, `string` in the generated SDK, `string` in the UI form. Change it to `d.integer()` and `tsc` lights up red everywhere that still expects a string — across server, SDK, and UI in a single typecheck. No manual type duplication, no runtime surprises.

### Production-ready by default

OpenAPI generation isn't a plugin — it's built in. Environment validation isn't an afterthought — it's required. CORS isn't a middleware you install — it's a config option.

## The Architecture

```
d.table()        →  Define the schema once
entity()         →  Get a typed CRUD API
createServer()   →  Serve it
vertz codegen    →  Generate a typed SDK
query() / form() →  Use it in the UI
```

Everything is explicit. Dependencies are declared, not discovered. The compiler knows the full dependency graph at build time.

For custom business logic, Vertz also has a module system with services, routers, middleware, and dependency injection — but the entity path gets you from zero to full-stack CRUD in minutes.

### Server-agnostic

`app.listen()` auto-detects your runtime. Need more control? `app.handler` gives you a raw `(request: Request) => Promise<Response>` function:

```typescript
app.listen(3000);                           // Auto-detect (Bun, Node)
export default { fetch: app.handler };      // Cloudflare Workers
Deno.serve(app.handler);                    // Deno Deploy
```

## The Experiment

Vertz is an experiment in a question: **Can an LLM build a production-ready stack?**

Every design decision is evaluated through one lens: "Does this make the LLM more correct on the first try?" Functions over decorators — because type inference flows through functions. One way to do things — because ambiguity causes wrong guesses. Compile-time over runtime — because LLMs can't run your code.

The answer so far: yes — when you have strong conventions, explicit-over-implicit APIs, and compile-time guarantees. The codebase follows strict TDD (every behavior has a test), every feature goes through design docs before implementation, and the LLM writes the tests first.

We're building this in public. Follow the journey:

- [Vision](./VISION.md) — Where we're going and the 8 principles that guide every decision
- [Manifesto](./MANIFESTO.md) — What we believe and why
- [Design docs](./plans/) — How every feature is planned before it's built
- [@viniciusdacal](https://x.com/viniciusdacal) on X/Twitter — Build-in-public updates

## Current Status

Vertz is in active development. Here's where things stand:

| Layer | Package | Description |
|-------|---------|-------------|
| **Server** | `@vertz/server` | App factory, modules, services, routers, middleware, DI, CORS, env validation |
| | `@vertz/core` | Framework primitives shared across packages |
| | `@vertz/schema` | 40+ schema types, runtime validation, type inference, JSON Schema / OpenAPI output |
| | `@vertz/errors` | Result types, domain errors, and mapping utilities |
| | `@vertz/fetch` | Type-safe HTTP client |
| **Database** | `@vertz/db` | Typed queries, migrations, codegen (PostgreSQL, SQLite) |
| **UI** | `@vertz/ui` | Signals, components, JSX runtime, router, forms, queries, scoped CSS |
| | `@vertz/ui-primitives` | Headless UI primitives (Accordion, Dialog, Select, etc.) |
| **Tooling** | `@vertz/compiler` | Static analysis, OpenAPI gen, route tables, app manifests |
| | `@vertz/cli` | Dev server, build, create, and deploy commands |
| | `create-vertz-app` | Project scaffolding |
| | `@vertz/testing` | `createTestApp()` with service/middleware mocking |
| **Deploy** | `@vertz/cloudflare` | Cloudflare Workers adapter |

This is pre-release software. APIs will change. But the architecture and philosophy are stable — and that's the part that matters most right now.

## Contributing

> Vertz requires [Bun](https://bun.sh) for development.

```bash
git clone https://github.com/vertz-dev/vertz.git
cd vertz
bun install
bun test
bun run typecheck
```

The codebase follows strict TDD — every behavior needs a failing test first. Check the [plans/](./plans/) directory to see what's being worked on and what's coming next.

## License

[MIT](./LICENSE)

---

<p align="center">
  <em>Type-safe. LLM-native. The whole stack.</em>
</p>
