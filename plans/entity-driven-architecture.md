# Entity-Driven Architecture (EDA)

> **Status:** Draft — Design Discussion  
> **Authors:** Vinicius (CTO), Mika (VP Eng)  
> **Date:** 2026-02-19  
> **Supersedes:** `entity-aware-api.md` (design concepts evolved)  
> **Related:** `entity-aware-api.md` (prior art), `entity-phase1-spec.md` (Phase 1 impl), `result-boundaries.md`, `async-data-design.md`

---

## 1. What is Entity-Driven Architecture?

Entity-Driven Architecture (EDA) is a design pattern for full-stack TypeScript applications where **entities are the universal building block**. An entity declares its data shape, relationships, access rules, and behavior in a single definition. The framework derives everything else: CRUD endpoints, query interfaces, SDK types, and client bindings.

**The core principle:** Declare what your data is and who can do what with it. The framework handles how it's stored, served, queried, and consumed.

**In one sentence:** EDA is what you get when you take the concepts of Domain-Driven Design and make them declarative.

---

## 2. Relationship to Domain-Driven Design

EDA is directly inspired by DDD (Eric Evans, 2003). We adopt DDD's vocabulary and mental model wherever it applies, and we diverge where declarative tooling makes classical patterns unnecessary.

### Recommended Reading

- **"Domain-Driven Design" by Eric Evans (2003)** — The foundational text. Defines Entity, Value Object, Aggregate, Bounded Context, Domain Service.
- **"Implementing Domain-Driven Design" by Vaughn Vernon (2013)** — Practical guide to Aggregates, Repositories, Domain Events.
- **"Domain-Driven Design Distilled" by Vaughn Vernon (2016)** — Condensed version, good for team onboarding.
- **"Learning Domain-Driven Design" by Vlad Khononov (2021)** — Modern take, covers DDD in microservices and event-driven systems.

### Terminology Mapping

We reuse DDD terminology **only where the meaning is consistent**. Where we diverge, we use different names to avoid confusion.

| DDD Concept | Vertz EDA | Consistent? | Notes |
|---|---|---|---|
| **Entity** | `entity()` | ✅ Yes | DDD: "An object with identity that persists over time, distinguished by its identity rather than its attributes." Ours is the same — an entity has an identity (`id`), state (schema fields), and behavior (actions). We extend the concept to include non-persisted entities (action entities, semantic entities). |
| **Value Object** | Schema types (`s.object()`, etc.) | ✅ Yes | DDD: "An immutable object defined by its attributes, with no identity." Our schema types are exactly this — they define shape and validation, have no identity of their own. |
| **Bounded Context** | `domain()` | ✅ Yes | DDD: "An explicit boundary within which a domain model is defined and applicable." Our `domain()` groups entities into a bounded context with shared access policies and explicit exports. |
| **Domain Service** | `service()` | ✅ Yes | DDD: "A stateless operation that doesn't naturally belong to any entity." Our `service()` is for cross-entity business logic — exactly the DDD use case. |
| **Aggregate** | — (not used) | ✅ N/A | DDD: "A cluster of entities and value objects treated as a unit for data changes, with a root entity." We do NOT use this term. Our entities handle their own consistency via access rules, hooks, and schema validation. We don't need the Aggregate pattern because the framework enforces consistency declaratively. If a developer needs to coordinate multiple entities atomically, they use a `service()` or an action entity — not an Aggregate. |
| **Repository** | — (auto-generated) | ✅ N/A | DDD: "An abstraction for persistence operations." We don't expose repositories as a concept. CRUD operations are auto-generated from the entity definition. The developer never writes a repository. |
| **Domain Event** | Hooks (`afterCreate`, `afterUpdate`, etc.) + Event Bus | ⚠️ Similar | DDD: "Something that happened in the domain that domain experts care about." Our hooks serve the same purpose but are co-located with the entity definition, not separate event classes. The `@vertz/db` event bus enables cross-entity event propagation. We call them "hooks" rather than "domain events" to avoid implying we require a full event-sourcing architecture. |
| **Factory** | Hooks (`beforeCreate`) | ⚠️ Similar | DDD: "Encapsulates complex object creation logic." Our `beforeCreate` hooks serve this role — transforming input data before persistence. We don't use the "Factory" name because the hook model is simpler and more intuitive. |
| **Application Service** | Action entities / action handlers | ⚠️ Similar | DDD: "Orchestrates use cases by coordinating domain objects." Our action entities (entities with `kind: 'action'`) fill this role — orchestrating workflows that span multiple persisted entities. We don't call them "application services" because they're still entities in our model, just without persistence. |
| **Module** | `domain()` | ⚠️ Renamed | DDD: "A way to organize domain objects within a bounded context." In classical DDD, modules are organizational units inside a bounded context. In vertz, `domain()` serves as both the bounded context AND the organizational unit. We chose `domain()` over `module()` because "domain" better communicates the business-level grouping, and avoids collision with JavaScript/TypeScript's native module system. |

