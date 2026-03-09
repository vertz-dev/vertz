# Access Redesign — Entity-Centric `defineAccess()`

## Motivation

The current `defineAccess()` scatters entity information across three separate top-level keys (`hierarchy`, `roles`, `inheritance`). To understand what a "team" is, you read three different places. The redesign makes entities the root-level grouping — each entity is self-contained with its roles and inheritance.

## Quickstart

Minimal example — just roles, entitlements, and inheritance. No plans, no limits, no billing.

```ts
const access = defineAccess({
  entities: {
    workspace: { roles: ['admin', 'member'] },
    document: {
      roles: ['editor', 'viewer'],
      inherits: { 'workspace:admin': 'editor', 'workspace:member': 'viewer' },
    },
  },
  entitlements: {
    'document:view': { roles: ['viewer', 'editor'] },
    'document:edit': { roles: ['editor'] },
    'workspace:invite': { roles: ['admin'] },
  },
});

// Check access
const ctx = await access.createContext({ user, headers });
await ctx.can('document:edit', { entity: doc });   // true if user is editor
await ctx.can('workspace:invite');                  // true if user is admin
```

That's the minimum viable config. Add plans and limits later when you need billing. Everything below builds on this foundation.

## API Surface

### Full example

```ts
const access = defineAccess({
  entities: {
    organization: {
      roles: ['owner', 'admin', 'member'],
    },
    team: {
      roles: ['lead', 'editor', 'viewer'],
      inherits: {
        'organization:owner': 'lead',
        'organization:admin': 'editor',
        'organization:member': 'viewer',
      },
    },
    project: {
      roles: ['manager', 'contributor', 'viewer'],
      inherits: {
        'team:lead': 'manager',
        'team:editor': 'contributor',
        'team:viewer': 'viewer',
      },
    },
    task: {
      roles: ['assignee', 'viewer'],
      inherits: {
        'project:manager': 'assignee',
        'project:contributor': 'assignee',
        'project:viewer': 'viewer',
      },
    },
    brand: {
      roles: ['owner', 'editor'],
      inherits: {
        'organization:owner': 'owner',
        'organization:admin': 'editor',
      },
    },
  },

  entitlements: {
    // ── Simple: role-based only ──────────────────────────────────
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit': { roles: ['contributor', 'manager'] },
    'project:delete': { roles: ['manager'] },
    'project:export': { roles: ['manager'], flags: ['export-v2'] },
    'task:view': { roles: ['viewer', 'assignee'] },
    'organization:create-team': { roles: ['admin', 'owner'] },
    'organization:invite-member': { roles: ['admin', 'owner'] },
    'team:invite': { roles: ['lead', 'editor'] },
    'prompt:create': { roles: ['contributor', 'manager'] },
    'observation:create': { roles: ['contributor', 'manager'] },

    // ── With attribute-based rules (callback — r is scoped to entity) ──

    'task:delete': (r) => ({
      roles: ['assignee'],
      rules: [r.where({ createdBy: r.user.id })],
    }),

    'task:edit': (r) => ({
      roles: ['assignee'],
      rules: [r.where({ createdBy: r.user.id })],
    }),
  },

  // ── Plans ────────────────────────────────────────────────────────
  // Each billing variant is a separate plan. `group` ties them together
  // so a tenant can only have one plan per group at a time.
  // Plans are always associated with a tenant (e.g., organization).
  // Everything converges to entitlements — at check time you only ask
  // "can user do X?" and the system resolves roles + plan + limits.

  plans: {
    free: {
      title: 'Free',
      description: 'Get started for free',
      group: 'main',
      features: [
        'project:view',
        'project:edit',
        'task:view',
        'task:edit',
      ],
      limits: {
        prompts: { max: 50, gates: 'prompt:create' },
        prompts_per_brand: { max: 5, gates: 'prompt:create', scope: 'brand' },
        members: { max: 3, gates: 'organization:invite-member' },
        observations: { max: 1_000, per: 'month', gates: 'observation:create' },
      },
    },

    pro_monthly: {
      title: 'Pro',
      description: 'For growing teams',
      group: 'main',
      price: { amount: 29, interval: 'month' },
      features: [
        'project:view',
        'project:edit',
        'project:delete',
        'task:view',
        'task:edit',
        'team:invite',
        'organization:invite-member',
      ],
      limits: {
        prompts: { max: 100, gates: 'prompt:create' },
        prompts_per_brand: { max: 10, gates: 'prompt:create', scope: 'brand' },
        members: { max: 10, gates: 'organization:invite-member' },
        observations: { max: 10_000, per: 'month', gates: 'observation:create' },
      },
    },

    pro_yearly: {
      title: 'Pro',
      description: 'For growing teams',
      group: 'main',
      price: { amount: 290, interval: 'year' },
      features: [
        'project:view',
        'project:edit',
        'project:delete',
        'task:view',
        'task:edit',
        'team:invite',
        'organization:invite-member',
      ],
      limits: {
        prompts: { max: 500, gates: 'prompt:create' },
        prompts_per_brand: { max: 50, gates: 'prompt:create', scope: 'brand' },
        members: { max: 10, gates: 'organization:invite-member' },
        observations: { max: 10_000, per: 'month', gates: 'observation:create' },
      },
    },

    enterprise: {
      title: 'Enterprise',
      description: 'For large organizations',
      group: 'main',
      price: { amount: 999, interval: 'month' },
      features: [
        'project:view',
        'project:edit',
        'project:delete',
        'project:export',
        'task:view',
        'task:edit',
        'team:invite',
        'organization:create-team',
      ],
      limits: {
        prompts: { max: -1, gates: 'prompt:create' },
        prompts_per_brand: { max: -1, gates: 'prompt:create', scope: 'brand' },
        members: { max: -1, gates: 'organization:invite-member' },
        observations: { max: -1, per: 'month', gates: 'observation:create' },
      },
    },

    // ── Add-ons ──────────────────────────────────────────────────
    // Stack on top of the base plan. A tenant can have multiple add-ons.
    // Features and limits are additive to the base plan.

    extra_prompts_50: {
      title: 'Extra 50 Prompts',
      addOn: true,
      price: { amount: 10, interval: 'one_off' },
      limits: {
        prompts: { max: 50, gates: 'prompt:create' },  // +50 to base plan limit
      },
    },

    export_addon: {
      title: 'Export Add-on',
      addOn: true,
      price: { amount: 15, interval: 'month' },
      features: ['project:export'],                     // unlocks an entitlement
    },

    extra_seats_10: {
      title: '10 Extra Seats',
      addOn: true,
      price: { amount: 20, interval: 'month' },
      limits: {
        members: { max: 10, gates: 'organization:invite-member' },  // +10 seats
      },
    },
  },

  defaultPlan: 'free',
});
```

### Entitlement definition formats

An entitlement value can be:

**1. Object — role-based only (most common)**
```ts
'task:view': { roles: ['viewer', 'assignee'] },
```

**2. Callback — role + attribute-based rules (r scoped to entity)**
```ts
'task:delete': (r) => ({
  roles: ['assignee'],
  rules: [r.where({ createdBy: r.user.id })],
}),
```

