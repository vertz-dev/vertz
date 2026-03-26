# Sub-Tenant Plan Assignment (#1915)

> Allow `subscriptionStore.assign()` to accept a `resourceType` + `resourceId` pair, enabling plan assignment to any entity in the tenant hierarchy — not just the root tenant.

## Problem

`auth_plans.tenant_id` stores plan assignments keyed by a single opaque ID. This was fine for single-level tenancy (one plan per org), but with multi-level tenancy (#1787), plans must be assignable to entities below the root — e.g., per-project billing within an account.

The current API is:
- **Ambiguous** — `tenantId` implies root tenant. Callers pass project IDs into `tenantId`, which works but is misleading.
- **Inconsistent** — `auth_role_assignments` uses `(resource_type, resource_id)`. `auth_plans` uses only `tenant_id`.
- **Collision-prone** — If two entity types share ID formats, `UNIQUE(tenant_id)` could collide. `UNIQUE(resource_type, resource_id)` is safe.
- **Not queryable by level** — Can't query "all project-level subscriptions" without joining the closure table.

## Proposed

Align `SubscriptionStore` with the `RoleAssignmentStore` pattern: replace the single `tenantId` parameter with `(resourceType, resourceId)` on all methods. Apply the same change to `GrandfatheringStore`, `PlanVersionStore`, and `PlanManager` interfaces.

---

## API Surface

### Single-Level Convention

**Single-level apps use `resourceType = 'tenant'` as the default.** This applies everywhere:

```ts
// Single-level: one plan per tenant
await subscriptionStore.assign('tenant', orgId, 'pro');
const sub = await subscriptionStore.get('tenant', orgId);

// Multi-level: per-entity plans
await subscriptionStore.assign('account', acctId, 'enterprise');
await subscriptionStore.assign('project', projId, 'pro');
```

In `access-set.ts`, the single-level path uses `tenantLevel ?? 'tenant'`:
```ts
// Single-level path (line ~388)
const resourceType = config.tenantLevel ?? 'tenant';
const subscription = await subscriptionStore.get(resourceType, tenantId);
```

### `Subscription` type

```ts
// Before
interface Subscription {
  tenantId: string;
  planId: string;
  startedAt: Date;
  expiresAt: Date | null;
  overrides: Record<string, LimitOverride>;
}

// After
interface Subscription {
  resourceType: string;
  resourceId: string;
  planId: string;
  startedAt: Date;
  expiresAt: Date | null;
  overrides: Record<string, LimitOverride>;
}
```

### `SubscriptionStore` interface

```ts
// Before
interface SubscriptionStore {
  assign(tenantId: string, planId: string, startedAt?: Date, expiresAt?: Date | null): Promise<void>;
  get(tenantId: string): Promise<Subscription | null>;
  updateOverrides(tenantId: string, overrides: Record<string, LimitOverride>): Promise<void>;
  remove(tenantId: string): Promise<void>;
  attachAddOn?(tenantId: string, addOnId: string): Promise<void>;
  detachAddOn?(tenantId: string, addOnId: string): Promise<void>;
  getAddOns?(tenantId: string): Promise<string[]>;
  listByPlan?(planId: string): Promise<string[]>;
  dispose(): void;
}

// After
interface SubscriptionStore {
  assign(resourceType: string, resourceId: string, planId: string, startedAt?: Date, expiresAt?: Date | null): Promise<void>;
  get(resourceType: string, resourceId: string): Promise<Subscription | null>;
  updateOverrides(resourceType: string, resourceId: string, overrides: Record<string, LimitOverride>): Promise<void>;
  remove(resourceType: string, resourceId: string): Promise<void>;
  attachAddOn?(resourceType: string, resourceId: string, addOnId: string): Promise<void>;
  detachAddOn?(resourceType: string, resourceId: string, addOnId: string): Promise<void>;
  getAddOns?(resourceType: string, resourceId: string): Promise<string[]>;
  listByPlan?(planId: string): Promise<Array<{ resourceType: string; resourceId: string }>>;
  dispose(): void;
}
```

### `orgResolver` Return Type Change

`orgResolver` changes from returning a plain string to returning a `ResourceRef`:

```ts
// Before (access-context.ts)
orgResolver?: (resource?: ResourceRef) => Promise<string | null>;

// After
orgResolver?: (resource?: ResourceRef) => Promise<{ type: string; id: string } | null>;
```

Consumer sites destructure the result:

```ts
// Before
const resolvedOrgId = await orgResolver(resource);
if (!resolvedOrgId) return denied();
const subscription = await subscriptionStore.get(resolvedOrgId);

// After
const resolvedOrg = await orgResolver(resource);
if (!resolvedOrg) return denied();
const subscription = await subscriptionStore.get(resolvedOrg.type, resolvedOrg.id);
// For flagStore/walletStore/overrideStore that still take a plain ID:
const orgId = resolvedOrg.id;
const flagValue = flagStore.getFlag(orgId, flag);
```

**Note:** `flagStore`, `walletStore`, and `overrideStore` (for wallet consumption) still use a plain `orgId` for now. Only `subscriptionStore` methods receive the full `(type, id)` pair. See "Known Gaps" for `auth_flags`.

### `PlanManager` Interface Changes

```ts
// Before
interface PlanManager {
  resolve(tenantId: string): Promise<TenantPlanState | null>;
  migrate(planId: string, opts?: MigrateOpts): Promise<void>;
  // ...
}
interface MigrateOpts { tenantId?: string; }
interface PlanEvent { tenantId?: string; /* ... */ }

// After
interface PlanManager {
  resolve(resourceType: string, resourceId: string): Promise<TenantPlanState | null>;
  migrate(planId: string, opts?: MigrateOpts): Promise<void>;
  // ...
}
interface MigrateOpts { resourceType?: string; resourceId?: string; }
interface PlanEvent { resourceType?: string; resourceId?: string; /* ... */ }
```

The internal `listTenantsOnPlan()` becomes `listResourcesOnPlan()` (renamed for clarity).

### `GrandfatheringStore` Interface Changes

```ts
// Before
interface GrandfatheringState {
  tenantId: string;
  planId: string;
  version: number;
  graceEnds: Date | null;
}
interface GrandfatheringStore {
  setGrandfathered(tenantId: string, planId: string, version: number, graceEnds: Date | null): Promise<void>;
  getGrandfathered(tenantId: string, planId: string): Promise<GrandfatheringState | null>;
  listGrandfathered(planId: string): Promise<GrandfatheringState[]>;
  removeGrandfathered(tenantId: string, planId: string): Promise<void>;
}

// After
interface GrandfatheringState {
  resourceType: string;
  resourceId: string;
  planId: string;
  version: number;
  graceEnds: Date | null;
}
interface GrandfatheringStore {
  setGrandfathered(resourceType: string, resourceId: string, planId: string, version: number, graceEnds: Date | null): Promise<void>;
  getGrandfathered(resourceType: string, resourceId: string, planId: string): Promise<GrandfatheringState | null>;
  listGrandfathered(planId: string): Promise<GrandfatheringState[]>;
  removeGrandfathered(resourceType: string, resourceId: string, planId: string): Promise<void>;
}
```

### `PlanVersionStore` Interface Changes

```ts
// Before
interface PlanVersionStore {
  getTenantVersion(tenantId: string, planId: string): Promise<number | null>;
  setTenantVersion(tenantId: string, planId: string, version: number): Promise<void>;
  // ... (other methods unchanged — they don't take tenantId)
}

// After
interface PlanVersionStore {
  getTenantVersion(resourceType: string, resourceId: string, planId: string): Promise<number | null>;
  setTenantVersion(resourceType: string, resourceId: string, planId: string, version: number): Promise<void>;
  // ... (other methods unchanged)
}
```

### Webhook Handler Changes

`extractTenantId()` becomes `extractResource()`, reading both `resourceType` and `resourceId` from Stripe metadata:

```ts
// Before
function extractTenantId(obj: Record<string, unknown>): string | null {
  const meta = obj.metadata as Record<string, string> | undefined;
  if (meta?.tenantId) return meta.tenantId;
  // ...
}

// After
function extractResource(obj: Record<string, unknown>): { type: string; id: string } | null {
  const meta = obj.metadata as Record<string, string> | undefined;
  const resourceId = meta?.resourceId ?? meta?.tenantId; // fallback for compat
  const resourceType = meta?.resourceType ?? 'tenant';   // default for single-level
  if (resourceId) return { type: resourceType, id: resourceId };
  // ...
}
```

### DB Schema Changes

```sql
-- auth_plans: tenant_id → (resource_type, resource_id)
CREATE TABLE auth_plans (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  started_at TIMESTAMP,
  expires_at TIMESTAMP,
  UNIQUE(resource_type, resource_id)
);

-- auth_overrides: tenant_id → (resource_type, resource_id)
CREATE TABLE auth_overrides (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  overrides TEXT NOT NULL,
  updated_at TIMESTAMP,
  UNIQUE(resource_type, resource_id)
);

-- auth_plan_addons: tenant_id → (resource_type, resource_id)
CREATE TABLE auth_plan_addons (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  addon_id TEXT NOT NULL,
  is_one_off BOOLEAN DEFAULT FALSE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP,
  UNIQUE(resource_type, resource_id, addon_id)
);
```

### Usage Example — Per-Project Billing

```ts
// Account gets enterprise plan
await subscriptionStore.assign('account', 'acct-1', 'enterprise');

// Each project gets its own plan
await subscriptionStore.assign('project', 'proj-1', 'pro');
await subscriptionStore.assign('project', 'proj-2', 'free');

// Query a project's plan
const sub = await subscriptionStore.get('project', 'proj-1');
// → { resourceType: 'project', resourceId: 'proj-1', planId: 'pro', ... }

// Single-level app (no hierarchy)
await subscriptionStore.assign('tenant', 'org-1', 'pro');
```

---

## Manifesto Alignment

- **One way to do things** — Roles and plans both use `(resourceType, resourceId)`. No more divergent patterns.
- **If it builds, it works** — `resourceType` is a string (entity name from `defineAccess`). Future: could be constrained to `keyof entities` at the type level.
- **Explicit over implicit** — The resource being subscribed is explicit in the API, not inferred from context.
- **AI agents are first-class** — An LLM seeing `assign('project', projId, 'pro')` immediately understands what's happening. `assign(projId, 'pro')` is ambiguous.

### Tradeoff

- **More verbose API** — Every call gains one parameter. Accepted because clarity > brevity, especially for LLMs.
- **Large mechanical refactor** — ~150+ callsites across production and test code. Accepted because pre-v1, no external consumers.

---

## Non-Goals

- **Runtime validation of `resourceType`** — We don't validate that `resourceType` matches an entity in `defineAccess` at the store level. The store is a dumb persistence layer; validation happens in the access resolution layer.
- **Migration tooling** — No SQL migration scripts for existing data. Pre-v1, no production deployments. DDL is `CREATE TABLE IF NOT EXISTS`.
- **Type-level `resourceType` constraint** — Could constrain `resourceType` to `keyof entities` generically, but deferred. String is sufficient for now.
- **Optional `resourceType` filter on `listByPlan`** — Could add `listByPlan(planId, resourceType?)` for filtering. Deferred until the need materializes (YAGNI).

---

## Known Gaps / Future Work

- **`auth_flags` table** — `auth_flags` uses `tenant_id` and suffers the same ambiguity. In multi-level tenancy, flags set at the account level are invisible when the context tenant is a project. This is the same underlying pattern and should be addressed in a follow-up issue with `(resource_type, resource_id)`. Not included in this PR to keep scope focused on plan assignment.
- **`plan_id` index on `auth_plans`** — No secondary index on `plan_id` for `listByPlan` queries. Pre-existing gap, not introduced by this PR. Should be added when `DbSubscriptionStore` implements `listByPlan`.

---

## Unknowns

None identified. The pattern is already proven in `auth_role_assignments` and `auth_closure`. This is a mechanical alignment of `auth_plans` / `auth_overrides` / `auth_plan_addons` to the same pattern.

---

## POC Results

N/A — no POC needed. The `auth_role_assignments` table already proves `(resource_type, resource_id)` works at scale. The multi-level E2E test (`multi-level-access-e2e.test.ts`) already demonstrates plans being assigned to sub-tenant entities.

---

## Type Flow Map

```
SubscriptionStore.assign(resourceType, resourceId, planId)
  ↓
Subscription { resourceType, resourceId, planId }
  ↓
subscriptionStore.get(entry.type, entry.id)          // access-set.ts multi-level loop
subscriptionStore.get('tenant', tenantId)             // access-set.ts single-level path
  ↓
computeAccessSet → AccessSet.plans[entry.type] = planId
  ↓
encodeAccessSet → JWT.acl.plans
  ↓
decodeAccessSet → client-side AccessSet.plans

orgResolver() → { type, id } | null                   // access-context.ts
  ↓
subscriptionStore.get(org.type, org.id)

PlanManager.resolve(resourceType, resourceId)
  ↓
subscriptionStore.get(resourceType, resourceId)
  ↓
versionStore.getTenantVersion(resourceType, resourceId, planId)
  ↓
grandfatheringStore.getGrandfathered(resourceType, resourceId, planId)

resourceType: string at all layers (no generic, no dead params)
resourceId: string at all layers
```

No generics introduced. All types are concrete `string`. Type flow is straightforward.

---

## E2E Acceptance Test

```ts
describe('Feature: Sub-tenant plan assignment (#1915)', () => {
  describe('Given an account → project hierarchy', () => {
    describe('When assigning plans to both levels with resourceType + resourceId', () => {
      it('Then stores distinct plans per resource', async () => {
        const store = new InMemorySubscriptionStore();
        await store.assign('account', 'acct-1', 'enterprise');
        await store.assign('project', 'proj-1', 'pro');
        await store.assign('project', 'proj-2', 'free');

        const acctSub = await store.get('account', 'acct-1');
        expect(acctSub?.planId).toBe('enterprise');
        expect(acctSub?.resourceType).toBe('account');

        const proj1Sub = await store.get('project', 'proj-1');
        expect(proj1Sub?.planId).toBe('pro');
        expect(proj1Sub?.resourceType).toBe('project');

        const proj2Sub = await store.get('project', 'proj-2');
        expect(proj2Sub?.planId).toBe('free');
      });
    });

    describe('When computing access set with resourceType-aware subscription store', () => {
      it('Then resolves plans per billing level via ancestor chain', async () => {
        const subscriptionStore = new InMemorySubscriptionStore();
        await subscriptionStore.assign('account', 'acct-1', 'enterprise');
        await subscriptionStore.assign('project', 'proj-1', 'pro');

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef,
          roleStore,
          closureStore,
          subscriptionStore,
          tenantId: 'proj-1',
          tenantLevel: 'project',
          ancestorResolver: mockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        expect(result.plans).toEqual({ account: 'enterprise', project: 'pro' });
        expect(result.entitlements['project:ai-generate'].allowed).toBe(true);
      });
    });

    describe('When using single-level mode (no tenantLevel)', () => {
      it('Then uses resourceType "tenant" as default', async () => {
        const subscriptionStore = new InMemorySubscriptionStore();
        await subscriptionStore.assign('tenant', 'org-1', 'pro');

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef: singleLevelAccessDef,
          roleStore,
          closureStore,
          subscriptionStore,
          tenantId: 'org-1',
          // no tenantLevel, no ancestorResolver → single-level path
        });

        expect(result.plan).toBe('pro');
      });
    });
  });

  describe('Given the old tenantId API', () => {
    it('Then assign(tenantId, planId) no longer compiles', () => {
      const store = new InMemorySubscriptionStore();
      // @ts-expect-error - tenantId-only API removed, now requires (resourceType, resourceId, planId)
      store.assign('acct-1', 'enterprise');
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Core Interface + Store Implementations

**Goal:** Update `SubscriptionStore`, `GrandfatheringStore`, `PlanVersionStore` interfaces, `Subscription` type, all in-memory store implementations, DDL, and all store-level tests.

**Changes:**
- `subscription-store.ts` — Update `Subscription` type, `SubscriptionStore` interface, `InMemorySubscriptionStore`
- `db-subscription-store.ts` — Update `DbSubscriptionStore` SQL: `tenant_id` → `resource_type` + `resource_id`
- `auth-tables.ts` — Update DDL for `auth_plans`, `auth_overrides`, `auth_plan_addons`
- `auth-models.ts` — Update model definitions if they reference `tenant_id`
- `grandfathering-store.ts` — Update `GrandfatheringState`, `GrandfatheringStore` interface, `InMemoryGrandfatheringStore`
- `plan-version-store.ts` — Update `getTenantVersion`/`setTenantVersion` signatures, `InMemoryPlanVersionStore`

**Tests (update to new API):**
- `shared-subscription-store.tests.ts`
- `db-subscription-store.test.ts`

**Acceptance Criteria:**
```ts
describe('Phase 1: Core interface + stores', () => {
  describe('Given InMemorySubscriptionStore with resourceType API', () => {
    describe('When assigning a plan with resourceType + resourceId', () => {
      it('Then get returns subscription with resourceType and resourceId fields', () => {});
      it('Then upsert replaces plan for same (resourceType, resourceId) pair', () => {});
      it('Then different resourceTypes with same ID are distinct subscriptions', () => {});
    });
    describe('When managing overrides with resourceType + resourceId', () => {
      it('Then updateOverrides scopes to (resourceType, resourceId)', () => {});
    });
    describe('When managing add-ons with resourceType + resourceId', () => {
      it('Then attachAddOn/detachAddOn/getAddOns scope to (resourceType, resourceId)', () => {});
    });
    describe('When listing by plan', () => {
      it('Then listByPlan returns array of { resourceType, resourceId }', () => {});
    });
  });
  describe('Given GrandfatheringStore with resourceType API', () => {
    describe('When setting grandfathered state', () => {
      it('Then getGrandfathered returns state with resourceType and resourceId', () => {});
      it('Then listGrandfathered includes resourceType per entry', () => {});
    });
  });
  describe('Given PlanVersionStore with resourceType API', () => {
    describe('When tracking tenant versions', () => {
      it('Then getTenantVersion/setTenantVersion use (resourceType, resourceId, planId)', () => {});
    });
  });
  describe('Given auth DDL generation', () => {
    describe('When generating DDL for auth_plans', () => {
      it('Then DDL has resource_type + resource_id columns with UNIQUE constraint', () => {});
    });
    describe('When generating DDL for auth_overrides', () => {
      it('Then DDL has resource_type + resource_id columns with UNIQUE constraint', () => {});
    });
    describe('When generating DDL for auth_plan_addons', () => {
      it('Then DDL has resource_type + resource_id + addon_id UNIQUE constraint', () => {});
    });
  });
});
```

### Phase 2: Access Resolution Consumers

**Goal:** Update all consumers that call subscription/plan/grandfathering stores to pass `(resourceType, resourceId)`.

**Changes:**
- `access-set.ts` — Multi-level loop passes `entry.type` + `entry.id`. Single-level path uses `tenantLevel ?? 'tenant'` as `resourceType`.
- `access-context.ts` — `orgResolver` return type changes from `string | null` to `{ type: string; id: string } | null`. All consumers destructure: `subscriptionStore.get(org.type, org.id)`. Other stores (`flagStore`, `walletStore`) still use `org.id` (plain string).
- `plan-manager.ts` — `resolve(resourceType, resourceId)` replaces `resolve(tenantId)`. `listTenantsOnPlan()` renamed to `listResourcesOnPlan()` with updated return type. `PlanEvent.tenantId` → `PlanEvent.resourceType` + `PlanEvent.resourceId`. `MigrateOpts.tenantId` → `MigrateOpts.resourceType` + `MigrateOpts.resourceId`.
- `webhook-handler.ts` — `extractTenantId()` becomes `extractResource()` reading `metadata.resourceType` (default `'tenant'`) + `metadata.resourceId` (fallback to `metadata.tenantId`).
- `create-server.ts` — Wire `orgResolver` to return `{ type, id }`.

**Tests (update to new API):**
- `access-set.test.ts` + `access-set-addons.test.ts`
- `multi-level-access-e2e.test.ts`
- `access-context.test.ts`
- `plan-manager.test.ts`
- `webhook-handler.test.ts` + `webhook-metadata.test.ts`
- `cloud-failmode.test.ts`
- Integration tests in `packages/integration-tests/`

**Acceptance Criteria:**
```ts
describe('Phase 2: Access resolution consumers', () => {
  describe('Given computeAccessSet with multi-level plans', () => {
    describe('When resolving plans per ancestor level', () => {
      it('Then returns plans per billing level using (resourceType, resourceId) lookups', async () => {
        await subscriptionStore.assign('account', 'acct-1', 'enterprise');
        await subscriptionStore.assign('project', 'proj-1', 'pro');
        const result = await computeAccessSet({ /* ... */ });
        expect(result.plans).toEqual({ account: 'enterprise', project: 'pro' });
        expect(result.entitlements['project:ai-generate'].allowed).toBe(true);
      });
    });
  });
  describe('Given computeAccessSet in single-level mode', () => {
    describe('When resolving plans without tenantLevel', () => {
      it('Then uses resourceType "tenant" and resolves plan correctly', async () => {
        await subscriptionStore.assign('tenant', 'org-1', 'pro');
        const result = await computeAccessSet({ tenantId: 'org-1' /* no tenantLevel */ });
        expect(result.plan).toBe('pro');
      });
    });
  });
  describe('Given AccessContext with updated orgResolver', () => {
    describe('When checking plan-gated entitlements', () => {
      it('Then orgResolver returns { type, id } and subscription is resolved correctly', () => {});
    });
  });
  describe('Given PlanManager with resourceType API', () => {
    describe('When resolving tenant plan state', () => {
      it('Then resolve(resourceType, resourceId) returns correct TenantPlanState', () => {});
    });
    describe('When grandfathering on plan version change', () => {
      it('Then listResourcesOnPlan returns { resourceType, resourceId } entries', () => {});
      it('Then grandfathering store receives (resourceType, resourceId) per resource', () => {});
    });
  });
  describe('Given webhook handler with resourceType extraction', () => {
    describe('When Stripe webhook has resourceType in metadata', () => {
      it('Then assigns plan with correct (resourceType, resourceId)', () => {});
    });
    describe('When Stripe webhook has only tenantId (legacy)', () => {
      it('Then falls back to resourceType "tenant"', () => {});
    });
  });
});
```

### Phase 3: Documentation

**Goal:** Update Mintlify docs for the new API.

**Changes:**
- Update auth/plans documentation showing the new `(resourceType, resourceId)` API
- Add per-project billing example
- Document the `'tenant'` default for single-level apps
- Update webhook metadata docs to include `resourceType`
