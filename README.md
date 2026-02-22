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

### Server

```typescript
import { vertz, s } from '@vertz/server';

const userDef = vertz.moduleDef({ name: 'users' });

const userService = userDef.service({
  methods: () => ({
    list: () => [{ id: '1', name: 'Jane' }],
    getById: (id: string) => ({ id, name: 'Jane' }),
  }),
});

const userRouter = userDef.router({ prefix: '/users', inject: { userService } })
  .get('/', {
    response: s.array(s.object({ id: s.string(), name: s.string() })),
    handler: (ctx) => ctx.userService.list(),
  })
  .get('/:id', {
    params: s.object({ id: s.string() }),
    response: s.object({ id: s.string(), name: s.string() }),
    handler: (ctx) => ctx.userService.getById(ctx.params.id),
  });

const userModule = vertz.module(userDef, {
  services: [userService],
  routers: [userRouter],
  exports: [userService],
});

const app = vertz
  .app({ basePath: '/api' })
  .register(userModule);

app.listen(3000);
```

No decorators. No runtime magic. Types flow from schema to handler to response — and the compiler catches the rest.

### UI

```tsx
import { query, form, css } from '@vertz/ui';

const styles = css({
  card: ['bg:background', 'rounded:lg', 'p:4'],
});

export function TaskList() {
  const tasks = query(() => fetch('/api/tasks').then((r) => r.json()), {
    key: 'tasks',
  });

  return (
    <ul>
      {tasks.data?.map((task) => (
        <li class={styles.classNames.card}>{task.title}</li>
      ))}
    </ul>
  );
}
```

Compiler-driven reactivity — `let` becomes a signal, `const` becomes computed. No hooks, no virtual DOM.

## Why Vertz?

### Designed for how software is actually written now

LLMs write code alongside us. They're fast and capable — but they can't run your code. They can't see that runtime error. They can't know the DI container will fail until you tell them.

Vertz moves those failures to compile time. If the LLM writes code that builds, it works. That's not a slogan — it's an architectural decision baked into every layer.

### One way to do things

Ambiguity is the enemy of LLMs — and of teams. When there are three ways to do something, you'll find all three in your codebase. Vertz has strong opinions. Not because we think we're always right, but because predictability matters more than flexibility.

### Type safety that actually flows

```typescript
// Types flow naturally — no manual wiring
const router = userDef.router({ prefix: '/users', inject: { userService } })
  .post('/', {
    body: s.object({ name: s.string().min(1) }),
    response: s.object({ id: s.string(), name: s.string() }),
    handler: (ctx) => {
      // ctx.body is { name: string } — inferred from schema
      // ctx.userService is fully typed — inferred from inject
      // Return type must match response schema — enforced by compiler
      return { id: '1', name: ctx.body.name };
    },
  });
```

### Production-ready by default

OpenAPI generation isn't a plugin — it's built in. Environment validation isn't an afterthought — it's required. CORS isn't a middleware you install — it's a config option.

```typescript
const env = vertz.env({
  schema: s.object({
    DATABASE_URL: s.string(),
    API_PORT: s.number().default(3000),
    LOG_LEVEL: s.string().default('info'),
  }),
});
// Missing DATABASE_URL? Readable error at startup, not a crash in production.

const app = vertz
  .app({ basePath: '/api', cors: { origins: true } })
  .middlewares([authMiddleware])
  .register(userModule);

app.listen(env.API_PORT);
```

## The Architecture

Vertz follows a four-layer module pattern:

```
moduleDef()  →  Define the contract (name, shape)
service()    →  Implement business logic
router()     →  Define HTTP routes with schemas
module()     →  Assemble services + routers
app()        →  Compose modules into an application
```

Everything is explicit. Dependencies are declared, not discovered. The compiler knows the full dependency graph at build time — no runtime resolution, no missing service surprises.

### Middleware that makes sense

No `next()` callbacks. Middleware returns what it contributes to the context:

```typescript
const auth = vertz.middleware({
  name: 'auth',
  handler: (ctx) => {
    const token = ctx.request.headers.get('authorization');
    if (!token) throw new UnauthorizedException('Missing token');
    return { user: { id: '1', role: 'admin' } };
  },
});

// In your route handler, ctx.user is typed and available
```

### Server-agnostic

`app.listen()` auto-detects your runtime. Need more control? The `app.handler` getter gives you a raw `(request: Request) => Promise<Response>` function:

```typescript
// Auto-detect (Bun, Node, etc.)
app.listen(3000);

// Or use the handler directly for edge runtimes
export default { fetch: app.handler };  // Cloudflare Workers
Deno.serve(app.handler);                // Deno Deploy
```

## The Experiment

Vertz is an experiment in a question: **Can an LLM build a production-ready stack?**

Every design decision is evaluated through one lens: "Does this make the LLM more correct on the first try?" Functions over decorators — because type inference flows through functions. One way to do things — because ambiguity causes wrong guesses. Compile-time over runtime — because LLMs can't run your code.

The answer so far: with strong conventions, explicit over implicit, and compile-time guarantees — yes. The codebase follows strict TDD (every behavior has a test), every feature goes through design docs before implementation, and the LLM writes the tests first.

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

The server handles HTTP requests end-to-end: trie-based routing, schema validation, middleware with typed context, service injection, and structured error responses. The UI uses compiler-driven reactivity — no virtual DOM, no hooks, just signals and JSX. The database layer provides type-safe queries with Result-based error handling.

`app.handler` returns a standard `(Request) => Promise<Response>` function that works with any runtime:

```typescript
app.listen(3000);                           // Auto-detect (Bun, Node)
Deno.serve(app.handler);                    // Deno
export default { fetch: app.handler };      // Cloudflare Workers
```

This is pre-release software. APIs will change. But the architecture and philosophy are stable — and that's the part that matters most right now.

## Quickstart

**New to Vertz?** Get your first API running in under 5 minutes:

```bash
npx create-vertz-app my-api --example
cd my-api
bun install
bun run dev
```

👉 **[Full Quickstart Guide](./QUICKSTART.md)** — step-by-step with examples

## Documentation

Visit **[docs.vertz.dev](https://docs.vertz.dev)** for the full documentation and API reference.

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
