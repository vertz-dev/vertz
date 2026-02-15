# Entity-Aware API — Design Document

> **Status:** Draft — brainstorm capture  
> **Authors:** Vinicius (CTO), Mika (VP Eng)  
> **Date:** 2026-02-15  
> **Last updated:** 2026-02-15

> **Decisions (2026-02-15):**
> - Renamed `entity()` → `domain()` — "a Vertz domain is a unit of data, behavior, or both with a typed API surface"
> - Explicit `type` field required: `'persisted' | 'process' | 'view' | 'session'`
> - Unified verb vocabulary: `list`, `get`, `create`, `update`, `delete` (no `findMany`/`findOne`)
> - Persisted domains can have custom `actions` alongside auto-CRUD (e.g., `resetPassword` → `POST /api/users/:id/resetPassword`)
> - `/api/` default route prefix, configurable via `createServer({ apiPrefix: '/v1/' })`
> - No auto-pluralize — domain name used as-is for routes
> - File convention: `*.domain.ts` files, registered via `*.module.ts` using `createModule({ domains: [...] })`
> - Access rules: sync-only in v1
> - Errors-as-values in all public APIs (Result type pattern, not exceptions)
> - Middleware on module level (not domain level) — types flow from module context

## 1. Vision

Vertz controls the entire stack from database to browser. The entity-aware API is the unifying layer that ties it all together: one definition, one type system, flowing from schema → server → client → UI.

**Core conviction:** Developers shouldn't think in "REST vs GraphQL vs RPC." They should think in *entities* and *actions*. The framework handles the rest.

**Design principle:** Everything that can be inferred, should be. Everything that needs customization, should be easy. No YAML. No separate config files. No triple bookkeeping.

---

## 2. The Unified Entity Model

### 2.1 Entity Spectrum

Not every entity maps to a database table. Entities exist on a spectrum:

| Type | Backed by | Example | Auto-CRUD |
|------|-----------|---------|-----------|
| **Persisted** | DB table | User, Post, Order | Yes |
| **Virtual** | Business logic (composes persisted entities) | Onboarding, Checkout | Defined by handlers |
| **View** | Read-only projection / aggregation | Dashboard, Analytics | Read-only |
| **Session** | Ephemeral / cache-backed | AuthSession, Cart | Create/Read/Delete |

All entity types share the same API surface. A client querying an `Onboarding` entity uses the same syntax as querying a `User`. The difference is invisible to the consumer.

### 2.2 Entity Definition

```ts
// Persisted entity — backed by DB table (*.domain.ts file)
const User = domain('users', {
  type: 'persisted',
  table: userEntry,  // d.entry(usersTable, usersRelations)

  // Restrict which columns are exposed via API
  // Uses the same { select } syntax as DB queries — one mental model
  fields: {
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    // passwordHash, internalNotes → never exposed via API
  },

  // Expose relations — same { select, include, true } syntax as DB queries and client requests
  // Only listed relations are queryable. Omitted relations are invisible.
  expose: {
    // Expose entire relation (all its exposed fields)
    posts: true,

    // Expose relation with field restriction
    organization: {
      select: { name: true, logo: true },
      // Client can NEVER see org.billingEmail, org.taxId, etc.
    },

    // auditLogs: not listed → not exposed at all
  },

  access: {
    read: (user, ctx) => ctx.tenant.id === user.organizationId,
    update: (user, ctx) => user.id === ctx.user.id || ctx.user.role === 'admin',
    delete: (_, ctx) => ctx.user.role === 'admin',
  },
  computed: {
    fullName: (user) => `${user.firstName} ${user.lastName}`,
    postCount: count(() => Post, 'authorId'),
  },
  cache: { ttl: '5m', invalidateOn: ['update', 'delete'] },

  // Custom actions alongside auto-CRUD
  actions: {
    resetPassword: async (id, data, ctx) => {
      await ctx.services.auth.resetPassword(id, data.newPassword)
      return { ok: true, data: { success: true } }
    },
    deactivate: async (id, data, ctx) => {
      await ctx.db.users.update({ where: { id }, data: { active: false } })
      return { ok: true, data: { deactivated: true } }
    },
  },
})

// Virtual entity — not a table, composes business logic
const Onboarding = domain('onboarding', {
  type: 'process',
  schema: {
    userId: v.uuid(),
    plan: v.enum(['free', 'pro', 'enterprise']),
    step: v.enum(['profile', 'workspace', 'invite', 'complete']),
  },
  virtual: true,
  handlers: {
    create: async (data, ctx) => {
      // Orchestrate: create user, workspace, send welcome email
      const user = await ctx.entities.user.create({ ... })
      const workspace = await ctx.entities.workspace.create({ ... })
      await ctx.services.email.sendWelcome(user)
      return { userId: user.id, plan: data.plan, step: 'profile' }
    },
    read: async (id, ctx) => {
      // Compute onboarding state from multiple entities
    },
    update: async (id, data, ctx) => {
      // Advance onboarding step
    },
  },
  access: {
    read: (onboarding, ctx) => onboarding.userId === ctx.user.id,
    create: () => true,  // public — signup flow
  },
})
```

### 2.3 Narrowing Hierarchy — One Syntax, Every Layer

The same `{ select, include, true }` syntax is used at every level: DB queries, entity configuration, and client requests. Each layer can only **narrow** what the layer above exposes — never widen.

```
DB table (all columns & relations)
  → entity fields    (select: which columns the API can ever return)
    → entity expose  (which relations are available, with which of their fields)
      → client query (further narrows per request)
        → compiler   (auto-selects only fields the code actually reads)
```

**Type safety flows through every layer:**

```ts
// Entity config — expose is typed from d.entry() relations
// Only valid relation names get autocomplete. Invalid names → compile error.
const User = domain('users', {
  type: 'persisted',
  table: userEntry,
  fields: {
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  },
  expose: {
    posts: true,
    organization: {
      select: { name: true, logo: true },
    },
  },
})

// Client types enforce the narrowing — return types match expose config
const user = await api.user.get(id)
user.name                        // ✅ in fields.select
user.passwordHash                // ❌ compile error — not in fields.select
user.organization.name           // ✅ in expose.organization.select
user.organization.billingEmail   // ❌ compile error — not in expose select

// Client can narrow further but NEVER widen
api.user.get(id, {
  select: { name: true },
  include: { organization: { select: { name: true } } },
})  // ✅ selecting less than exposed

api.user.get(id, {
  include: { organization: { select: { billingEmail: true } } },
})  // ❌ compile error — billingEmail not in expose
```