### Where We Diverge (and Why)

**1. Entities are declarative, not code-heavy.**

In classical DDD, an entity is a class with methods, invariant enforcement, and identity logic:

```java
// Classical DDD (Java)
public class Order {
    private OrderId id;
    private List<LineItem> items;
    private Money total;
    
    public void addItem(Product product, int quantity) {
        // Enforce invariants
        if (quantity <= 0) throw new InvalidQuantityException();
        items.add(new LineItem(product, quantity));
        recalculateTotal();
    }
    
    private void recalculateTotal() { ... }
}
```

In vertz EDA, the entity is a declaration. Invariants are enforced by the schema, access rules, and hooks:

```typescript
// Vertz EDA
const orders = entity('orders', {
  model: ordersModel,
  
  access: {
    create: (ctx) => ctx.authenticated(),
  },
  
  hooks: {
    beforeCreate: (data, ctx) => ({
      ...data,
      total: calculateTotal(data.items),
    }),
  },
  
  actions: {
    addItem: {
      input: s.object({ productId: s.string().uuid(), quantity: s.number().min(1) }),
      handler: async (input, ctx, order) => { ... },
    },
  },
})
```

**Why:** The declarative approach means the framework can auto-generate CRUD, generate SDK types, enforce access rules at the HTTP boundary, and optimize queries — none of which is possible when behavior lives in opaque class methods.

**2. No repositories — CRUD is derived.**

DDD prescribes repositories as an abstraction over persistence. We skip this entirely because the entity definition contains everything the framework needs to generate CRUD operations. Writing a repository would be boilerplate with zero value.

**3. No aggregates — consistency is declarative.**

DDD aggregates exist to enforce transactional consistency boundaries. In vertz, consistency is enforced by:
- Schema validation (compile-time + runtime)
- Access rules (who can modify what)
- Hooks (beforeCreate/beforeUpdate for invariant enforcement)
- Database transactions (the framework wraps mutations in transactions)

If you need to coordinate multiple entities atomically, use a `service()` with an explicit transaction — which is clearer than hiding it inside an aggregate boundary.

**4. Hooks instead of Domain Events (for v1).**

Classical DDD domain events are separate classes that flow through an event bus. Vertz hooks are co-located with the entity and execute synchronously (before/after the operation). This is simpler for most use cases. For cross-entity event propagation, the `@vertz/db` event bus exists, and we'll add a more explicit event system in v2 if needed.

---

## 3. The Building Blocks

### 3.1 Schema — The Source of Truth

The schema defines the data structure with annotations that control behavior across the entire stack.

```typescript
import { d } from '@vertz/db'

const users = d.table('users', {
  id:           d.uuid().primaryKey(),
  email:        d.text().unique(),
  name:         d.text(),
  passwordHash: d.text().hidden(),       // Never exposed via API
  ssn:          d.text().hidden(),       // Never exposed via API
  role:         d.enum('role', ['user', 'admin']),
  avatarUrl:    d.text().optional(),
  tenantId:     d.tenant(),              // Auto RLS scoping
  createdAt:    d.timestamp().defaultNow().readOnly(),    // Set on insert, can't be changed via API
  updatedAt:    d.timestamp().autoUpdate().readOnly(),   // Auto-set on every update, can't be changed via API
})
```

**Schema annotations:**
- `.hidden()` — Field exists in DB, never in API responses or SDK types.
- `.readOnly()` — Cannot be set via create/update operations through the API. Only writable via action overrides or internal methods.
- `.tenant()` — Auto-scoped per tenant. Queries automatically filter by tenant.
- `.ref(() => target)` — Declares a foreign key relationship (column-level).
- `.unique()`, `.notNull()`, `.default()` — Standard DB constraints that also inform validation.
- `.defaultNow()` — DB sets the value to current timestamp on insert.
- `.autoUpdate()` — Framework automatically sets the value to current timestamp on every update. Combine with `.readOnly()` to prevent client manipulation.

### 3.2 Model — Schema + Relations

The model combines a table definition with its relationships. Relations are defined separately from the table to avoid circular dependency issues.

