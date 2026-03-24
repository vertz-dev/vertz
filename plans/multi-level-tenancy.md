# Multi-Level Tenancy — Design Doc

**Issue:** [#1787](https://github.com/vertz-dev/vertz/issues/1787)
**Status:** Draft — Rev 4
**Author:** viniciusdacal + Claude

---

## Revision History

- **Rev 1:** Initial draft. Three reviews (DX, Product, Technical) requested changes.
- **Rev 2:** Addressed all review findings (see below).
- **Rev 3:** Stress test — 10 real-world scenarios tested. Found 4 design gaps, 1 optimization, 1 scaling boundary:
  - Added `tenantLevel` to `SessionPayload` (gap: closure table needs entity type to resolve ancestors)
  - Added level-aware `withTenantFilter()` design (gap: entity scoped to non-leaf level)
  - Added flag resolution strategy: deepest wins (gap: multi-level flags unspecified)
  - Added plan-level validation at access resolution (gap: wrong-level plan assignment)
  - Added batch wallet optimization for `computeAccessSet()`
  - Added parent-level consumption rule (user at account level without project)
  - Documented hot-row scaling boundary for high-throughput sibling contention
- **Rev 4:** Final review round (3x Approve with Suggestions). Applied cross-review fixes:
  - Renamed `tenantLevel` → `tenantLevel` for naming symmetry with `level` on plans (DX S3)
  - Pre-upgrade JWT fallback: missing `tenantLevel` → single-level resolution (Product S2)
  - Resolved Open Question #2: isolation-only levels use nearest ancestor with billing (Product S4)
  - `getBatchConsumption` groups limit keys by billing period (Technical C1)
  - Specified "user shallower than entity" filtering strategy (Technical C3)
  - Closure table dual-purpose: POC spike in Phase 1 (Technical C5)
  - Plan-level mismatch: throw in dev, warn+skip in prod (DX S5)
- **Rev 2 (original):** Addressed all review findings:
  - Added explicit `level` field on plans (all 3 reviewers flagged `group` overloading)
  - Deferred allocation API to follow-up issue (Product: only Agency model needs it)
  - Marked `consumeCascaded` / `CascadeChain` as internal (DX: too low-level for public API)
  - Made feature resolution configurable (`'inherit' | 'local'`) (DX + Product)
  - Added `AccessSet.plan` backward compat strategy (DX + Product)
  - Rewrote Non-Goal #1 (Product: contradicted union resolution)
  - Specified `TenantGraph` consumer audit (Technical blocker B1)
  - Specified ancestor chain population mechanism (Technical blocker B2)
  - Specified `orgResolver` evolution to `ancestorResolver` (Technical blocker B3)
  - Added 3-level E2E scenario (Product: Vertz Cloud model)
  - Added per-user tracking as explicit non-goal (Product)
  - Added edge enforcement boundary (Technical: feature gates = edge, wallet = origin)
  - Merged Phase 2 + Phase 5 for vertical slice delivery (Product: phases weren't vertical)
  - Added lock ordering strategy for Postgres (Technical concern C1)
  - Added `.tenant()`-only levels (no billing) for isolation-only use case (Product concern #4)

---

## Problem

The framework currently supports a single `.tenant()` root — one table defines the tenant boundary. Billing (plans, wallet, flags), access control, and data isolation all attach at that single level.

Real SaaS applications need **multiple levels of tenancy** where different concerns attach at different levels:

| Example | Level 1 | Level 2 | Level 3 |
|---------|---------|---------|---------|
| Cloudflare | Account (access) | Domain (billing, isolation) | — |
| Vertz Cloud | Account (access, billing) | Project (billing, isolation) | Customer Tenant (isolation only) |
| Agency | Agency (billing ceiling) | Organization (sub-allocation) | Brand (isolation) |
| Multi-brand | Corporation (billing) | Brand (billing, isolation) | Store/Region |

The pattern "service provider inside a platform" — where a customer acts as a mini-SaaS within your SaaS — is common enough to warrant first-class framework support.

## What Already Exists

Before designing new APIs, it's important to recognize what infrastructure already exists — and what's missing:

| Concept | Current State | What's Missing |
|---------|--------------|----------------|
| Resource hierarchy | `ClosureStore` with ancestor/descendant tracking | Populated for role hierarchy only, NOT tenant hierarchy |
| Roles at any level | `RoleAssignmentStore` stores `(userId, resourceType, resourceId, role)` | Nothing — fully supports multi-level |
| Role inheritance | `defineAccess()` entities with `inherits` map | Nothing — already cross-entity |
| Tenant chain | `resolveTenantChain()` BFS from entity → tenant root | Only one root; `computeTenantGraph()` rejects multiple `.tenant()` |
| Subscription | `SubscriptionStore` — `tenantId → plan` | Only one billing level; no hierarchy awareness |
| Wallet | `WalletStore` — per-tenantId consumption | No cascading; single level |
| Flags | `FlagStore` — per-tenantId boolean flags | Single level only |
| Access Set | JWT `acl` claim — computed per-tenant | Single plan; `orgResolver` returns one ID |
| Access Context | `createAccessContext` 7-layer engine | `orgResolver` returns `string | null` (single ID) |

**The closure table + role inheritance already model the resource graph.** What we're adding is (a) tenant-level hierarchy awareness and (b) billing resolution across multiple levels.

**Key implementation reality:** `computeTenantGraph()` currently **throws** on multiple `.tenant()` tables. Every consumer of `TenantGraph.root` (a single string) must be audited. This is not incremental — it's a targeted refactor.

---

## API Surface

### 1. DB Schema — Multi-level `.tenant()` Declarations

Currently, only one table can be the tenant root:

```ts
// Current — single level
const organizations = d.table('organizations', { ... }).tenant();
```

**New:** Multiple tables can be declared as tenant levels. The framework infers the hierarchy from FK relationships:

```ts
const accounts = d.table('accounts', {
  id: d.uuid().primaryKey(),
  name: d.text(),
}).tenant();

const projects = d.table('projects', {
  id: d.uuid().primaryKey(),
  accountId: d.uuid(),
  name: d.text(),
}).tenant();

// Customer tenants — isolation only, no billing
const customerTenants = d.table('customer_tenants', {
  id: d.uuid().primaryKey(),
  projectId: d.uuid(),
  name: d.text(),
}).tenant();
```

The hierarchy is inferred from model relations (`d.ref.one`), not column-level references:

The framework sees three `.tenant()` tables with FK relationships and infers:

```
accounts (level 0 — root)
  └── projects (level 1)
        └── customer_tenants (level 2 — isolation only, no plan group targets this)
```

**A `.tenant()` table with no corresponding plan group is an isolation-only level.** It participates in data scoping but has no billing. This is the Vertz Cloud "Customer Tenant" pattern.

**Rules:**
- Multiple `.tenant()` tables must form a single chain through FK relationships (no forks)
- If multiple `.tenant()` tables exist, the one with no FK to another `.tenant()` table is the root
- Maximum 4 levels (same as existing hierarchy depth cap)
- Each `.tenant()` table must have a single-column PK (same as current requirement)

**Backward compatible:** A single `.tenant()` call behaves exactly as today.

#### TenantGraph Changes

`computeTenantGraph()` currently returns:

```ts
interface TenantGraph {
  root: string | null;
  directlyScoped: string[];
  indirectlyScoped: string[];
  shared: string[];
}
```

**New:**

```ts
interface TenantGraph {
  root: string | null;
  /** Ordered chain of tenant levels (root first, leaf last). Empty for single-level. */
  levels: TenantLevel[];
  directlyScoped: string[];
  indirectlyScoped: string[];
  shared: string[];
}

interface TenantLevel {
  /** Model key (e.g., 'account', 'project') */
  key: string;
  /** Table name */
  tableName: string;
  /** FK column to parent level (null for root) */
  parentFk: string | null;
  /** Parent level key (null for root) */
  parentKey: string | null;
  /** Depth in the hierarchy (0 = root) */
  depth: number;
}
```

**Consumer audit required:**
- `resolveTenantChain()` — currently walks to single root; must understand level chain
- `withTenantFilter()` in CRUD pipeline — see **Level-Aware Tenant Filtering** below
- Entity registration (`registerEntity`) — tenant scoping inference
- `createServer()` — auto-wiring of tenant config

**Level-Aware Tenant Filtering:**

`withTenantFilter()` currently injects `WHERE tenantId = ctx.tenantId`. With multi-level, an entity may be scoped to a different level than the user's current scope:

```
User scoped to: project_abc (tenantLevel = 'project')
Entity: billing_invoices (scoped to 'account' via FK chain)
```

The filter must:
1. Determine the entity's scoping level (account) from its tenant chain
2. Compare with user's current level (project)
3. If user is deeper: walk the ancestor chain to find the matching level's ID (`project_abc → account_xyz`)
4. Filter by `WHERE accountId = 'account_xyz'`

If user is shallower (e.g., scoped to account, entity scoped to project):
- The filter uses the indirect tenant chain resolution (existing `resolveTenantChain()` JOINs) to scope queries
- Example: user scoped to `account_xyz`, listing tasks (scoped to projects). The query JOINs tasks → projects and filters `WHERE projects.accountId = 'account_xyz'`
- This is the same mechanism already used for indirectly-scoped entities — multi-level extends it to work when the user's scope is above the entity's direct tenant level

### 2. `defineAccess()` — Plans with Explicit `level` Field

Plans gain a new **`level`** field that maps a plan to a tenant-level entity. The `group` field retains its original meaning: mutual exclusivity within a level.

```ts
const access = defineAccess({
  entities: {
    account: { roles: ['owner', 'admin', 'member'] },
    project: {
      roles: ['admin', 'editor', 'viewer'],
      inherits: { 'account:owner': 'admin', 'account:admin': 'admin' },
    },
  },

  entitlements: {
    'account:manage': { roles: ['owner', 'admin'] },
    'project:create': { roles: ['member'] },
    'project:ai-generate': {
      roles: ['editor'],
      // NEW: configurable feature resolution
      featureResolution: 'inherit',  // 'inherit' (default) | 'local'
    },
  },

  plans: {
    // Account-level plans
    enterprise: {
      level: 'account',         // NEW: billing level (matches entity name)
      group: 'account-plans',   // Mutual exclusivity (original meaning)
      features: ['project:create'],
      limits: {
        'ai-credits': { max: 10000, gates: 'project:ai-generate', per: 'month' },
      },
    },
    starter: {
      level: 'account',
      group: 'account-plans',
      features: ['project:create'],
      limits: {
        'ai-credits': { max: 1000, gates: 'project:ai-generate', per: 'month' },
      },
    },

    // Project-level plans
    pro: {
      level: 'project',
      group: 'project-plans',
      features: ['project:ai-generate'],
      limits: {
        'ai-credits': { max: 500, gates: 'project:ai-generate', per: 'month' },
      },
    },
    free: {
      level: 'project',
      group: 'project-plans',
      features: [],
    },
  },

  // Default plan per billing level (extends existing `defaultPlan`)
  defaultPlans: {
    account: 'starter',
    project: 'free',
  },
});
```

**Why `level` instead of overloading `group`:**
- `group` means "mutual exclusivity" — that's its job and it does it well
- `level` means "which tenant level this plan attaches to" — a separate concern
- Decoupled: a developer can have multiple plan groups at the same level (e.g., `compute-plans` and `storage-plans` both at `account` level)
- No naming collision risk: `group: 'main'` remains valid regardless of entity names
- LLMs can learn the pattern: `level` matches an entity name, `group` is for exclusivity

**`featureResolution` per entitlement:**
- `'inherit'` (default): Allowed if ANY plan in the ancestor chain includes the feature. Account's enterprise enables it even if project is on free.
- `'local'`: Only check the deepest (most specific) level's plan. Parent plans don't propagate features.

**Validation rules:**
- Plan `level` must reference a defined entity that corresponds to a `.tenant()` table
- All plans in the same `group` must have the same `level` (mutual exclusivity is within a level)
- `defaultPlans` keys must match entity names that have plans targeting them
- Backward compat: `defaultPlan: string` still works for single-level; `defaultPlans` for multi-level

**New types:**

```ts
interface PlanDef {
  // ... existing fields ...
  /** Tenant level this plan attaches to. Must match an entity name with a .tenant() table. */
  level?: string;
}

interface EntitlementDef {
  // ... existing fields ...
  /** How features resolve across ancestor levels. Default: 'inherit'. */
  featureResolution?: 'inherit' | 'local';
}

interface DefineAccessInput {
  // ... existing fields ...
  defaultPlan?: string;  // Single-level (existing)
  defaultPlans?: Record<string, string>;  // Multi-level (new)
}

interface AccessDefinition {
  // ... existing fields ...
  /** Computed: maps entity name → plan names targeting that level. */
  readonly _billingLevels: Readonly<Record<string, readonly string[]>>;
}
```

### 3. SubscriptionStore — Per-Level Assignment

No interface change needed — `SubscriptionStore.assign()` already takes a generic `tenantId`. The "tenant" at project level is just `projectId`:

```ts
// Assign plans at different levels — same API, different IDs
await subscriptionStore.assign('account_xyz', 'enterprise');
await subscriptionStore.assign('project_abc', 'pro');
await subscriptionStore.assign('project_def', 'free');
```

The store doesn't know or care about levels — it just maps an ID to a plan. The framework resolves which level an ID belongs to via the closure table.

### 4. Ancestor Chain Resolution

**New internal mechanism:** When checking plan-gated entitlements, the access engine needs to resolve the ancestor chain from the current `tenantId` up to the root.

**Population mechanism:** The closure table must be populated with tenant hierarchy relationships. This happens **automatically** when tenant-level entities are created via the entity service:

```ts
// When a project is created via the entity service:
// 1. Entity service detects project is a .tenant() table
// 2. Reads projectId and accountId from the created row
// 3. Calls closureStore.addResource('project', projectId, { parentType: 'account', parentId: accountId })
```

This is wired into the entity service's `create` pipeline for `.tenant()` entities. The developer doesn't call `addResource()` manually.

**`orgResolver` evolution:**

The current `orgResolver: (resource?) => Promise<string | null>` returns a single org ID. For multi-level, we need the full ancestor chain.

**New: `ancestorResolver`**

```ts
interface AccessContextConfig {
  // ... existing ...
  /** @deprecated Use ancestorResolver for multi-level. Falls back to single-level behavior. */
  orgResolver?: (resource?: ResourceRef) => Promise<string | null>;
  /** Resolves the ancestor chain from a tenant. Returns entries from child to root. */
  ancestorResolver?: (tenantLevel: string, tenantId: string) => Promise<AncestorChainEntry[]>;
}

interface AncestorChainEntry {
  type: string;  // entity type (e.g., 'account', 'project')
  id: string;    // entity ID
  depth: number; // 0 = the tenantId itself, 1 = parent, 2 = grandparent
}
```

The `ancestorResolver` is auto-wired by `createServer()` using the closure store:

```ts
// Auto-wired implementation (tenantLevel comes from SessionPayload.tenantLevel):
ancestorResolver: async (tenantLevel: string, tenantId: string) => {
  const ancestors = await closureStore.getAncestors(tenantLevel, tenantId);
  return ancestors.filter(a => a.depth > 0).sort((a, b) => a.depth - b.depth);
}
```

**Backward compat:** If only `orgResolver` is provided (existing apps), the access engine uses single-level behavior. If `ancestorResolver` is provided, multi-level resolution kicks in.

### 5. Access Resolution — Multi-Level Checks

The access context gains hierarchy awareness internally. **No public API change** — `ctx.can()`, `ctx.check()`, `ctx.canAndConsume()` work the same way.

**Feature gate resolution (Layer 3):**
```
For each ancestor in chain (child → root):
  Resolve subscription at this level
  If plan has the feature → allowed (short-circuit for 'inherit' mode)
If 'local' mode: only check the deepest level's plan
```

**Limit resolution (Layer 4):**
```
For each ancestor in chain (child → root):
  Resolve subscription at this level
  If plan has a limit with matching key → add to cascade chain
Check wallet consumption at ALL levels with limits
If any level is over limit → denied
```

**Internal cascaded consumption:**

When `canAndConsume()` encounters limits at multiple levels, it uses an internal cascaded consume that checks and increments atomically at all levels. This is internal to the access engine — **not exposed on `WalletStore`**.

```ts
// Internal — not public API
async function consumeCascaded(
  walletStore: WalletStore,
  chain: Array<{ id: string; limit: number; periodStart: Date; periodEnd: Date }>,
  entitlement: string,
  amount: number,
): Promise<{ success: boolean; rejectedAt?: string }> {
  // 1. Read consumption at all levels
  // 2. Check if amount fits at all levels
  // 3. Atomically increment all levels (or reject)
}
```

**Lock ordering for Postgres:** Always acquire wallet row locks from root to leaf (ascending depth). This prevents deadlocks when concurrent requests cascade through the same hierarchy.

### 6. Access Set — Multi-Level Plan Info

```ts
interface AccessSet {
  entitlements: Record<string, AccessCheckData>;
  flags: Record<string, boolean>;
  /** @deprecated Use `plans` for multi-level. Kept for backward compat — returns deepest level's plan. */
  plan: string | null;
  /** Plan per billing level. Keys are entity names. */
  plans: Record<string, string | null>;
  computedAt: string;
}
```

**Backward compat:** `plan` is kept as a convenience getter that returns the deepest level's plan. Existing client code that reads `accessSet.plan` continues to work. New code uses `accessSet.plans.project`.

**`computeAccessSet()` performance:**

Multi-level requires N subscription lookups (one per level). Optimization: batch all subscription lookups upfront before iterating entitlements.

```ts
// Before: 1 subscriptionStore.get() + N walletStore.getConsumption() calls
// After: batch everything upfront, then iterate entitlements

// 1. Batch subscription lookups (one per billing level)
const subscriptions = new Map<string, Subscription | null>();
for (const entry of ancestorChain) {
  subscriptions.set(entry.id, await subscriptionStore.get(entry.id));
}

// 2. Batch wallet reads per level, grouped by billing period
// Different limit keys may have different periods (e.g., ai-credits: monthly, api-calls: daily)
// Group by (tenantId, periodStart, periodEnd) to batch efficiently
const walletByLevel = new Map<string, Map<string, number>>();
for (const entry of ancestorChain) {
  const sub = subscriptions.get(entry.id);
  if (!sub) continue;
  const plan = accessDef.plans?.[sub.planId];
  if (!plan?.limits) continue;

  // Group limit keys by billing period
  const byPeriod = new Map<string, string[]>();
  for (const [key, limitDef] of Object.entries(plan.limits)) {
    const period = calculateBillingPeriod(sub.startedAt, limitDef.per);
    const periodKey = `${period.periodStart.getTime()}:${period.periodEnd.getTime()}`;
    if (!byPeriod.has(periodKey)) byPeriod.set(periodKey, []);
    byPeriod.get(periodKey)!.push(key);
  }

  // One batch query per unique period
  const merged = new Map<string, number>();
  for (const [periodKey, limitKeys] of byPeriod) {
    const [start, end] = periodKey.split(':').map(Number);
    const batch = await walletStore.getBatchConsumption(
      entry.id, limitKeys, new Date(start), new Date(end),
    );
    for (const [k, v] of batch) merged.set(k, v);
  }
  walletByLevel.set(entry.id, merged);
}

// 3. Iterate entitlements using cached data — zero additional async calls
```

**New `WalletStore` method needed:**

```ts
interface WalletStore {
  // ... existing ...
  /** Batch read: all consumption for a tenant across multiple limit keys in one query. */
  getBatchConsumption(
    tenantId: string,
    limitKeys: string[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Map<string, number>>;
}
```

This reduces `computeAccessSet()` from O(levels × entitlements) async calls to O(levels) — critical for JWT computation latency.

### 7. Session & Tenant Switching

```ts
interface SessionPayload {
  // ... existing ...
  tenantId?: string;    // Most specific level ID (e.g., 'project_abc')
  tenantLevel?: string;  // NEW: entity type of tenantId (e.g., 'project')
}
```

**Why `tenantLevel` is required:** The closure store needs `(type, id)` to look up ancestors: `closureStore.getAncestors('project', 'project_abc')`. Without `tenantLevel`, the engine doesn't know if `tenantId` refers to an account, project, or customer tenant — it can't query the closure table.

`tenantLevel` is set automatically during `switch-tenant`. The framework resolves which `.tenant()` table contains the target ID by querying each tenant-level table in order (root first). This is O(levels) queries but only happens on tenant switch (not per-request).

**Pre-upgrade JWT fallback:** If a JWT has `tenantId` but no `tenantLevel` (issued before the multi-level upgrade), the access engine falls back to single-level resolution behavior — treating `tenantId` as the root tenant level. This ensures in-flight tokens continue to work during a rolling upgrade.

**Tenant switching:** The existing `switch-tenant` endpoint works unchanged externally. Internally, it now also sets `tenantLevel` in the JWT. When a user switches to a project, the framework knows the account from the closure table. When a user switches to an account (without selecting a project), `tenantLevel = 'account'` and features/limits resolve at account level only.

**Parent-level scoping rule:** When a user is scoped to a parent level (e.g., account) without selecting a child:
- Feature gates resolve at the scoped level and above only
- Wallet consumption charges against the scoped level only (not against child levels)
- Child-level limits are not checked (no child to attribute to)
- This means: at account level, you can consume account-level credits, but project-level features gated by `featureResolution: 'local'` are unavailable

### 8. Edge Enforcement Boundary

**Feature gates (Layer 3) → edge-enforceable.** Feature lists from plans are static data that can be serialized and cached in KV. The edge Worker resolves the ancestor chain from cached closure data and checks feature membership.

**Wallet limits (Layer 4) → origin-only.** Wallet state is write-heavy and latency-sensitive. It cannot be cached at the edge with reasonable consistency. Limit checks require real-time consumption data from the database.

**Boundary rule:** Edge enforcement handles authentication, roles, flags, and feature gates. Wallet/limit enforcement always routes to the origin server.

### 9. Full Developer Walkthrough

```ts
// === 1. DB Schema ===
import { d } from '@vertz/db';

const accounts = d.table('accounts', {
  id: d.uuid().primaryKey(),
  name: d.text(),
}).tenant();

const projects = d.table('projects', {
  id: d.uuid().primaryKey(),
  accountId: d.uuid(),
  name: d.text(),
}).tenant();

// Customer tenants — isolation only, no billing
const customerTenants = d.table('customer_tenants', {
  id: d.uuid().primaryKey(),
  projectId: d.uuid(),
  name: d.text(),
}).tenant();

// Tasks scoped to projects (nearest .tenant() ancestor with billing)
const tasks = d.table('tasks', {
  id: d.uuid().primaryKey(),
  projectId: d.uuid(),
  title: d.text(),
  createdBy: d.uuid(),
});

// === 2. Models ===
const accountModel = d.model(accounts, {});
const projectModel = d.model(projects, {
  account: d.ref.one(accounts, { foreignKey: 'accountId' }),
});
const customerTenantModel = d.model(customerTenants, {
  project: d.ref.one(projects, { foreignKey: 'projectId' }),
});
const taskModel = d.model(tasks, {
  project: d.ref.one(projects, { foreignKey: 'projectId' }),
});

// === 3. Access Control ===
const access = defineAccess({
  entities: {
    account: { roles: ['owner', 'admin', 'member'] },
    project: {
      roles: ['admin', 'editor', 'viewer'],
      inherits: { 'account:owner': 'admin', 'account:admin': 'editor' },
    },
  },
  entitlements: {
    'account:manage': { roles: ['owner', 'admin'] },
    'project:create': { roles: ['member'] },
    'project:edit': { roles: ['admin', 'editor'] },
    'project:ai-generate': {
      roles: ['editor'],
      featureResolution: 'inherit',  // account plan can grant this to child projects
    },
  },
  plans: {
    enterprise: {
      level: 'account',
      group: 'account-plans',
      features: ['project:create'],
      limits: {
        'ai-credits': { max: 10000, gates: 'project:ai-generate', per: 'month' },
      },
    },
    starter: {
      level: 'account',
      group: 'account-plans',
      features: ['project:create'],
      limits: {
        'ai-credits': { max: 1000, gates: 'project:ai-generate', per: 'month' },
      },
    },
    pro: {
      level: 'project',
      group: 'project-plans',
      features: ['project:ai-generate'],
      limits: {
        'ai-credits': { max: 500, gates: 'project:ai-generate', per: 'month' },
      },
    },
    free: {
      level: 'project',
      group: 'project-plans',
      features: [],
    },
  },
  defaultPlans: {
    account: 'starter',
    project: 'free',
  },
});

// === 4. Runtime — Billing Setup ===
await subscriptionStore.assign('account_xyz', 'enterprise');
await subscriptionStore.assign('project_abc', 'pro');
await subscriptionStore.assign('project_def', 'free');

// === 5. Runtime — Access Checks ===
// User is in project_abc context (tenantId = project_abc)
const allowed = await ctx.can('project:ai-generate');
// Resolves ancestor chain: project_abc → account_xyz
// Checks:
// 1. Role: user has 'editor' on project_abc? ✓
// 2. Feature (inherit mode):
//    - project plan 'pro' has 'project:ai-generate'? ✓ (short-circuit)
//    - (if project were on 'free': account plan 'enterprise' checked next)
// 3. Limits:
//    - project_abc limit: 500 (from pro plan)
//    - account_xyz limit: 10000 (from enterprise plan)
//    Both checked — consumption counts against both

const result = await ctx.canAndConsume('project:ai-generate');
// Increments wallet at BOTH project_abc AND account_xyz levels

// === 6. Client Side ===
// Access set in JWT:
// accessSet.plans.account === 'enterprise'
// accessSet.plans.project === 'pro'
// accessSet.plan === 'pro' (deprecated convenience — deepest level)
```

---

## Manifesto Alignment

### "If it builds, it works" (Principle 1)
- Plan `level` is validated at `defineAccess()` time — must reference an entity with a `.tenant()` table
- TypeScript narrows `level` to valid entity names via codegen
- `defaultPlans` keys are validated against entities that have billing levels

### "One way to do things" (Principle 2)
- Multi-level tenancy is an extension of the existing single-level pattern, not a parallel system
- `.tenant()` on tables is the one way to declare levels
- `level` on plans is the one way to map plans to levels
- No `defineTenancy()` function — the hierarchy is derived from table relations + `.tenant()` declarations

### "AI agents are first-class users" (Principle 3)
- The API adds one new concept: `level` on plans — LLMs can learn from a single example
- `group` retains its original meaning — no relearning needed
- The pattern is predictable: `level` matches entity name, `group` is for exclusivity

---

## Non-Goals

1. **Feature subtraction** — A parent plan cannot remove features granted by a child plan. If the project's own plan includes a feature, the parent can't block it. (Developers use `featureResolution: 'local'` to prevent parent propagation, but can't subtract.)

2. **Dynamic hierarchy changes** — Moving a project from one account to another is out of scope. The FK relationship is static. Billing migration (reassigning subscriptions, transferring wallet consumption) is complex.

3. **Per-resource subscriptions** — Plans attach to tenant-level entities (`.tenant()` tables), not arbitrary entities. A task can't have its own plan.

4. **Multi-parent hierarchies** — A project belongs to exactly one account. No "shared projects across accounts."

5. **Billing provider (Stripe) integration for multi-level** — The existing `BillingAdapter` handles single-level Stripe sync. Multi-level Stripe sync (multiple subscriptions per customer) is a follow-up.

6. **Per-user consumption tracking** — The wallet tracks consumption per tenant-level ID, not per user. Answering "which user consumed the most credits?" requires application-level audit logging.

7. **Quota allocation** — Parent-to-child quota sub-allocation (`allocate()` / `deallocate()`) is deferred to a follow-up issue. The core multi-level feature delivers per-level billing and cascaded consumption without allocation. See [Deferred: Allocation API](#deferred-allocation-api).

---

## Unknowns — Resolved

### 1. Feature gate composition across levels — RESOLVED: configurable per entitlement

`featureResolution: 'inherit' | 'local'` on each entitlement definition.

- `'inherit'` (default): Allowed if ANY plan in the ancestor chain includes the feature. Parent grants to children.
- `'local'`: Only the deepest level's plan is checked. Parent plans don't propagate.

This gives developers explicit control. The default (`inherit`) matches real-world expectations (Cloudflare: enterprise account unlocks features for all domains). Developers who want per-project billing enforcement use `local`.

### 2. Limit resolution when both levels define the same limit key — RESOLVED: check all levels (cascade)

Both levels are checked. Consumption at the child level counts against both the child's limit and all ancestor limits with matching keys. This is the cascading model from the issue.

### 3. `defaultPlans` backward compatibility — RESOLVED: support both

- Single `.tenant()` → `defaultPlan: string` still works
- Multiple `.tenant()` → use `defaultPlans: Record<string, string>`
- If both provided, `defaultPlans` takes precedence

### 4. JWT size budget — RESOLVED: needs POC (deferred to implementation)

Adding `plans: Record<string, string | null>` is small (one string per level). The concern is per-entitlement limit info at multiple levels. Will measure during Phase 2 implementation. If over budget, use the existing overflow strategy (hash + server-side lookup).

### 5. Wallet atomicity in Postgres — RESOLVED: lock ordering root-to-leaf

Always acquire wallet row locks from root to leaf (ascending depth order). This prevents deadlocks with concurrent requests on overlapping hierarchies. Advisory locks are not needed — row-level locks with consistent ordering are sufficient.

---

## Unknowns — Resolved (Rev 3, from stress testing)

### 3. Flag resolution across levels — RESOLVED: deepest wins

When the same flag key exists at multiple levels (e.g., account has `beta_ai: true`, project has `beta_ai: false`), the **deepest (most specific) level wins**. This matches the mental model of "the project opted out of this flag."

Resolution order: check from leaf to root, first match wins.

### 4. Plan assigned at wrong level — RESOLVED: throw in dev, warn in prod

`SubscriptionStore.assign()` remains generic (any ID + any plan). But during access resolution, if a plan's `level` doesn't match the entity type of the ID it's assigned to:
- **Development mode:** Throws an error (fail fast — "if it builds, it works")
- **Production mode:** Logs a warning and skips the mismatched plan (treats as no subscription at that level)

Rationale: validating at `assign()` time would couple the store to the entity type system. Resolution-time validation is simpler. Throwing in dev catches the bug early; warning in prod avoids crashing on a misconfiguration that can be hot-fixed.

### 5. User at parent level without child selected — RESOLVED: consume at scoped level only

When a user is scoped to a parent level (e.g., `tenantLevel = 'account'`, no project selected):
- Feature gates resolve at account level and above only
- Wallet consumption charges against the account's own limits only
- Child-level limits are not checked (no child context to attribute to)
- Entitlements with `featureResolution: 'local'` targeting a deeper level are denied (no child plan to check)

This is the natural behavior: if you're not in a project, project-level billing doesn't apply.

---

## Unknowns — Resolved (Rev 4)

### 6. Isolation-only level billing resolution — RESOLVED: nearest ancestor with billing

When a user is scoped to an isolation-only `.tenant()` level (e.g., `customer_tenant` with no plan group targeting it), the access engine walks up the ancestor chain and resolves billing at the **nearest ancestor with plans**. For the Vertz Cloud model:

```
User scoped to: customer_tenant_123 (isolation only)
Ancestor chain: customer_tenant_123 → project_456 → account_789
Billing resolved at: project_456 (nearest ancestor with plans) and account_789
```

The isolation-only level participates in data scoping (WHERE filters) but is transparent to billing.

### 7. Closure table dual-purpose — RESOLVED: POC spike in Phase 1

The closure table likely shares rows for both role hierarchy and tenant hierarchy (a project IS a resource in both). The `type` field (`'project'`, `'account'`) provides the distinction. However, this assumption will be verified with a **focused POC spike during Phase 1** before Phase 2 depends on it. If they can't share rows (e.g., role entries are only populated for resources with explicit role assignments, not every entity), a type prefix or separate table will be needed.

---

## Unknowns — Open

### 1. `_entitlementToLimitKeys` map ambiguity

Currently maps entitlement → limit keys across ALL plans. With multi-level, the same limit key can appear in plans at different levels. The access engine needs to know which plan defines which limit key at which level.

**Likely resolution:** The map remains flat (entitlement → limit keys), but during resolution, the engine iterates ancestor subscriptions and checks each subscription's plan for the limit key. The map tells the engine "this entitlement has limits to check" — the per-level resolution happens at check time.

---

## Type Flow Map

```
d.table(...).tenant()
  ↓ [table._tenant = true]
computeTenantGraph()
  ↓ [TenantGraph.root, .levels[], .directlyScoped, .indirectlyScoped]
resolveTenantChain()
  ↓ [TenantChain with hops — now multi-level aware]

PlanDef.level: string
  ↓ [must match entity name in defineAccess().entities]
PlanDef.group: string
  ↓ [mutual exclusivity within a level]
defineAccess()
  ↓ [AccessDefinition._billingLevels: Record<string, string[]>]
  ↓ [maps entity name → plan names targeting that level]

Entity service: create(.tenant() entity)
  ↓ closureStore.addResource(type, id, { parentType, parentId })
  ↓ [Populates tenant hierarchy in closure table]

SubscriptionStore.assign(entityId, planId)
  ↓ [Subscription { tenantId, planId }]

SessionPayload.tenantLevel + SessionPayload.tenantId
  ↓ [set during switch-tenant]
ancestorResolver(tenantLevel, tenantId)
  ↓ closureStore.getAncestors(tenantLevel, tenantId)
  ↓ [AncestorChainEntry[] — child to root]

AccessContext.can(entitlement, resource?)
  ↓ ancestorResolver(tenantLevel, tenantId)
  ↓ [for each level: resolve subscription → check features/limits]
  ↓ [internal cascaded wallet check if limits at multiple levels]

computeAccessSet()
  ↓ [AccessSet.plans: Record<string, string | null>]
  ↓ [AccessSet.plan: deepest level's plan (backward compat)]
  ↓ [Encoded in JWT acl claim]
```

---

## E2E Acceptance Test

```ts
describe('Feature: Multi-level tenancy', () => {

  // --- 2-level: account + project (Cloudflare model) ---

  describe('Given account on enterprise (10,000 credits) and project on pro (500 credits)', () => {
    describe('When user in project consumes 1 ai-credit', () => {
      it('Then consumption increments at both project and account levels', () => {});
    });

    describe('When project consumption reaches 500 (project plan limit)', () => {
      it('Then further consumption is denied with limit_reached at project level', () => {});
    });

    describe('When account consumption reaches 10,000 (account plan limit)', () => {
      it('Then further consumption is denied at account level even if project has remaining', () => {});
    });
  });

  describe('Given account on enterprise and project on free (featureResolution: inherit)', () => {
    describe('When checking project:ai-generate entitlement', () => {
      it('Then allowed because account plan includes the feature (inherit mode)', () => {});
    });
  });

  describe('Given account on enterprise and project on free (featureResolution: local)', () => {
    describe('When checking a local-only entitlement', () => {
      it('Then denied because project plan does not include the feature', () => {});
    });
  });

  // --- 3-level: account + project + customer tenant (Vertz Cloud model) ---

  describe('Given 3-level hierarchy: account → project → customer_tenant', () => {
    describe('and customer_tenant is isolation-only (no plan group targets it)', () => {
      describe('When user is scoped to customer_tenant', () => {
        it('Then billing checks resolve at project and account levels only', () => {});
        it('Then data isolation is enforced at customer_tenant level', () => {});
      });
    });
  });

  // --- Backward compatibility ---

  describe('Given a single .tenant() table', () => {
    describe('When using existing single-level APIs', () => {
      it('Then everything works identically to pre-multi-level behavior', () => {});
    });
    describe('When using defaultPlan (not defaultPlans)', () => {
      it('Then single-level default plan still works', () => {});
    });
  });

  // --- Access Set ---

  describe('Given multi-level plans assigned', () => {
    describe('When computing access set', () => {
      it('Then accessSet.plans has one entry per billing level', () => {});
      it('Then accessSet.plan returns deepest level plan (backward compat)', () => {});
      it('Then limit meta includes level information', () => {});
    });
  });

  // --- Closure table population ---

  describe('Given a project created via entity service', () => {
    it('Then closure table has entry: project → account (depth 1)', () => {});
    it('Then ancestorResolver returns [project, account] for the project', () => {});
  });

  // --- Level-aware tenant filtering ---

  describe('Given billing_invoices scoped to account level', () => {
    describe('and user scoped to project_abc (child of account_xyz)', () => {
      describe('When listing invoices', () => {
        it('Then filters by accountId = account_xyz (resolved from ancestor chain)', () => {});
        it('Then does NOT filter by projectId', () => {});
      });
    });
  });

  // --- Flag resolution ---

  describe('Given account flag beta_ai: true and project flag beta_ai: false', () => {
    describe('When checking flag-gated entitlement at project level', () => {
      it('Then flag resolves to false (deepest wins)', () => {});
    });
  });

  // --- Parent-level scoping ---

  describe('Given user scoped to account (no project selected)', () => {
    describe('When checking project:ai-generate (featureResolution: local)', () => {
      it('Then denied (no project plan to check in local mode)', () => {});
    });
    describe('When consuming account-level limit', () => {
      it('Then charges against account wallet only', () => {});
    });
  });

  // --- Plan-level mismatch ---

  describe('Given project-level plan assigned to account ID (misconfiguration)', () => {
    describe('When resolving access', () => {
      it('Then skips the mismatched plan with a warning', () => {});
      it('Then uses defaultPlan for that level instead', () => {});
    });
  });

  // --- Sibling consumption ---

  describe('Given two projects under same account (enterprise: 10,000 credits)', () => {
    describe('When project_a consumes 9,500 and project_b consumes 500', () => {
      it('Then account total is 10,000', () => {});
      it('Then further consumption by either project is denied at account level', () => {});
    });
  });

  // --- Type-level tests ---

  describe('Type: plan level must match entity name', () => {
    it('Then defineAccess() accepts plans with valid level', () => {});
    // @ts-expect-error — plan level that doesn't match any entity
  });

  describe('Type: defaultPlans keys must match entity names with billing', () => {
    it('Then accepts valid entity-keyed default plans', () => {});
    // @ts-expect-error — defaultPlans key for entity with no plans
  });
});
```

---

## Implementation Phases

### Phase 1: Multi-level `.tenant()` + hierarchy inference
- Remove the "only one `.tenant()`" restriction in `computeTenantGraph()`
- Add `TenantGraph.levels: TenantLevel[]` field
- Validate chain structure (single chain, no forks, max 4 levels)
- Audit and update all `TenantGraph.root` consumers
- `resolveTenantChain()` handles multi-level chains
- **POC spike: closure table dual-purpose** — verify that tenant hierarchy and role hierarchy can share the same closure table rows. If not, determine partitioning strategy before Phase 2.
- Backward compatible: single `.tenant()` works unchanged
- **Acceptance:** `computeTenantGraph()` correctly infers 1, 2, and 3-level chains

### Phase 2: Per-level billing + access set integration (vertical slice)
- `PlanDef.level` field + validation in `defineAccess()`
- `_billingLevels` computed map
- `defaultPlans` config (alongside `defaultPlan`)
- Auto-populate closure table for `.tenant()` entities on create
- `ancestorResolver` in access context config
- `computeAccessSet()` resolves plans at each level
- Feature gate resolution with `featureResolution: 'inherit' | 'local'`
- `AccessSet.plans` + backward-compat `AccessSet.plan`
- JWT encoding/decoding updated
- **Acceptance:** End-to-end test: defineAccess with multi-level plans → assign subscriptions → check entitlement → access set has plans per level

### Phase 3: Cascaded wallet consumption
- Internal cascaded consume logic in access context
- `canAndConsume()` checks limits at all ancestor levels
- Lock ordering (root-to-leaf) for DB-backed wallet
- `unconsume()` cascade rollback
- **Acceptance:** Consuming at child level increments wallet at all ancestor levels; denial at any level blocks consumption

### Phase 4: Documentation + developer walkthrough
- Update `packages/docs/` with multi-level tenancy guide
- Full walkthrough example (2-level and 3-level)
- Migration guide from single-level
- Edge enforcement boundary documentation

---

## Deferred: Allocation API

Quota allocation (parent-to-child budget sub-allocation) is deferred to a follow-up issue. The core multi-level tenancy feature delivers:

- Per-level plan assignment (account gets enterprise, project gets pro)
- Cascaded limit checking (consumption counts against both levels)
- Feature inheritance/local resolution

What's deferred:
- `allocate()` / `deallocate()` / `getAllocations()`
- Allocation ceilings (parent says "project X gets 5000 of my 10000 credits")
- `auth_allocations` table
- Allocation validation (sum ≤ parent limit)

**Rationale:** Only the Agency/White-Label model requires explicit allocation. The Cloudflare, Vertz Cloud, and Multi-brand models work with independent per-level plans + cascaded consumption. Allocation adds significant complexity (new store, new table, validation, reconciliation on plan change) that can ship independently.

---

## Alternatives Considered

### Alternative A: `defineTenancy()` as a separate function

```ts
const tenancy = defineTenancy({
  levels: {
    account: { table: accountsTable, access: true },
    project: { table: projectsTable, parent: 'account', billing: true },
  },
});
```

**Why rejected:**
- `parent: 'account'` is redundant — FK relationships already declare this
- `access: true` / `billing: true` flags are vague — what does "access: true" mean concretely?
- Creates a new config surface that needs to be wired into `defineAccess()`, `createServer()`, etc.
- Two sources of truth for the hierarchy (table FKs + defineTenancy)

### Alternative B: Extend `.tenant()` with capabilities

```ts
const accounts = d.table('accounts', { ... }).tenant({ access: true });
const projects = d.table('projects', { ... }).tenant({ billing: true, isolation: true });
```

**Why rejected:**
- Mixes DB-level concerns (table definition) with business-level concerns (billing, access)
- The table shouldn't know about billing — that's the access layer's job

### Alternative C: Overload `group` instead of adding `level`

```ts
plans: {
  enterprise: { group: 'account', ... },  // group = billing level
  pro: { group: 'project', ... },
}
```

**Why rejected (after review feedback):**
- `group` means "mutual exclusivity" — overloading couples two different concerns
- Prevents multiple plan dimensions at one level (e.g., `compute-plans` and `storage-plans` both at account level)
- LLMs would generate `group: 'main'` from existing examples, creating silent failures
- Naming collision risk when entity names match common group names

---

## Stress Test Results

10 real-world scenarios were tested against the design. Results:

| # | Scenario | Result | Action |
|---|----------|--------|--------|
| 1 | **Sibling contention** — 50 projects under one account, high throughput | Scaling boundary | Documented. Root-to-leaf locking serializes at account wallet row. Fine for moderate throughput; needs sharding for thousands of req/s. |
| 2 | **`tenantLevel` missing** — closure table needs entity type to resolve ancestors | **Gap found** | Fixed: added `tenantLevel` to `SessionPayload`. Set during `switch-tenant`. |
| 3 | **Entity scoped to non-leaf level** — invoices scoped to account, user at project level | **Gap found** | Fixed: `withTenantFilter()` now walks ancestor chain to find matching level ID. |
| 4 | **Plan assigned at wrong level** — project-level plan assigned to account ID | **Gap found** | Fixed: validate at resolution time, log warning, skip mismatched plan. |
| 5 | **Flag resolution across levels** — same flag at account and project with different values | **Gap found** | Fixed: deepest wins (most specific level overrides parent). |
| 6 | **Billing period mismatch** — account monthly, project daily | Holds up | Independent wallet entries at different granularities compose correctly. |
| 7 | **User at parent level** — scoped to account, no project selected | Needs rule | Fixed: consume at scoped level only. Child-level features (`local`) unavailable. |
| 8 | **3-level `computeAccessSet()` perf** — 2 billing levels × 20 entitlements | Needs optimization | Fixed: batch wallet reads per level (`getBatchConsumption`). O(levels) not O(levels × entitlements). |
| 9 | **Tenant switching across accounts** — different accounts, different plans | Holds up | Same mechanism as today; just resolves more subscriptions. |
| 10 | **Add-ons at different levels** — account add-on doesn't affect project limits | Holds up | Add-ons modify the plan they're attached to, naturally scoped to their level. |

### Scenarios that hold up without changes

**Billing period mismatch (account: monthly, project: daily):** Different period granularities compose correctly. They're independent wallet entries. A project that exhausts its daily limit still counts against the account's monthly limit — but the daily limit resets the next day while the monthly keeps accumulating. Correct.

**Mid-period plan downgrade:** Account downgrades from enterprise (10,000) to starter (1,000) while at 8,000 consumed. Next consumption is denied until the period resets. Same behavior as single-level — no new issue.

**Tenant switching between accounts:** Full access set recomputation on switch. Same mechanism, more subscriptions resolved. No gap.

**Add-ons at different levels:** Account add-on adds credits to account limit. Project add-on adds storage to project limit. They don't cross-contaminate. Add-ons modify the subscription they're attached to.

**Override at different levels:** Account override and project override apply independently. The override store is already keyed by tenantId. Each level resolves its own overrides.

### Known scaling boundary: hot-row contention

With cascaded consumption, the root-level wallet row becomes a serialization point for ALL descendant consumption. For an account with 50 projects at 100 req/s total, that's 100 `SELECT ... FOR UPDATE` on the same row per second.

**Mitigation strategies (follow-up work, not in scope for v1):**
- **Counter sharding:** Split wallet row into N shards, distribute writes. Sum on read.
- **Async consumption queue:** Buffer increments in a queue, flush periodically. Accept eventual consistency for wallet reads.
- **Approximate counting:** Use probabilistic counters (HyperLogLog-style) for hot limit keys where exact counts aren't critical.

For v1, root-to-leaf locking with row-level locks is sufficient for the expected throughput of early adopters.

---

## Open Questions for Discussion

1. **Concurrent cascade consumption** — For v1, root-to-leaf locking is sufficient. For scale, do we need counter sharding or async consumption queues? (Deferred — tracked as a known scaling boundary.)

2. **`featureResolution` naming** — DX review suggested `featureScope: 'cascade' | 'own'` or a simple `inherit: boolean` as more intuitive alternatives. Current `'inherit' | 'local'` works but may be jargon-heavy for LLMs. Open to bike-shedding.
