# Entity-Aware API — Phase 1 Implementation Spec

> **Status:** Ready for implementation  
> **Author:** Mika (VP Eng)  
> **Date:** 2026-02-15  
> **Depends on:** `@vertz/db` (d.entry, CRUD functions), `@vertz/core` (createServer, middleware)  
> **Related:** [`entity-aware-api.md`](./entity-aware-api.md), [`access-system.md`](./access-system.md)

---

## 1. Overview & Goals

Phase 1 ships the `domain()` function and auto-CRUD route generation. A developer defines a domain with an explicit `type` field, a table reference (for persisted domains), access rules, optional handler overrides, and custom actions. The framework auto-generates RESTful CRUD endpoints plus action routes.

**Goals:**
- One domain definition → five REST endpoints (list, get, create, update, delete) + custom action endpoints
- Secure by default: no access rules = deny all; no `expose` = no relations queryable
- Handler overrides for the 20% of operations needing custom logic
- Custom `actions` for domain-specific operations (e.g., `POST /api/users/:id/resetPassword`)
- Errors-as-values in all public APIs (Result type pattern, not exceptions)
- Opt-in adoption: existing Vertz apps add domains incrementally alongside manual routes
- File convention: `*.domain.ts` files, registered via `*.module.ts` using `createModule({ domains: [...] })`
- All contracts designed so Phases 2–7 layer on without breaking changes

**Non-goals (explicitly deferred):**
- No codegen — types are inferred at the TypeScript level
- No computed fields, hooks (beforeCreate/afterCreate), VertzQL field selection/filtering
- No virtual domains, real-time/subscriptions, client SDK, UI bindings
- No `defineAccess()` / `ctx.can()` / closure tables / RLS policy generation
- No bulk operations, idempotency keys, or API versioning headers
- No async access rules (sync-only in v1)

---

## 2. API Surface

### 2.1 `domain()` Function