```typescript
import { d, relations, one, many } from '@vertz/db'

// Relations — defined separately
const userRelations = relations(users, {
  assignedTasks: many(tasks, { field: 'assigneeId' }),
  createdTasks:  many(tasks, { field: 'createdBy' }),
  organization:  one(organizations, { field: 'organizationId' }),
})

const taskRelations = relations(tasks, {
  assignee: one(users, { field: 'assigneeId' }),
  creator:  one(users, { field: 'createdBy' }),
  project:  one(projects, { field: 'projectId' }),
})

// Model = table + relations
const usersModel = d.model(users, userRelations)
const tasksModel = d.model(tasks, taskRelations)
```

**Why separate?** Tables can reference each other (users → tasks → users). Defining relations inline would create circular imports. The separate `relations()` function uses lazy thunks internally to break cycles.

**Why `d.model()` and not `d.entry()`?** "Model" is universally understood — it's your data shape plus relationships. "Entry" was an implementation artifact with no semantic meaning.

### 3.3 Entity — The Universal Building Block

An entity combines a model with access rules, behavior, and exposure configuration. There are three kinds, determined by what you put in the definition.

#### Persisted Entity (has `model`)

The most common. Maps to a DB table. CRUD is auto-generated.

```typescript
const tasksEntity = entity('tasks', {
  model: tasksModel,

  // Relations from the model are all available by default.
  // Narrow what's exposed to the API:
  relations: {
    assignee: true,                       // All public fields
    creator: { id: true, name: true },    // Only id and name
    project: false,                       // Not exposed via API
  },

  // Access rules — deny by default if omitted
  access: {
    list:   (ctx) => ctx.tenant(),
    get:    (ctx) => ctx.tenant(),
    create: (ctx) => ctx.authenticated(),
    update: (ctx, task) => task.assigneeId === ctx.userId || ctx.role('admin'),
    delete: false,  // Disabled — no delete endpoint
  },

  // Lifecycle hooks
  hooks: {
    beforeCreate: (data, ctx) => ({ ...data, createdBy: ctx.userId }),
    afterUpdate:  (prev, next, ctx) => audit(ctx, 'task.updated', prev, next),
  },

  // Public actions — become HTTP endpoints
  actions: {
    complete: {
      input: s.object({ note: s.string().optional() }),
      access: (ctx, task) => task.assigneeId === ctx.userId,
      handler: async (input, ctx, task) => {
        return ctx.self.update(task.id, { status: 'done' })
      },
    },
  },

  // Internal methods — available to other entities via injection, NOT exposed as HTTP
  methods: {
    calculatePriority: (task, projectDeadline) => {
      // Business logic reusable by other entities
    },
  },
})
```

**What the framework generates:**
```
GET    /api/tasks          → list (VertzQL: filter, sort, paginate, select, include)
GET    /api/tasks/:id      → get (with relation includes)
POST   /api/tasks          → create (validates, strips hidden/readOnly)
PATCH  /api/tasks/:id      → update (validates, strips readOnly, checks access)
DELETE /api/tasks/:id      → ✗ disabled (delete: false)
POST   /api/tasks/:id/complete → custom action
```

#### Action Entity (no `model`, has `actions`)

For workflows, processes, and operations that don't map 1:1 to a database table.

```typescript
const authEntity = entity('auth', {
  actions: {
    requestOTP: {
      input:  s.object({ email: s.string().email() }),
      output: s.object({ sent: s.boolean() }),
      access: () => true,  // Public
      handler: async (input, ctx) => {
        const user = await ctx.entities.users.find({ email: input.email })
        const code = generateOTP()
        await ctx.entities.otpCodes.create({ userId: user.id, code })
        await ctx.mail.send(input.email, { template: 'otp', data: { code } })
        return { sent: true }
      },
    },
    verify: {
      input:  s.object({ email: s.string().email(), code: s.string() }),
      output: s.object({ token: s.string(), expiresAt: s.date() }),
      access: () => true,
      handler: async (input, ctx) => {
        // Validate OTP, create session, return token
      },
    },
    logout: {
      input:  s.object({ token: s.string() }),
      output: s.object({ ok: s.boolean() }),
      access: (ctx) => ctx.authenticated(),
      handler: async (input, ctx) => {
        await ctx.entities.sessions.delete({ token: input.token })
        return { ok: true }
      },
    },
  },
})

// Generated:
// POST /api/auth/requestOTP
// POST /api/auth/verify
// POST /api/auth/logout
```

