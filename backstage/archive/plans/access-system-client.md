# Unified Access System: Client-Side Integration

> **Status:** Draft (Decisions Applied)
> **Authors:** Vinicius (CTO), Ben (Core)
> **Date:** 2026-03-07
> **Extends:** [`plans/access-system.md`](../../plans/access-system.md) (Server-Side Design)
> **Related:** [#345](https://github.com/vertz-dev/vertz/issues/345), [#346](https://github.com/vertz-dev/vertz/issues/346)

---

## 1. Problem Statement

The server-side access system (`plans/access-system.md`) provides `ctx.can('project:export', project)` that resolves five layers (feature flags, RBAC, hierarchy, plan, wallet) in a single call. But there is no corresponding client-side story:

- **UI components cannot check permissions.** No API for "should this button be visible/enabled?"
- **No session bootstrap.** The user's access set is computed server-side per-request but never shipped to the client.
- **No entity-level access metadata.** The UI doesn't know which actions the user can perform on each entity.
- **No reactive invalidation.** Permission changes require a hard refresh.
- **No denial context.** When access is denied, the UI can't distinguish "upgrade your plan" from "contact your admin" from "feature coming soon."

---

## 2. `defineAccess()` Enhanced API

### 2.1 Configuration

```ts
import { defineAccess } from '@vertz/server';
import { Organization, Team, Project, Task } from './entities';

const auth = defineAccess({
  hierarchy: [Organization, Team, Project, Task],

  roles: {
    Organization: ['owner', 'admin', 'member'],
    Team: ['lead', 'editor', 'viewer'],
    Project: ['manager', 'contributor', 'viewer'],
    Task: ['assignee', 'viewer'],
  },

  entitlements: {
    'project:view':   { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit':   { roles: ['contributor', 'manager'] },
    'project:create': { roles: ['manager', 'lead', 'admin', 'owner'] },
    'project:delete': { roles: ['manager'] },
    'project:export': { roles: ['manager'], plans: ['enterprise'], flags: ['export-v2'] },
    'task:view':      { roles: ['viewer', 'assignee'] },
    'task:edit':      { roles: ['assignee'] },
    'task:complete':  { roles: ['assignee'] },
    'team:invite':    { roles: ['lead', 'admin', 'owner'] },
    'org:billing':    { roles: ['owner', 'admin'] },
    'org:audit-log':  { roles: ['owner', 'admin'], plans: ['enterprise'] },
  },

  plans: {
    free: {
      entitlements: ['project:create', 'project:view', 'project:edit'],
      limits: { 'project:create': { per: 'month', max: 5 } },
    },
    pro: {
      entitlements: ['project:create', 'project:view', 'project:edit', 'project:export'],
      limits: { 'project:create': { per: 'month', max: 100 } },
    },
    enterprise: {
      entitlements: [
        'project:create', 'project:view', 'project:edit', 'project:export',
        'org:audit-log', 'org:sso',
      ],
      limits: { 'project:create': { per: 'month', max: Infinity } },
    },
  },

  flags: {
    'export-v2': { description: 'Export V2 with CSV/JSON support' },
  },
});
```

---

## 3. Declarative Access Rules on Entities

### 3.1 `rules.where()` + `rules.user` — Unified with DB Query Syntax

Access rules use the same query syntax as the DB layer. No separate DSL. `rules.where()` accepts the same filter shape as entity queries, with `rules.user` as a declarative marker for session data.

```ts
import { entity, rules } from '@vertz/server';

// Reusable rules — just constants, no new concept
const isOwner = rules.where({ createdBy: rules.user.id });
const isAssignee = rules.where({ assignedTo: rules.user.id });
const isReviewer = rules.where({ reviewers: { has: rules.user.id } });
const isNotArchived = rules.where({ archived: false });

const Project = entity('projects', {
  model: projectModel,
  access: {
    list:   rules.all(rules.role('viewer', 'contributor', 'manager'), isNotArchived),
    get:    rules.role('viewer', 'contributor', 'manager'),
    create: rules.role('manager', 'lead', 'admin', 'owner'),
    update: rules.any(rules.role('contributor', 'manager'), isOwner),
    delete: rules.any(rules.role('manager'), isOwner),
    export: rules.all(
      rules.role('manager'),
      rules.plan('enterprise'),
      rules.flag('export-v2'),
    ),
  },
});

const Task = entity('tasks', {
  model: taskModel,
  access: {
    list:     rules.role('viewer', 'assignee'),
    get:      rules.role('viewer', 'assignee'),
    update:   rules.any(rules.role('editor'), isAssignee),
    complete: isAssignee,
    comment:  rules.any(rules.role('viewer'), isReviewer),
  },
});
```

### 3.2 `rules.user` — Session Data Markers

`rules.user` is a declarative marker, not a runtime value. It represents the current user's session data and is resolved at evaluation time:

```ts
rules.user.id          // Current user's ID
rules.user.tenantId    // Current user's tenant/org ID
```

Because `rules.user` is declarative, the framework can:
1. **Generate RLS policies:** `rules.where({ createdBy: rules.user.id })` → `USING (created_by = current_setting('app.user_id')::UUID)`
2. **Apply as query filters:** Automatically scope entity list queries
3. **Evaluate in-memory:** For `__access` metadata on already-loaded entities

### 3.3 Relational Where Clauses

Since `rules.where()` uses the DB query syntax, it supports relation traversal when the entity defines relations:

```ts
// Only show tasks from active teams
rules.where({ team: { status: 'active' } })

// Only allow editing projects owned by the user's org
rules.where({ organization: { id: rules.user.tenantId } })
```

### 3.4 Rules Builders

```ts
rules.role('editor', 'admin')     // User has at least one of the listed roles (OR)
rules.plan('pro', 'enterprise')   // Org is on at least one of the listed plans (OR)
rules.flag('export-v2')           // Feature flag is enabled
rules.where({ ... })              // Row-level condition (DB query syntax)
rules.all(rule1, rule2)           // All sub-rules must pass (AND)
rules.any(rule1, rule2)           // At least one sub-rule must pass (OR)
rules.authenticated()             // User is logged in (no specific role)
```

### 3.5 Type Safety

Invalid role names and invalid column names are compile errors:

```ts
// Valid -- autocompletes from defineAccess() config
rules.role('owner', 'manager')

// @ts-expect-error -- 'superadmin' is not a valid role
rules.role('superadmin')

// Valid -- 'createdBy' is a column on projectsTable
rules.where({ createdBy: rules.user.id })

// @ts-expect-error -- 'nonExistentField' is not a column
rules.where({ nonExistentField: rules.user.id })
```

### 3.6 RLS Generation

Because all rules are declarative, the framework can generate Row-Level Security policies:

```sql
-- From: rules.where({ createdBy: rules.user.id })
CREATE POLICY projects_owner_access ON projects FOR ALL
  USING (created_by = current_setting('app.user_id')::UUID);

-- From: rules.where({ archived: false })
CREATE POLICY projects_not_archived ON projects FOR SELECT
  USING (archived = false);

-- From: rules.where({ team: { status: 'active' } })
CREATE POLICY tasks_active_team ON tasks FOR SELECT
  USING (team_id IN (SELECT id FROM teams WHERE status = 'active'));
```

---

## 4. Access Set Bootstrap (Server to Client)

### 4.1 Data Shape

The server computes the user's access set at session start and ships it with the session response. The client-side set contains only global entitlements — no per-resource roles (~5KB total).

```ts
interface AccessSet {
  /** Global entitlements resolved with denial info */
  entitlements: Record<Entitlement, AccessCheckData>;

  /** Active feature flags for this tenant */
  flags: Record<string, boolean>;

  /** Org plan info */
  plan: {
    id: string;
    limits: Record<Entitlement, { max: number; consumed: number; remaining: number }>;
  };

  /** Cache invalidation timestamp */
  computedAt: number;
}

interface AccessCheckData {
  allowed: boolean;
  reason?: DenialReason;
  meta?: DenialMeta;
}
```

### 4.2 Denial Reasons

Every access check returns not just a boolean but a structured denial reason. This enables the UI to show contextual feedback.

```ts
type DenialReason =
  | 'role_required'       // User lacks the required role
  | 'plan_required'       // Org plan does not include this entitlement
  | 'flag_disabled'       // Feature flag is off
  | 'limit_reached'       // Wallet consumption limit hit
  | 'not_authenticated'   // No session
  | 'hierarchy_denied';   // No path in resource hierarchy

interface DenialMeta {
  requiredPlans?: string[];    // For 'plan_required'
  requiredRoles?: string[];    // For 'role_required'
  limit?: { max: number; consumed: number; remaining: number };  // For 'limit_reached'
}
```

The denial reason is narrowed per entitlement. If `project:export` has plan + flag requirements, TypeScript knows:

```ts
const check = can('project:export');
// check.reason is 'role_required' | 'plan_required' | 'flag_disabled'
// Never 'limit_reached' (project:export has no limit)
```

### 4.3 Bootstrap Flow

```
1. User authenticates -> server creates session
2. Server computes AccessSet via batch query:
   - role_assignments JOIN resource_closure -> effective roles
   - Plan lookup -> org plan + limits
   - Feature flags -> tenant flags
   - Wallet query -> consumption for limited entitlements
3. AccessSet stored in session (JWT claims or DB row)
4. On SSR: AccessSet injected into HTML as __VERTZ_ACCESS_SET__
5. Client hydrates: can() reads from global, wraps in signals
6. Post-hydration: WebSocket connects for invalidation events
```

### 4.4 SSR Serialization

Injected alongside query data using the same streaming mechanism:

```html
<script>
  window.__VERTZ_ACCESS_SET__ = {
    entitlements: {
      "project:export": {
        allowed: false,
        reason: "plan_required",
        meta: { requiredPlans: ["enterprise"] }
      },
      "project:edit": { allowed: true }
    },
    flags: { "export-v2": true },
    plan: { id: "pro", limits: { "project:create": { max: 100, consumed: 42, remaining: 58 } } },
    computedAt: 1709827200000
  };
</script>
```

---

## 5. Entity-Level Access Metadata

### 5.1 The `__access` Field

Entity responses automatically include `__access` showing what the user can do with that specific entity. This is where `rules.where()` conditions are resolved — the server evaluates them against the loaded entity data.

```ts
// GET /api/projects/p1
{
  id: 'p1',
  title: 'Marketing Site',
  createdBy: 'u1',       // matches rules.user.id -> isOwner grants access
  __access: {
    'project:edit':   { allowed: true },
    'project:delete': { allowed: true },
    'project:export': { allowed: false, reason: 'plan_required', meta: { requiredPlans: ['enterprise'] } },
  },
}
```

### 5.2 What's Included

Only **resource-scoped** entitlements (those that could vary per-entity due to `rules.where()` conditions, hierarchy, or ownership). Global entitlements come from the session access set.

The framework determines which entitlements are resource-scoped by checking which access rules contain `rules.where()` clauses.

### 5.3 Performance: No N+1

For a list of N entities, `__access` is computed in batch:

| Layer | Cost | Notes |
|-------|------|-------|
| Global checks (plan, flags) | O(1) | Resolved once per request |
| Real roles | O(1) | From session's precomputed access set |
| `rules.where()` conditions | O(N) field comparisons | Data already loaded, zero queries |
| Hierarchy | 1 batch query | `WHERE descendant_id IN (...)` |

Total per list: **1 query** (hierarchy batch) + **O(N) in-memory** comparisons. For 50 entities: < 1ms overhead.

### 5.4 Opt-Out

```ts
const Project = entity('projects', {
  model: projectModel,
  access: {
    // ...rules...
    __metadata: false,  // Disable __access on responses
  },
});
```

---

## 6. The Unified UI API

### 6.1 `can()` — Top-Level Function

Following Vertz convention (`query()`, `form()` — top-level, no `use` prefix), the client-side access check is **`can()`**, exported from `@vertz/ui/auth`.

### 6.2 Usage

```tsx
import { can } from '@vertz/ui/auth';
import { query } from '@vertz/ui';
import { projectApi } from '../sdk';

export function ProjectActions({ projectId }: { projectId: string }) {
  const project = query(projectApi.get(projectId));

  // Global check — from session access set (instant)
  const canCreate = can('project:create');

  // Resource-scoped check — from entity __access metadata (instant)
  const canExport = can('project:export', project.data);

  return (
    <div>
      {canCreate.allowed && <button>New Project</button>}

      <button disabled={!canExport.allowed}>Export</button>

      {!canExport.allowed && canExport.reason === 'plan_required' && (
        <UpgradePrompt plans={canExport.meta?.requiredPlans} />
      )}

      {!canExport.allowed && canExport.reason === 'role_required' && (
        <span>Contact your admin for export access</span>
      )}

      {!canExport.allowed && canExport.reason === 'flag_disabled' && (
        <span>Coming soon</span>
      )}
    </div>
  );
}
```

### 6.3 Return Type

```ts
interface AccessCheck {
  readonly allowed: ReadonlySignal<boolean>;
  readonly reason: ReadonlySignal<DenialReason | undefined>;
  readonly meta: ReadonlySignal<DenialMeta | undefined>;
}
```

`can()` returns an `AccessCheck` whose properties are signals. The compiler auto-unwraps them (registered as a reactive source in the signal API registry). Memoized by `entitlement + entity.id` — same key returns same object.

### 6.4 Compiler Integration

`can` is registered in `@vertz/ui/auth`'s reactivity manifest as a reactive source:

```json
{
  "exports": {
    "can": {
      "kind": "function",
      "reactivity": { "type": "reactive-source" }
    }
  },
  "filePath": "@vertz/ui/auth",
  "version": 1
}
```

This means every property on the `can()` return value is treated as a signal and auto-unwrapped by the compiler. Zero changes to the compiler — uses existing `REACTIVE_SOURCE_APIS` infrastructure via the cross-file manifest system (PR #995).

### 6.5 `AccessContext.Provider`

The app shell wraps the application in an `AccessContext.Provider`:

```tsx
import { AccessContext } from '@vertz/ui/auth';

export function App() {
  return (
    <AccessContext.Provider value={accessSet}>
      <RouterContext.Provider value={router}>
        {/* ... */}
      </RouterContext.Provider>
    </AccessContext.Provider>
  );
}
```

For SSR apps, the provider is automatically injected by the framework.

---

## 7. SSR Integration

### 7.1 Two-Pass Compatibility

Access checks are **synchronous reads** from a pre-computed set. No async work, no queries to register.

- **Pass 1 (Discovery):** `can()` reads from SSR context's access set. Returns synchronous results.
- **Pass 2 (Render):** Same. No discovery needed.

### 7.2 No Hydration Mismatch

The access set is computed once and shipped to both SSR and client. The SSR render uses the exact same data the client hydrates.

### 7.3 SSR Global Hook

Following established patterns (`__VERTZ_SSR_REGISTER_QUERY__`, etc.):

```ts
(globalThis as any).__VERTZ_ACCESS_SET__ = accessSet;
```

---

## 8. Reactive Invalidation

### 8.1 Events

| Event | Trigger | Client Response |
|-------|---------|-----------------|
| `access:flag_toggled` | Feature flag toggled | Update `flags` in access set signal (no network) |
| `access:limit_updated` | Wallet consumption changed | Update `plan.limits` (no network, payload inline) |
| `access:role_changed` | Role assignment created/deleted | Refetch access set from server (~5-20ms) |
| `access:plan_changed` | Org plan upgraded/downgraded | Refetch access set from server (~5-20ms) |

Refetches use jittered delays (random 0-2s) + userId-targeted WebSocket events to prevent thundering herd.

### 8.2 Reactive Cascade

The access set is stored in signals. When it updates, all `can()` checks that depend on changed values automatically re-evaluate. UI reactively updates.

For entity-level `__access`, invalidation triggers `revalidate()` on affected queries (SWR pattern).

---

## 9. Compiler Responsibilities

| Artifact | Source | Output |
|----------|--------|--------|
| `Entitlement` union | `defineAccess().entitlements` keys | `type Entitlement = 'project:view' \| 'project:edit' \| ...` |
| `Role<T>` mapped type | `defineAccess().roles` | `type Role<'project'> = 'manager' \| 'contributor' \| 'viewer'` |
| `DenialReasonFor<E>` | Entitlement config (plan, flag) | Narrowed union per entitlement |
| RLS policies | `rules.where()` + `rules.user` | `CREATE POLICY ... USING (...)` |
| Signal API entry | `can()` return shape | Reactive source in `@vertz/ui/auth` manifest |

---

## 10. Performance Summary

| Check type | Cost | Source |
|------------|------|--------|
| Global entitlement | O(1) signal read | Session access set |
| Resource-scoped (from `__access`) | O(1) signal read | Entity store |
| Feature flag | O(1) signal read | Session access set |
| Plan/limit check | O(1) signal read | Session access set |
| Access set bootstrap | 2-10ms batch query | Once at session start |
| `__access` per list of N entities | O(N) * 0.01ms + 1 batch query | `rules.where()` field comparisons + hierarchy |
| WebSocket invalidation | 0-20ms | Flag/limit: inline. Role/plan: jittered refetch. |
| `can()` memoization | O(1) Map lookup | Keyed by `entitlement + entity.id` |
| Client access set size | ~5KB | Global entitlements only, no per-resource roles |

---

## 11. Manifesto Alignment

**Explicit over implicit:** Access rules are declared at the entity level using composable `rules.*` builders. `rules.where()` explicitly declares row-level conditions using the same syntax as DB queries. Denial reasons are explicit.

**Compile-time over runtime:** Entitlement names are string literal unions (typos = compile errors). `rules.where()` column names autocomplete from the entity's table schema. `rules.role()` only accepts valid role names.

**One way to do things:** One API (`can()`), one definition site (`defineAccess()`), one entity annotation (`access: { ... }`), one query syntax (`rules.where()` = DB where). No separate hooks per concern. No separate "virtual role" concept.

**AI agents are first-class users:** `can('project:export')` is predictable. Denial reason enum is a closed set. LLMs can generate exhaustive switch statements.

### Alternatives Rejected

| Alternative | Why rejected |
|-------------|-------------|
| Separate `useFeatureFlag()`, `useRole()`, `usePlan()` hooks | Violates "one way to do things" |
| Client-side access resolution | Violates "compile-time over runtime". Server pre-resolves. |
| CASL/Casbin integration | External dependency. No type safety. |
| Per-component `<Authorize>` wrapper | `&&` with `can()` is simpler |
| `access().can()` method pattern | Unnecessary wrapper. Top-level `can()` is simpler, no compiler changes needed. |
| Virtual roles as separate concept | `rules.where()` + `rules.user` is strictly more powerful and doesn't introduce a new concept. |
| Separate `rules.where()` DSL | Using DB query syntax means one language for filtering everywhere. |

---

## 12. Non-Goals

1. **Client-side access resolution.** The client reads pre-resolved data, never computes access.
2. **Offline access checks.** Uses last-known access set. No offline-first guarantees.
3. **Custom client-side rules.** `rules.*` is server-only. Client gets results.
4. **Wallet increment from client.** `canAndConsume()` is server-only.
5. **Multi-tenant access set switching.** Switching tenants requires a new session.

---

## 13. Unknowns

### 13.1 Compiler-Generated Entitlement Types (Needs POC)

**Question:** Can the compiler generate the `Entitlement` string literal union from `defineAccess()` at dev-server startup, such that `can()` gets autocomplete before runtime?

**Resolution:** Needs POC. The existing compiler processes `.tsx` files per-request. `defineAccess()` lives in a `.ts` config file. Must verify the codegen pipeline can extract string literals and emit a `.d.ts` augmentation file.

### 13.2 `rules.where()` Relational Query Depth (Discussion)

**Question:** How deep should relational `rules.where()` traversal go? `rules.where({ team: { status: 'active' } })` is one level. What about `rules.where({ team: { org: { plan: 'enterprise' } } })`?

**Options:** (a) Limit to 1 level of relation traversal initially, extend later. (b) Support arbitrary depth matching the DB query API.

### 13.3 `rules.user` Extension Surface (Discussion)

**Question:** What properties should `rules.user` expose beyond `id` and `tenantId`? Should it support custom session fields?

**Options:** (a) Fixed set: `id`, `tenantId`, `roles`. (b) Generic: `rules.user.field('customField')` with type safety from session config.

---

## 14. Type Flow Map

```
defineAccess({ entitlements, roles, plans, flags })
  -> [Compiler] Entitlement string literal union
  -> [Compiler] Role<ResourceType> mapped type
  -> [Compiler] DenialReasonFor<E> conditional type

Entity TableDef<TColumns>
  -> rules.where() column names constrained to keyof TColumns & string
  -> rules.user markers resolved against session type

Server ctx.can(Entitlement, Resource)
  -> AccessCheckData { allowed, reason: DenialReasonFor<E>, meta }

Server ctx.check(Entitlement, Resource)
  -> AccessCheckData { allowed, reason, meta } (full structured response)

Session bootstrap
  -> AccessSet { entitlements: Record<Entitlement, AccessCheckData>, flags, plan }

can(Entitlement) [client, from @vertz/ui/auth]
  -> reads AccessContext
  -> AccessCheck (signals: allowed, reason, meta)

can(Entitlement, entity) [client]
  -> reads entity.__access
  -> AccessCheck (signals: allowed, reason, meta)

Compiler reactivity manifest (@vertz/ui/auth):
  can -> reactive-source (all properties auto-unwrapped)
```

Each arrow = mandatory type-level test in implementation.

---

## 15. E2E Acceptance Test

```ts
describe('Client-side access system', () => {
  it('can() returns allowed: true for entitled user');
  it('can() returns denial reason + meta for plan-gated entitlement');
  it('can() reads from entity __access for resource-scoped checks');
  it('entitlement names are type-checked (@ts-expect-error for invalid names)');
  it('rules.role() rejects invalid role names at compile time');
  it('rules.where() column names autocomplete on entity columns (@ts-expect-error for invalid)');
  it('rules.where({ createdBy: rules.user.id }) grants access when field matches user');
  it('rules.where() with relation traversal filters correctly');
  it('rules.where() generates valid RLS policies');
  it('reactive invalidation: WebSocket access set update re-evaluates can()');
  it('SSR renders with correct access checks (no hydration mismatch)');
  it('entity list response includes __access metadata per entity');
  it('can() memoizes by entitlement + entity.id');
});
```

---

## Appendix A: Adversarial Review Findings

Three adversarial reviews were conducted (API Design, Performance, Architecture). Below are the findings and resolutions.

### A.1 Resolved Issues

**Access set scope (was Critical - Performance):** The original `AccessSet.roles` field stored per-resource role assignments, growing to ~1MB for large orgs. **Resolution:** Remove `roles` from client-facing `AccessSet`. Client only receives global entitlements (~5KB), flags, and plan info. Per-resource access comes from `__access` on entity responses.

**`can()` memoization (was Important - Performance):** 300+ permission checks per page would create 900+ signals. **Resolution:** Memoize `can()` calls by `entitlement + entity.id`. Same key returns same `AccessCheck` object. Drops to ~20 unique checks / ~60 signals.

**Undefined entity behavior (was Important - API):** `can('project:edit', undefined)` when entity is loading. **Resolution:** Returns `{ allowed: false, reason: undefined }`. Developer handles loading at the query level.

**Server `ctx.can()` alignment (was Important - API):** Server returns `boolean`, client returns `{ allowed, reason, meta }`. **Resolution:** Add `ctx.check()` on server returning `AccessCheckData`. Existing `ctx.can()` unchanged (non-breaking).

**Thundering herd on role change (was Important - Performance):** N clients refetch simultaneously. **Resolution:** Jittered refetch (random 0-2s delay) + targeted userId in WebSocket event (only affected user refetches).

**`__access` payload size (was Minor - Performance):** ~200-500 bytes per entity. **Resolution:** Acceptable (10-25% overhead). Opt-out available via `__metadata: false`.

**Compiler feasibility of method calls (was Critical - Architecture):** Original review claimed `access().can()` method call pattern was infeasible. **Resolution:** PR #995's cross-file manifest system makes it feasible via moderate extension. However, CTO decided on top-level `can()` instead, which requires zero compiler changes — uses existing `REACTIVE_SOURCE_APIS` infrastructure.

### A.2 Design Decisions (CTO)

1. **Top-level `can()` over `access().can()`** — Simpler API, no wrapper boilerplate, zero compiler changes. Exported from `@vertz/ui/auth`.

2. **`rules.where()` + `rules.user` replaces virtual roles** — Virtual roles were a limited abstraction for "field matches current user." `rules.where()` with DB query syntax is strictly more powerful, doesn't introduce a new concept, and unifies with the DB query API. Reusable rules are just constants.

3. **`rules.where()` uses DB query syntax** — One language for filtering everywhere. Supports column filters, `rules.user` markers, and relation traversal. Enables RLS generation.

4. **Name: `can()`** — Short, reads naturally ("can the user export?"), exported from `@vertz/ui/auth` and `vertz/ui/auth`.

---

## Implementation Note

This design doc lives at `plans/access-system-client.md`. It extends `plans/access-system.md` (server-side design) with the client-side integration layer. The two documents together form the complete unified access system specification.