```ts
import type { TableEntry } from '@vertz/db'
import type { HandlerCtx } from '@vertz/server'

// ─── Core Types ──────────────────────────────────────────────────────────

/**
 * Infer the row type from a TableEntry.
 * This extracts the column types from the underlying table definition.
 */
type InferRow<TEntry extends TableEntry<any, any>> = 
  TEntry extends TableEntry<infer TTable, any>
    ? { [K in keyof TTable['_columns']]: TTable['_columns'][K]['_type'] }
    : never

/**
 * Infer available relation names from a TableEntry.
 */
type InferRelationNames<TEntry extends TableEntry<any, any>> =
  TEntry extends TableEntry<any, infer TRelations>
    ? keyof TRelations & string
    : never

/**
 * Infer the column/field names from a TableEntry.
 */
type InferFieldNames<TEntry extends TableEntry<any, any>> =
  TEntry extends TableEntry<infer TTable, any>
    ? keyof TTable['_columns'] & string
    : never

/**
 * Infer the column names of a related table entry.
 */
type InferRelationFieldNames<TEntry extends TableEntry<any, any>, TRelation extends string> =
  TEntry extends TableEntry<any, infer TRelations>
    ? TRelation extends keyof TRelations
      ? keyof TRelations[TRelation]['_table']['_columns'] & string
      : never
    : never

/**
 * The request context available to access rules and handlers.
 * Extends the base HandlerCtx with entity-specific utilities.
 */
interface DomainContext<TRow = any> extends HandlerCtx {
  /** The authenticated user, or null for unauthenticated requests */
  user: {
    id: string
    role: string
    [key: string]: unknown
  } | null

  /** The current tenant (org/workspace), resolved by tenant middleware */
  tenant: {
    id: string
    [key: string]: unknown
  } | null

  /** Database access — delegates to @vertz/db CRUD functions */
  db: Record<string, {
    get: (args: any) => Promise<any>
    list: (args: any) => Promise<any[]>
    listAndCount: (args: any) => Promise<{ data: any[]; total: number }>
    create: (args: any) => Promise<any>
    update: (args: any) => Promise<any>
    deleteOne: (args: any) => Promise<any>
  }>

  /** Registered services (from modules) */
  services: Record<string, unknown>

  /** Call the auto-generated default handler for this operation */
  defaultHandler: (data: any) => Promise<TRow>
}

// ─── Access Rules ────────────────────────────────────────────────────────

/**
 * Access rule function. Synchronous in v1 (no async).
 * Receives the row (or input data for create) and the request context.
 * Returns true to allow, false to deny.
 */
type AccessRule<TRow, TCtx = DomainContext<TRow>> = (row: TRow, ctx: TCtx) => boolean

interface AccessRules<TRow> {
  /** Applied to each row on read (list + get). Rows failing this are excluded. */
  read?: AccessRule<TRow>
  /** Applied to input data on create. */
  create?: AccessRule<Partial<TRow>>
  /** Applied to the existing row on update (before mutation). */
  update?: AccessRule<TRow>
  /** Applied to the existing row on delete. */
  delete?: AccessRule<TRow>
}

// ─── Handler Overrides ───────────────────────────────────────────────────

/**
 * Custom handler for a CRUD operation.
 * Unlike access rules, handlers CAN be async.
 */
type ListHandler<TRow> = (
  params: { cursor?: string; limit?: number; where?: Record<string, unknown> },
  ctx: DomainContext<TRow>,
) => Promise<{ data: TRow[]; pagination: PaginationMeta }>

type GetHandler<TRow> = (
  id: string,
  ctx: DomainContext<TRow>,
) => Promise<TRow>

type CreateHandler<TRow> = (
  data: Partial<TRow>,
  ctx: DomainContext<TRow>,
) => Promise<TRow>

type UpdateHandler<TRow> = (
  id: string,
  data: Partial<TRow>,
  ctx: DomainContext<TRow>,
) => Promise<TRow>

type DeleteHandler<TRow> = (
  id: string,
  ctx: DomainContext<TRow>,
) => Promise<TRow>

interface HandlerOverrides<TRow> {
  list?: ListHandler<TRow>
  get?: GetHandler<TRow>
  create?: CreateHandler<TRow>
  update?: UpdateHandler<TRow>
  delete?: DeleteHandler<TRow>
}

// ─── Result Type (Errors-as-Values) ──────────────────────────────────────

/**
 * All public APIs return Result types instead of throwing exceptions.
 * This makes error handling explicit and composable.
 */
type Result<T, E = DomainError> =
  | { ok: true; data: T }
  | { ok: false; error: E }

interface DomainError {
  type: 'validation_error' | 'access_denied' | 'not_found' | 'conflict' | 'internal_error'
  code: string
  message: string
  entity?: string
  field?: string
  details?: Array<{ field: string; message: string; code: string }>
}

// ─── Custom Actions ──────────────────────────────────────────────────────

/**
 * Custom action handler for domain-specific operations.
 * Generates: POST /api/{domainName}/:id/{actionName}
 */
type ActionHandler<TRow, TInput = any, TOutput = any> = (
  id: string,
  data: TInput,
  ctx: DomainContext<TRow>,
) => Promise<Result<TOutput>>

/**
 * Map of action names to their handlers.
 * Each action generates a POST endpoint: POST /api/{domainName}/:id/{actionName}
 */
type ActionsMap<TRow> = Record<string, ActionHandler<TRow>>

// ─── Domain Types ────────────────────────────────────────────────────────

/**
 * Explicit domain type — required field.
 * - 'persisted': backed by a DB table, auto-CRUD generated
 * - 'process': virtual entity for multi-step business logic (future)
 * - 'view': read-only projection / aggregation (future)
 * - 'session': ephemeral / cache-backed (future)
 */
type DomainType = 'persisted' | 'process' | 'view' | 'session'

// ─── Entity Options ──────────────────────────────────────────────────────

/**
 * Expose configuration for a single relation.
 * - `true` → expose the entire relation (all its exposed fields)
 * - `{ select: Record<FieldName, true> }` → expose only the specified fields
 *
 * Uses the same { select, true } syntax as DB queries and client requests.
 */
type RelationExposeConfig<TFieldNames extends string> =
  | true
  | { select: Partial<Record<TFieldNames, true>> }

/**
 * Field restriction for the entity's own columns.
 * Only listed fields are returned via the API.
 * Uses the same { select } syntax as DB queries.
 */
type FieldsConfig<TFieldNames extends string> = {
  select: Partial<Record<TFieldNames, true>>
}

interface DomainOptions<
  TEntry extends TableEntry<any, any>,
  TRow = InferRow<TEntry>,
> {
  /** Explicit domain type — required */
  type: DomainType

  /** The database table entry — source of truth for schema and relations */
  table: TEntry

  /**
   * Restrict which of the entity's own columns are exposed via the API.
   * Uses { select: { fieldName: true } } syntax — same as DB queries.
   * If omitted, all non-sensitive columns are exposed.
   */
  fields?: FieldsConfig<InferFieldNames<TEntry>>

  /**
   * Relations to expose via the API. Only listed relations are queryable.
   * If omitted, NO relations are exposed (secure by default — Zeroth Law).
   *
   * Uses the same { select, true } syntax as DB queries and client requests:
   * - `relationName: true` → expose entire relation
   * - `relationName: { select: { field: true } }` → expose with field restriction
   *
   * Fully typed from d.entry() — only valid relation names are allowed,
   * and field names autocomplete from the related table's columns.
   */
  expose?: {
    [K in InferRelationNames<TEntry>]?: RelationExposeConfig<InferRelationFieldNames<TEntry, K>>
  }

  /** Access rules — synchronous pure functions in v1 */
  access?: AccessRules<TRow>

  /** Override auto-generated CRUD handlers */
  handlers?: HandlerOverrides<TRow>

  /**
   * Custom actions alongside auto-CRUD.
   * Each action generates: POST /api/{domainName}/:id/{actionName}
   *
   * Example:
   *   actions: {
   *     resetPassword: async (id, data, ctx) => {
   *       // ... custom logic
   *       return { ok: true, data: { success: true } }
   *     }
   *   }
   * → generates POST /api/users/:id/resetPassword
   */
  actions?: ActionsMap<TRow>
}

// ─── Domain Definition (return type) ─────────────────────────────────────

interface DomainDefinition<
  TEntry extends TableEntry<any, any> = TableEntry<any, any>,
  TRow = InferRow<TEntry>,
> {
  /** The domain name (used as-is for routes — no auto-pluralization) */
  readonly name: string
  /** The explicit domain type */
  readonly type: DomainType
  /** The table entry */
  readonly table: TEntry
  /** Exposed relation configuration (relation name → true | { select }) */
  readonly exposedRelations: Record<string, true | { select: Record<string, true> }>
  /** Access rules */
  readonly access: AccessRules<TRow>
  /** Handler overrides */
  readonly handlers: HandlerOverrides<TRow>
  /** Custom actions */
  readonly actions: ActionsMap<TRow>
}

// ─── Module System ───────────────────────────────────────────────────────

/**
 * Modules group domains and provide middleware context.
 * File convention: *.module.ts
 * Middleware is defined at the module level (not domain level).
 * Types flow from the module context into domain handlers.
 */
interface ModuleOptions {
  /** Domains registered by this module */
  domains: DomainDefinition[]
  /** Module-level middleware (applies to all domains in this module) */
  middleware?: MiddlewareFunction[]
  /** Services provided by this module */
  services?: Record<string, unknown>
}

interface ModuleDefinition {
  readonly domains: DomainDefinition[]
  readonly middleware: MiddlewareFunction[]
  readonly services: Record<string, unknown>
}

function createModule(options: ModuleOptions): ModuleDefinition

// ─── domain() function ───────────────────────────────────────────────────

function domain<TEntry extends TableEntry<any, any>>(
  name: string,
  options: DomainOptions<TEntry>,
): DomainDefinition<TEntry>
```