This unified syntax means developers learn one query shape and use it everywhere — in server-side DB calls, entity definitions, and client-side API requests.

### 2.4 Zero-Boilerplate Default

For persisted domains, if you don't define handlers, Vertz auto-generates:
- `GET /api/users` → list (with VertzQL filtering)
- `GET /api/users/:id` → read
- `POST /api/users` → create
- `PATCH /api/users/:id` → update
- `DELETE /api/users/:id` → delete
- Plus any custom actions: `POST /api/users/:id/{actionName}`

No resolvers. No controllers. No boilerplate. Just define the schema and access rules. Domain name is used as-is for routes (no auto-pluralization). Default prefix `/api/`, configurable via `createServer({ apiPrefix: '/v1/' })`.

---

## 3. VertzQL — Query Language

### 3.1 Philosophy

VertzQL gives REST the precision of GraphQL without the complexity. The endpoints are REST. The query capabilities go beyond.

**Why not just REST?** REST returns full resources. For mobile, edge workers, and bandwidth-constrained clients, you want field selection. For dashboards, you want aggregations. REST alone can't do this without N+1 endpoints.

**Why not GraphQL?** GraphQL requires a separate schema, separate tooling, separate client libraries, and a single POST endpoint that breaks HTTP caching. VertzQL uses standard REST endpoints with enhanced query params.

**Why not tRPC?** tRPC is great for RPC but has no entity awareness — no field selection, no relations, no aggregations. And it's TypeScript-only (no mobile, no third-party consumers).

### 3.2 Query Syntax

```ts
// Client SDK (fully typed)
const user = await client.user.get(userId, {
  select: ['name', 'email'],
  include: {
    posts: {
      select: ['title', 'createdAt'],
      where: { published: true },
      limit: 10,
      orderBy: 'createdAt:desc',
    },
  },
})
// Returns: { name, email, posts: [{ title, createdAt }] }
// Type is inferred — no manual typing needed

// List with filtering
const activeUsers = await client.user.list({
  where: { role: 'editor', createdAt: { $gt: '2026-01-01' } },
  select: ['name', 'email'],
  limit: 50,
  cursor: lastCursor,
})
```

### 3.3 Wire Protocol

On the wire, VertzQL maps to REST with query parameters:

```
GET /entities/user/123?select=name,email&include=posts(select:title,createdAt;where:published=true;limit:10;orderBy:createdAt:desc)
```

Or via POST body for complex queries:

```
POST /entities/user/query
{
  "select": ["name", "email"],
  "where": { "role": "editor" },
  "include": { "posts": { "select": ["title"], "limit": 10 } }
}
```

**Key advantage over GraphQL:** GET requests are cacheable by CDNs and HTTP caches. Simple queries stay in the URL. Complex queries use POST.

### 3.4 Aggregations / Metrics (Semantic Layer)

```ts
// Query computed metrics — same syntax as querying fields
const orgStats = await client.user.aggregate({
  where: { organizationId: orgId },
  metrics: ['count', 'activeCount'],
  groupBy: ['role'],
})
// Returns: [{ role: 'admin', count: 5, activeCount: 4 }, ...]
```

Metrics are defined on the entity, not in a separate YAML file. The entity IS the semantic layer.

---

## 4. Hooks / Middleware — Business Logic Layer

### 4.1 The 80/20 Split

- **80% of operations:** Direct DB pass-through. No boilerplate needed.
- **20% of operations:** Need business logic (validation, side effects, orchestration).

Hooks are opt-in. You add them when you need them, not because the framework requires them.

### 4.2 Hook Types

```ts
const Order = domain('order', {
  schema: { ... },
  
  hooks: {
    // Before hooks — transform or validate data, can reject
    beforeCreate: async (data, ctx) => {
      await validateInventory(data.items)
      data.total = calculateTotal(data.items)
      return data
    },
    
    // After hooks — side effects (don't block the response)
    afterCreate: async (order, ctx) => {
      await ctx.services.email.sendOrderConfirmation(order)
      await ctx.services.analytics.track('order_created', order)
    },
    
    // Before read — augment queries (e.g., soft delete filter)
    beforeRead: async (query, ctx) => {
      query.where.deletedAt = null  // auto-filter soft deletes
      return query
    },
    
    // Field-level hooks — transform individual fields
    transformField: {
      email: (email) => email.toLowerCase(),
    },
  },
})
```

### 4.3 Middleware Stack

Middleware is defined at the **module level** (not domain level). Types flow from the module context into domain handlers and access rules:

```ts
// app.module.ts
const appModule = createModule({
  domains: [User, Post, Order, Onboarding],
  middleware: [
    authMiddleware(),     // Extract user from token → ctx.user
    tenantMiddleware(),   // Scope to tenant → ctx.tenant
    rateLimitMiddleware(),// Rate limiting
    auditMiddleware(),    // Log all mutations
  ],
})

const app = createServer({
  modules: [appModule],
  apiPrefix: '/api/',  // default, configurable
})
```

---

## 5. Authentication & Authorization

### 5.1 Design Principle: Zeroth Law

Security is non-negotiable. Auth must be:
1. **Correct by default** — if you forget to define access rules, the entity is private (deny by default)
2. **Fast** — auth checks cannot be the bottleneck
3. **Composable** — rules inherit through entity hierarchies
4. **Auditable** — every access decision can be logged and traced

### 5.2 Row-Level Security as Code

Instead of database-level RLS policies (which are opaque, hard to test, and PostgreSQL-specific), Vertz implements RLS at the application layer:

```ts
const Post = domain('post', {
  schema: { ... },
  
  access: {
    // Per-operation rules
    read: (post, ctx) => {
      if (post.published) return true           // Public posts are readable
      if (post.authorId === ctx.user.id) return true  // Authors see their own
      return false
    },
    create: (_, ctx) => ctx.user.role !== 'viewer',
    update: (post, ctx) => post.authorId === ctx.user.id,
    delete: (post, ctx) => ctx.user.role === 'admin',
  },
})
```

**Deny by default:** If no `access` rules are defined, the entity is inaccessible except to authenticated requests (configurable global default).

### 5.3 Hierarchical Permission Inheritance

Inspired by Blimu's model — permissions flow down resource hierarchies:

```
Organization
  └── Team
       └── Project
            └── Task
```

If a user has access to a Team, they automatically have access to that team's Projects and Tasks:

```ts
const Task = domain('task', {
  schema: { ... },
  tenant: 'organization',  // top-level tenant
  parent: 'project',        // inherits access from project → team → org
  
  access: {
    // Inherits read access from parent chain by default
    // Can override or add restrictions:
    update: (task, ctx) => task.assigneeId === ctx.user.id,
  },
})
```

