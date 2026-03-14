# Subscription & Tenant Architecture — Framework Data Boundary

**Issue:** [#1196](https://github.com/vertz-dev/vertz/issues/1196)
**Status:** Implemented — all tests passing

---

## Problem

The `plan` field lives on `AuthUser` (types.ts:346) and the `auth_users` DB table. This is architecturally wrong: **plans belong to tenants, not users**. A user doesn't have a plan — the tenant (org/workspace) they belong to does.

Beyond the `plan` field, there's a broader naming inconsistency: store interfaces use `orgId` (PlanStore, WalletStore, FlagStore), DB tables use `tenant_id`, and the session payload uses `tenantId`. These should all align on `tenantId`.

The existing `PlanStore` / `OrgPlan` naming is also misleading. What it models is a **subscription** — the link between a tenant and a plan. Calling it `PlanStore` conflates the plan definition (in `defineAccess`) with the plan assignment (the subscription).

## Solution

1. **Remove `plan` from `AuthUser`** — plans are not a user-level concept
2. **Rename `PlanStore` → `SubscriptionStore`**, `OrgPlan` → `Subscription` — clearer semantics
3. **Align `orgId` → `tenantId`** across all store interfaces — match the DB and session naming
4. **Wire `computeAccessSet` to resolve plan via subscription + tenantId** — not from the user object
5. **Formalize the framework data boundary** — all `auth_*` tables are framework-controlled, never in developer schemas

---

## API Surface

### Before (current)

```ts
// AuthUser has plan
interface AuthUser {
  id: string;
  email: string;
  role: string;
  plan?: string; // ← wrong: user-level
  // ...
}

// PlanStore with orgId
interface PlanStore {
  assignPlan(orgId: string, planId: string, ...): Promise<void>;
  getPlan(orgId: string): Promise<OrgPlan | null>;
  // ...
}

interface OrgPlan {
  orgId: string;
  planId: string;
  startedAt: Date;
  expiresAt: Date | null;
  overrides: Record<string, LimitOverride>;
}

// computeAccessSet receives plan from user
computeAccessSet({
  userId: user.id,
  plan: user.plan ?? null, // ← reading from user
  // ...
});
```

### After (proposed)

```ts
// AuthUser — no plan field
interface AuthUser {
  id: string;
  email: string;
  role: string;
  // plan removed
  emailVerified?: boolean;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

// SubscriptionStore with tenantId
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

interface Subscription {
  tenantId: string;
  planId: string;
  startedAt: Date;
  expiresAt: Date | null;
  overrides: Record<string, LimitOverride>;
}

// WalletStore — tenantId
interface WalletStore {
  consume(tenantId: string, entitlement: string, ...): Promise<ConsumeResult>;
  getConsumption(tenantId: string, entitlement: string, ...): Promise<number>;
  // ...
}

// FlagStore — tenantId
interface FlagStore {
  setFlag(tenantId: string, flag: string, enabled: boolean): void;
  getFlag(tenantId: string, flag: string): boolean;
  getFlags(tenantId: string): Record<string, boolean>;
}

// computeAccessSet — no plan param, uses subscriptionStore + tenantId
interface ComputeAccessSetConfig {
  userId: string | null;
  accessDef: AccessDefinition;
  roleStore: RoleAssignmentStore;
  closureStore: ClosureStore;
  // plan param removed
  flagStore?: FlagStore;
  subscriptionStore?: SubscriptionStore; // renamed from planStore
  walletStore?: WalletStore;
  orgResolver?: (resource?: ResourceRef) => Promise<string | null>;
  tenantId?: string | null; // renamed from orgId
}

// AuthAccessConfig — includes subscriptionStore
interface AuthAccessConfig {
  definition: AccessDefinition;
  roleStore: RoleAssignmentStore;
  closureStore: ClosureStore;
  flagStore?: FlagStore;
  subscriptionStore?: SubscriptionStore;
  walletStore?: WalletStore;
}

// Call site in index.ts — resolves from session tenantId
const accessSet = await computeAccessSet({
  userId: user.id,
  accessDef: config.access.definition,
  roleStore: config.access.roleStore,
  closureStore: config.access.closureStore,
  flagStore: config.access.flagStore,
  subscriptionStore: config.access.subscriptionStore,
  walletStore: config.access.walletStore,
  tenantId: sessionPayload.tenantId ?? null,
});
```

### resolveEffectivePlan — parameter rename only

```ts
// Before
function resolveEffectivePlan(orgPlan: OrgPlan | null, ...): string | null;

// After
function resolveEffectivePlan(subscription: Subscription | null, ...): string | null;
```

### No plan at signup — not even reserved

```ts
// Before
type ReservedSignUpField = 'role' | 'plan' | 'emailVerified' | 'id' | 'createdAt' | 'updatedAt';

// After — plan removed entirely
type ReservedSignUpField = 'role' | 'emailVerified' | 'id' | 'createdAt' | 'updatedAt';
```

### UserTableEntry — plan removed

```ts
// Before
interface UserTableEntry extends ModelEntry<any, any> {
  table: {
    id: { type: string };
    email: { type: string };
    passwordHash: { type: string };
    role: { type: string };
    plan?: { type: string }; // ← removed
    createdAt: { type: Date };
    updatedAt: { type: Date };
  };
}
```

---

## Manifesto Alignment

### "One way to do things" (Principle 2)

Currently there are two ways to provide a plan to `computeAccessSet`: the `plan` parameter (user-level) and the `planStore` + `orgId` combo (tenant-level). This creates ambiguity. After this change, there's **one way**: subscription + tenantId.

### "If it builds, it works" (Principle 1)

Removing `plan` from `AuthUser` makes it a compile error to reference `user.plan`. No more runtime confusion about where the plan comes from.

### "AI agents are first-class users" (Principle 3)

An LLM asked to "add billing" will see `SubscriptionStore` and immediately understand the concept. `PlanStore.assignPlan(orgId)` is confusing — is it defining a plan or subscribing to one? `SubscriptionStore.assign(tenantId, planId)` is unambiguous.

### Tradeoff: Breaking change across all store consumers

Every consumer of `PlanStore`, `WalletStore`, `FlagStore`, and `computeAccessSet` must update. This is acceptable pre-v1 per the breaking changes policy. No backward-compat shims.

---

## Non-Goals

1. **Tenant entity modeling** — The framework does NOT define what a tenant is. Tenants are developer-defined entities (orgs, workspaces, teams). The framework only stores a `tenantId` string reference. Plan #955 (move tenant to model) is separate.

2. **Cloud deployment split** — Phase 6 of the access redesign covers centralizing framework data in Vertz Cloud. This issue only establishes the data boundary conceptually and ensures the naming supports it. No cloud adapters here.

3. **Billing integration** — Phase 5 of the access redesign covers Stripe sync, webhooks, etc. This issue is purely about the data model and naming.

4. **DB migration scripts** — Pre-v1, no external users. We update the DDL and tests. No migration tooling.

5. **Renaming DB tables** — The `auth_plans` table name is fine. Only the TypeScript interfaces and parameters get renamed. The SQL column `tenant_id` already matches the new naming.

---

## Unknowns

### What happens when tenantId is not set on the session?

**Resolution:** When `tenantId` is undefined (user hasn't switched to a tenant), `computeAccessSet` receives `tenantId: null`. This means:
- No subscription lookup → no plan-gated entitlements are granted
- No flag lookup → no flag-gated entitlements are granted
- Role-based entitlements still work (they don't require a tenant)

This is correct behavior: if you're not in a tenant context, you don't get tenant-level capabilities. The developer handles tenant selection in their app (e.g., redirect to tenant picker after login).

### Should AuthAccessConfig require subscriptionStore when plans are defined?

**Resolution:** No. Keep it optional. If plans are defined in `defineAccess()` but no `subscriptionStore` is configured, plan-gated entitlements are simply never granted (same behavior as today when no `planStore` is provided). This is a valid configuration for apps that define plans but haven't wired up billing yet.

---

## POC Results

No POC needed. This is a mechanical rename + data model cleanup. The infrastructure (`PlanStore`, `auth_plans` table, `tenantId` in sessions) already exists and works. We're removing the wrong path (`user.plan`) and renaming for clarity.

---

## Type Flow Map

```
defineAccess({ plans: { pro: { features: ['task:create'] } } })
  └─→ AccessDefinition.plans                          (plan definitions)

SubscriptionStore.assign(tenantId, 'pro')
  └─→ Subscription { tenantId, planId: 'pro', ... }   (tenant ↔ plan link)

SessionPayload.tenantId
  └─→ computeAccessSet({ tenantId })
        └─→ subscriptionStore.get(tenantId)
              └─→ Subscription.planId
                    └─→ resolveEffectivePlan(subscription, accessDef.plans)
                          └─→ effectivePlanId: string
                                └─→ AccessSet.plan: string              (in JWT acl claim)
                                └─→ entitlements[name].allowed: boolean (plan-gated check)
```

No dead generics — all types are concrete (`string`, `Subscription`, `AccessSet`).

---

## E2E Acceptance Test

```ts
describe('Feature: Tenant-level subscription in access set', () => {
  describe('Given defineAccess with plans and a tenant with a pro subscription', () => {
    describe('When computing access set with tenantId', () => {
      it('Then plan-gated entitlements are resolved from the subscription', () => {
        const accessDef = defineAccess({
          entities: { org: { roles: ['admin', 'member'] } },
          entitlements: { 'org:create-project': { roles: ['admin', 'member'] } },
          plans: { pro: { group: 'base', features: ['org:create-project'] } },
          defaultPlan: 'pro',
        });

        const subscriptionStore = new InMemorySubscriptionStore();
        await subscriptionStore.assign('tenant-1', 'pro');

        const roleStore = new InMemoryRoleAssignmentStore();
        await roleStore.assignRole('user-1', 'org', 'tenant-1', 'member');

        const closureStore = new InMemoryClosureStore();
        await closureStore.addLink('org', 'tenant-1', 'org', 'tenant-1', 0);

        const accessSet = await computeAccessSet({
          userId: 'user-1',
          accessDef,
          roleStore,
          closureStore,
          subscriptionStore,
          tenantId: 'tenant-1',
        });

        expect(accessSet.plan).toBe('pro');
        expect(accessSet.entitlements['org:create-project'].allowed).toBe(true);
      });
    });
  });

  describe('Given a user with no tenant context (tenantId is null)', () => {
    describe('When computing access set', () => {
      it('Then plan-gated entitlements are denied', () => {
        // ... same accessDef ...
        const accessSet = await computeAccessSet({
          userId: 'user-1',
          accessDef,
          roleStore,
          closureStore,
          subscriptionStore,
          tenantId: null,
        });

        expect(accessSet.plan).toBeNull();
        expect(accessSet.entitlements['org:create-project'].allowed).toBe(false);
      });
    });
  });

  // @ts-expect-error — plan is no longer on AuthUser
  describe('Given AuthUser type', () => {
    it('Then accessing .plan is a type error', () => {
      const user: AuthUser = {
        id: '1', email: 'a@b.com', role: 'user',
        createdAt: new Date(), updatedAt: new Date(),
      };
      // @ts-expect-error — plan does not exist on AuthUser
      user.plan;
    });
  });
});
```

**Note on the type test:** `AuthUser` has `[key: string]: unknown` (index signature), so `user.plan` won't be a compile error — it resolves to `unknown`. The real protection is that `plan` is removed from the interface, the `auth_users` table, and the `DbUserStore`, so there's nowhere to set or read it. The acceptance criteria focus on runtime behavior: `computeAccessSet` resolves plan from subscription, not user.

---

## Framework Data Boundary

This change formalizes a principle that's already mostly true:

### Framework-controlled tables (auto-migrated, developer never defines)

| Table | Purpose |
|---|---|
| `auth_users` | Authentication credentials, role |
| `auth_sessions` | Active sessions, refresh tokens |
| `auth_oauth_accounts` | OAuth provider links |
| `auth_role_assignments` | RBAC role → user → resource |
| `auth_closure` | Resource hierarchy for role inheritance |
| `auth_plans` | **Subscription**: tenant → plan link |
| `auth_plan_addons` | Add-ons attached to tenant subscriptions |
| `auth_flags` | Per-tenant feature flags |
| `auth_overrides` | Per-tenant limit overrides |

### Developer-controlled (defined via `d.model()`)

Everything else. Tenants (orgs, workspaces, teams) are developer entities. The framework references them by `tenantId` string only.

### Cloud split (future, not this issue)

When Vertz Cloud is active, framework tables can be centralized in cloud infrastructure. The developer's DB only has their business data. This is enabled by the pluggable store interfaces (`SubscriptionStore`, `WalletStore`, `FlagStore`, etc.) — swap in cloud-backed implementations. This issue ensures the naming and boundaries support that future.

---

## Implementation Plan

### Phase 1: Remove plan from AuthUser + Rename stores

**Goal:** Clean data model — plan removed from user level, stores renamed to subscription/tenantId.

#### Changes

**types.ts:**
- Remove `plan?: string` from `AuthUser` (line 346)
- Remove `'plan'` from `ReservedSignUpField` (line 406)
- Remove `plan?: { type: string }` from `UserTableEntry` (line 550)
- Add `subscriptionStore?: SubscriptionStore` and `walletStore?: WalletStore` to `AuthAccessConfig`

**auth-tables.ts:**
- Remove `plan ${t.text()},` from `auth_users` DDL (line 26)

**db-user-store.ts:**
- Remove `plan` from INSERT, SELECT, and `rowToUser()`

**plan-store.ts → subscription-store.ts:**
- Rename file
- `PlanStore` → `SubscriptionStore`
- `OrgPlan` → `Subscription`
- `InMemoryPlanStore` → `InMemorySubscriptionStore`
- `assignPlan()` → `assign()`
- `getPlan()` → `get()`
- `removePlan()` → `remove()`
- `orgId` → `tenantId` in all method signatures
- `resolveEffectivePlan(orgPlan)` → `resolveEffectivePlan(subscription)`
- `checkAddOnCompatibility` and `getIncompatibleAddOns` — update parameter names

**db-plan-store.ts → db-subscription-store.ts:**
- Rename file and class: `DbPlanStore` → `DbSubscriptionStore`
- `orgId` → `tenantId` in all methods

**wallet-store.ts:**
- `orgId` → `tenantId` in `WalletStore` interface and `InMemoryWalletStore`
- `WalletEntry.orgId` → `WalletEntry.tenantId`

**flag-store.ts:**
- `orgId` → `tenantId` in `FlagStore` interface and `InMemoryFlagStore`

**access-set.ts:**
- `ComputeAccessSetConfig`: remove `plan` param, rename `planStore` → `subscriptionStore`, rename `orgId` → `tenantId`
- `computeAccessSet()`: resolve plan via `subscriptionStore.get(tenantId)` instead of using `plan` param directly
- `AccessSet.plan` stays (it's the resolved plan name, not a user field)

**index.ts (two call sites):**
- Replace `plan: user.plan ?? null` with `subscriptionStore: config.access.subscriptionStore`, `tenantId: sessionPayload.tenantId ?? null`
- For the token creation call site (line ~240): the session payload's `tenantId` may not be set on initial login. Pass `tenantId: null` — plan-gated entitlements won't be granted until the user switches to a tenant.

**Package exports (index.ts re-exports):**
- Update re-exports: `SubscriptionStore`, `Subscription`, `InMemorySubscriptionStore`, etc.
- Remove old names

#### Acceptance Criteria

```ts
describe('Phase 1: Remove plan from AuthUser + Rename stores', () => {
  describe('Given AuthUser interface', () => {
    describe('When creating a user via DbUserStore', () => {
      it('Then plan column is not included in INSERT', () => {});
      it('Then plan is not returned from findByEmail/findById', () => {});
    });
  });

  describe('Given SubscriptionStore (renamed from PlanStore)', () => {
    describe('When assigning a subscription', () => {
      it('Then assign(tenantId, planId) works', () => {});
      it('Then get(tenantId) returns Subscription with tenantId field', () => {});
    });
  });

  describe('Given WalletStore with tenantId param', () => {
    describe('When consuming', () => {
      it('Then consume(tenantId, ...) works', () => {});
    });
  });

  describe('Given FlagStore with tenantId param', () => {
    describe('When setting a flag', () => {
      it('Then setFlag(tenantId, ...) works', () => {});
    });
  });

  describe('Given computeAccessSet with subscriptionStore + tenantId', () => {
    describe('When tenantId has a subscription', () => {
      it('Then resolves plan from subscription, not from user', () => {});
    });
    describe('When tenantId is null', () => {
      it('Then plan is null and plan-gated entitlements are denied', () => {});
    });
  });

  describe('Given auth_users table DDL', () => {
    it('Then plan column is not present', () => {});
  });
});
```

### Phase 2: Update all tests + integration validation

**Goal:** All existing tests pass with the new naming. Integration tests validate the full flow.

#### Changes

- Update all test files that reference `PlanStore`, `OrgPlan`, `orgId`, `user.plan`
- Rename test helper factories
- Add integration test for the full flow: `defineAccess` → `SubscriptionStore.assign` → `computeAccessSet` → plan-gated entitlement resolved via tenant
- Verify the `/auth/access-set` endpoint resolves plan from subscription

#### Acceptance Criteria

```ts
describe('Phase 2: Integration validation', () => {
  describe('Given a full auth setup with subscription-based billing', () => {
    describe('When user logs in and switches tenant', () => {
      it('Then access set reflects the tenant subscription plan', () => {});
    });
    describe('When user logs in without tenant context', () => {
      it('Then access set has no plan and plan-gated entitlements denied', () => {});
    });
  });

  describe('Given all existing tests', () => {
    it('Then they pass with updated naming (no regressions)', () => {});
  });
});
```

---

## Files Involved (complete list)

### Renamed files
| Before | After |
|---|---|
| `plan-store.ts` | `subscription-store.ts` |
| `db-plan-store.ts` | `db-subscription-store.ts` |

### Modified files
| File | Change |
|---|---|
| `types.ts` | Remove `plan` from AuthUser, ReservedSignUpField, UserTableEntry; add subscription/wallet to AuthAccessConfig |
| `auth-tables.ts` | Remove `plan` column from auth_users DDL |
| `db-user-store.ts` | Remove plan from all queries and rowToUser |
| `access-set.ts` | Rename params, resolve plan from subscription |
| `index.ts` | Update computeAccessSet call sites, update exports |
| `wallet-store.ts` | orgId → tenantId |
| `flag-store.ts` | orgId → tenantId |
| `billing-period.ts` | Param name only (if orgId referenced) |
| `access-context.ts` | orgId → tenantId if referenced |
| All `__tests__/` files | Update to new names |

### No changes needed
| File | Reason |
|---|---|
| `define-access.ts` | Plans are defined here, not assigned — no orgId/plan references |
| `auth_plans` table DDL | Already uses `tenant_id` — no rename needed |
| `auth_plan_addons` table DDL | Already uses `tenant_id` |
| `auth_flags` table DDL | Already uses `tenant_id` |
| `auth_overrides` table DDL | Already uses `tenant_id` |