### 2.2 `createServer()` Integration

```ts
import type { AppConfig } from '@vertz/core'

interface ServerConfigWithEntities extends AppConfig {
  /**
   * Modules containing domain definitions and module-level middleware.
   * Preferred over passing domains directly.
   */
  modules?: ModuleDefinition[]

  /**
   * Domain definitions to register as auto-CRUD routes (convenience).
   * For middleware support, use modules instead.
   * Routes are generated under the apiPrefix (default: '/api/').
   */
  domains?: DomainDefinition[]

  /**
   * Prefix for all domain routes. Default: '/api/'.
   * Example: '/api/' → GET /api/users, POST /api/users
   * Example: '/v1/' → GET /v1/users, POST /v1/users
   */
  apiPrefix?: string
}

// Extended createServer signature
function createServer(config: ServerConfigWithEntities): AppBuilder
```

### 2.3 Usage Example

```ts
// ─── File: users.domain.ts ──────────────────────────────────────────────
import { d } from '@vertz/db'
import { domain } from '@vertz/server'
import { usersTable, usersRelations } from './schema'

export const User = domain('users', {
  type: 'persisted',
  table: d.entry(usersTable, usersRelations),

  // Restrict own columns — same { select } syntax as DB queries
  fields: {
    select: { id: true, name: true, email: true, role: true, orgId: true, createdAt: true },
    // passwordHash, internalNotes → never exposed via API
  },

  // Expose relations — same { select, true } syntax as DB queries and client requests
  expose: {
    organization: {
      select: { id: true, name: true },  // client can never see org.billingEmail, etc.
    },
    posts: true,  // expose entire relation
  },

  access: {
    read: (row, ctx) => row.orgId === ctx.tenant?.id,
    create: (data, ctx) => ctx.user?.role === 'admin',
    update: (row, ctx) => row.id === ctx.user?.id || ctx.user?.role === 'admin',
    delete: (_, ctx) => ctx.user?.role === 'admin',
  },

  handlers: {
    create: async (data, ctx) => {
      const user = await ctx.defaultHandler(data)
      await ctx.services.email.sendWelcome(user)
      return user
    },
  },

  // Custom actions alongside auto-CRUD
  // Generates: POST /api/users/:id/resetPassword
  actions: {
    resetPassword: async (id, data, ctx) => {
      const user = await ctx.db.users.get({ where: { id } })
      if (!user) return { ok: false, error: { type: 'not_found', code: 'entity_not_found', message: 'User not found' } }
      await ctx.services.auth.resetPassword(user, data.newPassword)
      return { ok: true, data: { success: true } }
    },
  },
})

// ─── File: organizations.domain.ts ──────────────────────────────────────
import { d } from '@vertz/db'
import { domain } from '@vertz/server'
import { orgsTable } from './schema'

export const Organization = domain('organizations', {
  type: 'persisted',
  table: d.entry(orgsTable),
  access: {
    read: (row, ctx) => row.id === ctx.tenant?.id,
  },
})

// ─── File: app.module.ts ────────────────────────────────────────────────
import { createModule } from '@vertz/server'
import { User } from './users.domain'
import { Organization } from './organizations.domain'
import { authMiddleware, tenantMiddleware } from './middleware'

export const appModule = createModule({
  domains: [User, Organization],
  // Middleware at module level — types flow from module context
  middleware: [authMiddleware(), tenantMiddleware()],
})

// ─── File: server.ts ────────────────────────────────────────────────────
import { createServer } from '@vertz/server'
import { appModule } from './app.module'

const app = createServer({
  modules: [appModule],
  apiPrefix: '/api/',  // default — configurable (e.g., '/v1/')
})
// Generates:
//   GET    /api/users
//   GET    /api/users/:id
//   POST   /api/users
//   PUT    /api/users/:id
//   DELETE /api/users/:id
//   POST   /api/users/:id/resetPassword   ← custom action
//   GET    /api/organizations
//   GET    /api/organizations/:id
//   POST   /api/organizations
//   PUT    /api/organizations/:id
//   DELETE /api/organizations/:id
```