The tenant graph (already computed by `@vertz/db`) resolves these hierarchies at startup. Access checks walk the graph.

### 5.4 Performance Considerations

**Auth cannot be slow.** Strategies:

1. **Precomputed access sets** — At session start, compute the user's accessible tenant/team/project IDs. Store in memory or fast cache. Row-level checks become set membership lookups (O(1)).
2. **Query-level filtering** — Instead of fetching rows then filtering, inject WHERE clauses into the SQL query. The DB does the filtering, not the app.
3. **Materialized permission tables** — For complex hierarchies, maintain a denormalized `user_permissions` table that's updated on role/membership changes. Reads are a simple JOIN.
4. **Cache permission decisions** — Permission checks for the same (user, resource_type, action) tuple can be cached per-request or with short TTLs.

**Benchmark target:** Auth overhead should be < 1ms per query for pre-computed access, < 5ms for hierarchical resolution.

### 5.5 Session Model

```ts
// Authentication configuration
const auth = createAuth({
  providers: [
    emailPassword(),
    oauth('google'),
    oauth('github'),
  ],
  session: {
    strategy: 'jwt',  // or 'database'
    ttl: '7d',
    refresh: true,
  },
})
```

The session context (`ctx`) is available in every hook, access rule, and handler.

---

## 6. Real-Time — WebSockets & Server-Sent Events

### 6.1 Same Model, Live

Subscribing to entities uses the same query model as reading them:

```ts
// Client — subscribe to entity changes
const unsubscribe = client.post.subscribe({
  where: { organizationId: orgId, published: true },
  select: ['title', 'updatedAt'],
  include: { author: { select: ['name'] } },
}, (event) => {
  // event.type: 'created' | 'updated' | 'deleted'
  // event.data: typed Post with selected fields
})
```

### 6.2 Transport

- **WebSockets** — bidirectional, for interactive apps
- **SSE** — unidirectional, for dashboards and feeds (simpler, works through more proxies)
- Auto-negotiate: client SDK picks the best transport

### 6.3 Auth on Subscriptions

- Permission check on subscribe (can you see these entities?)
- Permission check on every event (access rules might change, entities might move out of your scope)
- Tenant scoping applied to subscription filters

### 6.4 Scaling Real-Time

- Event bus (already shipped in `@vertz/db`) provides mutation notifications
- For multi-instance: Redis pub/sub or NATS for cross-instance event distribution
- For global: edge → origin fanout with regional subscription proxies

---

## 7. Semantic Layer

### 7.1 The Problem with Existing Semantic Layers

Tools like Cube.js, dbt metrics, and LookML require:
- **Separate schema files** (YAML/proprietary DSL) that duplicate your DB schema
- **Separate tooling** — a running Cube server, dbt Cloud, Looker instance
- **Separate mental model** — measures, dimensions, segments vs your application entities

This is triple bookkeeping. Schema in DB. Schema in ORM. Schema in semantic layer.

### 7.2 Vertz's Approach: Entities ARE the Semantic Layer

The entity definition contains everything:
- **Fields** → Dimensions
- **Computed fields** → Derived dimensions
- **Metrics** → Measures
- **Relations** → Join paths
- **Access rules** → Data governance

```ts
const Order = domain('order', {
  schema: {
    customerId: v.uuid(),
    total: v.decimal(),
    status: v.enum(['pending', 'paid', 'shipped', 'delivered']),
    createdAt: v.timestamp(),
  },
  
  computed: {
    // Dimensions
    quarter: (order) => getQuarter(order.createdAt),
    isHighValue: (order) => order.total > 1000,
  },
  
  metrics: {
    // Measures
    count: count(),
    revenue: sum('total'),
    averageOrderValue: avg('total'),
    highValueRate: ratio(
      count({ where: { total: { $gt: 1000 } } }),
      count(),
    ),
  },
  
  // Access rules apply to metrics too
  access: {
    // Only admins/managers can see revenue metrics
    metrics: {
      revenue: (_, ctx) => ctx.user.role in ['admin', 'manager'],
      highValueRate: (_, ctx) => ctx.user.role === 'admin',
    },
  },
})
```

### 7.3 Caching (Cube-Inspired, Zero-Config)

Cube.js's pre-aggregation model is powerful. We can do similar but without the YAML:

```ts
const Order = domain('order', {
  // ...schema...
  
  cache: {
    queries: { ttl: '5m' },         // Cache query results
    metrics: { ttl: '15m' },        // Cache aggregations longer
    invalidateOn: ['create', 'update', 'delete'],
    
    // Pre-aggregations (materialized views)
    preAggregate: {
      dailyRevenue: {
        metrics: ['revenue', 'count'],
        dimensions: ['status'],
        granularity: 'day',
        refreshEvery: '1h',
      },
    },
  },
})
```

The event bus (already in `@vertz/db`) handles cache invalidation. Mutation → event → invalidate affected caches.

---

## 8. RPC Escape Hatch

### 8.1 When Entities Aren't Enough

Some operations don't map to entities:
- Health checks, diagnostics
- Webhook receivers
- One-off computations (calculate shipping, validate address)
- External service integrations

### 8.2 RPC Definition

```ts
const calculateShipping = action('calculateShipping', {
  input: v.object({
    origin: v.string(),
    destination: v.string(),
    weight: v.number(),
  }),
  output: v.object({
    cost: v.decimal(),
    estimatedDays: v.number(),
  }),
  handler: async (input, ctx) => {
    // Business logic
    return { cost: 12.99, estimatedDays: 3 }
  },
  access: (_, ctx) => ctx.user.authenticated,
})
```

### 8.3 Same Client, Same Types

```ts
// Entity query and RPC call — same client, same DX
const user = await client.user.get(userId)
const shipping = await client.actions.calculateShipping({ origin, destination, weight })
// Both fully typed, same error handling, same auth context
```

---

## 9. Type Flow — End to End

```
Entity Definition (TypeScript)
    ↓ compile-time inference
Server Types (handlers, hooks, access rules)
    ↓ code generation (build step)
Client SDK (typed client with autocomplete)
    ↓ framework integration
UI Bindings (reactive, auto-updating components)
```

The client SDK is generated at build time. `vertz build` produces a typed client that knows every entity, every field, every action. No `any`. No runtime type checking. If it compiles, it works.

### 9.1 UI Integration