**DDD parallel:** Action entities are equivalent to Application Services — they orchestrate use cases that span multiple persisted entities. We call them "action entities" rather than "services" because they're declared the same way as any other entity and consumed through the same SDK/query interface.

#### Semantic Entity (has `source` + `measures`)

Computed views over persisted entities. Metrics, aggregations, analytics. Ships later but the architecture accounts for it now.

```typescript
const salesMetrics = entity('salesMetrics', {
  kind: 'semantic',

  source: ordersModel,
  // Relations from the model are available automatically for joins.
  // Extra joins for cases not defined in the schema:
  extraJoins: {
    warehouse: join(warehouses, {
      on: (orders, warehouses) => orders.warehouseCode === warehouses.code,
    }),
  },

  measures: {
    totalRevenue:    sum(orders.amount),
    avgOrderValue:   avg(orders.amount),
    orderCount:      count(orders.id),
  },

  dimensions: {
    date:      orders.createdAt,
    category:  products.category,     // Via schema relation (automatic)
    warehouse: warehouses.name,       // Via extraJoins
  },

  access: {
    read: (ctx) => ctx.role('analyst', 'admin'),
  },
})

// Consumed via query language:
// sdk.salesMetrics.query({
//   measures: ['totalRevenue', 'orderCount'],
//   dimensions: ['category'],
//   where: { date: { gte: '2026-01-01' } },
//   granularity: 'month',
// })
```

### 3.4 CRUD Control

For persisted entities, CRUD operations are auto-generated. Control them in the `actions` block:

```typescript
// Not mentioned → auto-generated (default)
// false → disabled, no endpoint
// { handler } → custom implementation, same endpoint

const countries = entity('countries', {
  model: countriesModel,
  actions: {
    create: false,    // Read-only reference data
    update: false,
    delete: false,
    // Only list + get remain
  },
})

const auditLog = entity('auditLog', {
  model: auditLogModel,
  actions: {
    update: false,    // Append-only
    delete: false,
    // Override create with custom logic:
    create: {
      handler: async (input, ctx) => {
        return ctx.self.create({ ...input, timestamp: Date.now(), actor: ctx.userId })
      },
    },
  },
})
```

### 3.5 Access Rules — One Place, All Operations

All access rules live at the root `access` block — for CRUD and custom actions alike. Actions only define `input` + `handler`. This gives you one scannable place for the entire security surface.

```typescript
const tasks = entity('tasks', {
  model: tasksModel,

  access: {
    // CRUD
    list:     (ctx) => ctx.tenant(),
    get:      (ctx) => ctx.tenant(),
    create:   (ctx) => ctx.authenticated(),
    update:   (ctx, task) => task.assigneeId === ctx.userId,
    delete:   false,
    // Custom actions
    complete: (ctx, task) => task.assigneeId === ctx.userId,
    reassign: (ctx) => ctx.role('admin'),
  },

  actions: {
    complete: {
      input: s.object({ note: s.string().optional() }),
      handler: async (input, ctx, task) => { ... },
    },
    reassign: {
      input: s.object({ assigneeId: s.string().uuid() }),
      handler: async (input, ctx, task) => { ... },
    },
  },
})
```

**Rule:** Access is NEVER defined inside an action object. Always at the root `access` block.

### 3.6 Action Overrides vs Event Reactions (`on`)

Two concepts, each with a clear, non-overlapping purpose:

- **Action override** (`actions`) — **transform** data or change behavior. The "before" use case. You override a CRUD action and call `ctx.self.create()` / `ctx.self.update()` for the raw operation.
- **Event reaction** (`after`) — **side effects** after something happened. Notifications, audit, cache invalidation. Cannot change the result. Works uniformly for CRUD AND custom actions.

```typescript
const users = entity('users', {
  model: usersModel,

  access: {
    create: (ctx) => ctx.authenticated(),
    resetPassword: (ctx, user) => user.id === ctx.userId,
  },

  // BEHAVIOR — transform data, change flow
  actions: {
    create: {
      handler: async (input, ctx) => {
        return ctx.self.create({ ...input, createdBy: ctx.userId })
      },
    },
    resetPassword: {
      input: s.object({ newPassword: s.string().min(8) }),
      handler: async (input, ctx, user) => {
        const hashed = await hashPassword(input.newPassword)
        return ctx.self.update(user.id, { passwordHash: hashed })
      },
    },
  },

  // REACTIONS — side effects after operations complete
  after: {
    create: async (user, ctx) => {
      await sendWelcomeEmail(user)
    },
    update: async (prev, next, ctx) => {
      await audit(ctx, 'user.updated', prev, next)
    },
    resetPassword: async (result, ctx, user) => {
      await notifySecurityTeam(user)
    },
  },
})
```