---

## 3. Auto-CRUD Behavior

Each domain generates five CRUD endpoints plus any custom action endpoints. The domain name is used as-is for routes (no auto-pluralization). All endpoints return `Result` types (errors-as-values).

### 3.1 `GET /api/{domainName}` — List

**Request:**
```
GET /api/users?cursor=eyJpZCI6MTAwfQ==&limit=20
```

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `cursor` | string (opaque) | none | Pagination cursor from previous response |
| `limit` | number | 20 | Page size (1–100) |

**Response: `200 OK`**
```json
{
  "data": [
    { "id": "uuid-1", "name": "Alice", "email": "alice@example.com", "orgId": "org-1" },
    { "id": "uuid-2", "name": "Bob", "email": "bob@example.com", "orgId": "org-1" }
  ],
  "pagination": {
    "cursor": "eyJpZCI6InV1aWQtMiJ9",
    "hasMore": true,
    "total": 142
  }
}
```

**Behavior:**
1. Parse and validate query params (limit clamped to 1–100).
2. Execute `listAndCount` on the entity's table with cursor-based pagination.
3. Apply `access.read` filter: rows where `access.read(row, ctx)` returns `false` are **excluded from results** (not errored — the user simply doesn't see them).
4. If relations are requested (future — not in v1 beyond basic include), fetch exposed relations.
5. Encode the last row's ID as the next cursor (base64-encoded `{ id: lastRow.id }`).

**Error responses:**
| Status | When |
|--------|------|
| `400` | Invalid `limit` (not a number, < 1, > 100) or malformed `cursor` |
| `401` | No authenticated user (if entity has access rules requiring auth) |
| `500` | Internal error |

### 3.2 `GET /api/{domainName}/:id` — Get by ID

**Request:**
```
GET /api/users/uuid-123
```

**Response: `200 OK`**
```json
{
  "data": {
    "id": "uuid-123",
    "name": "Alice",
    "email": "alice@example.com",
    "orgId": "org-1",
    "organization": { "id": "org-1", "name": "Acme Inc." },
    "posts": [
      { "id": "post-1", "title": "Hello World" }
    ]
  }
}
```

**Behavior:**
1. Fetch row by ID using `get({ where: { id } })`.
2. If row not found → `404`.
3. Run `access.read(row, ctx)`. If `false` → `403`.
4. If `expose` lists relations, fetch them (one level deep, see §5).
5. Return the row with exposed relations populated.

**Error responses:**
| Status | When |
|--------|------|
| `401` | Unauthenticated |
| `403` | Access rule denied |
| `404` | Row not found |

### 3.3 `POST /api/{domainName}` — Create

**Request:**
```
POST /api/users
Content-Type: application/json

{
  "name": "Charlie",
  "email": "charlie@example.com",
  "orgId": "org-1"
}
```

**Response: `201 Created`**
```json
{
  "data": {
    "id": "uuid-new",
    "name": "Charlie",
    "email": "charlie@example.com",
    "orgId": "org-1",
    "createdAt": "2026-02-15T04:35:00.000Z",
    "updatedAt": "2026-02-15T04:35:00.000Z"
  }
}
```

**Behavior:**
1. Parse and validate request body against the table schema (see §9).
2. Run `access.create(data, ctx)`. If `false` → `403`.
3. If a custom `handlers.create` exists, call it with `(data, ctx)`.
4. Otherwise, call `db.create({ data })` using `@vertz/db` CRUD.
5. Return the created row.

**Error responses:**
| Status | When |
|--------|------|
| `400` | Validation failed (missing required fields, wrong types) |
| `401` | Unauthenticated |
| `403` | Access rule denied |
| `409` | Unique constraint violation |

### 3.4 `PUT /api/{domainName}/:id` — Update

**Request:**
```
PUT /api/users/uuid-123
Content-Type: application/json

{
  "name": "Alice Updated"
}
```

**Response: `200 OK`**
```json
{
  "data": {
    "id": "uuid-123",
    "name": "Alice Updated",
    "email": "alice@example.com",
    "orgId": "org-1",
    "updatedAt": "2026-02-15T05:00:00.000Z"
  }
}
```

**Behavior:**
1. Fetch existing row by ID. If not found → `404`.
2. Run `access.update(existingRow, ctx)`. If `false` → `403`.
3. Validate the partial body against the table schema (partial — only provided fields validated).
4. If a custom `handlers.update` exists, call it with `(id, data, ctx)`.
5. Otherwise, call `db.update({ where: { id }, data })`.
6. Return the updated row.

**Error responses:**
| Status | When |
|--------|------|
| `400` | Validation failed |
| `401` | Unauthenticated |
| `403` | Access rule denied |
| `404` | Row not found |
| `409` | Unique constraint violation |

### 3.5 `DELETE /api/{domainName}/:id` — Delete

**Request:**
```
DELETE /api/users/uuid-123
```

**Response: `200 OK`**
```json
{
  "data": {
    "id": "uuid-123",
    "name": "Alice",
    "email": "alice@example.com",
    "orgId": "org-1"
  }
}
```

**Behavior:**
1. Fetch existing row by ID. If not found → `404`.
2. Run `access.delete(existingRow, ctx)`. If `false` → `403`.
3. If a custom `handlers.delete` exists, call it with `(id, ctx)`.
4. Otherwise, call `db.deleteOne({ where: { id } })`.
5. Return the deleted row.

**Error responses:**
| Status | When |
|--------|------|
| `401` | Unauthenticated |
| `403` | Access rule denied |
| `404` | Row not found |

---

## 4. Access Rules

### 4.1 Evaluation Rules

1. **No access rules defined** → deny all operations (secure by default). An entity with no `access` object is inaccessible via auto-CRUD.
2. **Operation not defined in access** → deny that operation. E.g., if only `read` is defined, create/update/delete are denied.
3. **Access rule returns `false`** → `403 Forbidden`.
4. **Access rule throws** → `500 Internal Server Error` (log the error, don't expose details).

### 4.2 Evaluation Order per Request

```
1. Authentication middleware (populates ctx.user)
2. Tenant middleware (populates ctx.tenant)
3. Route handler:
   a. Parse/validate request
   b. For update/delete: fetch existing row
   c. Run access rule
   d. If denied → 403
   e. Execute operation (default or custom handler)
   f. Return response
```

### 4.3 Context Shape

The `ctx` object passed to access rules:

```ts
interface DomainContext {
  // From auth middleware
  user: {
    id: string
    role: string
    email?: string
    [key: string]: unknown
  } | null

  // From tenant middleware
  tenant: {
    id: string
    plan?: string
    [key: string]: unknown
  } | null

  // Request metadata
  request: {
    method: string
    path: string
    headers: Record<string, string>
    ip: string
  }
}
```

### 4.4 Sync-Only in v1

Access rules MUST be synchronous. This is a deliberate constraint:
- Enables future SQL translation (Phase 3 RLS generation)
- Prevents N+1 async calls during list filtering
- Keeps access checks fast (< 0.1ms per check)

If a developer needs async access logic, they should use a handler override instead.

### 4.5 List Filtering Behavior

For list endpoints, the access rule acts as a **filter**, not a gate:
- Fetch page of rows from DB
- Apply `access.read(row, ctx)` to each row
- Return only rows that pass
- This means a page of 20 might return fewer than 20 rows if some are filtered

**Known limitation:** This can result in inconsistent page sizes. Acceptable for v1. Phase 2 introduces query-level WHERE injection to handle this at the DB level.

### 4.6 Error Response for Access Denied

```json
{
  "error": {
    "type": "access_denied",
    "code": "entity_forbidden",
    "message": "You don't have permission to {operation} this {entity}",
    "entity": "user",
    "doc_url": "https://vertz.dev/docs/errors/entity_forbidden"
  }
}
```

---

## 5. Relation Exposure

### 5.1 How `expose` Works

Relations are defined in `@vertz/db` via `d.entry(table, relations)`. The entity's `expose` object selects which of those relations are queryable via the API, and optionally restricts which fields of the related entity are visible.

The `expose` configuration uses the **same `{ select, true }` syntax** as DB queries and client requests — one mental model across the entire stack.

```ts
const usersRelations = {
  organization: d.ref.one(() => orgsTable, 'orgId'),
  posts: d.ref.many(() => postsTable, 'authorId'),
  auditLogs: d.ref.many(() => auditLogsTable, 'userId'),  // sensitive!
}

const User = domain('user', {
  table: d.entry(usersTable, usersRelations),

  // Restrict own fields
  fields: {
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  },

  // Expose relations with optional field restrictions
  expose: {
    posts: true,  // expose all fields of the posts relation
    organization: {
      select: { id: true, name: true, logo: true },
      // Client can NEVER see org.billingEmail, org.taxId, etc.
    },
    // auditLogs: not listed → not exposed at all
  },
})
```

- Only `posts` and `organization` are fetchable via the API.
- `organization` is further restricted: only `id`, `name`, and `logo` are visible.
- `auditLogs` is invisible — not even referenceable.
- If `expose` is omitted entirely → NO relations exposed.
- If `expose: {}` → explicitly no relations (same effect, more intentional).
- `fields.select` restricts the entity's own columns — `passwordHash`, `internalNotes`, etc. are never returned.

**Type safety:** The `expose` object is fully typed from `d.entry()`. Only valid relation names are allowed (autocomplete works). Field names in `select` autocomplete from the related table's columns. If you expose `organization: { select: { name: true } }`, the client return type for `organization` only has `name` — attempting to access `organization.billingEmail` is a compile error.

### 5.2 Nested Fetching in v1

**v1 scope:** Relations are fetched **one level deep** on GET-by-ID requests only. No nested includes (e.g., no `user.posts.comments`).

**On GET by ID:**
- All exposed relations are automatically fetched and included in the response.
- `ref.one` relations: single JOIN or secondary query.
- `ref.many` relations: secondary query with a default limit of 20.
- If a relation has a `select` restriction, only those fields are fetched/returned.

**On list (GET collection):**
- Relations are **NOT** auto-included on list endpoints in v1 (too expensive).
- Future: `?include=organization` query param (Phase 2 / VertzQL).

### 5.3 Depth Limits

- v1: max depth = 1 (entity + its direct relations)
- No circular fetching protection needed at depth 1
- Phase 2 introduces configurable depth (default 2, max 4)

### 5.4 Access Rules on Relations

In v1, exposed relations are fetched without separate access checks. The parent entity's `access.read` is the gate. If you can read the user, you can see their exposed relations.

**Future (Phase 2+):** If the related entity also has access rules, those are applied. Relations the user can't read are returned as `null` with an entry in `_errors`.

---

## 6. Handler Overrides

### 6.1 Signature

Each handler override receives operation-specific arguments and the context:

```ts
handlers: {
  list: async (params, ctx) => { ... },    // params: { cursor?, limit?, where? }
  get: async (id, ctx) => { ... },          // id: string
  create: async (data, ctx) => { ... },     // data: Partial<Row>
  update: async (id, data, ctx) => { ... }, // id: string, data: Partial<Row>
  delete: async (id, ctx) => { ... },       // id: string
}
```

### 6.2 Default Handler Access

Inside a handler override, `ctx.defaultHandler(data)` calls the auto-generated implementation:

```ts
handlers: {
  create: async (data, ctx) => {
    // Pre-processing
    data.slug = slugify(data.name)
    
    // Delegate to auto-generated create
    const row = await ctx.defaultHandler(data)
    
    // Post-processing (side effects)
    await ctx.services.email.sendWelcome(row)
    await ctx.services.analytics.track('user_created', row)
    
    return row
  },
}
```

The default handler:
- For `create`: calls `db.create({ data })` and returns the row
- For `get`: calls `db.get({ where: { id } })` and returns the row
- For `update`: calls `db.update({ where: { id }, data })` and returns the row
- For `delete`: calls `db.deleteOne({ where: { id } })` and returns the deleted row
- For `list`: calls `db.listAndCount(...)` with pagination

### 6.3 Validation Still Applies

Even with handler overrides, input validation runs **before** the handler is called. The handler receives validated data. Access rules also run before the handler.

Execution order:
```
1. Parse request
2. Validate input (schema validation)
3. Run access rule (for update/delete: fetch row first)
4. Call handler (custom or default)
5. Return response
```

### 6.4 Return Value Contract

Handler overrides MUST return the same shape as the default handler:
- `create`, `get`, `update`, `delete` → return the entity row object
- `list` → return `{ data: Row[], pagination: PaginationMeta }`

If the handler returns `null` or `undefined`, the framework returns `404`.

---

## 7. Pagination

### 7.1 Cursor-Based

All list endpoints use cursor-based pagination. Cursors are opaque base64-encoded strings.

```ts
interface PaginationMeta {
  /** Opaque cursor for the next page. null if no more results. */
  cursor: string | null
  /** Whether more results exist beyond this page. */
  hasMore: boolean
  /** Total count of matching rows (computed via COUNT(*) OVER()). */
  total: number
}
```

### 7.2 Cursor Encoding

The cursor encodes the primary key of the last row in the page:

```ts
// Encode
const cursor = Buffer.from(JSON.stringify({ id: lastRow.id })).toString('base64url')

// Decode
const { id } = JSON.parse(Buffer.from(cursor, 'base64url').toString())
```

Uses `base64url` encoding (URL-safe, no padding).

### 7.3 Defaults and Limits

| Parameter | Default | Min | Max |
|-----------|---------|-----|-----|
| `limit` | 20 | 1 | 100 |

- Requests with `limit > 100` → clamped to 100 (no error, just cap).
- Requests with `limit < 1` → `400 Bad Request`.

### 7.4 Ordering

v1: results are ordered by `id` ascending (the cursor column). No custom ordering in v1.

Future (Phase 2): `?orderBy=createdAt:desc` with cursor encoding adjusted for the sort column.

### 7.5 Forward-Only

v1 supports forward pagination only (no `previousCursor`). Bidirectional pagination deferred to Phase 2.

---

## 8. Error Format

All errors use a consistent JSON structure, inspired by Stripe and RFC 7807.

### 8.1 Shape

```ts
interface ErrorResponse {
  error: {
    /** Error category */
    type: 'validation_error' | 'access_denied' | 'not_found' | 'conflict' | 'internal_error'
    /** Machine-readable error code */
    code: string
    /** Human-readable message */
    message: string
    /** The entity this error relates to (if applicable) */
    entity?: string
    /** Specific field (for validation errors) */
    field?: string
    /** Link to documentation */
    doc_url?: string
    /** Validation details (for validation_error type) */
    details?: Array<{ field: string; message: string; code: string }>
  }
}
```

### 8.2 Error Codes

| HTTP Status | type | code | When |
|-------------|------|------|------|
| `400` | `validation_error` | `invalid_body` | Request body fails schema validation |
| `400` | `validation_error` | `invalid_params` | Invalid query parameters |
| `401` | `access_denied` | `unauthenticated` | No auth token or invalid token |
| `403` | `access_denied` | `entity_forbidden` | Access rule returned false |
| `404` | `not_found` | `entity_not_found` | Row with given ID doesn't exist |
| `409` | `conflict` | `unique_violation` | Unique constraint violated |
| `500` | `internal_error` | `internal` | Unexpected error (details hidden) |

### 8.3 Validation Error Example

```json
{
  "error": {
    "type": "validation_error",
    "code": "invalid_body",
    "message": "Request body validation failed",
    "entity": "user",
    "details": [
      { "field": "email", "message": "Must be a valid email address", "code": "invalid_format" },
      { "field": "name", "message": "Required", "code": "required" }
    ]
  }
}
```

---

## 9. Validation

### 9.1 Schema-Derived Validation

Validation schemas are automatically derived from the `@vertz/db` table definition. The column types in `d.table()` map to validation rules:

| Column Type | Validation |
|-------------|-----------|
| `d.uuid()` | Valid UUID v4 string |
| `d.text()` | Non-null string |
| `d.varchar(N)` | String, max length N |
| `d.email()` | Valid email format |
| `d.boolean()` | Boolean |
| `d.integer()` | Integer number |
| `d.decimal(P,S)` | Numeric string with correct precision/scale |
| `d.timestamp()` | ISO 8601 datetime string |
| `d.enum(name, values)` | One of the defined values |
| `d.jsonb()` | Valid JSON; if validator provided, apply it |
| `d.tenant()` | Valid UUID (tenant reference) |

### 9.2 Create vs Update Validation

- **Create**: All non-nullable, non-default columns are required. Columns with `.default()` or `.nullable()` are optional.
- **Update**: All columns are optional (partial update). Provided columns are validated.
- **ID column** (`id`): never accepted in create body (auto-generated), never accepted in update body (immutable).
- **Timestamp columns** (`createdAt`, `updatedAt`): never accepted in request body (managed by DB layer).

### 9.3 Implementation

Use the table's column metadata to build a validation function at entity registration time (not per-request):

```ts
// Pseudocode — built once during entity registration
function buildValidator(table: TableDef): {
  validateCreate: (data: unknown) => { valid: boolean; errors: ValidationError[] }
  validateUpdate: (data: unknown) => { valid: boolean; errors: ValidationError[] }
}
```

---

## 10. Configuration

### 10.1 Route Prefix

```ts
const app = createServer({
  modules: [appModule],
  apiPrefix: '/api/',       // default
  // apiPrefix: '/v1/',     // custom prefix
})
```

Generated routes: `{apiPrefix}{domainName}` and `{apiPrefix}{domainName}/:id`.

### 10.2 Route Naming — No Auto-Pluralization

Domain names are used **as-is** for routes. No auto-pluralization. The developer chooses the route name by choosing the domain name:

```ts
// Domain name IS the route segment
const users = domain('users', { ... })       // → /api/users
const person = domain('person', { ... })     // → /api/person
const categories = domain('categories', { ... }) // → /api/categories
```

This eliminates an entire class of bugs (wrong pluralization) and makes route naming explicit and predictable.

### 10.3 Module-Level Middleware

Middleware is defined at the **module level**, not the domain level. This ensures types flow correctly from module context into domain handlers and access rules.

```ts
// app.module.ts
const appModule = createModule({
  domains: [User, Organization],
  middleware: [authMiddleware(), tenantMiddleware()],  // applies to all domains in this module
})
```

### 10.4 Disabling Specific Operations

Not in v1 scope. Workaround: define an access rule that always returns `false` for the operation you want to disable:

```ts
access: {
  read: (row, ctx) => true,
  create: () => false,   // disables create
  update: () => false,   // disables update
  delete: () => false,   // disables delete
}
```

---

## 11. Testing Strategy

### 11.1 TDD Approach

Tests are written BEFORE implementation. Each test file covers one concern.

### 11.2 Test Plan

```
packages/server/src/domain/__tests__/
├── domain-definition.test.ts       # domain() returns correct DomainDefinition with type field
├── module-definition.test.ts       # createModule() groups domains with middleware
├── route-generation.test.ts        # createServer registers correct routes (no auto-pluralize)
├── custom-actions.test.ts          # POST /api/{domainName}/:id/{action} endpoints
├── result-type.test.ts             # Result<T> pattern — ok/err helpers, error shapes
├── crud-list.test.ts               # GET /api/{domainName} — pagination, filtering
├── crud-get.test.ts                # GET /api/{domainName}/:id — found, not found
├── crud-create.test.ts             # POST /api/{domainName} — validation, creation
├── crud-update.test.ts             # PUT /api/{domainName}/:id — partial update
├── crud-delete.test.ts             # DELETE /api/{domainName}/:id
├── access-rules.test.ts           # Access rule enforcement (sync-only)
├── access-deny-default.test.ts    # No access rules → deny all
├── relation-exposure.test.ts      # expose: relations included/excluded
├── handler-overrides.test.ts      # Custom handlers, defaultHandler access
├── validation.test.ts             # Schema-derived validation (create + update)
├── error-format.test.ts           # Consistent error response shape (Result pattern)
├── pagination.test.ts             # Cursor encoding/decoding, limits, hasMore
└── integration.test.ts            # Full server with modules + multiple domains
```

### 11.3 Key Test Cases

**Access rules — deny by default:**
```ts
test('entity with no access rules denies all operations', async () => {
  const Locked = domain('locked', { type: 'persisted', table: d.entry(someTable) })
  const app = createServer({ domains: [Locked] })
  
  const res = await app.request('/api/locked')
  expect(res.status).toBe(403)
})
```

**Access rules — list filtering:**
```ts
test('list excludes rows that fail access.read', async () => {
  // Seed: 3 rows, 2 in org-1, 1 in org-2
  // ctx.tenant.id = 'org-1'
  // Expect: only 2 rows returned
})
```

**Relation exposure — secure by default:**
```ts
test('entity without expose returns no relations', async () => {
  const User = domain('users', {
    type: 'persisted',
    table: d.entry(usersTable, usersRelations),
    access: { read: () => true },
    // no expose
  })
  
  const res = await getUser(userId)
  expect(res.data.organization).toBeUndefined()
  expect(res.data.posts).toBeUndefined()
})
```

**Handler override with defaultHandler:**
```ts
test('custom create handler can call defaultHandler', async () => {
  let sideEffectRan = false
  const User = domain('users', {
    type: 'persisted',
    table: d.entry(usersTable),
    access: { create: () => true },
    handlers: {
      create: async (data, ctx) => {
        const user = await ctx.defaultHandler(data)
        sideEffectRan = true
        return user
      },
    },
  })
  
  await createUser({ name: 'Test' })
  expect(sideEffectRan).toBe(true)
})
```

---

## 12. Migration Path

### 12.1 Opt-In Adoption

Entities are **additive**. Existing `@vertz/server` apps continue working unchanged. Adding `domains` to `createServer()` simply registers additional routes.

```ts
// Before: manual routes only
const app = createServer({
  modules: [authModule, myRoutes],
})

// After: domains + manual routes coexist
const app = createServer({
  modules: [authModule, myRoutes],
  domains: [User, Organization],  // adds /api/users, /api/organizations
})
```

### 12.2 Incremental Migration

Developers can migrate one entity at a time:
1. Define `domain()` for one table.
2. Verify auto-CRUD matches existing behavior.
3. Remove manual routes for that entity.
4. Repeat for next entity.

### 12.3 Route Conflicts

If a manually defined route conflicts with an auto-generated entity route, the manual route wins (registered first). A warning is logged at startup:

```
[vertz] Warning: Route GET /api/users conflicts with entity 'user' auto-CRUD. Manual route takes precedence.
```

---

## 13. File Structure

### 13.1 User-Facing File Convention

Domain files use the `*.domain.ts` convention. Modules use `*.module.ts`:

```
src/
├── users.domain.ts           # domain('users', { type: 'persisted', ... })
├── organizations.domain.ts   # domain('organizations', { type: 'persisted', ... })
├── app.module.ts             # createModule({ domains: [...], middleware: [...] })
├── server.ts                 # createServer({ modules: [...] })
└── schema.ts                 # d.table(), d.entry() definitions
```

### 13.2 Internal Package Structure

```
packages/server/src/domain/
├── index.ts                  # Public API: domain(), createModule(), DomainDefinition type
├── types.ts                  # All TypeScript types (AccessRules, HandlerOverrides, Result, etc.)
├── domain.ts                 # domain() implementation
├── module.ts                 # createModule() implementation
├── register.ts               # registerDomains() — adds routes to server
├── actions.ts                # Custom action route generation
├── handlers/
│   ├── list.ts               # Default list handler
│   ├── get.ts                # Default get handler
│   ├── create.ts             # Default create handler
│   ├── update.ts             # Default update handler
│   └── delete.ts             # Default delete handler
├── access.ts                 # Access rule evaluation
├── validation.ts             # Schema-derived validation builder
├── pagination.ts             # Cursor encode/decode utilities
├── result.ts                 # Result type utilities (ok(), err())
├── errors.ts                 # Domain-specific error builders
└── __tests__/                # All test files (see §11)
```

The public export from `@vertz/server` adds:
```ts
// packages/server/src/index.ts
export { domain, createModule } from './domain'
export type { DomainDefinition, DomainOptions, AccessRules, Result, DomainError } from './domain/types'
```

---

## 14. Open Questions

1. **Access rule on list: filter vs reject.** Current decision: filter (exclude rows silently). Alternative: if ANY row is denied, the whole request fails. Filter is more useful but means page sizes vary. Confirm this is acceptable.

2. **PUT vs PATCH semantics.** Spec uses PUT with partial body (PATCH semantics). Should we use PATCH instead? Or support both? Leaning toward `PATCH` for partial updates and reserving `PUT` for full replacement. **Decision needed.**

3. **Tenant scoping built-in.** Should entity auto-CRUD automatically inject `WHERE orgId = ctx.tenant.id` if the table has a `d.tenant()` column? This would make multi-tenant filtering automatic. Leaning yes — aligns with Zeroth Law.

4. **Default sort order.** Currently `id ASC`. Should it be `createdAt DESC` (most recent first)? Most APIs default to newest-first for list endpoints.

5. **Soft delete.** Should domains support a `softDelete: true` option that uses `deletedAt` instead of hard delete? Deferred to Phase 2 but the schema should not preclude it.

6. **Batch create.** `POST /api/users` with an array body to create multiple rows. Not in v1 but should the route handler reject arrays explicitly (clear error) or silently accept single objects only?

7. **ETag / If-Match for optimistic concurrency.** Useful for update/delete to prevent lost updates. Likely Phase 2 but worth considering in response headers now.

---

*This spec is ready for implementation. Start with the test files (§11), then implement against them.*