```tsx
// React/Vertz UI component — auto-typed, auto-reactive
function UserProfile({ userId }: { userId: string }) {
  const user = useEntity('user', userId, {
    select: ['name', 'email', 'avatar'],
    include: { posts: { select: ['title'], limit: 5 } },
  })
  // user is typed: { name: string, email: string, avatar: string, posts: { title: string }[] }
  // Auto-updates on real-time changes if subscriptions are enabled
}
```

---

## 10. Performance & Scaling

### 10.1 Database Strategies

Different workloads need different databases:

| Workload | DB Type | Example |
|----------|---------|---------|
| Transactional CRUD | PostgreSQL | User, Order, Post |
| Analytics / Metrics | Column-store | ClickHouse, BigQuery |
| Graph traversals | Graph DB | Neo4j, DGraph |
| Full-text search | Search engine | Elasticsearch, Meilisearch |
| Real-time / Caching | In-memory | Redis, DragonflyDB |

**Vertz approach:** PostgreSQL is the default (and sufficient for most apps). But the entity layer should be **database-agnostic at the query level** — the same VertzQL query can be routed to different backends based on the entity configuration.

```ts
const Order = domain('order', {
  schema: { ... },
  storage: {
    primary: 'postgres',        // Writes + transactional reads
    analytics: 'clickhouse',    // Aggregation queries route here
    search: 'meilisearch',      // Full-text search routes here
  },
})
```

**v1 scope:** PostgreSQL only. But the abstraction layer should be designed so adding backends is a plugin, not a rewrite.

### 10.2 Multi-Region & Global Distribution

**The latency problem:** Users are global. Databases are not. A user in Tokyo hitting a server in US-East adds 150ms+ of latency per query.

**Strategies to consider:**

1. **Read replicas at the edge** — Write to primary region, read from nearest replica. Eventually consistent but fast. Works for most read-heavy apps.
2. **Edge compute + origin fallback** — Entity reads that hit cache are served from edge. Cache misses fall through to origin. Real-time subscriptions connect to nearest region.
3. **Regional primary (Vitess/CockroachDB model)** — For apps that need multi-region writes. Heavier, more complex, but some apps need it.
4. **Vertz Cloud handles this** — The `vertz publish` experience should abstract region selection. "Deploy to EU + US" as a config option, not an infrastructure project.

```ts
// Future: multi-region config
export default defineConfig({
  regions: ['us-east', 'eu-west', 'ap-northeast'],
  strategy: 'read-replicas',  // or 'multi-primary'
  entities: {
    User: { region: 'primary-only' },      // Sensitive — primary region only
    Post: { region: 'replicated' },         // Read from nearest
    Analytics: { region: 'eu-only' },       // Data residency requirement
  },
})
```

### 10.3 Permission Performance Budget

**Target:** Auth overhead < 1ms per query (precomputed), < 5ms (hierarchical resolution).

Strategies (Section 5.4) ensure auth doesn't become the bottleneck:
- Precomputed access sets at session start
- SQL-level WHERE injection (DB does the filtering)
- Materialized permission tables for complex hierarchies
- Per-request permission caching

---

## 11. Unexplored Opportunities

> These are possibilities that our stack uniquely enables. Not all should be built, but all should be considered.

### 11.1 LLM-Native Entity Layer

Since Vertz entities are fully typed and self-describing, an LLM can:
- **Generate queries** — "Show me all orders over $100 from last month" → VertzQL
- **Generate entities** — Describe your data model in English → entity definitions
- **Auto-generate admin UIs** — Entity schema → CRUD interface (like Django admin, but type-safe)
- **Natural language access control** — "Only managers can see salary data" → access rules

### 11.2 Automatic API Documentation

Entity definitions contain everything needed for docs:
- Schema → field descriptions, types, constraints
- Access rules → who can do what
- Relations → how entities connect
- Metrics → what's queryable

`vertz build` could generate OpenAPI specs, interactive docs (like Swagger), and even tutorial-style docs — all from entity definitions. Zero manual documentation.

### 11.3 Schema Evolution & Migration Intelligence

Since entities define the complete model:
- **Auto-migration generation** — Change entity schema → auto-generate migration
- **Breaking change detection** — Warn when a schema change would break existing clients
- **Zero-downtime migrations** — Entity layer can serve both old and new schema during rollout

### 11.4 Cross-Service Entity Federation

For microservices architectures, entities could span services:

```ts
// Service A defines User
const User = domain('user', { ... })

// Service B references User from Service A
const Order = domain('order', {
  schema: { ... },
  relations: {
    customer: ref.remote('service-a', 'user', 'customerId'),
  },
})
```

VertzQL resolves cross-service joins automatically. Types flow across service boundaries.

### 11.5 Time-Travel Queries

If we track entity history (event sourcing or temporal tables):

```ts
const userYesterday = await client.user.get(userId, {
  at: '2026-02-14T00:00:00Z',  // Point-in-time query
})

const orderHistory = await client.order.history(orderId)
// Returns all versions of the order over time
```

### 11.6 Offline-First / Local-First

The typed entity model could sync to client-side storage:
- Entity definitions generate local DB schemas (SQLite, IndexedDB)
- VertzQL works locally (same API, offline)
- Sync engine resolves conflicts using entity-level merge rules
- Real-time subscriptions reconnect and catch up

This is the Convex/Replicache model, but with the full type safety of Vertz.

### 11.7 Collaborative / Multiplayer

