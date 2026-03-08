# Unified Access System — Design Document

> **Status:** Draft  
> **Authors:** Vinicius (CTO), Mika (VP Eng)  
> **Date:** 2026-02-15  
> **Last updated:** 2026-02-15  
> **Related:** [`plans/entity-aware-api.md`](./entity-aware-api.md) (Entity-Aware API Design)

---

## Table of Contents

1. [Vision & Problem Statement](#1-vision--problem-statement)
2. [The Unified Access Model](#2-the-unified-access-model)
3. [Resource Hierarchy & Closure Table](#3-resource-hierarchy--closure-table)
4. [Role System](#4-role-system)
5. [Entitlements](#5-entitlements)
6. [Plans & Limits](#6-plans--limits)
7. [Consumption Wallet](#7-consumption-wallet)
8. [The `ctx.can()` API](#8-the-ctxcan-api)
9. [Compiler Responsibilities](#9-compiler-responsibilities)
10. [Caching Strategy](#10-caching-strategy)
11. [Performance Analysis](#11-performance-analysis)
12. [Type System](#12-type-system)
13. [Comparison with Existing Solutions](#13-comparison-with-existing-solutions)
14. [Implementation Phases](#14-implementation-phases)
15. [Open Questions](#15-open-questions)

---

## 1. Vision & Problem Statement

### The Problem

Authorization in modern applications is fragmented across at least five independent systems:

| System | What it answers | Typical tool |
|--------|----------------|--------------|
| **RBAC** | "Does this user have the `admin` role?" | Hand-rolled or framework auth |
| **Feature flags** | "Is this feature enabled for this tenant?" | LaunchDarkly, Unleash |
| **Entitlements** | "Is this user allowed to export projects?" | Custom middleware |
| **Billing / Plans** | "Is this org on the Enterprise plan?" | Stripe metadata checks |
| **Usage limits** | "Has this org exceeded 1000 API calls this month?" | Redis counters + custom logic |
| **Resource-level access** | "Can this user see *this specific* project?" | Zanzibar, Oso, hand-rolled |

Each system has its own data store, its own caching story, its own invalidation mechanism, and its own API. A single user action—say, exporting a project—may require checks against *all six*. The developer writes six `if` statements scattered across middleware, controllers, and business logic. Some are cached. Some aren't. Some are checked at the edge. Some hit the database. Nobody knows the full picture.

### The Vision

Vertz collapses all six systems into **one unified access model** with **one API**:

```ts
const allowed = await ctx.can('project:export', project)
```

This single call resolves:

1. **RBAC** — Does the user have a role that grants `project:export`?
2. **Resource hierarchy** — Does the user have access to *this specific* project (via org → team → project)?
3. **Entitlements** — Is `project:export` an entitlement the user possesses?
4. **Plan** — Is the org on a plan that includes `project:export`?
5. **Usage limits** — Has the org exceeded its export quota for this billing period?
6. **Feature flags** — Is the export feature enabled for this tenant/environment?

One call. One system. One caching strategy. One invalidation path. Full type safety.

### Why Now

At Blimu (CTO's prior company), we built a version of this system. It worked, but it had a critical limitation: Blimu didn't own the database. Every resource registration required an API call. Every hierarchy mutation required a network round-trip. The closure table was maintained externally.

**Vertz owns the database.** We generate the schema. We generate the migrations. We generate the RLS policies. Entity hooks maintain the hierarchy graph automatically. The compiler knows every resource type, every entitlement, every role at build time. This is the environment where a unified access system can actually work.

---

## 2. The Unified Access Model

### Five Layers, One System

The access system is conceptually layered, but the developer interacts with a single surface:

```
┌─────────────────────────────────────────────────┐
│                  ctx.can()                        │
│         (single entry point for all checks)       │
├─────────────────────────────────────────────────┤
│  Layer 1: RBAC                                    │
│  - Precomputed role → entitlement mappings        │
│  - Edge-cacheable                                 │
│  - Handles ~90% of checks                         │
├─────────────────────────────────────────────────┤
│  Layer 2: Resource Hierarchy (Zanzibar-style)     │
│  - Closure table resolves ancestry                │
│  - Cached per-request                             │
│  - "Can user X access resource Y via parent Z?"   │
├─────────────────────────────────────────────────┤
│  Layer 3: Entitlements + Plans                    │
│  - Plan determines available entitlements         │
│  - Cacheable per-org (changes rarely)             │
├─────────────────────────────────────────────────┤
│  Layer 4: Consumption / Limits                    │
│  - Wallet tracks usage per entitlement            │
│  - Dynamic — hits Redis/DB                        │
│  - NOT edge-cacheable                             │
├─────────────────────────────────────────────────┤
│  Layer 5: Feature Flags                           │
│  - Environment/tenant-level toggles               │
│  - Cacheable, WebSocket-invalidated               │
└─────────────────────────────────────────────────┘
```

### Resolution Order

`ctx.can()` evaluates layers top-down and **short-circuits**:

1. **Feature flag check** — If the feature is globally disabled, return `false`. No further checks. (Cheapest check, avoids unnecessary work.)
2. **RBAC check** — Resolve user's effective role for the target resource. Map role → entitlements. If the role grants the entitlement, proceed. If the role explicitly denies it, return `false`.
3. **Hierarchy check** — If the entitlement is resource-scoped, verify the user has a path to the target resource through the hierarchy (closure table lookup).
4. **Plan check** — Verify the org's plan includes this entitlement. If not, return `false`.
5. **Consumption check** — If the entitlement has a usage limit, check the wallet. If over limit, return `false`.

If all layers pass, return `true`.

### Why This Order

- Feature flags are a binary lookup (O(1), in-memory). Check first to avoid all other work.
- RBAC handles 90% of cases. Most checks resolve here.
- Hierarchy is the next most common (resource-scoped access).
- Plan and consumption are the rarest and most expensive. Check last.

---

## 3. Resource Hierarchy & Closure Table

### The Problem

Resources form trees: Organizations contain Teams, Teams contain Projects, Projects contain Tasks. When a user is an admin of an Organization, they should automatically have access to everything within it. When a user is a viewer on a Team, they should be able to read that team's Projects.

Naive recursive queries (`WITH RECURSIVE`) are slow and unpredictable. They don't cache well, and their cost grows with hierarchy depth.

### Closure Table

A closure table precomputes **all** ancestor/descendant relationships with depth:

```sql
CREATE TABLE resource_closure (
  ancestor_type   TEXT NOT NULL,
  ancestor_id     UUID NOT NULL,
  descendant_type TEXT NOT NULL,
  descendant_id   UUID NOT NULL,
  depth           INT NOT NULL,
  PRIMARY KEY (ancestor_type, ancestor_id, descendant_type, descendant_id)
);

-- Indexes for both directions
CREATE INDEX idx_closure_descendant ON resource_closure (descendant_type, descendant_id);
CREATE INDEX idx_closure_ancestor ON resource_closure (ancestor_type, ancestor_id);
```

**Example data** for `Org A → Team B → Project C`:

| ancestor_type | ancestor_id | descendant_type | descendant_id | depth |
|---------------|-------------|-----------------|---------------|-------|
| organization  | A           | organization    | A             | 0     |
| organization  | A           | team            | B             | 1     |
| organization  | A           | project         | C             | 2     |
| team          | B           | team            | B             | 0     |
| team          | B           | project         | C             | 1     |
| project       | C           | project         | C             | 0     |

**Query: "All resources user X can access"** becomes a simple JOIN between the user's role assignments and the closure table. No recursion.

### Opt-In Hierarchy

**Not every entity needs to participate in the closure table.** A `Comment` on a `Project` doesn't need its own row in the closure table — it inherits access from its parent Project. Only entities that:

1. Have their **own role assignments**, or
2. Are **targets of entitlement checks**, or
3. Are **intermediate nodes** in the hierarchy

...participate in the closure table. This keeps the table small and fast.

```ts
// Project participates in hierarchy (has roles, is a hierarchy node)
const Project = domain('project', {
  table: d.entry(projectsTable, projectRelations),
  access: {
    read: (row, ctx) => ctx.can('project:view', row),
    update: (row, ctx) => ctx.can('project:edit', row),
  },
})

// Comment does NOT participate — references parent's entitlement
const Comment = domain('comment', {
  table: d.entry(commentsTable),
  access: {
    read: (row, ctx) => ctx.can('project:view', row.projectId),
  },
})
```

As described in the [Entity-Aware API doc](./entity-aware-api.md) (§5.3), entities can declare a `parent` for hierarchical access inheritance. The access system uses this declaration to determine which entities need closure table entries.

### Hierarchy Maintenance

Since Vertz owns the database and generates entity hooks (see [Entity-Aware API doc](./entity-aware-api.md) §4.2), the closure table is maintained automatically:

- **On entity create:** Insert self-reference row (depth 0) + rows for all ancestors (computed from parent chain).
- **On entity delete:** Remove all rows where the entity is an ancestor or descendant.
- **On reparent (move):** Delete old ancestry rows, insert new ones. This is the expensive case — bounded by `O(subtree_size × ancestor_count)`.

These operations are generated by the compiler as part of the entity's mutation hooks. The developer never writes closure table maintenance code.

### Depth Cap

Hierarchy depth is capped at **4 levels** (as decided in [Entity-Aware API doc](./entity-aware-api.md) §13.5). Beyond 4 levels, the recommendation is to flatten the hierarchy or adopt Zanzibar-style relationship tuples for the deeper branches.

---

## 4. Role System

### 4.1 Role Definition

Roles are defined per resource type in the hierarchy:

```ts
const auth = defineAccess({
  hierarchy: [Organization, Team, Project, Task],
  roles: {
    Organization: ['owner', 'admin', 'member'],
    Team: ['lead', 'editor', 'viewer'],
    Project: ['manager', 'contributor', 'viewer'],
    Task: ['assignee', 'viewer'],
  },
})
```

Roles are stored as assignments:

```sql
CREATE TABLE role_assignments (
  user_id       UUID NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   UUID NOT NULL,
  role          TEXT NOT NULL,
  PRIMARY KEY (user_id, resource_type, resource_id, role)
);
```

### 4.2 Role Inheritance

When a user has a role on a parent resource, they automatically receive a mapped role on child resources:

```ts
const auth = defineAccess({
  // ...
  inheritance: {
    Organization: {
      owner: 'lead',      // org.owner → team.lead
      admin: 'editor',    // org.admin → team.editor
      member: 'viewer',   // org.member → team.viewer
    },
    Team: {
      lead: 'manager',    // team.lead → project.manager
      editor: 'contributor',
      viewer: 'viewer',
    },
    Project: {
      manager: 'assignee', // project.manager → task.assignee
      contributor: 'assignee',
      viewer: 'viewer',
    },
  },
})
```

**Resolution algorithm:**

1. Look up the user's **direct role assignments** for the target resource.
2. Walk up the closure table to find all ancestor resources.
3. For each ancestor where the user has a role, apply the inheritance mapping to compute the **effective role** at the target resource level.
4. The user's effective role is the **most permissive** role from all paths (direct + inherited).

**Example:** User has `admin` on Org A. Org A contains Team B. The inheritance map says `admin → editor`. User's effective role on Team B is `editor` (unless they also have a direct `lead` assignment on Team B, in which case it's `lead`).

### 4.3 Role-to-Entitlement Mapping

Roles grant entitlements. This mapping is defined centrally:

```ts
const auth = defineAccess({
  // ...
  entitlements: {
    'project:view':   { roles: ['viewer', 'contributor', 'manager', 'lead', 'editor', 'admin', 'owner'] },
    'project:edit':   { roles: ['contributor', 'manager', 'lead', 'editor', 'admin', 'owner'] },
    'project:delete': { roles: ['manager', 'admin', 'owner'] },
    'project:export': { roles: ['manager'], plans: ['enterprise'] },
    'team:invite':    { roles: ['lead', 'admin', 'owner'] },
  },
})
```

Note that `project:export` has both a `roles` requirement AND a `plans` requirement. Both must be satisfied.

### 4.4 Role Storage & Precomputation

At session initialization (login or token refresh), the user's effective roles for all accessible resources are precomputed:

```ts
// Precomputed at session start
type UserAccessSet = {
  roles: Map<`${ResourceType}:${ResourceId}`, Role[]>
  entitlements: Set<Entitlement>  // Plan-level entitlements
  orgPlan: PlanId
}
```

This set is cached in the session and invalidated via WebSocket when role assignments change.

---

## 5. Entitlements

### 5.1 Namespacing

Entitlements follow a `resource:action` naming convention:

```
project:view
project:edit
project:create
project:export
project:delete
team:invite
team:manage
org:billing
org:audit-log
```

The namespace prefix is the **resource type** that the entitlement applies to. The action is the **operation**. This convention is enforced by the type system — the compiler rejects entitlements that reference unknown resource types.

### 5.2 Entitlement Sources

An entitlement can be granted by multiple sources. **All applicable sources must agree** (AND logic for restrictive sources, OR logic for granting sources):

| Source | Logic | Example |
|--------|-------|---------|
| **Role** | OR — any matching role grants it | User has `manager` role → gets `project:export` |
| **Plan** | AND — plan must include it | Org must be on `enterprise` plan |
| **Feature flag** | AND — flag must be enabled | `export-v2` flag must be on |
| **Custom rule** | AND — rule must pass | Custom function for edge cases |

Resolution: `(any role grants) AND (plan includes OR no plan requirement) AND (flag enabled OR no flag requirement) AND (custom rule passes OR no custom rule)`.

### 5.3 Resource-Scoped vs Global Entitlements

Some entitlements are scoped to a specific resource instance, others are global:

```ts
// Resource-scoped: "Can this user export THIS project?"
ctx.can('project:export', project)

// Global: "Can this user create projects?" (no specific resource)
ctx.can('project:create')

// Org-scoped: "Can this user access billing for THIS org?"
ctx.can('org:billing', organization)
```

For resource-scoped checks, the hierarchy is consulted. For global checks, only role and plan are checked.

### 5.4 Entitlement Declaration

Entitlements are declared in `defineAccess` and referenced in entity definitions:

```ts
// Declaration
const auth = defineAccess({
  entitlements: {
    'project:export': {
      roles: ['manager'],
      plans: ['enterprise'],
      description: 'Export project data as CSV/JSON',
    },
    'team:invite': {
      roles: ['lead', 'admin'],
      description: 'Invite new members to a team',
    },
  },
})

// Usage in entity (see entity-aware-api.md §5.2)
const Project = domain('project', {
  table: d.entry(projectsTable, projectRelations),
  access: {
    read: (row, ctx) => ctx.can('project:view', row),
    update: (row, ctx) => ctx.can('project:edit', row),
    delete: (row, ctx) => ctx.can('project:delete', row),
  },
  actions: {
    export: {
      access: (row, ctx) => ctx.can('project:export', row),
      handler: async (row, ctx) => { /* ... */ },
    },
  },
})
```

---

## 6. Plans & Limits

### 6.1 Design Philosophy

Plans are designed now but implemented later. The access system must accommodate plans without requiring them — an app with no plan definitions should work identically (all plan checks pass by default).

**Key insight from Blimu:** Plans define **limits**, not entitlements. Two plans might both have `project:create`, but the `free` plan limits it to 5/month while `pro` allows 100/month. The entitlement is the same. The limit differs.

### 6.2 Plan Definition

```ts
const plans = definePlans({
  free: {
    entitlements: ['project:create', 'project:view', 'project:edit'],
    limits: {
      'project:create': { per: 'month', max: 5 },
      'team:invite': { per: 'month', max: 10 },
      'storage:upload': { per: 'month', max: 1_000_000_000 }, // 1GB in bytes
    },
  },
  pro: {
    entitlements: ['project:create', 'project:view', 'project:edit', 'project:export'],
    limits: {
      'project:create': { per: 'month', max: 100 },
      'team:invite': { per: 'month', max: 100 },
      'storage:upload': { per: 'month', max: 50_000_000_000 }, // 50GB
    },
  },
  enterprise: {
    entitlements: ['project:create', 'project:view', 'project:edit', 'project:export', 'org:audit-log', 'org:sso'],
    limits: {
      'project:create': { per: 'month', max: Infinity },
      'team:invite': { per: 'month', max: Infinity },
      'storage:upload': { per: 'month', max: Infinity },
    },
  },
})
```

### 6.3 Per-Customer Overrides

Eventually (Gleam-style), individual customers can have limit overrides:

```ts
// Future API
await setCustomerOverride(orgId, {
  'project:create': { per: 'month', max: 200 }, // Override pro's 100 limit
})
```

Override resolution: `customer override > plan limit > default (Infinity if no limit defined)`.

### 6.4 Plan Assignment

Plans are assigned at the organization level:

```sql
CREATE TABLE org_plans (
  org_id      UUID PRIMARY KEY,
  plan_id     TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  overrides   JSONB DEFAULT '{}'  -- Per-customer limit overrides
);
```

---

## 7. Consumption Wallet

### 7.1 Purpose

The wallet tracks **how much of each limited entitlement an org has consumed** in the current billing period. It's the dynamic counterpart to the static plan definition.

### 7.2 Schema

```sql
CREATE TABLE consumption_wallet (
  org_id        UUID NOT NULL,
  entitlement   TEXT NOT NULL,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  consumed      BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, entitlement, period_start)
);

CREATE INDEX idx_wallet_active ON consumption_wallet (org_id, entitlement, period_end)
  WHERE period_end > NOW();
```

### 7.3 Operations

**Increment (on action):**

```ts
// Called by ctx.can() when the check passes and the entitlement has a limit
async function incrementWallet(orgId: string, entitlement: string, amount: number = 1): Promise<boolean> {
  // Atomic increment with limit check
  const result = await db.execute(sql`
    UPDATE consumption_wallet
    SET consumed = consumed + ${amount}
    WHERE org_id = ${orgId}
      AND entitlement = ${entitlement}
      AND period_end > NOW()
      AND consumed + ${amount} <= ${getLimit(orgId, entitlement)}
    RETURNING consumed
  `)
  return result.rowCount > 0
}
```

The increment is **atomic** — the limit check and increment happen in the same UPDATE. No race conditions.

**Check (read-only):**

```ts
async function checkWallet(orgId: string, entitlement: string): Promise<{ consumed: number; limit: number; remaining: number }> {
  // ...
}
```

**Reset (period rollover):**

New wallet rows are created at the start of each billing period. A cron job or lazy initialization creates them. Old rows are retained for audit/analytics.

### 7.4 Redis Acceleration

For high-frequency entitlements (e.g., API rate limits), the wallet can be backed by Redis instead of Postgres:

```
INCR wallet:{orgId}:{entitlement}:{period}
EXPIREAT wallet:{orgId}:{entitlement}:{period} {periodEnd}
```

The choice of backend is per-entitlement, configured in the plan definition:

```ts
limits: {
  'api:request': { per: 'minute', max: 1000, backend: 'redis' },
  'project:create': { per: 'month', max: 5, backend: 'postgres' },
}
```

---

## 8. The `ctx.can()` API

### 8.1 Signature

```ts
interface AccessContext {
  /** Check if the current user can perform an action */
  can(entitlement: Entitlement): Promise<boolean>
  can(entitlement: Entitlement, resource: Resource): Promise<boolean>
  can(entitlement: Entitlement, resourceId: string): Promise<boolean>

  /** Check and throw if denied */
  authorize(entitlement: Entitlement, resource?: Resource): Promise<void>

  /** Check and increment wallet (for limited entitlements) */
  canAndConsume(entitlement: Entitlement, resource?: Resource, amount?: number): Promise<boolean>

  /** Bulk check — returns a map of entitlement → boolean */
  canAll(checks: Array<{ entitlement: Entitlement; resource?: Resource }>): Promise<Map<string, boolean>>
}
```

### 8.2 Resolution Flow (Detailed)

```ts
async function can(ctx: Context, entitlement: Entitlement, resource?: Resource): Promise<boolean> {
  // 1. Feature flag check
  if (!featureFlags.isEnabled(entitlement, ctx.tenant)) {
    return false
  }

  // 2. RBAC — resolve effective role
  const effectiveRole = resolveEffectiveRole(ctx.user, resource)
  const entitlementDef = getEntitlementDef(entitlement)

  // 3. Role check
  const roleGranted = effectiveRole && entitlementDef.roles.includes(effectiveRole)
  if (!roleGranted && entitlementDef.roles.length > 0) {
    return false
  }

  // 4. Hierarchy check (resource-scoped only)
  if (resource) {
    const hasPath = await checkHierarchyAccess(ctx.user, resource)
    if (!hasPath) return false
  }

  // 5. Plan check
  if (entitlementDef.plans && entitlementDef.plans.length > 0) {
    const orgPlan = await getOrgPlan(ctx.tenant.id)
    if (!entitlementDef.plans.includes(orgPlan)) {
      return false
    }
  }

  // 6. Consumption check (if entitlement has limits)
  const limit = await getLimit(ctx.tenant.id, entitlement)
  if (limit !== Infinity) {
    const wallet = await checkWallet(ctx.tenant.id, entitlement)
    if (wallet.consumed >= limit) {
      return false
    }
  }

  return true
}
```

### 8.3 Integration with Entity Access Rules

As described in the [Entity-Aware API doc](./entity-aware-api.md) (§5.2), entity access rules use `ctx.can()`:

```ts
const Project = domain('project', {
  table: d.entry(projectsTable, projectRelations),
  access: {
    read: (row, ctx) => ctx.can('project:view', row),
    update: (row, ctx) => ctx.can('project:edit', row),
    delete: (row, ctx) => ctx.can('project:delete', row),
  },
})
```

The entity layer calls these access functions before every operation. If `ctx.can()` returns `false`, the operation is denied with a structured error (see [Entity-Aware API doc](./entity-aware-api.md) §13.11).

### 8.4 Query-Level Filtering

For list operations, rather than fetching all rows and filtering, `ctx.can()` can be translated to SQL WHERE clauses:

```ts
// Instead of: fetch all projects → filter by access
// We do: inject WHERE clause based on user's access set
const accessibleProjectIds = ctx.user.accessSet.getResourceIds('project', 'view')
const projects = await db.project.list({
  where: { id: { in: accessibleProjectIds } },
})
```

This is the "precomputed access sets" strategy from the [Entity-Aware API doc](./entity-aware-api.md) §5.4. The compiler generates the appropriate WHERE clause injection based on the entity's access rules.

### 8.5 `canAndConsume` — Atomic Check + Increment

For limited entitlements, checking and consuming must be atomic to avoid race conditions:

```ts
// Non-atomic (BAD — race condition)
if (await ctx.can('project:create')) {
  await incrementWallet(orgId, 'project:create')
  await createProject(data)
}

// Atomic (GOOD)
if (await ctx.canAndConsume('project:create')) {
  await createProject(data)
}
```

`canAndConsume` performs the full `can()` check and, if successful, atomically increments the wallet. If the wallet increment fails (limit reached between check and increment), it returns `false`.

---

## 9. Compiler Responsibilities

### 9.1 What the Compiler Generates

The Vertz compiler (see [`plans/vertz-compiler-design.md`](./vertz-compiler-design.md)) generates the following from `defineAccess()` and `definePlans()`:

| Artifact | Description |
|----------|-------------|
| **Closure table migration** | `CREATE TABLE resource_closure` + indexes |
| **Role assignment table** | `CREATE TABLE role_assignments` + indexes |
| **Wallet table** | `CREATE TABLE consumption_wallet` + indexes |
| **Plan table** | `CREATE TABLE org_plans` |
| **RLS policies** | Postgres Row-Level Security policies per entity (defense in depth) |
| **Entity hooks** | `afterCreate`, `afterDelete`, `afterUpdate` hooks that maintain the closure table |
| **Role resolution queries** | Optimized SQL for resolving effective roles via closure table |
| **TypeScript types** | `Entitlement`, `Role`, `ResourceType` union types |
| **Client types** | Typed `ctx.can()` with autocomplete on entitlement names |

### 9.2 Closure Table Maintenance Hooks

For every entity in the hierarchy, the compiler generates hooks:

```ts
// Generated by compiler for Project entity
const projectHooks = {
  afterCreate: async (project, ctx) => {
    // Insert self-reference
    await db.execute(sql`
      INSERT INTO resource_closure (ancestor_type, ancestor_id, descendant_type, descendant_id, depth)
      VALUES ('project', ${project.id}, 'project', ${project.id}, 0)
    `)
    // Insert ancestry rows (project's team, team's org, etc.)
    await db.execute(sql`
      INSERT INTO resource_closure (ancestor_type, ancestor_id, descendant_type, descendant_id, depth)
      SELECT ancestor_type, ancestor_id, 'project', ${project.id}, depth + 1
      FROM resource_closure
      WHERE descendant_type = 'team' AND descendant_id = ${project.teamId}
    `)
  },
  afterDelete: async (project, ctx) => {
    await db.execute(sql`
      DELETE FROM resource_closure
      WHERE descendant_type = 'project' AND descendant_id = ${project.id}
    `)
  },
}
```

### 9.3 RLS Policy Generation

As decided in the [Entity-Aware API doc](./entity-aware-api.md) §13.19, the compiler generates Postgres RLS policies as a defense-in-depth layer:

```sql
-- Generated by compiler for projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_read ON projects FOR SELECT
  USING (
    id IN (
      SELECT rc.descendant_id FROM resource_closure rc
      JOIN role_assignments ra ON ra.resource_type = rc.ancestor_type
                              AND ra.resource_id = rc.ancestor_id
      WHERE ra.user_id = current_setting('app.user_id')::UUID
        AND rc.descendant_type = 'project'
    )
  );
```

The compiler warns when an access rule contains logic that can't be translated to SQL (e.g., async external calls). In those cases, the RLS policy is a permissive fallback, and the app-layer check is the authority.

### 9.4 Type Generation

```ts
// Generated types
type ResourceType = 'organization' | 'team' | 'project' | 'task'
type Entitlement = 
  | 'project:view' | 'project:edit' | 'project:create' | 'project:delete' | 'project:export'
  | 'team:invite' | 'team:manage'
  | 'org:billing' | 'org:audit-log' | 'org:sso'

type Role<T extends ResourceType> = 
  T extends 'organization' ? 'owner' | 'admin' | 'member' :
  T extends 'team' ? 'lead' | 'editor' | 'viewer' :
  T extends 'project' ? 'manager' | 'contributor' | 'viewer' :
  T extends 'task' ? 'assignee' | 'viewer' :
  never

// ctx.can() is fully typed
interface AccessContext {
  can(entitlement: Entitlement): Promise<boolean>
  can(entitlement: Entitlement, resource: HierarchyResource): Promise<boolean>
}
```

---

## 10. Caching Strategy

### 10.1 Cache Layers

| Data | Cache location | TTL | Invalidation |
|------|---------------|-----|-------------|
| **Feature flags** | Edge (CDN/KV) | 30s | WebSocket push on toggle |
| **Role assignments** | App memory (per-session) | Session lifetime | WebSocket push on role change |
| **Effective roles** | App memory (per-request) | Request lifetime | Recomputed each request from cached role assignments |
| **Closure table lookups** | App memory (per-request) | Request lifetime | N/A — query once per request |
| **Plan data** | App memory (per-org) | 5 min | WebSocket push on plan change |
| **Wallet (Postgres)** | None — always fresh | N/A | N/A |
| **Wallet (Redis)** | Redis IS the cache | Key TTL = period end | Auto-expire |

### 10.2 Edge Cacheability

**Edge-cacheable (CDN/KV store):**
- Feature flag values (per-tenant)
- Role → entitlement mappings (static, changes only on deploy)
- Plan definitions (static, changes only on deploy)

**App-cacheable (per-session/request):**
- User's role assignments
- Closure table query results
- Org plan assignment

**Not cacheable:**
- Wallet consumption (must be real-time accurate for limits)

### 10.3 Invalidation via WebSocket

When a role assignment, plan, or feature flag changes:

1. The mutation handler publishes an event to the event bus (already in `@vertz/db`).
2. The event bus fans out via WebSocket to all connected clients/servers.
3. Receivers invalidate their local caches.

For multi-instance deployments, Redis pub/sub distributes invalidation events across instances (same infrastructure as real-time subscriptions, see [Entity-Aware API doc](./entity-aware-api.md) §6.4).

### 10.4 Cache Warming

On session start (login/token refresh), precompute and cache:

1. All role assignments for the user.
2. Effective roles for all resources the user can access (via closure table).
3. The org's plan and entitlements.
4. Active feature flags for the tenant.

This is a single batch query. Subsequent `ctx.can()` calls resolve from cache without hitting the database.

---

## 11. Performance Analysis

### 11.1 Read Path (ctx.can)

**Best case (90% of checks — RBAC only):**
- Feature flag: in-memory lookup — **< 0.01ms**
- Role check: in-memory lookup from precomputed access set — **< 0.01ms**
- **Total: < 0.1ms**

**Typical case (resource-scoped):**
- Feature flag: **< 0.01ms**
- Role check: **< 0.01ms**
- Hierarchy (closure table): 1 SQL query, indexed — **0.5–2ms**
- Plan check: in-memory — **< 0.01ms**
- **Total: 1–3ms**

**Worst case (resource-scoped + usage limit):**
- All of above: **1–3ms**
- Wallet check: 1 SQL/Redis query — **1–5ms**
- **Total: 2–8ms**

**Benchmark targets:**
- P50: < 1ms (precomputed RBAC)
- P95: < 5ms (hierarchy + plan)
- P99: < 10ms (hierarchy + plan + wallet)

### 11.2 Write Path

**Role assignment change:**
- Write to `role_assignments` table: **1–2ms**
- Invalidation event via WebSocket: **< 5ms propagation**
- Client cache rebuild: **5–20ms** (batch query for new access set)

**Entity create (with closure table update):**
- Entity INSERT: **1–2ms**
- Closure table INSERT (all ancestry rows): **1–5ms** (depends on hierarchy depth)
- **Total overhead: 2–7ms** on top of normal entity creation

**Entity reparent (move):**
- DELETE old closure rows: **1–5ms**
- INSERT new closure rows: **2–10ms** (depends on subtree size)
- This is the expensive case but is rare in practice.

### 11.3 Precomputation Costs

**Closure table size:**
- For N hierarchy entities with average depth D: `N × D` rows.
- For 10,000 entities across 4 levels: ~25,000 rows. Trivial for Postgres.
- For 1M entities: ~2.5M rows. Still manageable with proper indexing.

**Access set precomputation (per session):**
- 1 query joining `role_assignments` × `resource_closure`: **2–10ms**
- Result cached for session lifetime.
- For users with access to 100 resources: ~100 entries in the access set.
- For admin users with access to all resources: bounded by org size. If an org has 10,000 resources, the access set has 10,000 entries (~80KB in memory). Acceptable.

---

## 12. Type System

### 12.1 Developer Experience Goals

The type system provides:
1. **Autocomplete on entitlement names** — `ctx.can('pro|')` → suggests `project:view`, `project:edit`, etc.
2. **Autocomplete on role names** — `assignment.role = 'ed|'` → suggests `editor`.
3. **Resource type safety** — `ctx.can('project:view', team)` → type error (entitlement is for projects, not teams).
4. **Plan-aware types** — If an entitlement requires a specific plan, the type system can surface this.

### 12.2 Type Augmentation

The generated types augment the framework's built-in types:

```ts
// Generated by compiler
declare module '@vertz/access' {
  interface EntitlementMap {
    'project:view': { resource: 'project'; roles: ['viewer', 'contributor', 'manager'] }
    'project:edit': { resource: 'project'; roles: ['contributor', 'manager'] }
    'project:export': { resource: 'project'; roles: ['manager']; plans: ['enterprise'] }
    'team:invite': { resource: 'team'; roles: ['lead', 'admin'] }
  }

  interface RoleMap {
    organization: 'owner' | 'admin' | 'member'
    team: 'lead' | 'editor' | 'viewer'
    project: 'manager' | 'contributor' | 'viewer'
    task: 'assignee' | 'viewer'
  }

  interface HierarchyMap {
    organization: { children: 'team' }
    team: { parent: 'organization'; children: 'project' }
    project: { parent: 'team'; children: 'task' }
    task: { parent: 'project' }
  }
}
```

### 12.3 Type-Safe ctx.can()

With type augmentation, `ctx.can()` enforces correct usage:

```ts
// ✅ Correct — project:view expects a project resource
ctx.can('project:view', project)

// ✅ Correct — global entitlement, no resource needed
ctx.can('project:create')

// ❌ Type error — project:view expects a project, not a team
ctx.can('project:view', team)

// ❌ Type error — 'project:fly' is not a valid entitlement
ctx.can('project:fly', project)
```

### 12.4 Integration with Entity Types

The entity's access rules are typed against the generated entitlement map:

```ts
// The entity definition is fully type-checked
const Project = domain('project', {
  access: {
    // ✅ row is typed as ProjectRow, ctx.can is typed to accept project entitlements
    read: (row, ctx) => ctx.can('project:view', row),
    // ❌ Type error if you use 'team:invite' here (wrong resource type)
  },
})
```

This connects to the invisible codegen pipeline described in the [Entity-Aware API doc](./entity-aware-api.md) §15 — the types are generated as part of `vertz dev` and are always up to date.

---

## 13. Comparison with Existing Solutions

### 13.1 Feature Matrix

| Feature | Vertz Access | Google Zanzibar / SpiceDB | Oso | Casbin | Auth0 FGA | LaunchDarkly |
|---------|-------------|--------------------------|-----|--------|-----------|-------------|
| **RBAC** | ✅ Built-in | ✅ Via relations | ✅ Polar lang | ✅ Models | ✅ Via tuples | ❌ |
| **Relationship-based (ReBAC)** | ✅ Closure table | ✅ Core model | ✅ | Partial | ✅ | ❌ |
| **Entitlements** | ✅ First-class | ❌ DIY | ❌ | ❌ | ❌ | ❌ |
| **Plans / Billing** | ✅ Built-in | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Usage limits** | ✅ Wallet | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Feature flags** | ✅ Integrated | ❌ | ❌ | ❌ | ❌ | ✅ Core product |
| **Type safety** | ✅ Full | ❌ | Partial (Polar) | ❌ | ❌ | Partial (SDK) |
| **DB-integrated** | ✅ Owns DB | ❌ External | ❌ External | ❌ External | ❌ External | ❌ SaaS |
| **RLS generation** | ✅ Compiler | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Edge-cacheable** | ✅ Layered | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Single API** | ✅ `ctx.can()` | Partial | ✅ `authorize()` | ✅ `enforce()` | ✅ `check()` | ❌ Different API |

### 13.2 Detailed Comparisons

**vs Google Zanzibar / SpiceDB:**
Zanzibar is the gold standard for relationship-based access control. SpiceDB is the best open-source implementation. However:
- Zanzibar is **relationship-only** — no concept of plans, limits, or feature flags.
- Requires an **external service** — every check is a network call (SpiceDB latency: 1–5ms per check).
- No **type safety** — relationships are string-based.
- No **DB integration** — you must sync your resource graph to SpiceDB separately.
- Vertz's closure table achieves the same relationship resolution but **inside your database**, with generated types and automatic maintenance.

**vs Oso:**
Oso provides a beautiful policy language (Polar) and good reasoning about authorization. However:
- **Separate policy language** — developers must learn Polar in addition to their application language.
- **No billing/limits** — Oso is purely about authorization, not about plans or usage.
- **External evaluation** — Oso Cloud is a SaaS; embedded Oso is in-process but still a separate system.
- Vertz's access rules are **TypeScript** — same language, same tooling, same type system.

**vs Casbin:**
Casbin is flexible and model-agnostic (RBAC, ABAC, ReBAC via config). However:
- **Configuration-heavy** — models, policies, and adapters require significant setup.
- **No type safety** — everything is string-based.
- **No billing integration.**
- **Performance concerns** at scale — policy evaluation can be slow for complex models.

**vs Auth0 FGA:**
Auth0 FGA (Fine-Grained Authorization) is Zanzibar-inspired and well-designed. However:
- **SaaS dependency** — every check goes through Auth0's infrastructure.
- **Latency** — network round-trip for every check.
- **No billing, limits, or feature flags.**
- **Cost** — scales with check volume.

**vs LaunchDarkly:**
LaunchDarkly is excellent for feature flags but:
- **Only does feature flags** — no RBAC, no entitlements, no billing.
- **SaaS dependency.**
- **Separate system** — doesn't know about your authorization model.

### 13.3 The Vertz Advantage

Nobody does all-in-one. Every existing solution covers 1–2 of the 6 concerns. Developers end up integrating SpiceDB + LaunchDarkly + Stripe + custom rate limiting + custom RBAC. That's 5 systems, 5 caching strategies, 5 invalidation mechanisms, and exponential complexity.

Vertz collapses this because:
1. **We own the database** — no external calls for access checks.
2. **We have the compiler** — types, RLS, and closure tables are generated.
3. **We have entity hooks** — hierarchy maintenance is automatic.
4. **We have the event bus** — cache invalidation is built-in.

---

## 14. Implementation Phases

### Phase 1: Foundation (v0.x minor)
**RBAC + Entity Access Rules**

- `defineAccess()` with roles per resource type
- `ctx.can()` with role-based resolution (no hierarchy yet)
- Entity access rules using `ctx.can()`
- Type generation for entitlements and roles
- Deny-by-default behavior
- **Deliverable:** Apps can define roles and protect entities. Single-level (flat) access.

### Phase 2: Hierarchy (v0.x minor)
**Closure Table + Role Inheritance**

- Closure table migration generation
- Entity hooks for closure table maintenance
- Role inheritance across hierarchy levels
- `ctx.can()` with hierarchy resolution
- RLS policy generation (defense in depth)
- **Deliverable:** Multi-level access. Org admins automatically access all children.

### Phase 3: Entitlements + Feature Flags (v0.x minor)
**Named Entitlements + Toggle System**

- Entitlement declaration in `defineAccess()`
- Role → entitlement mapping
- Feature flag integration (entitlements as flags)
- WebSocket-based cache invalidation
- **Deliverable:** Fine-grained permission control. Feature flags as first-class access checks.

### Phase 4: Plans & Wallet (v0.x minor)
**Billing Integration**

- `definePlans()` API
- Plan → entitlement mapping
- Consumption wallet (Postgres-backed)
- `canAndConsume()` atomic check + increment
- Per-customer overrides
- **Deliverable:** SaaS-ready billing integration. Free/Pro/Enterprise plan enforcement.

### Phase 5: Performance & Scale (v1.0+)
**Redis Wallet + Edge Caching + Optimizations**

- Redis-backed wallet for high-frequency limits
- Edge-cacheable access data
- Access set precomputation at session start
- Query-level WHERE clause injection
- Benchmarking and optimization
- **Deliverable:** Production-grade performance at scale.

---

## 15. Open Questions

### Resolved in This Document

- **Resolution order for layers?** → Feature flags → RBAC → Hierarchy → Plan → Wallet (§2).
- **AND vs OR for multi-source entitlements?** → OR for granting (roles), AND for restrictive (plans, flags) (§5.2).
- **Hierarchy depth cap?** → 4 levels, aligned with entity-aware-api.md decision (§3).

### Open

1. **Wallet atomicity across distributed systems.** If we have multiple app instances, how do we ensure wallet increments are atomic across instances? Postgres advisory locks? Redis INCR? This becomes critical for high-throughput entitlements.

2. **Retroactive plan downgrades.** If an org downgrades from Enterprise to Pro, what happens to resources created under Enterprise entitlements? Do we soft-lock them? Show a migration wizard? Just deny future access?

3. **Impersonation / sudo.** Should `ctx.can()` support an "acting as" mode for support staff? What are the audit implications?

4. **API key scoping.** API keys may need narrower access than the user who created them. How do API key entitlements intersect with user entitlements?

5. **Time-based entitlements.** Some entitlements might be time-limited (trial access, temporary permissions). Does the wallet cover this, or do we need a separate mechanism?

6. **Entitlement dependencies.** Can entitlements depend on other entitlements? E.g., `project:export` requires `project:view`. Should this be enforced at the type level?

7. **Bulk access checks for list views.** When rendering a list of 100 projects, we need 100 access checks. The precomputed access set handles this, but what about checks that require wallet lookups?

8. **Cross-org access.** Some apps need users to belong to multiple orgs. How does the hierarchy handle cross-org resource sharing?

9. **Anonymous / public access.** How does `ctx.can()` work for unauthenticated users? Is there a built-in "anonymous" role, or do entities explicitly declare public access?

10. **Migration path from existing auth.** For apps adopting Vertz with an existing custom auth system, what's the migration story?

---

*This is a living document. Updated as design decisions are made and implementation progresses.*