**Key behaviors:**
- `after.create` fires after any create — whether auto-generated or overridden via `actions.create`
- `after.resetPassword` fires after the custom action handler completes
- Event reactions receive the result but cannot modify it
- Same pattern for CRUD operations and custom actions — no special casing

**DDD parallel:** Event reactions are Domain Events — "something that happened in the domain that other parts of the system care about." They're decoupled from the operation itself, enabling clean separation of core logic from side effects.

**Shipping:** `after` is designed and decided but deferred to v0.2. v0.1 ships without event reactions — developers handle side effects inline in action overrides for now.

### 3.5c Public vs Internal Operations

Two kinds of operations on an entity:

- **`actions`** — Public. Become HTTP endpoints. Consumed via SDK.
- **`methods`** — Internal. Available to other entities that inject this one. NOT exposed as HTTP.

```typescript
const orders = entity('orders', {
  model: ordersModel,

  // Public — HTTP endpoints
  actions: {
    place: {
      input: s.object({ items: s.array(itemSchema) }),
      handler: async (input, ctx) => {
        const total = ctx.self.calculateTotal(input.items)  // calls internal method
        await ctx.self.validateStock(input.items)            // calls internal method
        return ctx.self.create({ userId: ctx.userId, total, status: 'pending' })
      },
    },
    cancel: {
      access: (ctx, order) => order.userId === ctx.userId,
      handler: async (input, ctx, order) => {
        await ctx.entities.payments.refund(order)
        return ctx.self.update(order.id, { status: 'cancelled' })
      },
    },
  },

  // Internal — not HTTP, available via injection
  methods: {
    calculateTotal: (items) => items.reduce((sum, i) => sum + i.price * i.qty, 0),
    validateStock: async (items, ctx) => {
      for (const item of items) {
        const product = await ctx.entities.products.get(item.productId)
        if (product.stock < item.qty) throw new InsufficientStockError(item.productId)
      }
    },
  },
})
```

**When entity A injects entity B, A gets:**
- B's CRUD operations (internal, no HTTP roundtrip)
- B's `methods` (internal logic)
- B's `actions` (callable internally, same code path, no HTTP)

The HTTP boundary is a projection: actions and CRUD get endpoints. Methods don't. That's the only difference.

### 3.6 Domain — The Bounded Context

Domains group entities into bounded contexts. They control visibility, shared policies, and deployment boundaries.

```typescript
const identity = domain('identity', {
  entities: [usersEntity, sessionsEntity, authEntity],

  // What other domains can access
  exports: [usersEntity, authEntity],
  // sessionsEntity is internal — not importable by other domains

  // Domain-level access (applies to all entities)
  access: (ctx) => ctx.authenticated(),

  // Domain-level hooks
  hooks: {
    beforeAll: (ctx) => auditLog(ctx),
  },
})

const commerce = domain('commerce', {
  entities: [productsEntity, ordersEntity, cartEntity, checkoutEntity],
  inject: [identity],   // Imports identity's exports
  exports: [productsEntity, ordersEntity],
})

const analytics = domain('analytics', {
  entities: [salesMetrics, userEngagement],
  inject: [commerce, identity],
  access: (ctx) => ctx.role('analyst', 'admin'),
})
```

**Visibility levels:**

| Level | Who can access | How |
|---|---|---|
| `actions` | Anyone (via HTTP) | API endpoint |
| `methods` + CRUD | Entities that inject this one (within domain or via domain exports) | Direct call / RPC |
| Non-exported entities | Only within the same domain | Direct call only |

**Microservice boundary:** In development, all domains run in one process. In production, a domain can be deployed as a separate service. Cross-domain `inject` becomes RPC automatically — the syntax never changes. The entity type signatures are the contract.

```typescript
// Developer writes:
await ctx.entities.payments.charge(order)

// Monolith mode: direct function call
// Microservice mode: auto-generated RPC from entity types
// The code is identical. The deployment topology is configuration.
```

### 3.7 Service — Cross-Entity Logic

Services are the escape hatch for business logic that spans multiple entities and is reusable across different contexts.