Real-time subscriptions + entity awareness = collaborative features:
- Presence (who's looking at this entity?)
- Optimistic updates with conflict resolution
- CRDT-based fields for concurrent editing

### 11.8 Observability Built-In

Since all data flows through the entity layer:
- Automatic query performance tracking
- Entity access audit logs
- Anomaly detection (unusual query patterns)
- Usage analytics per entity/field (which fields are never queried? → schema cleanup)

### 11.9 Testing as a First-Class Concern

Typed entities enable powerful testing:
- **Fixture generation** — Auto-generate valid test data from entity schemas
- **Access rule testing** — "Can user X read entity Y?" as a unit test
- **Snapshot testing** — Serialize entity state, compare across test runs
- **Seed data** — Entity definitions → seed scripts

### 11.10 Web Workers & Service Workers

Since Vertz controls the full stack, we can leverage browser-level workers in ways other frameworks can't:

- **Service Worker as entity cache** — VertzQL responses cached in the service worker. Offline reads hit the local cache, online reads get served instantly with background revalidation. The entity schema tells the service worker what's cacheable and for how long.
- **Web Workers for heavy computation** — Entity transformations, filtering, sorting on large datasets can be offloaded to web workers. The typed entity model means we can serialize/deserialize efficiently (structured clone, not JSON.stringify).
- **SharedWorker for multi-tab sync** — One WebSocket connection shared across browser tabs. Entity mutations in one tab propagate to all tabs instantly via the SharedWorker.
- **Service Worker as API proxy** — Intercept fetch requests to entity endpoints, batch them (DataLoader pattern in the browser), deduplicate identical concurrent requests, and add optimistic responses.
- **Background sync** — Offline mutations queued in the service worker, synced when connectivity returns. Entity-level conflict resolution rules (defined in schema) handle merge conflicts.
- **Push notifications tied to entity subscriptions** — Subscribe to entity changes server-side → push notification when entity changes while app is closed.
- **Worker-based SSR** — Server-side rendering in a worker thread (already in edge runtime territory), keeping the main thread responsive.

**The opportunity:** Most frameworks treat service workers as an afterthought (add a PWA plugin). We can make them integral — the entity model flows to the browser, into the service worker, with typed caching, sync, and offline-first as a natural extension of the same API.

### 11.11 Automatic Search / Inverted Index

Since every entity field is typed and known at build time:

- **Auto-generate search indexes** — No manual Elasticsearch mapping. The entity schema IS the search mapping. `v.string()` → text field, `v.number()` → numeric range, `v.enum()` → keyword.
- **`entity.search('query')`** — Full-text search across entity fields, with the same access rules applied. No separate search service to configure.
- **Faceted search from entity metadata** — Enum fields auto-become facets. Relations enable cross-entity search ("find posts by users in org X").
- **Built-in or pluggable** — Start with a lightweight inverted index (like MiniSearch or FlexSearch in-process), graduate to Meilisearch/Typesense/Elasticsearch via plugin. The API stays the same.

The opportunity: search is currently a "bolt-on" in every framework. You set up Elasticsearch, write mapping files, sync data with a pipeline, handle consistency. We can make it disappear — the entity model contains everything the search engine needs.

### 11.12 Vertz-Native Database (Long-Term Exploration)

**The radical question:** If we find ourselves limited by composing Postgres + ClickHouse + Elasticsearch + Redis + graph DB, should we build a purpose-built database optimized for Vertz's access patterns?

**Precedent:**
- **Convex** — Built their own DB on FoundationDB. Optimized for reactive queries, transactions, and their function model.
- **Turso** — Built libSQL (SQLite fork) optimized for edge distribution.
- **Supabase** — Wraps Postgres but adds realtime, auth, and storage as integrated layers.
- **FoundationDB** — Apple built a custom DB for their specific consistency/scale needs.

**What a Vertz-native DB would optimize for:**
- **VertzQL as the native query language** — No SQL translation layer. The DB speaks entities natively.
- **Tenant isolation at storage level** — Physical or logical data separation, not just WHERE clauses.
- **Real-time as a primitive** — Subscriptions are a storage-level concept, not WAL tailing.
- **Graph traversals for permissions** — The Org → Team → Project → Task hierarchy is a graph. A graph-aware storage engine resolves permissions without recursive JOINs.
- **Inverted indexes co-located with relational data** — Search and CRUD in the same engine, same transaction.
- **Time-travel / versioning** — Entity history as a first-class storage concept, not an audit table.
- **Column-store for analytics** — Metric queries route to columnar storage automatically based on query shape.

**Build vs buy decision criteria:**
- Start with Postgres (covers 90% of use cases)
- Add plugins for search, analytics, caching as needed
- If we consistently hit the same integration pain across multiple plugins → that's the signal to explore a unified engine
- The entity abstraction layer means we can swap storage without changing user code

**Not v1. Not v2. But the architecture should not prevent this from ever happening.**

### 11.13 Intelligent Global Distribution

Not just "deploy to multiple regions" — **smart, automated distribution**:

- **Traffic analysis** — Vertz Cloud monitors where requests come from. Dashboard shows: "40% of your traffic is from EU, but you're only deployed in US-East. Deploying to EU-West would reduce P95 latency by 120ms."
- **One-click optimization** — User sees the suggestion, clicks "Deploy to EU-West" (or approves a cost increase), done. No Terraform, no Kubernetes, no CloudFormation.
- **Automatic data placement** — Based on traffic patterns and data residency rules, decide where data lives. Hot data near users, cold data in cheapest region.
- **Cost-aware scaling** — "It's $10/month more to serve EU from a local region. Want to enable it?" Clear, simple pricing tied to concrete performance improvements.
- **Progressive rollout** — Don't deploy everywhere on day one. Start single-region, suggest optimizations as traffic grows. The framework guides you.

**The insight:** Cloud providers make multi-region possible but complex. We make it a no-brainer — suggest, price, deploy, done.

### 11.14 Session Time-Travel & Auto-Bug-Fix

**The vision:** A bug is reported → Vertz replays the user session → reproduces the bug → AI writes a test → AI fixes it → deploys in under 30 seconds.

**How this works with our stack:**

1. **Session recording** — Track browser events (clicks, navigation, state changes) tied to entity operations. Not screen recording — structured, typed event logs.
2. **Deterministic replay** — Because entities are typed and state transitions are known, we can replay a session against any version of the code. Time-travel debugging.
3. **Automatic reproduction** — AI agent receives the session log, replays it in a test environment, confirms the bug. No manual reproduction steps.
4. **Auto-fix pipeline:**
   - Session replay identifies the failing state transition
   - Compiler traces which code path handles that transition (we know every usage)
   - AI writes a failing test (TDD — the test fails first)
   - AI writes the fix (the test passes)
   - Deterministic build — only the changed code paths are rebuilt
   - Deploy the delta — not a full rebuild, just the changed modules
5. **Sub-30-second CI/CD** — Because the compiler knows exactly what changed and what depends on it, we can:
   - Skip unaffected tests (dependency-aware test selection)
   - Build only affected modules (already have this with Turborepo)
   - Deploy only the changed bundles (not a full redeploy)
   - With edge functions: deploy is just pushing a new bundle to the CDN

**Why we're uniquely positioned:** We have the compiler that traces every import, every type dependency, every code path. Other frameworks rebuild everything because they can't prove what's safe to skip. We can.

**Debugging use cases:**
- **"Show me what happened"** — Replay any user session, see every entity read/write, every state transition
- **"When did this break?"** — Binary search through deploys using session replay. Time-travel across versions.
- **"Fix this bug"** — AI reproduces from session log → writes test → fixes → deploys. Human reviews the PR or auto-merges if confidence is high.

### 11.15 Compiler-Aware Deploys

Since the Vertz compiler traces every dependency:

- **Surgical deploys** — Change a utility function → compiler knows exactly which endpoints, which entities, which client components are affected → rebuild and deploy only those
- **Guaranteed safety** — If the compiler can prove a change doesn't affect a module, that module isn't rebuilt or redeployed. Not heuristic — proven.
- **Instant rollback** — Previous bundles are still cached at the edge. Rollback = point to previous bundle. Sub-second.
- **A/B testing at the module level** — Serve different versions of specific modules to different users. The type system ensures both versions are compatible with the rest of the app.

### 11.16 Plugin Ecosystem

The entity layer is a natural extension point:
- **Storage plugins** — Add ClickHouse, DynamoDB, etc.
- **Auth plugins** — OAuth providers, SAML, API keys
- **Cache plugins** — Redis, Cloudflare KV, etc.
- **Real-time plugins** — Different transports (WebSocket, SSE, WebTransport)
- **Semantic plugins** — BI tool integrations (Metabase, Grafana)

---

## 12. Honest Comparison with Existing Solutions

> **Note:** This compares frameworks to frameworks and specs to specs. GraphQL is a spec, not a framework — when comparing framework features, we compare to GraphQL + its ecosystem (Apollo, Pothos, Hasura).

### Where Vertz Wins
- **Co-located everything** — Schema, auth, hooks, metrics in one definition. GraphQL fragments this across files. tRPC doesn't have entity awareness.
- **Deny-by-default auth** — No other framework makes entities private by default with co-located access rules.
- **Entity spectrum** — Virtual entities, views, session entities are first-class. Others force everything into DB tables or RPC.
- **Zero-boilerplate CRUD** — Define schema + access rules, get REST endpoints. Similar to Supabase/Hasura but with app-level hooks.
- **Full-stack type flow** — Schema → server → client → UI, all TypeScript, invisible codegen. Prisma + tRPC gets close but requires glue code.

### Where Others Win
- **GraphQL ecosystem** — Decade of tooling (GraphiQL, Apollo DevTools, codegen for every language). VertzQL has none of this yet.
- **GraphQL introspection** — Runtime schema discovery. We need to build `/__schema` to match.
- **Supabase RLS** — Database-level enforcement. Our app-level auth is more flexible but needs DB-level safety net.
- **tRPC simplicity** — No query language, no entity model, just typed functions. For simple APIs, tRPC is less to learn.
- **Stripe DX** — Simple, predictable, incredible error messages, perfect docs. Our bar for developer experience.
- **Convex reactive model** — Purpose-built database for reactive queries. If we go multi-DB, they'll still be faster for their specific use case.

### Honest Trade-offs
- VertzQL adds learning curve over plain REST — justified only if field selection + filtering deliver real value to users
- More opinionated than Express/Fastify — teams that want full control may resist
- Entity model requires buy-in — can't adopt incrementally like tRPC

---

## 13. Design Decisions (Post-Expert Review)

Incorporating feedback from Alex Chen (GraphQL expert) and Sarah Martinez (REST expert). Full reviews: `entity-aware-api-review-graphql.md` and `entity-aware-api-review-rest.md`.

### 13.1 VertzQL Syntax — Resolved

**Decision:** Simple queries use GET with query params. Complex queries use POST body. No tree-encoding in URLs.

```
# Simple — GET with query params
GET /api/users/123?select=name,email

# Complex — POST body
POST /api/users/query
{ "select": ["name", "email"], "where": { "role": "editor" }, "include": { "posts": { "select": ["title"], "limit": 10 } } }
```

**v1 scope:** Field selection (`select`) + simple filtering (`where`) + cursor pagination. No nested includes in v1 — use sub-resource endpoints (`/api/users/:id/posts`) instead. Add includes in v1.1 only if real users demand it.

### 13.2 N+1 Strategy — Resolved

**Decision:** Batched queries (DataLoader pattern) built into the entity layer. Relations ARE the DataLoader.

When resolving `include: { posts }` for 50 users:
1. Collect all user IDs
2. Run ONE query: `SELECT * FROM posts WHERE authorId IN (...)`
3. Distribute results back

Developer never writes a DataLoader. The entity relation definitions contain enough info to generate optimal batched queries. For v1, use batched queries. Optimize to SQL JOINs with lateral joins in v1.1 if benchmarks show benefit.

### 13.3 Cache Invalidation — Resolved

**Decision:** Per-entity invalidation is the sane default. Invalidate on mutation via event bus (already shipped in `@vertz/db`). Per-field caching is premature optimization. HTTP-level caching (CDN) handles per-query caching externally.

### 13.4 Virtual Entity Lifecycle — Resolved

**Decision:** Virtual entities HAVE IDs (synthetic, e.g., `onboarding:{userId}`). They ARE subscribable. Caching is the handler's responsibility since only the handler knows freshness semantics.

### 13.5 Permission Hierarchy Depth — Resolved

**Decision:** Cap at 4 levels. Beyond that, flatten or adopt Zanzibar-style relationship tuples (SpiceDB as reference). Research Zanzibar/SpiceDB for v2 auth scaling.

### 13.6 GraphQL Interop — DECIDED

**Decision:** GraphQL as optional transport, enabled by flag. CTO approved 2026-02-15.

```ts
const server = createServer({
  domains: [User, Post, Order],
  graphql: true,   // Generates GraphQL schema + POST /graphql endpoint
})
```

- Auto-generates GraphQL schema from entity definitions (trivial — we have all the type info)
- Enables GraphiQL explorer in dev mode
- Same access rules apply — GraphQL queries go through the same entity layer
- Not a priority for v1 — but the entity model should be designed so this is always possible
- Implementation: likely a `@vertz/graphql` plugin package

### 13.7 Offline Sync — Resolved

**Decision:** Last-write-wins by default. Entity-level merge functions as opt-in. CRDTs deferred — overkill for most apps.

### 13.8 Multi-DB Query Planning — Resolved

**Decision:** Route at the entity level, not the query level. One query hits one DB. Cross-DB includes = two queries + in-memory join. Don't build a distributed query planner — that's a multi-year project.

### 13.9 Wire Format — Resolved

**Decision:** JSON for v1. Add MessagePack as opt-in for bandwidth-sensitive clients. Protobuf only if enterprise customers demand it.

### 13.10 API Versioning — NEW (was missing)

**Decision:** Header-based versioning, Stripe-style.

```
Vertz-Version: 2026-03-01
```

- Additive changes (new fields, new entities) are non-breaking — no version bump
- Removing/renaming fields requires a version boundary
- Entity definitions can declare deprecated fields: `v.string().deprecated('Use fullName instead')`
- Generated client SDKs are pinned to a version
- Server maintains transformation layer between versions

### 13.11 Error Format — NEW (was missing)

**Decision:** Structured error responses, inspired by Stripe/RFC 7807:

```json
{
  "error": {
    "type": "access_denied",
    "code": "entity_forbidden",
    "message": "You don't have permission to read this user",
    "entity": "user",
    "field": null,
    "doc_url": "https://vertz.dev/docs/errors/entity_forbidden"
  }
}
```

Error types: `validation_error`, `access_denied`, `not_found`, `rate_limited`, `internal_error`, `query_error` (VertzQL syntax/complexity errors).

For partial failures in includes: return parent data with `null` for failed include + error in `_errors` array.

### 13.12 Pagination — NEW (was missing)

**Decision:** Cursor-based by default. Inspired by Relay connections but simpler:

```json
{
  "data": [...],
  "pagination": {
    "cursor": "eyJpZCI6MTAwfQ==",
    "hasMore": true,
    "total": 1450
  }
}
```

- Default page size: 20 (configurable per entity)
- Max page size: 100 (configurable, prevents full table scans)
- Cursor is opaque to client (base64-encoded key)
- Supports forward pagination only in v1. Bidirectional in v1.1.

### 13.13 Rate Limiting for Complex Queries — NEW (was missing)

**Decision:** Query complexity scoring. Each query gets a cost:
- Simple field selection: cost 1
- Each `where` clause: cost 1
- Each `include`: cost 5
- Each nested include: cost 10
- Aggregations: cost 20

Rate limit by cost per time window, not by request count. Prevents pathological queries from DOSing the database. Default: 1000 cost per minute per client.

### 13.14 Idempotency — NEW (was missing)

**Decision:** Support `Idempotency-Key` header on all mutation requests (POST, PATCH, DELETE).

```
POST /api/orders
Idempotency-Key: unique-client-key-123
```

Framework stores the response and returns it for duplicate keys within a configurable TTL (default: 24h). Essential for reliable mutations in distributed systems.

### 13.15 Bulk Operations — NEW (was missing)

**Decision:** Batch endpoint for bulk mutations:

```
POST /api/users/batch
{
  "operations": [
    { "action": "create", "data": { ... } },
    { "action": "update", "id": "123", "data": { ... } },
    { "action": "delete", "id": "456" }
  ]
}
```

Executed in a transaction. All succeed or all fail. Max batch size: 100 (configurable). Individual results returned per operation.

### 13.16 Schema Introspection — NEW (was missing)

**Decision:** Discovery endpoint for non-TypeScript consumers:

```
GET /api/__schema
```

Returns entity definitions in a machine-readable format (JSON Schema-based). Enables:
- Auto-generated documentation
- Mobile client generation (Swift, Kotlin)
- Third-party integrations
- Runtime API explorers

### 13.17 Subscription Consistency — Resolved

**Decision:** Pragmatic model:
- **Strong auth check** on subscribe
- **Periodic re-authorization** every 60s for active subscriptions
- **Immediate termination** on explicit permission revocation (user removed from org → kill subscriptions)
- **Accept eventual consistency** for edge cases (up to 60s window)
- v1: SSE only (simpler, stateless, works through proxies). WebSocket in v1.1.

### 13.18 URL Pattern — DECIDED

**Decision:** `/api/users`, `/api/posts` — domain name used as-is (no auto-pluralization). CTO approved 2026-02-15.

Default prefix: `/api/`, configurable via `createServer({ apiPrefix: '/v1/' })`. Domain name IS the route segment — `domain('users', ...)` → `/api/users`. No auto-pluralization, no `plural` override needed. Developer chooses the name they want in the URL.

### 13.19 Errors-as-Values — DECIDED

**Decision:** All public APIs use the Result type pattern instead of throwing exceptions. CTO approved 2026-02-15.

```ts
type Result<T, E = DomainError> =
  | { ok: true; data: T }
  | { ok: false; error: E }
```

- Domain handlers, custom actions, and all public-facing functions return `Result<T>`
- No try/catch needed at call sites — pattern match on `ok`
- Internal framework code may still throw for truly exceptional cases (programmer errors)
- HTTP responses map `ok: false` to appropriate status codes based on `error.type`

### 13.20 File Convention — DECIDED

**Decision:** `*.domain.ts` for domain definitions, `*.module.ts` for module grouping. CTO approved 2026-02-15.

```
src/
├── users.domain.ts           # domain('users', { type: 'persisted', ... })
├── organizations.domain.ts   # domain('organizations', { type: 'persisted', ... })
├── app.module.ts             # createModule({ domains: [...], middleware: [...] })
└── server.ts                 # createServer({ modules: [...], apiPrefix: '/api/' })
```

Middleware is defined at the module level, not the domain level. This ensures types flow correctly from module context into domain handlers.

### 13.21 Custom Actions — DECIDED

**Decision:** Persisted domains can define custom `actions` alongside auto-CRUD. CTO approved 2026-02-15.

```ts
const User = domain('users', {
  type: 'persisted',
  table: userEntry,
  actions: {
    resetPassword: async (id, data, ctx) => {
      // ... custom logic
      return { ok: true, data: { success: true } }
    },
  },
})
// Generates: POST /api/users/:id/resetPassword
```

Actions use the same access rules, validation, and Result return type as CRUD operations.

### 13.22 Explicit Domain Type — DECIDED

**Decision:** Explicit `type` field required on all domains. CTO approved 2026-02-15.

```ts
type DomainType = 'persisted' | 'process' | 'view' | 'session'
```

No inference from shape — the developer declares intent explicitly. Only `persisted` generates auto-CRUD in v1.

### 13.23 Database-Level RLS — DECIDED

**Decision:** Defense in depth. Compiler generates Postgres RLS policies from entity access rules. CTO approved 2026-02-15.

- App layer: fast checks, nice error messages, complex logic (virtual entities, computed access)
- DB layer: safety net generated by compiler. Prevents raw SQL / migration scripts / background workers from bypassing access rules.
- Compiler warns when an access rule expression can't be translated to SQL (e.g., async lookups, external service calls). In those cases, app-layer-only with a documented security note.
- Postgres functions as escape hatch for complex policies that CAN be expressed in SQL but aren't trivially translatable.
- Performance: benchmark RLS overhead. If < 1ms per query, enable by default. If higher, make opt-in with warning.

---

## 14. Proposed Expert Review Process

1. **Share this doc** with 2-3 domain experts:
   - A GraphQL advocate (production experience with schema stitching, DataLoader, federation)
   - A REST/MVC advocate (large-scale REST API experience)
   - Optionally: A real-time/local-first expert (Convex, Replicache, Liveblocks background)

2. **Structured critique:** Each expert writes a 1-page response covering:
   - What they love
   - What concerns them
   - What's missing
   - One thing they'd change

3. **Live debate session:** Bring experts together to debate the contentious points (VertzQL syntax, auth model, caching strategy).

4. **Iterate:** Update this doc based on feedback. Repeat until convergence.

---

## 15. Invisible Codegen — Revised DB/Type Strategy

### 15.1 The Shift

Previously: no codegen, everything inferred at the TypeScript type level.
Now: **invisible codegen** — `vertz dev` watches schema files, auto-generates types. The user never runs a command.

### 15.2 Why

- **Performance** — Inferred types from complex schemas slow down the IDE. Generated types are pre-computed and instant.
- **Better API** — Codegen lets us offer a Prisma-style query API (`db.post.list({ select, where, include })`) with exact return types, without the type gymnastics.
- **Better errors** — Generated types can include custom error messages, not TypeScript's generic walls.
- **Simpler internals** — Less type-level magic in the runtime code.

### 15.3 What Gets Generated

All from one `vertz dev` process, triggered by file changes:

| Layer | Generated | Used by |
|-------|-----------|---------|
| DB query types | `db.post.list()` with exact return types | Server code |
| Entity types | Full entity shape, computed fields, metrics | Server + client |
| Client SDK | `client.post.get(id, { select })` → exact type | Client code |
| UI bindings | `useEntity('post', id)` → exact reactive type | Components |
| Route types | Params, navigation, middleware | Router |
| Subscription types | Match query types for real-time | Client code |

### 15.4 The Constraint

**The user NEVER runs codegen manually.** It's part of `vertz dev`:
- File watcher detects schema change → regenerate in background → IDE picks up new types
- Same pattern as Next.js (`.next/types`) and Nuxt (`.nuxt/types`), but covering the full stack
- Build step (`vertz build`) also generates types as part of the pipeline

### 15.5 Comparison — Nobody Does Full-Stack Type Generation

| Framework | Route types | DB types | API types | Client types | UI types |
|-----------|-------------|----------|-----------|-------------|----------|
| Next.js | ✅ | ❌ | ❌ | ❌ | ❌ |
| Nuxt | ✅ | ❌ | Partial | ❌ | ❌ |
| Prisma | ❌ | ✅ | ❌ | ❌ | ❌ |
| tRPC | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Vertz** | ✅ | ✅ | ✅ | ✅ | ✅ |

One schema → types for every layer → if it compiles, it works, everywhere.

---

## 16. LLM-Queryable Entities

> **Key insight from CTO brainstorm:** If entities expose a structured, typed query API with access rules enforced automatically, LLMs can safely query application data without raw DB access.

### 16.1 How It Works

- **Schema introspection endpoint** (`GET /api/__schema`) gives LLMs the vocabulary — entity names, fields, types, available filters, relations
- **LLMs translate natural language → VertzQL queries** using the same API as the frontend
- **Access rules enforce row-level security automatically** — LLM only sees what the authenticated user can see
- **Query limits** (depth, complexity, pagination) prevent abuse
- **No special configuration needed** — entities the developer already defined ARE the tool definitions

### 16.2 Configuration

```ts
const app = createServer({
  domains: [User, Project, Task],
  ai: {
    enabled: true,
    // Auto-exposes entity schema as LLM tool definitions
    // Queries go through same access rules as frontend
  },
})
```

This is safer than giving LLMs raw SQL or ORM access. The entity layer is the sandbox. The same access rules, rate limits, and query complexity scoring that protect the API from malicious clients also protect it from LLM misuse.

### 16.3 Future Possibilities

- **Auto-generate OpenAI function calling tool definitions** from entity schemas
- **MCP (Model Context Protocol) server** auto-generated from entities
- **Natural language → VertzQL translation** (built-in or plugin)
- **Audit trail for LLM queries** (which agent queried what)

---

## 17. Compiler-Driven Query Optimization

> **Key insight from CTO:** Developers shouldn't need to write select clauses. The compiler can trace property access in components and auto-generate optimized queries.

### 17.1 How It Works

1. Developer writes: `const user = await read(User, id)` then uses `user.name`, `user.email`
2. Compiler traces property access statically
3. Codegen produces: `GET /api/users/:id?select=name,email`
4. Only fetched fields are transmitted over the wire

### 17.2 Tiers of Analysis

| Tier | Scope | Behavior |
|------|-------|----------|
| **Tier 1** | Same-file usage | Straightforward property access tracking |
| **Tier 2** | Child component tracing | Follow type signatures across component boundaries |
| **Tier 3** | Dynamic/generic passing | Falls back to all exposed fields with compiler warning |

### 17.3 Design Principles

- **Unknown access → fetch all exposed fields** (safe fallback, always correct)
- **Compiler warns about over-fetching:** "Can't determine field usage — fetching all fields"
- Developer can always **override with explicit select**
- **Progressive optimization:** compiler gets smarter over time, reducing fallback cases

### 17.4 Implementation Phasing

- **v1:** Fetch all exposed fields (no compiler magic)
- **v1.1:** Compiler warns about over-fetching
- **v2:** Auto-select for same-file usage
- **v3:** Cross-component tracing (Relay-level)

### 17.5 Same Client Syntax for Server and Client

```ts
// Server (hits DB)
db.user.list({ where, select, include })

// Client (hits API — same syntax!)
api.user.list({ where, select, include })
```

### 17.6 Security Controls

- **Entity-level query limits** (maxDepth, maxResults, allowedFilters)
- **Access rules enforced on every query**
- **Exposed relations only** (secure by default — entities use explicit `expose` config, not expose-all)
- **Query complexity scoring** for rate limiting

---

## 18. Implementation Roadmap (Tentative)

| Phase | Scope | Dependencies |
|-------|-------|-------------|
| **Phase 1** | Persisted entities + auto-CRUD + access rules | `@vertz/db` v1, `@vertz/core` |
| **Phase 2** | VertzQL (field selection, filtering, relations) | Phase 1 |
| **Phase 3** | Virtual entities + hooks | Phase 1 |
| **Phase 4** | Real-time (WebSocket + SSE subscriptions) | Phase 2 |
| **Phase 5** | Semantic layer (computed fields, metrics, caching) | Phase 2 |
| **Phase 6** | Client SDK generation + UI bindings | Phase 2 |
| **Phase 7** | Multi-region, multi-DB, offline-first | Phase 4-5 |

---

*This is a living document. Update as decisions are made.*