`r` is typed to the entity's model — `r.where()` only accepts that entity's columns. See [Callback `r` type safety](#callback-r-type-safety--schema-generic) for how the type connection works.

```ts
// ✅ 'createdBy' autocompletes, type-checked against task columns
'task:edit': (r) => ({
  rules: [r.where({ createdBy: r.user.id })],
}),

// ❌ TS error — 'archived' does not exist on task model
'task:edit': (r) => ({
  rules: [r.where({ archived: false })],
}),
```

**3. Union type**

The entitlement type is: `EntitlementDef | ((r: RuleContext<Entity>) => EntitlementDef)`. Both object and callback return the same shape — the callback just adds access to the typed rule context `r`.

### Composing rules

All existing `rules.*` combinators work inside entitlements:

```ts
'task:edit': {
  roles: ['assignee'],
  rules: [
    rules.all(                                         // viewer AND creator
      rules.role('viewer'),
      isTaskCreator,
    ),
    rules.all(                                         // fva required for non-creators
      rules.role('assignee'),
      rules.fva(600),
    ),
  ],
},
```

## Key changes from current API

| Aspect | Before | After |
|--------|--------|-------|
| Entity definition | Split across `hierarchy`, `roles`, `inheritance` | Single `entities` object — self-contained |
| Hierarchy order | Explicit `hierarchy: [...]` array | Inferred from `inherits` declarations |
| Inheritance direction | Defined on the **parent** | Defined on the **child** with `'entity:role'` keys |
| Role references | Implicit — positional | Explicit — `'entity:role'` string format |
| Attribute rules | Separate from entitlements (`rules.where` in handlers) | Inline in entitlements via callback `(r) => ({...})` |
| Rule type safety | `Record<string, unknown>` | Callback `r` scoped to entity columns via schema generic |
| Entitlements | Flat | Same shape + optional `rules` / callback |
| Plans | Entitlements reference plans (`plans: ['enterprise']`) | Plans reference entitlements (`features: [...]`). Code-first with title/description. Limits use structured `scope` field. |
| Limit scoping | N/A | Explicit `scope` field (not string parsing) |
| Bulk checks | `canAll()` (sequential loop) | `canBatch()` (preload + batch) |

## Migration from Current API

**Hard break.** All packages are pre-v1 with no external users. Per our [breaking changes policy](../.claude/rules/policies.md), the old `defineAccess()` shape (`hierarchy`, `roles`, `inheritance` as top-level keys) is removed entirely. All existing tests (40+ in `packages/server/src/auth/__tests__/` and 28+ integration tests) are rewritten as part of the implementation.

No overloaded signature, no dual-API, no codemod. The old shape is gone. The new shape is the only shape.

**What changes for existing test code:**

```ts
// BEFORE
const access = defineAccess({
  hierarchy: ['Organization', 'Team', 'Project', 'Task'],
  roles: {
    Organization: ['owner', 'admin', 'member'],
    Team: ['lead', 'editor', 'viewer'],
  },
  inheritance: {
    Organization: { owner: 'lead', admin: 'editor', member: 'viewer' },
  },
  entitlements: {
    'project:create': { roles: ['admin', 'owner'] },
  },
});

// AFTER
const access = defineAccess({
  entities: {
    organization: { roles: ['owner', 'admin', 'member'] },
    team: {
      roles: ['lead', 'editor', 'viewer'],
      inherits: { 'organization:owner': 'lead', 'organization:admin': 'editor', 'organization:member': 'viewer' },
    },
  },
  entitlements: {
    'organization:create-project': { roles: ['admin', 'owner'] },
  },
});
```

**Key migration notes:**
- Entity names are lowercase in the new API (`organization` not `Organization`)
- Entitlement roles must belong to the referenced entity (no cross-entity roles in entitlements — use inheritance)
- `hierarchy` array is removed — hierarchy is inferred from `inherits`
- `inheritance` is removed — use `inherits` on each child entity
- `canAll()` is replaced by `canBatch()`

## Design Decisions

### Hierarchy — inferred from `inherits` declarations

The entity hierarchy is NOT defined in `defineAccess()` as an explicit array. Instead, it is **inferred from the `inherits` declarations** in the entities config.

**Inference algorithm:**

1. Parse all `inherits` keys across all entities. Each key has format `'entity:role'`.
2. Extract parent→child edges: if entity B has `inherits: { 'A:role': ... }`, then A is an ancestor of B.
3. Build a directed graph from these edges.
4. Topologically sort to determine hierarchy order.
5. Validate: must form one or more linear chains (see validation rules below).
6. Entities without `inherits` and not referenced by other entities' `inherits` are standalone roots.

**Example inference:**

```
team.inherits has keys starting with 'organization:'    → organization → team
project.inherits has keys starting with 'team:'         → team → project
task.inherits has keys starting with 'project:'         → project → task

Inferred hierarchy: ['organization', 'team', 'project', 'task']
```

**Why not explicit?** The `inherits` declarations already contain the hierarchy information. An explicit `hierarchy: [...]` array would be redundant — and any mismatch between the array and the inherits declarations would be a source of bugs.

**Closure store consistency:** At runtime, the closure store validates that `addResource()` calls use parent-child relationships consistent with the inferred hierarchy. Calling `addResource('project', 'p1', { parentType: 'organization', parentId: 'o1' })` would fail because the hierarchy says project's parent is team, not organization.

**Standalone entities:** An entity with no `inherits` and not referenced in any other entity's `inherits` is a standalone root. It participates in RBAC (has roles, entitlements) but has no hierarchical relationship with other entities. This is valid — not every entity needs to be in a hierarchy.

### Entitlement roles are entity-scoped

Entitlements use `entity:action` format. The roles listed MUST belong to that entity:

```ts
// VALID — 'viewer', 'contributor', 'manager' are all project roles
'project:view': { roles: ['viewer', 'contributor', 'manager'] },

// INVALID — 'owner' is an organization role, not a project role
'project:view': { roles: ['owner', 'manager'] },
```

Cross-entity access works through **inheritance resolution**. An org `owner` inherits `lead` in `team`, so `'team:invite': { roles: ['lead'] }` already covers org owners — no need to list org roles in team entitlements.

### Single approach for attribute rules: callback

One way to define attribute-based rules: the callback `(r) => ({...})`. `r` is scoped to the entity's model — type safety comes from the entity context, not from a separate builder. No `rules.for()`, no external rule objects, no possibility of entity mismatch.

### Callback `r` type safety — schema generic

The type safety for callback rule contexts requires connecting `defineAccess()` to the database schema definition via a generic parameter:

```ts
import { schema } from './db';

// Schema generic connects entity names to their model types
const access = defineAccess<typeof schema>({
  entities: {
    task: { roles: ['assignee', 'viewer'] },
  },
  entitlements: {
    'task:delete': (r) => ({
      // r.where() is typed: Record<keyof TaskModel, ...>
      // 'createdBy' autocompletes from task table columns
      rules: [r.where({ createdBy: r.user.id })],
    }),
  },
});
```

**How types flow:**

```
schema (typeof schema)
  → defineAccess<S> generic parameter
    → entitlement key prefix ('task:delete' → entity = 'task')
      → S['task'] → model type for 'task' entity
        → RuleContext<S['task']> → r parameter type
          → r.where() accepts Record<keyof S['task']['columns'], ...>
```

**Compile-time vs runtime:**
- **Compile-time:** `r.where()` column validation is purely TypeScript — the generic constrains the callback parameter type. No runtime column validation.
- **Runtime:** `r.where()` produces a rule descriptor `{ type: 'where', conditions: {...} }`. The conditions are evaluated against the entity data passed to `can()` at check time. If a condition references a field that doesn't exist on the entity, it evaluates to `false` (no match) — not an error.

**Without schema generic:** If `defineAccess()` is called without the schema generic, `r.where()` accepts `Record<string, unknown>` — no column validation, same as the current API. The schema generic is opt-in enhancement, not a requirement.

### Plans — code-first, converge to entitlements

Plans are defined code-first with metadata (title, description, price) and can be programmatically published to Stripe or other billing providers. A plan is always associated with a **tenant** (e.g., organization).

A plan defines:
- **`title`** / **`description`** — metadata for UI and billing provider sync
- **`group`** — ties billing variants together. A tenant can only have one plan per group at a time. Switching from `pro_monthly` to `pro_yearly` replaces within the `main` group. All base plans must have a `group`. Plans without a `group` are allowed only when `addOn: true`.
- **`price`** — `{ amount, interval }` where interval is `'month'` | `'quarter'` | `'year'` | `'one_off'`. Omitted for free plans.
- **`features`** — list of entitlements the plan grants. Same keys used elsewhere (`project:view`, `task:edit`).
- **`limits`** — metered quotas with `gates` linking to entitlements.

**Billing variants are separate plans, not nested.** `pro_monthly` and `pro_yearly` are distinct plans with their own limits, grouped by `group: 'main'`. Each plan is fully self-contained — no merging or override logic. Inspired by [Autumn's approach](https://docs.useautumn.com/documentation/pricing/plans).

At check time, plans are invisible — everything resolves to entitlements. `can('project:export')` checks:
1. Does the user's role grant this entitlement? (role layer)
2. Does the tenant's plan include this feature? (plan layer)
3. Is any relevant limit within quota? (limit layer)
4. Are required feature flags enabled? (flag layer)

All four layers converge into a single yes/no entitlement result.

### Full-stack advantage

Unlike external billing platforms (Autumn, Stripe Entitlements) that require HTTP calls to check access, Vertz controls the entire stack. A single `can('prompt:create')` resolves roles + inheritance + plan features + limits + flags + attribute rules **in-process** — no external calls, no webhooks, no state sync. The same `defineAccess()` config powers server-side authorization, client-side reactive `can()`, JWT-embedded access sets, and real-time WebSocket invalidation.

### Limits measure resources, not actions

Limits count **how many things exist**, not how many times an action was called. If a user creates 10 prompts and deletes 5, the count is 5 — not 10. Deletion adjusts the wallet. This is business logic the developer manages; the framework provides the counting/gating infrastructure.

Each limit declares `gates` — the entitlement it blocks when the limit is reached. The name "gates" means "this limit gates (controls passage through) this entitlement." When you call `can('prompt:create')`, the system checks the role + plan feature + any limits that gate `prompt:create`.

**Why `gates` and not `guards` / `controls`?** A gate is binary: open or closed. It either lets you through or blocks you. "Guards" implies active defense, "controls" is too generic. `gates` reads naturally: "the prompts limit gates the prompt:create entitlement."

### Limit scoping — structured `scope` field

Each limit declares its counting scope via an explicit `scope` field:

| `scope` | Meaning | Example |
|---------|---------|---------|
| _(omitted)_ | Tenant-level | `prompts: { max: 50, gates: 'prompt:create' }` — 50 total for the tenant |
| `'entity_name'` | Per entity instance | `prompts_per_brand: { max: 5, gates: 'prompt:create', scope: 'brand' }` — 5 per brand |

The limit key (`prompts_per_brand`) is just a descriptive identifier — the framework reads `scope` to determine counting scope. No string parsing, no naming conventions.

```ts
limits: {
  prompts: { max: 50, gates: 'prompt:create' },                                 // 50 total per tenant
  prompts_per_brand: { max: 5, gates: 'prompt:create', scope: 'brand' },         // 5 per brand
}
```

**Validation:** `scope` must reference a defined entity. `scope: 'nonexistent'` is a validation error.

### Multi-limit resolution

When multiple limits gate the same entitlement, **ALL must pass**. This is the most intuitive behavior — you need capacity at every scope level.

```ts
limits: {
  prompts: { max: 50, gates: 'prompt:create' },                                // tenant-level cap
  prompts_per_brand: { max: 5, gates: 'prompt:create', scope: 'brand' },        // per-brand cap
}
```

When checking `can('prompt:create', { entity: prompt, scope: { brand: 'brand-1' } })`:
1. Check `prompts` limit: has the tenant used < 50 total? → must pass
2. Check `prompts_per_brand` limit: has brand-1 used < 5? → must pass
3. Both must pass for the check to succeed

If either fails, the denial includes `meta.limit` with the specific limit that blocked (`{ key: 'prompts_per_brand', max: 5, consumed: 5, remaining: 0 }`).

**`canAndConsume()` with multiple limits:** When consuming, ALL limits are decremented atomically. If the atomic step fails on any limit (concurrent request consumed the last credit), the entire operation fails — no partial consumption.

### Limit windows

Limits support different time windows — or no window at all:

| `per` value | Meaning | Example |
|-------------|---------|---------|
| _(omitted)_ | Fixed for subscription lifetime | `{ max: 50 }` — 50 total, ever |
| `'month'` | Resets monthly | `{ max: 1_000, per: 'month' }` |
| `'year'` | Resets yearly | `{ max: 10_000, per: 'year' }` |

The billing period and the limit window are independent. You can pay yearly but have monthly credit resets. A limit with no `per` is a lifetime cap — it doesn't reset.

Special values:
- `max: -1` — unlimited (no cap enforced). Valid in any context.
- `max: 0` — zero capacity (feature effectively disabled at this limit level). Valid — useful for overrides to throttle a tenant.

When checking a limit, the system finds the tenant for the resource, looks up their plan, and evaluates the limit at the correct scope and window.

### Plans and entitlements — the mapping

Entitlements no longer list `plans: [...]` directly. Instead, plans declare which entitlements they grant via `features`. This is a single direction: **plan → entitlements**.

```ts
// Before: entitlement references plans
'project:export': { roles: ['manager'], plans: ['enterprise'] },

// After: plan references entitlements (features)
plans: {
  enterprise: {
    features: ['project:export', ...],
  },
},
// Entitlement only cares about roles + flags
'project:export': { roles: ['manager'], flags: ['export-v2'] },
```

This keeps entitlements clean — they define WHO (roles) and WHEN (flags/rules). Plans define WHAT you get access to.

### Add-ons — stackable on top of base plans

Add-ons are plans with `addOn: true`. They are defined in the same `plans` object as base plans, distinguished by the `addOn: true` flag.

| Aspect | Base plan | Add-on |
|--------|-----------|--------|
| Per group | One at a time | Multiple simultaneously |
| Features | Standalone | **Additive** — merged with base plan features |
| Limits | Standalone | **Additive** — added to base plan limits |
| Price | Subscription or free | One-off or recurring |
| Group | Required | Must NOT have a `group` |

When resolving entitlements, the system merges the base plan's features/limits with all active add-ons:

```
Effective features = base.features ∪ addon1.features ∪ addon2.features
Effective limits   = base.limits + addon1.limits + addon2.limits  (per matching key)
```

Example: Pro base gives 100 prompts. Tenant buys `extra_prompts_50`. Effective limit = 150 prompts.

Add-ons can:
- **Unlock entitlements** — `features: ['project:export']` grants access to an entitlement the base plan doesn't include
- **Increase limits** — `limits: { prompts: { max: 50 } }` adds 50 to the base limit
- **Both** — combine features and limits in one add-on

**Add-on features do NOT need to exist in any base plan.** An add-on can unlock an entitlement that no base plan includes (e.g., `project:export` is only available via the export add-on or the enterprise plan). This is valid.

### One-off add-on semantics

One-off add-ons (`price.interval: 'one_off'`) have special limit behavior:

```ts
extra_prompts_50: {
  addOn: true,
  price: { amount: 10, interval: 'one_off' },
  limits: { prompts: { max: 50, gates: 'prompt:create' } },
},
```

**Semantics:**
1. **Lifetime addition** — the +50 is a permanent increase to the tenant's effective limit. It does NOT reset with the billing period. If the base plan has `per: 'month'` on prompts, the one-off +50 is applied on top of the monthly allocation and persists indefinitely.
2. **Stackable** — a tenant can purchase the same one-off add-on multiple times. 2 purchases = +100 prompts. Each purchase creates a separate add-on assignment.
3. **Persists across plan changes** — upgrading or downgrading the base plan does not remove one-off add-on allocations. They are separate purchases tied to the tenant, not the plan.
4. **Consumption** — the one-off allocation is consumed in FIFO order after the base plan's periodic allocation is exhausted. The system tracks: base plan periodic limit → add-on allocations (oldest first).

**Recurring add-ons** (`interval: 'month'`, `'year'`) behave like the base plan — their limit additions reset with each billing period of the add-on.

### Seats / member limits — same pattern as consumable limits

Seats are just limits counting members instead of resources. No special `type` needed:

```ts
members: { max: 10, gates: 'organization:invite-member' },
members_per_team: { max: 5, gates: 'team:add-member', scope: 'team' },
```

When a member is invited, `can('organization:invite-member')` checks the `members` limit. When a member leaves, the developer decrements the count — same wallet pattern as prompts.

The framework doesn't need to know it's a "seat" — it's just a number. This keeps the model simple and uniform. Seats, prompts, API calls, storage — all use the same limit mechanism.

**Free vs billable roles (e.g., viewers don't count as seats):**

Many SaaS products charge only for certain roles — viewers are free. Two patterns:

```ts
// Pattern A: Separate entitlements (declarative — framework knows the distinction)
entitlements: {
  'organization:invite-member': { roles: ['admin', 'owner'] },  // billable seat
  'organization:invite-viewer': { roles: ['admin', 'owner'] },  // free seat
},
limits: {
  members: { max: 10, gates: 'organization:invite-member' },    // only gates billable invites
}
// Invite viewer → can('organization:invite-viewer') → no limit
// Invite editor → can('organization:invite-member') → limit checked

// Pattern B: Developer controls the wallet (flexible — logic in user code)
// Single entitlement, developer decides what to count:
// if (role !== 'viewer') await wallet.increment('members');
```

Pattern A is recommended — the access config declares the full policy. Pattern B is a fallback for cases where the billable/free distinction is too dynamic for static config.

### `can()` resolution flow

Server-side, a single `can()` call evaluates all layers in order (fail-fast):

```ts
const result = await can('task:edit', { entity: task });
// { allowed: boolean, reasons: DenialReason[], reason?: DenialReason, meta?: DenialMeta }
```

**Evaluation order (server-side):**

```
1. Authentication — is the user authenticated?
   └─ fail → 'not_authenticated'

2. Feature flags — are required flags enabled for the tenant?
   └─ fail → 'flag_disabled'

3. Plan features — does the tenant's plan (+ add-ons) include this entitlement?
   └─ fail → 'plan_required'

4. Limits — are any limits that gate this entitlement within quota?
   └─ fail → 'limit_reached' (with meta: { key, max, consumed, remaining })

5. Roles — does the user have a qualifying role? (direct assignment + inheritance)
   └─ fail → 'role_required'

6. Attribute rules — if entitlement has rules callback, evaluate against entity
   └─ fail → 'hierarchy_denied'

7. Step-up auth — if any rule requires fva(), check MFA freshness
   └─ fail → 'step_up_required' (with meta: { fvaMaxAge })
```

Ordered by actionability — the first denial reason is the most useful for the developer to surface to the user ("upgrade your plan" vs "you need the editor role" vs "verify your identity").

**Client-side (advisory — JWT access set):**

```ts
const check = can('task:edit');
// Signal-backed, reactive. Re-evaluates on WebSocket events.
// check.allowed  → boolean signal
// check.reason   → DenialReason | undefined signal
```

Client-side evaluates a subset of layers (no entity data, no server counts):

| Layer | Server | Client |
|-------|--------|--------|
| Authentication | ✅ | ✅ (from session) |
| Feature flags | ✅ | ✅ (from JWT / WebSocket) |
| Plan features | ✅ | ✅ (from JWT access set) |
| Limits | ✅ | ❌ (need server count) |
| Roles | ✅ | ✅ (from JWT access set) |
| Attribute rules | ✅ | ❌ (need entity data) |
| Step-up auth | ✅ | ✅ (from JWT `fva` claim) |

Client `can()` is enough to hide/disable UI elements, show upgrade prompts, and react to role/flag changes in real-time. The server always has the final word.

### Resolution at the app layer

Attribute rules (`where` conditions) are resolved at the application layer, not compiled to database-level RLS. This keeps the system database-agnostic (SQLite, Postgres, etc.). Future optimization: for Postgres, `where` rules could optionally compile to RLS policies.

### Semantics: roles OR rules

Within an entitlement, `roles` and each entry in `rules` are **OR'd** — any path that grants access is sufficient. Within a single rule (e.g., `rules.all(...)`), conditions are AND'd.

```
access = roles[0] OR roles[1] OR ... OR rules[0] OR rules[1] OR ...
```

## Validation Rules

### Entity and role validation

1. `inherits` keys must use format `'entity:role'` where `entity` is a defined entity and `role` is a valid role on that entity
2. `inherits` values must be a valid role on the current entity
3. **No self-referencing inheritance** — an entity cannot inherit from itself. `team: { inherits: { 'team:lead': 'viewer' } }` is invalid.
4. **No circular inheritance** — if A inherits from B, B cannot inherit from A (directly or transitively). The inheritance graph must be a DAG.
5. **Hierarchy must form linear chains** — each entity can have at most one parent entity (determined by its `inherits` sources). `project: { inherits: { 'team:lead': 'manager', 'organization:admin': 'contributor' } }` is invalid because project would have two parents (team AND organization). All sources in a single entity's `inherits` must reference the same parent entity.
6. **Hierarchy depth must not exceed 4 levels** — same limit as the current API.
7. **Duplicate roles within an entity** — `{ roles: ['admin', 'admin'] }` is a validation error. Roles must be unique.
8. **Empty roles** — `{ roles: [] }` is valid. An entity with no roles can still participate in the hierarchy but cannot be directly role-assigned.

### Entitlement validation

9. Entitlement prefix (before `:`) must match a defined entity
10. Entitlement roles must all exist in the referenced entity's `roles` list — no cross-entity roles
11. Callback `r.where()` conditions are type-checked at compile time (when schema generic is provided). No runtime validation of column names.

### Plan validation

12. Plan `features` must reference defined entitlement keys
13. Limit `gates` must reference a defined entitlement
14. Limit `scope` must reference a defined entity
15. `defaultPlan` must reference a defined base plan (not an add-on)
16. `price.interval` must be `'month'` | `'quarter'` | `'year'` | `'one_off'`
17. Add-on limit keys must match limit keys defined in at least one base plan (can't add to a limit that doesn't exist in the ecosystem)
18. Base plans must have a `group`. Add-ons must NOT have a `group`.
19. `limit.max` must be an integer. `-1` (unlimited) and `0` (disabled) are valid. Negative values other than `-1` are invalid.

### Inheritance direction validation

20. **Direction validation** — `inherits` keys must reference an ancestor entity (a parent or grandparent), not a descendant or sibling. If entity B inherits from entity A, then A must appear higher in the inferred hierarchy. Writing `organization: { inherits: { 'team:lead': 'owner' } }` (parent inheriting from child) is a validation error: "organization cannot inherit from team — team is a descendant of organization."
21. **Error guidance** — when a developer accidentally uses the old direction (defining inheritance on the parent instead of the child), the error message explicitly says: "Inheritance is defined on the child entity. Move `'organization:admin': 'editor'` to team.inherits."

## Type Flow Map

Shows how types flow from definition to consumer. Distinguishes compile-time and runtime validation.

```
┌─────────────────────────────────────────────────────────────────────┐
│ COMPILE TIME (TypeScript)                                          │
│                                                                    │
│ schema (typeof schema)                                             │
│   │                                                                │
│   ├─► defineAccess<S>()                                            │
│   │     │                                                          │
│   │     ├─► S keys → valid entity names (autocomplete)             │
│   │     │                                                          │
│   │     ├─► entitlement callback (r) parameter                     │
│   │     │     │                                                    │
│   │     │     └─► RuleContext<S[EntityName]>                        │
│   │     │           └─► r.where() → Record<keyof Columns, ...>     │
│   │     │                                                          │
│   │     └─► returns AccessDefinition<S>                            │
│   │           │                                                    │
│   │           ├─► createContext() → AccessContext<S>                │
│   │           │     └─► ctx.can(entitlement, { entity })           │
│   │           │           entity type checked against S             │
│   │           │                                                    │
│   │           └─► canBatch(entitlement, entities[])                │
│   │                 entities type checked against S                 │
│   │                                                                │
│   └─► Without schema generic:                                      │
│         All entity/column references are string (no autocomplete)  │
│         r.where() accepts Record<string, unknown>                  │
│         Everything still works — just no type narrowing             │
│                                                                    │
├─────────────────────────────────────────────────────────────────────┤
│ RUNTIME (validation in defineAccess())                             │
│                                                                    │
│ ├─► Entity validation: inherits refs, hierarchy inference          │
│ ├─► Entitlement validation: entity prefix, role scoping            │
│ ├─► Plan validation: features, limits, gates, scope                │
│ ├─► Inheritance validation: cycles, direction, depth               │
│ └─► Frozen output: Object.freeze() on all config                   │
│                                                                    │
│ Column names in r.where() are NOT validated at runtime.            │
│ Invalid columns evaluate to false (no match), not errors.          │
└─────────────────────────────────────────────────────────────────────┘
```

## Gap analysis vs WorkOS FGA

Compared against [WorkOS FGA](https://workos.com/docs/fga) (Zanzibar-based fine-grained authorization):

**Already covered:** RBAC, resource hierarchy, cross-entity inheritance, per-resource role assignments, attribute-based rules (typed), step-up auth, feature flags, plans/billing/limits, reactive client-side `can()`.

**Not adopting — intra-entity role ordering:** WorkOS allows `owner > editor > viewer` ordering within a resource type. We explicitly list all qualifying roles per entitlement instead. This is intentional — roles aren't always a linear hierarchy. A `billing` role is orthogonal to `editor`. A `viewer` might have a `request-access` entitlement that an `admin` shouldn't. Explicit listing handles orthogonal roles, role-specific entitlements, and edge cases correctly.

**Future — query API:** "Which resources can user X access?" / "Who has access to resource Z?" — useful for building permission UIs. Not a config concern; can be added as a runtime store feature later.

**Future — public access:** "Anyone can view" pattern. Can be modeled as an entitlement with empty `roles: []` (plan/flag check only, not role-gated) or a dedicated `public: true` flag on the entitlement.

## Plan Versioning & Grandfathering

### How versioning works

The `defineAccess()` config is always the **current** version of each plan. No version history in code — that would clutter the config. Versioning is handled by the runtime layer.

On startup/deploy, the system hashes each plan's config (features + limits + price). If the hash differs from the stored current version, a new version is created. Existing tenants keep their snapshot.

```
Deploy 1 → pro_monthly v1 stored (features, limits, price)
Deploy 2 → pro_monthly unchanged → no-op
Deploy 3 → pro_monthly limits changed → v2 created
           New subscribers → v2
           Existing subscribers → still on v1 (grandfathered)
```

**Version hash algorithm:** SHA-256 of the canonical JSON representation of `{ features, limits, price }`. Canonical JSON uses sorted keys (via `JSON.stringify` with sorted replacer) to ensure deterministic hashing regardless of object key order. `title` and `description` are excluded — cosmetic changes don't create new versions.

### Grandfathering policy

Each plan defines a `grandfathering` policy — how long existing tenants keep their old version:

```ts
plans: {
  pro_monthly: {
    title: 'Pro',
    group: 'main',
    price: { amount: 29, interval: 'month' },
    features: [...],
    limits: { ... },

    // Grandfathering policy
    grandfathering: {
      grace: '12m',  // 12-month grace period, then auto-migrate
    },
  },
}
```

| `grace` value | Behavior |
|---------------|----------|
| `'1m'`, `'3m'`, `'6m'`, etc. | Time-limited — auto-migrate after grace period expires |
| `'indefinite'` | Never auto-migrate (opt-in, discouraged) |
| _(omitted)_ | Default: **1 billing cycle** (monthly plan → `'1m'`, yearly → `'3m'`) |

**Default matches the billing cycle.** Monthly plans get 1 month grace, yearly plans get 3 months. This is enough notice without trapping early-stage startups in year-long commitments. Early-stage companies iterate fast — pricing changes are expected and acceptable with reasonable notice. Indefinite grandfathering requires explicit `'indefinite'` to discourage SKU sprawl.

### Migration API

```ts
// Migrate all tenants past their grace period (safe — only auto-eligible)
await access.plans.migrate('pro_monthly');

// Migrate a specific tenant (immediate, regardless of grace period)
await access.plans.migrate('pro_monthly', { tenantId: 'org-123' });

// Schedule a future migration date for all grandfathered tenants
await access.plans.schedule('pro_monthly', { at: '2026-06-01' });

// Query a tenant's plan state
const info = await access.plans.resolve('org-123');
// {
//   planId: 'pro_monthly',
//   version: 3,
//   currentVersion: 5,
//   grandfathered: true,
//   graceEnds: '2027-01-15',
//   snapshot: { features: [...], limits: {...}, price: {...} },
// }

// List all grandfathered tenants for a plan
const tenants = await access.plans.grandfathered('pro_monthly');
// [{ tenantId: 'org-123', version: 3, graceEnds: '2027-01-15' }, ...]
```

**Where does `access.plans` live?** `defineAccess()` returns an `AccessDefinition` object. The `plans` property on it provides the plan management API (migrate, schedule, resolve, grandfathered). This is a runtime API that requires store access — it reads from/writes to the plan version store and grandfathering state store.

### Migration semantics

When a tenant is migrated (auto or manual):
- **Feature balances carry over** — usage is not reset
- **New limits apply** at the next reset window (or immediately if no window)
- **Price changes apply** at the next billing cycle (no mid-cycle proration by default)

### Grandfathering testability

Testing versioning and grandfathering requires time control and config simulation:

**1. Clock injection** — the migration system accepts an optional `now` parameter (or injectable clock) for deterministic time-based testing:

```ts
// Test grace period expiration
const access = defineAccess({ ..., clock: () => new Date('2027-01-16') });
await access.plans.migrate('pro_monthly');  // migrates tenants whose grace ended before 2027-01-16
```

**2. Version simulation** — `defineAccess()` can be called with different configs in tests to simulate deploy-time version detection:

```ts
// Deploy 1 — original config
const v1 = defineAccess({ plans: { pro: { features: ['a', 'b'], ... } } });
await v1.plans.initialize();  // stores v1

// Deploy 2 — changed config (simulates a new deploy)
const v2 = defineAccess({ plans: { pro: { features: ['a', 'b', 'c'], ... } } });
await v2.plans.initialize();  // detects hash change, creates v2
```

**3. Event testing** — grandfathering events (`plan:grace_approaching`, etc.) are emittable via the clock mechanism. Advance the clock past the threshold and verify the event fires.

**4. All stores have InMemory implementations** — `InMemoryPlanVersionStore`, `InMemoryGrandfatheringStore`, `InMemoryWalletStore` are provided for testing. No cloud dependency required.

### Events / hooks

The framework emits events that developers use for communication (emails, in-app banners):

| Event | When | Use case |
|-------|------|----------|
| `plan:version_created` | Deploy detects plan change | Internal alert — new version available |
| `plan:grace_approaching` | 30 days before grace expires | Send advance notice email to tenant |
| `plan:grace_expiring` | 7 days before grace expires | Send reminder email |
| `plan:migrated` | Tenant moved to new version | Confirmation email, in-app notification |

### Best practices enforced by the API

| Practice | How the framework enforces it |
|----------|------------------------------|
| **Grandfathering by default** | Existing tenants always keep their snapshot. No opt-out. |
| **Time-limited grace periods** | Default: 1 billing cycle. Indefinite requires explicit `'indefinite'`. |
| **Advance notice** | `grace_approaching` and `grace_expiring` events for proactive communication |
| **No downgrade migrations** | `migrate()` warns if new version has fewer features than the tenant's current version |
| **Single version per tenant** | No partial migrations. All-or-nothing: features + limits + price move together |

### Anti-patterns the API discourages

| Anti-pattern | Framework response |
|-------------|-------------------|
| Indefinite grandfathering | Requires explicit `'indefinite'` — not the default |
| Too many active versions | Warning when a plan has > 3 concurrent active versions |
| Instant forced migration | `migrate()` is always explicit — never automatic without grace period |
| Frequent plan changes | Version creation only on actual config hash change — cosmetic edits (title, description) don't create new versions |

### What triggers a new version

A new version is created when any of these change:
- `features` list (entitlements added or removed)
- `limits` (max, per, gates, scope changed)
- `price` (amount or interval changed)

These do NOT trigger a new version (metadata-only):
- `title`
- `description`

## Performance

### Problem

The current `canAll()` is a sequential loop — checking 50 tasks means 50 separate role lookups, 50 org resolutions, 50 plan lookups, 50 wallet queries. This is O(N × layers), unacceptable for list views and batch APIs.

### `canBatch()` replaces `canAll()`

`canAll()` is removed. `canBatch()` is its replacement with proper batch semantics:

```ts
// OLD — removed
const results = await ctx.canAll([
  { entitlement: 'project:view', resource: { type: 'Project', id: 'proj-1' } },
  { entitlement: 'project:edit', resource: { type: 'Project', id: 'proj-1' } },
]);

// NEW — batch check for same entitlement across multiple entities
const results = await ctx.canBatch('task:edit', tasks);
// Map<string, AccessCheckResult>  — keyed by entity ID
```

The key difference: `canBatch()` operates on a single entitlement across multiple entities, enabling the preload optimization. For checking multiple entitlements on a single entity, call `can()` multiple times — the preloaded context makes this cheap.

### Strategy: preload once, evaluate many

The access context is created once per request. On creation, it eagerly loads the **static layers** (things that don't change per entity). Per-entity evaluation only runs the **dynamic layers**.

```ts
// Middleware — creates context once per request
const ctx = await access.createContext({ user, headers });

// All checks in this request reuse preloaded data
await ctx.can('task:edit', { entity: task });
const results = await ctx.canBatch('task:edit', tasks);
```

### What gets preloaded (once per request)

| Data | Source | Cost |
|------|--------|------|
| User's role assignments | RoleAssignmentStore | 1 query — all roles for this user |
| Tenant ID | orgResolver or JWT | 1 query or 0 (from JWT) |
| Tenant's plan + active add-ons | PlanStore | 1 query |
| Effective features (plan ∪ add-ons) | Computed from plan | 0 (Set lookup) |
| Effective limits (plan + add-on sums) | Computed from plan | 0 (Map merge) |
| Feature flags | FlagStore (in-memory) | 0 (already in-memory) |
| JWT access set | From request headers | 0 (already parsed) |

After preloading, each `can()` call is:
- **Feature flags** → Set.has() — O(1)
- **Plan features** → Set.has() — O(1)
- **Limits** → single wallet query per limit key (batchable)
- **Roles** → lookup in preloaded role map + inheritance resolution (in-memory)
- **Attribute rules** → evaluate against entity data (in-memory)

### Batched checks — `canBatch()`

```ts
const results = await ctx.canBatch('task:edit', tasks);
// Map<string, AccessCheckResult>  — keyed by entity ID
```

Under the hood:
1. **Static layers** (flags, plan, features) — evaluated ONCE, shared across all entities
2. **Limits** — ONE wallet query per limit key per tenant (not per entity)
3. **Roles** — user's role set is already preloaded. Per-entity: find the resource's position in the hierarchy and match against preloaded roles. Batchable: load all resource→ancestor mappings in one closure table query.
4. **Attribute rules** — evaluated per entity, but with all context already in memory

For 50 tasks in the same project: **3-4 total DB queries** instead of 250+.

### Performance verification

The "3-4 queries for 50 entities" claim will be verified with:

1. **Batch closure store API** — `getAncestorsBatch(entities: Array<{ type, id }>)` returns all ancestor mappings in a single query. This does not exist yet; it is part of the implementation.
2. **Batch wallet API** — `checkBatch(tenantId, limitKeys: string[])` returns all limit states in a single query.
3. **Integration benchmark** — an integration test that asserts query count for `canBatch()` with 50 entities. The test instruments the stores to count queries and asserts `<= 4`.
4. **If the batch APIs prove infeasible**, the claim will be revised and documented with actual measured query counts.

### JWT short-circuit

For checks that don't need limits or attribute rules, the JWT access set answers immediately — zero DB queries:

```ts
// JWT already contains: flags ✅, plan features ✅, roles at org level ✅
// These can short-circuit without hitting any store:
await ctx.can('project:export');  // flag + plan feature check → JWT only

// These still need DB:
await ctx.can('task:edit', task);  // attribute rule → needs entity data
await ctx.can('prompt:create');    // limit check → needs wallet query
```

The context checks the JWT first. If the JWT says "denied" for a static layer (flag, plan, role), it fails fast. If "allowed" for all static layers, it proceeds to dynamic layers (limits, attribute rules).

### Tiered caching

| Data | Cache strategy | Invalidation |
|------|---------------|-------------|
| Feature flags | In-memory singleton | WebSocket push on change |
| Plan assignment | Per-request preload + 60s TTL background cache | WebSocket push on plan change |
| Role assignments | Per-request preload | WebSocket push on role change |
| Wallet/limit counts | **Never cached** — always fresh | — (counts are too dynamic) |
| Closure table (ancestors) | Per-request preload + LRU cache | On resource create/move/delete |
| Access config (`defineAccess()`) | In-memory singleton (immutable) | On deploy (new version) |

### Query budget per request

| Scenario | DB queries |
|----------|-----------|
| Simple `can()` — flag/plan/role only (JWT hit) | **0** |
| `can()` with limit check | **1** (wallet query) |
| `can()` with attribute rule | **0** extra (entity already loaded by caller) |
| `canBatch()` — 50 entities, same tenant | **3-4** (preload roles + closure batch + wallet) |
| `canBatch()` — 50 entities, mixed tenants | **3-4 per tenant** (grouped by tenant) |

### `canAndConsume()` — atomic check + consume

Already exists in the current implementation. The wallet `consume()` is atomic (compare-and-swap at the store level). The full sequence:

1. Evaluate all non-limit layers (auth, flags, plan, roles, rules) — fail fast on any denial
2. Check limit(s) — read current wallet state
3. Atomic consume — CAS operation: `UPDATE wallet SET consumed = consumed + 1 WHERE consumed = {expected}`
4. If CAS fails (concurrent consumer got the last credit), return `{ allowed: false, reason: 'limit_reached' }`

The CAS ensures no over-consumption under concurrency. The check in step 2 is advisory — the atomic step in 3 is the source of truth. This means: under high contention, a small number of requests may pass the check but fail at consume. This is correct behavior — the framework never over-grants.

## Stripe Sync

Plans are defined code-first in `defineAccess()`. The framework can programmatically sync them to Stripe:

```ts
// Sync all plans to Stripe — creates/updates Products and Prices
await access.plans.syncToStripe({ apiKey: process.env.STRIPE_SECRET_KEY });
```

Mapping:

| Vertz concept | Stripe concept |
|---------------|---------------|
| Plan (`pro_monthly`) | Product + Price |
| `title` / `description` | Product name / description |
| `price.amount` / `price.interval` | Price amount / recurring interval |
| `group` | Product metadata (`group: 'main'`) |
| Add-on | Product with `metadata.addOn: true` |
| Plan version | Product metadata (`version: 3`) |

The sync is **idempotent** — running it twice produces the same result. It uses Stripe product metadata to track which Vertz plan ID and version it corresponds to. When a plan version changes, a new Stripe Price is created (old Price is archived, not deleted — preserves existing subscriptions).

This is a **push** operation — the framework pushes plan definitions to Stripe. Stripe is the source of truth for *payment and subscription state*; Vertz is the source of truth for *access*. Subscription lifecycle events flow back via webhooks (see [Webhook Handling](#webhook-handling)).

## Overrides — per-tenant customizations

Overrides are runtime, per-tenant adjustments that sit on top of the plan + add-ons. They're not plans — they're business decisions applied to a specific customer (strategic partner, beta tester, compensation for an outage, sales deal).

### API

```ts
// Grant extra limits to a specific tenant
await access.overrides.set('org-123', {
  limits: { prompts: { add: 200 } },           // +200 on top of plan + add-ons
});

// Unlock a feature the plan doesn't include
await access.overrides.set('org-123', {
  features: ['project:export'],                  // granted regardless of plan
});

// Set a hard limit override (replaces, doesn't add)
await access.overrides.set('org-123', {
  limits: { prompts: { max: 1000 } },           // hard cap at 1000, ignoring plan
});

// Remove an override
await access.overrides.remove('org-123', { limits: ['prompts'] });
await access.overrides.remove('org-123', { features: ['project:export'] });

// View all overrides for a tenant
const overrides = await access.overrides.get('org-123');
// { features: ['project:export'], limits: { prompts: { add: 200 } } }
```

### Resolution order

When evaluating `can()`, effective features and limits are computed as:

```
Effective features = plan.features ∪ addons.features ∪ overrides.features
Effective limits   = plan.limits + addons.limits + overrides.limits
```

For limits, two override modes:
- **`add: N`** — additive, stacks on top of plan + add-ons. "Give them 200 more prompts."
- **`max: N`** — hard override, replaces the computed total. "Cap them at exactly 1000."

`max` takes precedence over `add` if both are set on the same override. When `max` is removed (via `overrides.remove`), only the `max` is cleared — if an `add` was also set, it takes effect.

### Override edge cases

| Scenario | Behavior |
|----------|----------|
| Override a limit that doesn't exist in any plan | Validation error — limit key must match a defined limit |
| `add: -50` (negative add) | Valid — reduces the effective limit. Useful for throttling without hard-capping. |
| `max: -1` (unlimited override) | Valid — overrides to unlimited regardless of plan + add-ons. |
| `max: 0` (disable via override) | Valid — hard blocks the entitlement at the limit layer. |
| Negative `max` (other than `-1`) | Invalid — validation error. Only `-1` is allowed as a special value. |
| Both `add` and `max` set | `max` wins. Both are stored. Removing `max` reveals the `add`. |
| Feature override for nonexistent entitlement | Validation error — features must reference defined entitlement keys. |

### Use cases

| Scenario | Override |
|----------|---------|
| Strategic partner deal | `features: ['project:export']` + `limits: { prompts: { add: 500 } }` |
| Beta tester for new feature | `features: ['ai-assistant']` |
| Compensation for outage | `limits: { observations: { add: 5000 } }` |
| Sales trial extension | `limits: { members: { max: 50 } }` |
| Throttle abusive tenant | `limits: { observations: { max: 0 } }` |

### Overrides vs add-ons

| Aspect | Add-on | Override |
|--------|--------|---------|
| Cost | Has a price | Free (no billing) |
| Purchased by | Tenant (self-serve) | Applied by the business (admin/sales) |
| Defined in | `defineAccess()` config | Runtime API |
| Versioned | Yes (with the plan) | No (always current) |
| Visible to tenant | Yes (in billing UI) | Optional (depends on implementation) |

## Add-on Compatibility

Add-ons can declare which base plans they're compatible with:

```ts
export_addon: {
  title: 'Export Add-on',
  addOn: true,
  price: { amount: 15, interval: 'month' },
  features: ['project:export'],
  requires: { group: 'main', plans: ['pro_monthly', 'pro_yearly', 'enterprise'] },
},
```

`requires` is optional. When set:
- The add-on can only be purchased by tenants on one of the listed plans
- Attempting to attach the add-on to a tenant on `free` would fail with an error
- If a tenant downgrades from `pro` to `free`, their incompatible add-ons are flagged (not auto-removed — business decides)

## Payment Processor Abstraction

Stripe sync is the first implementation, but the design is processor-agnostic. The `syncToStripe()` call is a specific adapter. Future adapters:

```ts
await access.plans.syncToStripe({ apiKey: '...' });
await access.plans.syncToLemonSqueezy({ apiKey: '...' });
await access.plans.syncToPaddle({ apiKey: '...' });
```

The cloud offering can abstract this entirely — developers configure billing through the Vertz dashboard, and the platform handles processor integration (and charges a percentage on transactions).

## Limit Overage Billing

When a tenant hits a limit, two options:

**1. Hard block (default)** — `can()` returns `false`, tenant must upgrade or buy an add-on.

**2. Overage billing** — allow usage beyond the limit at a per-unit cost. The excess is billed at the end of the billing period.

```ts
limits: {
  observations: {
    max: 10_000,
    per: 'month',
    gates: 'observation:create',
    overage: { amount: 0.01, per: 1 },          // $0.01 per extra observation
  },
}
```

When `overage` is set:
- `can('observation:create')` returns `true` even when the limit is exceeded
- The `check()` result includes `meta.limit.overage: true` so the UI can show a warning ("you're in overage — extra usage will be billed")
- At billing cycle end, the framework computes: `(consumed - max) × overage.amount` and reports it to the payment processor as a metered line item

**Overage caps** — optional safety net:

```ts
overage: { amount: 0.01, per: 1, cap: 500 },    // max $500 overage per period
```

When the overage cap is hit, `can()` returns `false` — hard block. Prevents runaway bills.

Overage billing requires a payment processor adapter (Stripe metered billing, etc.). Without one, overage config is a validation error in production. In test/dev environments (using InMemory stores), overage is tracked but not billed.

## Webhook Handling

Payment events flow from the processor to the framework. The framework provides a webhook handler that maps processor events to access system actions:

```ts
// Route: POST /api/billing/webhooks
app.post('/api/billing/webhooks', access.billing.webhookHandler());
```

| Processor event | Framework action |
|----------------|-----------------|
| `subscription.created` | Assign plan to tenant |
| `subscription.updated` | Update plan (upgrade/downgrade) |
| `subscription.deleted` | Revert to `defaultPlan` |
| `invoice.payment_failed` | Emit `billing:payment_failed` event |
| `invoice.paid` | Clear payment failure state |
| `checkout.session.completed` | Activate plan or add-on |

The handler is processor-specific (Stripe adapter first). It validates webhook signatures, maps events, and updates the plan/add-on stores.

**Developer hooks** — the framework emits events for business logic:

```ts
access.billing.on('subscription:created', async ({ tenantId, planId }) => {
  // Send welcome email, provision resources, etc.
});

access.billing.on('billing:payment_failed', async ({ tenantId, planId, attempt }) => {
  // Notify admin, show in-app banner, etc.
});

access.billing.on('subscription:canceled', async ({ tenantId, planId }) => {
  // Cleanup, send win-back email, etc.
});
```

**Event naming convention:** All events use `category:action` format. Categories: `plan` (versioning/migration), `subscription` (lifecycle), `billing` (payment events).

## Tenant Billing Portal

Self-serve UI components for tenants to manage their billing:

```tsx
// Pricing table — shows available plans with current plan highlighted
<PricingTable access={access} />

// Plan management — upgrade/downgrade, view current plan, billing cycle
<PlanManager access={access} />

// Usage dashboard — current consumption vs limits, overage warnings
<UsageDashboard access={access} />

// Add-on store — browse and purchase add-ons
<AddOnStore access={access} />

// Invoice history — past invoices and payment status
<InvoiceHistory access={access} />
```

These components use the `can()` system internally — they show upgrade prompts for plan-gated features, disable purchasing incompatible add-ons, and display real-time usage against limits.

The components are optional — developers can build their own UI using the same APIs the components use. The components are just the fast path.

## Data Residency — Local DB vs Cloud

### The problem

The access system generates several categories of data. Storing all of it in the developer's local database (especially SQLite) bloats the DB, adds complexity, and limits scalability. But moving everything to the cloud adds latency and a dependency.

### Data classification

| Data | Characteristics | Where it lives |
|------|----------------|---------------|
| **Access config** (`defineAccess()`) | Static, immutable per deploy | In-memory (code) |
| **Role assignments** | Low volume, low churn. Critical for `can()`. | **Local DB** |
| **Closure table** (resource hierarchy) | Medium volume, grows with resources. Critical for inheritance. | **Local DB** |
| **Feature flags** | Tiny, rarely changes | **Local DB** (or cloud with sync) |
| **Plan assignments** (tenant → plan) | Low volume, rarely changes | **Local DB** |
| **Plan version snapshots** | Grows with version history. Needed for grandfathering. | **Cloud** |
| **Wallet / consumption counts** | High write volume, per-tenant per-limit per-period | **Cloud** |
| **Overrides** | Low volume, rarely changes | **Local DB** |
| **Add-on assignments** | Low volume | **Local DB** |
| **Billing events / invoices** | High volume, append-only, archival | **Cloud** |
| **Grandfathering state** | Per-tenant per-plan, migration tracking | **Cloud** |
| **Audit log** (who changed what) | Append-only, compliance | **Cloud** |

### Principle: local DB = hot path, cloud = everything else

**Local DB stores what `can()` needs to resolve in-process:**
- Role assignments, closure table, plan assignments, flags, overrides, add-on assignments
- These are the tables that `can()` queries on every request
- Small, bounded growth — scales linearly with tenants and resources, not with usage
- Works perfectly on SQLite — low write concurrency, read-heavy

**Cloud stores what accumulates over time:**
- Wallet counts (high write volume — every create/delete adjusts the count)
- Plan version snapshots (grows with every deploy that changes a plan)
- Grandfathering/migration state
- Billing events, invoices, audit logs
- This data would bloat SQLite and is better served by a managed service

### How it works

```ts
const access = defineAccess({
  // ... entities, entitlements, plans ...

  storage: {
    // Local DB — the developer's database (SQLite or Postgres)
    local: db,

    // Cloud — Vertz managed service (wallet, versions, billing)
    cloud: { apiKey: process.env.VERTZ_API_KEY },
  },
});
```

**Without cloud (self-hosted / offline dev):**
Everything falls back to local DB. Wallet counts, version snapshots, all stored locally. Works fine — just more data in the local DB. SQLite handles it for small-to-medium scale. All cloud features have `InMemory` implementations for testing — no cloud dependency required to run the full test suite.

**With cloud:**
Hot-path data stays local (fast `can()` resolution). High-volume and archival data lives in the cloud. The developer's SQLite stays lean.

### Query flow with cloud

```
can('prompt:create')
  ├─ Flags        → local (in-memory)
  ├─ Plan feature → local (plan assignment table)
  ├─ Roles        → local (role assignment + closure table)
  ├─ Limits       → cloud (wallet API — single HTTP call, <50ms with edge)
  └─ Attr rules   → local (entity data already loaded)
```

The limit check is the only layer that hits the cloud. For checks without limits (pure role/flag/plan checks), it's 100% local — zero network calls.

### SQLite longevity

By offloading high-write and archival data to the cloud, the local SQLite database stays:
- **Small** — role assignments, plan assignments, flags, overrides are all low-volume tables
- **Read-heavy** — `can()` is reads, wallet writes go to cloud
- **Low contention** — no high-frequency writes competing for SQLite's single-writer lock
- **Long-lived** — developers don't need to migrate to Postgres just because their access system grew

This lets developers stay on SQLite longer, saving them operational cost and complexity.

## Cloud Failure Modes

When the cloud wallet API is unavailable, the limit check layer needs a defined behavior. The developer configures this per `defineAccess()`:

```ts
storage: {
  local: db,
  cloud: {
    apiKey: process.env.VERTZ_API_KEY,
    failMode: 'closed',  // default: deny on cloud failure
  },
},
```

| `failMode` | Behavior on cloud error | Use case |
|------------|------------------------|----------|
| `'closed'` (default) | Limit checks return `false` — deny access | Security-sensitive (billing, payments). No one gets free access during an outage. |
| `'open'` | Limit checks return `true` — allow access | UX-sensitive (content viewing, low-value actions). Prefer availability over strict enforcement. |
| `'cached'` | Use last-known wallet state (stale reads) | Balance between security and availability. Requires local wallet cache with TTL. |

**Without cloud configured:** All stores are local (InMemory or local DB). No failure mode needed — everything is in-process.

**Timeout:** Cloud wallet calls have a 2-second timeout. On timeout, the configured `failMode` applies. The `check()` result includes `meta.cloudError: true` so the application can log/alert.

## Implementation Phases

Rough phase outline — each phase delivers a usable vertical slice. Detailed acceptance criteria will be defined per-phase before implementation.

```
Phase 1: Entity restructuring + entitlements
├── New defineAccess() input shape (entities, entitlements)
├── Hierarchy inference from inherits
├── Validation rules (1-11)
├── createAccessContext + can/check/authorize
├── Rewrite all existing tests to new shape
└── Depends on: nothing

Phase 2: Plans + limits + billing foundations
├── Plan definitions (features, limits, gates, scope)
├── Plan validation rules (12-19)
├── Wallet store + canAndConsume()
├── canBatch() (replaces canAll)
├── Multi-limit resolution (ALL must pass)
├── Add-ons (addOn: true, additive semantics)
└── Depends on: Phase 1

Phase 3: Overrides + advanced limits
├── Override API (set, remove, get)
├── Override resolution (add vs max)
├── Override validation (edge cases)
├── Overage billing config
├── One-off add-on semantics
├── Add-on compatibility (requires)
└── Depends on: Phase 2

Phase 4: Versioning + grandfathering
├── Plan version hashing (SHA-256 canonical JSON)
├── Version store + snapshot persistence
├── Grandfathering policy (grace periods)
├── Migration API (migrate, schedule, resolve)
├── Grandfathering events
├── Clock injection for testability
└── Depends on: Phase 2

Phase 5: Billing integration
├── Stripe sync adapter (syncToStripe)
├── Webhook handler (subscription lifecycle)
├── Billing events (subscription:created, etc.)
├── Payment processor abstraction
└── Depends on: Phase 4

Phase 6: Cloud storage + data residency
├── Cloud wallet adapter
├── Cloud failure modes (closed/open/cached)
├── Local/cloud data split
├── InMemory implementations for all cloud stores
└── Depends on: Phase 2

Phase 7: Client-side + UI components (optional, can parallel Phase 5-6)
├── JWT access set with plans/limits
├── Client-side reactive can()
├── Billing portal components (PricingTable, UsageDashboard, etc.)
└── Depends on: Phase 2
```

Phases 4-7 can proceed in parallel after Phase 2 is complete. Phase 3 can start immediately after Phase 2.

## Open — to define later

- Rate limiting / abuse prevention at the access layer
- Multi-region cloud edge caching for wallet queries
- Self-hosted cloud alternative (run the wallet/billing service yourself)