```typescript
const billingService = service('billing', {
  inject: [usersEntity, subscriptionsEntity, invoicesEntity, paymentsEntity],

  methods: {
    async upgradePlan(userId, newPlan, ctx) {
      const user = await ctx.entities.users.get(userId)
      const sub = await ctx.entities.subscriptions.update(
        user.subscriptionId, { plan: newPlan }
      )
      const invoice = await ctx.entities.invoices.create({ ... })
      await ctx.entities.payments.charge(invoice)
      return sub
    },
  },
})
```

**When to use a service vs an action entity:**
- **Action entity** — when the workflow IS the API surface (auth flow, checkout, onboarding)
- **Service** — when the logic is reusable internally by multiple entities/actions but isn't itself an API

**DDD parallel:** Services in EDA are identical to DDD Domain Services — stateless operations that don't belong to any single entity.

---

## 4. The Narrowing Hierarchy

The same `{ field: true }` syntax is used at every layer. Each layer can only **narrow** what the layer above exposes — never widen.

```
DB table (all columns & relations)
  → Schema annotations (.hidden(), .readOnly())
    → Entity relations config (which relations are exposed, with which fields)
      → Client query (further narrows per request)
        → Compiler (auto-selects only fields the code actually reads)
```

**Example flow:**

```typescript
// DB has: id, email, name, passwordHash, ssn, role, tenantId, createdAt
// Schema: passwordHash.hidden(), ssn.hidden(), createdAt.readOnly()
// Entity: relations.creator = { id: true, name: true }

// What the API can ever return: id, email, name, role, tenantId, createdAt
// What the creator relation exposes: only id and name

// Client query:
sdk.tasks.list({
  where: { status: 'todo' },
  include: {
    assignee: true,                     // ✅ all public fields of assignee
    creator: { id: true, name: true },  // ✅ within entity's restriction
    creator: { email: true },           // ❌ compile error — email not exposed on creator
    project: true,                      // ❌ compile error — project relation not exposed
  },
})

// The compiler further narrows: if the component only uses task.title and assignee.name,
// the actual query only requests those fields.
```

---

## 5. Guard Rails — The Entity Layer as Security Boundary

The entity layer sits between the client and the database. Every request passes through it.

```
Client request                    Entity guard rails                 DB query
─────────────                    ──────────────────                 ────────
where: { status: 'todo' }   →   ✅ status is a public field    →   WHERE status = 'todo'
where: { passwordHash: x }  →   ❌ hidden field, rejected
include: { assignee: true }  →   ✅ declared in relations       →   JOIN users ON assigneeId
include: { payments: true }  →   ❌ not declared, rejected
select: { ssn: true }        →   ❌ hidden field, stripped
                                  + tenant scoping (auto)        →   AND tenant_id = :tenantId
                                  + access check                 →   (row-level if applicable)
```

**Deny by default:** If no `access` rules are defined on an entity, it is inaccessible. No accidental data exposure.

---

## 6. What Developers Write vs What the Framework Generates

**Developer writes (~30 lines):**
```typescript
const tasksEntity = entity('tasks', {
  model: tasksModel,
  relations: { assignee: true, creator: { id: true, name: true } },
  access: {
    list:   (ctx) => ctx.tenant(),
    get:    (ctx) => ctx.tenant(),
    create: (ctx) => ctx.authenticated(),
    update: (ctx, task) => task.assigneeId === ctx.userId,
    delete: false,
  },
  hooks: {
    beforeCreate: (data, ctx) => ({ ...data, createdBy: ctx.userId }),
  },
  actions: {
    complete: {
      access: (ctx, task) => task.assigneeId === ctx.userId,
      handler: async (input, ctx, task) => ctx.self.update(task.id, { status: 'done' }),
    },
  },
})
```

**Framework generates:**
- HTTP endpoints (5 CRUD + 1 action)
- Input validation from schema
- Output filtering (hidden/readOnly fields stripped)
- Relation query support with narrowing
- SDK client with full TypeScript types:
  - `sdk.tasks.list({ where, include, orderBy, limit })`
  - `sdk.tasks.get(id, { include })`
  - `sdk.tasks.create({ title, status })`
  - `sdk.tasks.update(id, { title })`
  - `sdk.tasks.complete(id, { note })`
- Type definitions: `Task`, `TaskCreate`, `TaskUpdate`, `TaskWithAssignee`, `TaskWithCreator`
- Access rule enforcement at HTTP boundary
- Tenant scoping in queries
- Event bus notifications on mutations

**What the developer reviews:** Access rules, hooks, custom action logic. ~30 lines. Everything else is framework-derived and provably correct from the declaration.

---

## 7. File Conventions

