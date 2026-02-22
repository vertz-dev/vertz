# Design: Entity-Todo → Cloudflare Workers Deployment

**Status:** Draft — Awaiting CTO Review
**Author:** mike (VP Engineering)

## Goal

Get the entity-todo example running end-to-end on Cloudflare Workers:
- SSR (streaming) with client hydration
- Entity-driven CRUD (schema → DB → API → SDK → UI)
- SQLite locally, Cloudflare D1 in production
- Auto-generated SDK + OpenAPI
- Local dev via `vertz dev` (Vite under the hood)
- Deploy via `wrangler deploy`

This is our **North Star demo** — proving the full Vertz stack works from database to browser on the edge.

## Architecture Vision: Entities → Domains

### The Shift

We're dropping the module system. Entities already do what modules were supposed to do — they group routes, schemas, access rules, and dependency injection naturally. Modules were redundant.

**Old model (deprecated):**
```
App → Modules → (Services + Routers + Schemas + DI)
```

**New model:**
```
App → Domains → Entities
```

- **Entity** = schema + routes + access + DI (one cohesive unit)
- **Domain** = group of related entities = deployable microservice boundary
- Framework handles microservice splitting at deploy time

**Example:**
```
Identity Domain → [User, Auth, Session]     → deploys as Worker A
Commerce Domain → [Product, Order, Cart]    → deploys as Worker B
```

Developer writes one monolith-shaped app. Vertz splits it into microservices.

### For Entity-Todo (Now)

Single domain, single entity. The simplest case:

```
Todo Domain → [Todo entity] → one Cloudflare Worker
```

Domains are a future feature. For now, entity-todo proves the entity → deployment pipeline works.

## Current State

| Layer | Status | Notes |
|-------|--------|-------|
| Entity definitions | ✅ Working | `entities.ts` defines Todo CRUD |
| DB schema | ✅ Defined | `schema.ts` with todos table |
| DB adapter | ❌ Noop | No real database connected |
| Server | ✅ Working | `createServer({ entities })` generates routes |
| SDK codegen | ✅ Working | Generated client + entity SDKs |
| OpenAPI | ✅ Generated | `.vertz/generated/openapi.json` |
| UI components | ✅ Working | Todo list, form, item with Result handling |
| SSR | ❌ Not wired | `@vertz/ui-server` exists but not integrated |
| Cloudflare adapter | ❌ Missing | No `worker.ts` or `wrangler.toml` |
| Static assets | ❌ Missing | Need Cloudflare Workers static assets |

## Implementation Phases

### Phase 1: SQLite Database Adapter

**Goal:** Replace noop adapter with real SQLite persistence.

**What:**
- Wire `@vertz/db` to `better-sqlite3` for local development
- Verify D1 compatibility (same SQLite dialect)
- Connect entity-todo to a real database
- Migrations: create todos table from schema definition

**Key decisions:**
- Use `better-sqlite3` locally (fast, matches D1 dialect exactly)
- D1 adapter for production (Cloudflare's managed SQLite)
- Schema-driven migrations from `@vertz/db`

**Files to create/modify:**
- `packages/db/src/adapters/sqlite.ts` (if not exists)
- `examples/entity-todo/src/db.ts` — database config
- `examples/entity-todo/src/server.ts` — wire real DB into createServer

**Acceptance criteria:**
- [ ] Create a todo → persisted in SQLite file
- [ ] List todos → reads from SQLite
- [ ] Update/delete → reflected in SQLite
- [ ] Server restart → data persists

**Estimate:** 4-6 hours

---

### Phase 2: Cloudflare Worker Entry + D1

**Goal:** Entity-todo runs on Cloudflare Workers with D1.

**What:**
- Create `worker.ts` entry point using `@vertz/cloudflare`
- Create `wrangler.toml` with D1 database binding
- Bridge `createServer()` output to `createHandler()`
- D1 adapter for production database

**Architecture:**
```ts
// worker.ts
import { createHandler } from '@vertz/cloudflare';
import { createServer } from '@vertz/server';
import { todos } from './entities';
import { createD1Adapter } from '@vertz/db';

export default {
  async fetch(request: Request, env: Env) {
    const app = createServer({
      entities: [todos],
      db: createD1Adapter(env.DB),
    });
    return createHandler(app)(request);
  },
};
```

```toml
# wrangler.toml
name = "vertz-entity-todo"
main = "src/worker.ts"
compatibility_date = "2026-02-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "entity-todo-db"
database_id = "local"
```

**Acceptance criteria:**
- [ ] `wrangler dev` starts the worker locally
- [ ] CRUD operations work against local D1
- [ ] `wrangler deploy` pushes to Cloudflare
- [ ] Production URL serves API responses

**Estimate:** 4-6 hours

---

### Phase 3: SSR + Client Hydration

**Goal:** Server-side rendered HTML with client-side hydration.

**What:**
- Add SSR route handler using `renderToStream()` from `@vertz/ui-server`
- Catch-all route: API requests (`/api/*`) go to entity routes, everything else to SSR
- Client bundle for hydration
- Static assets via Cloudflare Workers static assets (native)

**Architecture:**
```
Request → Worker
  ├─ /api/* → Entity CRUD handlers → JSON response
  └─ /* → renderToStream(App) → HTML response
              └─ <script src="/assets/client.js"> → hydration
```

**Key decisions:**
- Use Cloudflare Workers native static assets for JS/CSS bundles
- `renderToStream()` for streaming SSR (better TTFB)
- Vite builds the client bundle at deploy time
- Route-based code splitting (future optimization)

**Files to create/modify:**
- `examples/entity-todo/src/worker.ts` — add SSR catch-all
- `examples/entity-todo/src/entry-client.ts` — client hydration entry
- `examples/entity-todo/src/entry-server.ts` — SSR render function
- `wrangler.toml` — static assets config

**Acceptance criteria:**
- [ ] Page loads with HTML content (view source shows todos)
- [ ] Client hydrates — buttons and forms become interactive
- [ ] Navigation works client-side after hydration
- [ ] CSS loads correctly (no flash of unstyled content)

**Estimate:** 6-8 hours

---

### Phase 4: Local Dev Experience

**Goal:** `vertz dev` runs the full stack locally with HMR.

**What:**
- `vertz dev` uses Vite for UI hot module replacement
- Server restarts on entity/schema changes
- SQLite file for local persistence
- Single command, full stack

**Dev workflow:**
```bash
cd examples/entity-todo
vertz dev
# → http://localhost:3000 (SSR + HMR + API + SQLite)
```

**Acceptance criteria:**
- [ ] `vertz dev` starts everything with one command
- [ ] UI changes hot-reload without page refresh
- [ ] Entity changes trigger server restart
- [ ] Data persists in local SQLite between restarts

**Estimate:** 4-6 hours (depends on existing `vertz dev` capabilities)

---

### Phase 5: E2E Verification + Polish

**Goal:** Full stack works end-to-end, deployed and tested.

**What:**
- Verify OpenAPI spec at `/api/openapi.json`
- Verify generated SDK works against deployed Worker
- Test full CRUD flow in production
- Error handling works (404, validation errors, network errors)
- Performance check (TTFB, hydration time)

**Acceptance criteria:**
- [ ] Create, read, update, delete todos on production URL
- [ ] OpenAPI spec accessible and correct
- [ ] SSR HTML includes todo data
- [ ] Client hydration completes without errors
- [ ] Error states render correctly (validation, not found)
- [ ] matchError with PascalCase keys works in production

**Estimate:** 2-4 hours

---

## Open Questions

1. **`createServer` → `createHandler` bridge:** Does `@vertz/cloudflare`'s `createHandler()` accept the output of `createServer()` today? If not, what adapter is needed?

2. **DB adapter interface:** What does `@vertz/db` expect from an adapter? Is there a defined interface we implement for SQLite/D1, or do we need to design one?

3. **`vertz dev` current state:** How much of the local dev experience already works? Does it support SSR + API + HMR today?

4. **Static assets config:** What does Cloudflare Workers static assets config look like in `wrangler.toml`? (Need to check latest Cloudflare docs)

## Total Estimated Effort

| Phase | Effort | Can Parallelize? |
|-------|--------|-----------------|
| Phase 1: SQLite adapter | 4-6h | Independent |
| Phase 2: Worker + D1 | 4-6h | After Phase 1 |
| Phase 3: SSR + hydration | 6-8h | After Phase 2 |
| Phase 4: Local dev | 4-6h | Partially with Phase 3 |
| Phase 5: E2E verification | 2-4h | After all |
| **Total** | **~3-4 days** | |

## Success Criteria (North Star)

```bash
# Local development
cd examples/entity-todo
vertz dev
# → Full stack running at localhost:3000

# Production deployment
wrangler deploy
# → https://vertz-entity-todo.workers.dev
# → SSR HTML with todos
# → CRUD operations persisted in D1
# → Generated SDK + OpenAPI working
```

**When this works, we've proven Vertz delivers on its promise:** one schema definition flows from database to browser, type-safe, on the edge, with zero seams.

## Future: Domains

After entity-todo proves the single-entity pipeline:

1. **Multi-entity example** — add Users + Auth alongside Todos
2. **Domain grouping** — `createDomain('identity', [User, Auth, Session])`
3. **Auto-splitting** — framework deploys each domain as a separate Worker
4. **Cross-domain communication** — type-safe service-to-service calls
5. **Shared schema** — entities reference each other across domains

This is the path from "todo app" to "production platform."