```
src/
  entities/
    users.entity.ts        # Entity definition
    tasks.entity.ts
    auth.entity.ts         # Action entity
    salesMetrics.entity.ts # Semantic entity (future)
  models/
    users.model.ts         # Table + relations
    tasks.model.ts
  schemas/
    users.schema.ts        # Table definition (columns)
    tasks.schema.ts
  services/
    billing.service.ts     # Cross-entity logic
  domains/
    identity.domain.ts     # Bounded context
    commerce.domain.ts
  app.ts                   # Domain registration
```

```typescript
// app.ts
import { createServer } from '@vertz/server'
import { identity } from './domains/identity.domain'
import { commerce } from './domains/commerce.domain'

const app = createServer({
  domains: [identity, commerce],
  apiPrefix: '/api/',
})
```

---

## 8. Scope & Shipping Plan

### v0.1 — Core EDA (current priority)

**Ship:**
- `entity()` for persisted entities with auto-CRUD
- `d.model()` replacing `d.entry()`
- Access rules (sync, deny by default)
- `actions` on persisted entities (custom endpoints)
- `actions: { delete: false }` for CRUD disabling
- `hooks` (beforeCreate, afterCreate, beforeUpdate, afterUpdate)
- `fields` config (hidden/readOnly from schema annotations)
- `relations` narrowing (which relations exposed, which fields)
- VertzQL: `select`, `where`, `orderBy`, `limit`, cursor pagination
- Codegen: TypeScript SDK from entity definitions

**Don't ship:**
- Action entities (process/workflow)
- Semantic entities (metrics/aggregations)
- `methods` (internal operations)
- `domain()` grouping
- `service()` cross-entity logic
- Real-time subscriptions
- VertzQL: `include` with nested filtering (use sub-resource endpoints for v0.1)

### Future (patch/minor — ship when ready)

- **Soft deletes** — likely a schema-level annotation (e.g., `.softDelete()` on a `deletedAt` column) that auto-filters deleted rows and converts `delete` to a timestamp set. Design details deferred.
- **Optimistic locking** — schema annotation (e.g., `.version()` on an integer column) that auto-increments on update and rejects stale writes with 409 Conflict. Design details deferred.
- **Bulk operations** — `createMany`, `updateMany`, `deleteMany` auto-generated alongside single-record CRUD. Deferred due to complexity (partial failures, per-row access checks, transactions).
- **Caching** — per-entity cache config (TTL, invalidation on mutations via event bus, HTTP Cache-Control headers). Open questions: cache location (in-memory/Redis/pluggable), granularity (per-entity/per-query), config cascade (app defaults + entity overrides).
- **Domain-level middleware** — middleware on `domain()` applying to all entities within the bounded context. For v0.1, middleware lives on `createServer()` and applies globally. Domain-level middleware ships with `domain()` in v0.2.

### v0.2 — Production Ready

- Action entities (`action()`)
- Event reactions (`after`) — side effects after CRUD and custom actions, DDD Domain Events pattern (designed, see Section 3.6)
- `methods` (public/internal split)
- `domain()` with `exports` and `inject`
- `service()` for cross-entity logic
- VertzQL: nested includes
- Computed fields (derived/aggregated fields with `resolve` function, type declaration, opt-in via `select`). Filter support for computed fields to be designed at implementation time.

### v0.3+ — Enterprise

- Semantic entities (measures, dimensions, extraJoins)
- Auth hierarchy (tenant → team → project → resource)
- Domain → microservice boundary (auto RPC)
- Real-time subscriptions
- Pre-aggregation / caching
- GraphQL transport (optional)

---

## 9. Default Query Behavior

Defaults are configured at three levels with a cascade: **framework defaults → app defaults → entity defaults → client request**.

### Framework Built-in Defaults

If nothing is configured, the framework uses:
- `pagination: 'cursor'` — safer for real-time data, better performance at scale
- `orderBy: { createdAt: 'desc' }` — newest first
- `limit: 50`
- `maxLimit: 200` — clients can never exceed this

### App-Level Defaults

Override framework defaults for all entities:

```typescript
const app = createServer({
  domains: [identity, commerce],
  apiPrefix: '/api/',
  defaults: {
    orderBy: { createdAt: 'desc' },
    pagination: 'cursor',
    limit: 50,
    maxLimit: 200,
  },
})
```

### Entity-Level Defaults

Override app defaults for a specific entity:

```typescript
const auditLog = entity('auditLog', {
  model: auditLogModel,
  defaults: {
    orderBy: { timestamp: 'desc' },
    limit: 100,
    maxLimit: 1000,
  },
})
```

Entities with no `defaults` block inherit app defaults.

### Client Override

Clients can override `orderBy` and `limit` per request, but can never exceed the entity's `maxLimit`.

---

## 10. Design Decisions from Review (v2)

### Decided
1. **Entity injection respects access rules.** Internal calls bypass HTTP but still execute the target entity's access rules. This prevents privilege escalation through injection.
2. **N+1 is an ORM concern, not an entity concern.** The entity layer passes include requests through to the ORM (after narrowing). The ORM handles batched queries (DataLoader pattern: separate batched query per relation, in-memory resolution). Not JOINs.
3. **Separate files are the convention.** No co-located schema + model + entity in one file. Deterministic file structure: `schemas/`, `models/`, `entities/`. LLMs generate the boilerplate. Convention scales better than convenience.
4. **Entity definitions don't specify route params or query params.** The framework derives `:id` from the primary key. VertzQL handles list query params (where, orderBy, limit, cursor). Custom actions only define `input` (request body). Response type is inferred from the handler return.
5. **`on` renamed to `after`** — clearer temporal semantics for event reactions.

### VertzQL Wire Format
6. **VertzQL uses a hybrid wire format: readable params for filtering/pagination, encoded param for structural queries.**

**Readable in URL** (filtering, sorting, pagination — changes with user interaction, visible in devtools/logs):
- `where[status]=todo` — filtering
- `orderBy=createdAt:desc` — sorting
- `limit=20` — pagination size
- `cursor=abc123` — cursor pagination

**Encoded in `q=`** (field selection, relation includes — structural, varies per component, cached):
- Base64url-encoded canonical JSON (keys sorted recursively, URL-safe, no padding)
- Same structural query from any client → identical `q=` → HTTP/CDN cache hit
- SDK generates this automatically — developers never write it by hand

```
GET /api/tasks?where[status]=todo&orderBy=createdAt:desc&limit=20&q=eyJzZWxlY3QiOnsidGl0bGUiOnRydWV9LCJpbmNsdWRlIjp7ImFzc2lnbmVlIjp0cnVlfX0
// q= decodes to: {"include":{"assignee":true},"select":{"title":true}}
```

POST fallback for queries exceeding URL length limits (~2KB).

### Notes (to be designed)
- **Headers and permissions context** — How do HTTP headers flow into `ctx`? How does the auth middleware populate `ctx.userId`, `ctx.role()`, `ctx.tenant()`? Need to define the ctx shape and how middleware populates it. Related to the middleware design (v0.2 for domain-level, v0.1 for global).
- **Error response format** — What does a denied access check return? Schema validation failure? Action handler error? Need a consistent error response shape across all entity operations.
- **Testing story** — How to unit test entity access rules and action handlers. Define ctx mocking utilities.
- **Escape hatch for raw SQL** — `ctx.db.raw()` or equivalent for queries VertzQL can't express.

---

## 11. Open Questions

1. **Default relation exposure:** Should all schema relations be exposed by default (`'all'`), or should developers explicitly opt-in (`'none'`)? `'all'` is less boilerplate; `'none'` is more secure. Recommendation: `'all'` with `.hidden()` fields stripped — the developer already declared those relations intentionally.

2. **VertzQL wire format:** Simple queries as GET with query params, complex queries as POST body (decided in entity-aware-api.md). Need to finalize the exact query param encoding.

3. **Transaction boundaries:** When an action's handler calls multiple entity operations, should the framework auto-wrap in a transaction? Recommendation: yes, with opt-out.

4. **`createModule()` deprecation:** The existing `createModule()` in `@vertz/core` overlaps with `domain()`. Plan: `domain()` supersedes `createModule()` for entity registration. `createModule()` remains for non-entity middleware/plugin registration if needed.

5. **Relation syntax in models:** The current `d.ref.one()` / `d.ref.many()` exists in the codebase. The `relations()` + `one()` / `many()` pattern shown in this doc may be a cleaner API. Need to verify against the actual `db-design.md` decisions and settle on one.

---

## 10. Summary

Entity-Driven Architecture is DDD made declarative for the TypeScript full-stack era. It takes proven concepts — entities, bounded contexts, domain services — and eliminates the boilerplate that made classical DDD heavyweight. The framework derives CRUD, types, SDK, and query interfaces from entity declarations. Developers write only what matters: data shape, access rules, and custom logic.

**The promise:** Define your entity in 30 lines. Get a type-safe, access-controlled, query-optimized API with a generated SDK. Review only the code that matters. Ship faster.
