# Plans & Wallet — Phase 8 Design Doc

**Issue:** #1022
**Parent:** #1015 — Unified Auth System
**Design:** `plans/unified-auth-system.md` Section 9

---

## 1. API Surface

### 1.1 Plan Definition in `defineAccess()`

```ts
const accessDef = defineAccess({
  hierarchy: ['Organization', 'Team', 'Project'],
  roles: {
    Organization: ['owner', 'admin', 'member'],
    Team: ['lead', 'editor', 'viewer'],
    Project: ['manager', 'contributor', 'viewer'],
  },
  inheritance: {
    Organization: { owner: 'lead', admin: 'editor', member: 'viewer' },
    Team: { lead: 'manager', editor: 'contributor', viewer: 'viewer' },
  },
  entitlements: {
    'project:create': { roles: ['admin', 'owner'], plans: ['free', 'pro', 'enterprise'] },
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
    'project:export': { roles: ['manager'], plans: ['enterprise'] },
  },
  plans: {
    free: {
      entitlements: ['project:create', 'project:view'],
      limits: { 'project:create': { per: 'month', max: 5 } },
    },
    pro: {
      entitlements: ['project:create', 'project:view', 'project:export'],
      limits: { 'project:create': { per: 'month', max: 100 } },
    },
    enterprise: {
      entitlements: ['project:create', 'project:view', 'project:export'],
      // No limits = unlimited
    },
  },
});
```

### 1.2 PlanStore Interface

```ts
interface OrgPlan {
  orgId: string;
  planId: string;
  startedAt: Date;
  expiresAt: Date | null;
  overrides: Record<string, { per: BillingPeriod; max: number }>;
}

type BillingPeriod = 'month' | 'day' | 'hour';

interface PlanDef {
  entitlements: string[];
  limits?: Record<string, { per: BillingPeriod; max: number }>;
}

interface PlanStore {
  assignPlan(orgId: string, planId: string, startedAt?: Date, expiresAt?: Date | null): void;
  getPlan(orgId: string): OrgPlan | null;
  updateOverrides(orgId: string, overrides: Record<string, { per: BillingPeriod; max: number }>): void;
  removePlan(orgId: string): void;
  dispose(): void;
}
```

### 1.3 WalletStore Interface

```ts
interface WalletEntry {
  orgId: string;
  entitlement: string;
  periodStart: Date;
  periodEnd: Date;
  consumed: number;
}

interface ConsumeResult {
  success: boolean;
  consumed: number;
  limit: number;
  remaining: number;
}

interface WalletStore {
  consume(orgId: string, entitlement: string, periodStart: Date, periodEnd: Date, limit: number, amount?: number): ConsumeResult;
  unconsume(orgId: string, entitlement: string, periodStart: Date, periodEnd: Date, amount?: number): void;
  getConsumption(orgId: string, entitlement: string, periodStart: Date, periodEnd: Date): number;
  dispose(): void;
}
```

### 1.4 AccessContext Extensions

```ts
interface AccessContext {
  // Existing
  can(entitlement: string, resource?: ResourceRef): Promise<boolean>;
  check(entitlement: string, resource?: ResourceRef): Promise<AccessCheckResult>;
  authorize(entitlement: string, resource?: ResourceRef): Promise<void>;
  canAll(checks: Array<{ entitlement: string; resource?: ResourceRef }>): Promise<Map<string, boolean>>;

  // New — Phase 8
  canAndConsume(entitlement: string, resource?: ResourceRef, amount?: number): Promise<boolean>;
  unconsume(entitlement: string, resource?: ResourceRef, amount?: number): Promise<void>;
}
```

### 1.5 AccessContextConfig Extensions

```ts
interface AccessContextConfig {
  // Existing
  userId: string | null;
  accessDef: AccessDefinition;
  closureStore: ClosureStore;
  roleStore: RoleAssignmentStore;
  fva?: number;

  // New — Phase 8
  planStore?: PlanStore;
  walletStore?: WalletStore;
  orgResolver?: (resource?: ResourceRef) => Promise<string | null>;
}
```

### 1.6 Client-Side Limit Visibility

```ts
// Server check() result includes limit info
const result = await ctx.check('project:create', { type: 'Organization', id: 'org-1' });
// result.meta?.limit = { max: 5, consumed: 3, remaining: 2 }

// Client can() reads from access set
const canCreate = can('project:create');
// canCreate.meta.limit = { max: 5, consumed: 3, remaining: 2 }
```

### 1.7 WebSocket Event Shape (deferred to Phase 9)

```ts
interface LimitUpdatedEvent {
  type: 'access:limit_updated';
  entitlement: string;
  consumed: number;
  remaining: number;
}
```

---

## 2. Manifesto Alignment

- **If it builds, it works**: Plan entitlements and limits validated at `defineAccess()` time — invalid references caught before runtime.
- **One way to do things**: `canAndConsume()` is the single correct way to gate limited operations. `can()` for UI display, `canAndConsume()` for mutations. No ambiguity.
- **AI agents are first-class users**: Plan definitions are declarative objects in `defineAccess()` — an LLM can produce them from a product requirements description.
- **Test what matters**: Wallet atomicity and plan expiration are the critical behaviors. Each gets dedicated tests.

**Tradeoffs accepted:**
- `orgResolver` callback breaks pure data-driven resolution — but org resolution requires walking the closure table, which varies per-resource. A callback keeps this flexible without hardcoding traversal logic.
- In-memory stores are not truly atomic (no DB transactions) — acceptable for Phase 8 since PostgreSQL adapter is a future phase. The interface contract is atomic; InMemory simulates it.

**Rejected alternatives:**
- Global plan context (set once, used everywhere): Too implicit. Explicit `orgResolver` forces developers to think about which org owns which resource.
- Separate `PlanContext` and `WalletContext`: Over-decomposed. Plans and wallets are tightly coupled (limits belong to plans). Keeping them in `AccessContext` maintains a single evaluation engine.

---

## 3. Non-Goals

- **Redis-backed wallet**: In-memory only for Phase 8. High-frequency rate limiting is a future concern.
- **Sub-org billing**: Team budgets, per-user quotas not in scope.
- **Stripe/payment integration**: Plan assignment is manual; no payment processor hooks.
- **Resource-count limits**: Only creation-velocity (per billing period). Use `rules.where()` for resource counts.
- **WebSocket fan-out implementation**: Phase 9. This phase defines the event shape and has `canAndConsume()` return the data needed for broadcast.
- **Feature flags layer**: Layer 1 remains stubbed.
- **Grace period / `plan_expiring` flag**: Design is specified but implementation deferred — the core plan expiration (fallback to free) is in scope.

---

## 4. Unknowns

- **Billing period edge cases**: Month boundaries (Jan 31 → Feb 28?). Resolution: Use simple date arithmetic — `startedAt + N months`. Edge cases are inherent to calendar months. For Phase 8 (in-memory), use millisecond-based period calculation. PostgreSQL adapter will use `interval '1 month'` in a future phase.
- **Concurrent `canAndConsume()` in InMemory**: Single-threaded JavaScript means no true concurrency. The InMemory implementation is sequentially consistent by default. Interface contract specifies atomicity for future PostgreSQL adapter.

---

## 5. POC Results

No POC needed. The design follows established patterns (5-layer resolution already implemented for Layers 1-3, plan/wallet layers are additive).

---

## 6. Type Flow Map

```
DefineAccessInput.plans (user-provided)
  → defineAccess() validation
  → AccessDefinition.plans (frozen, readonly)
    → AccessContextConfig.accessDef.plans (read by can/check)
    → PlanStore.getPlan() → OrgPlan.planId
      → accessDef.plans[planId] → PlanDef.entitlements (Layer 4 check)
      → accessDef.plans[planId] → PlanDef.limits[entitlement] → { per, max }
        → max(override, planLimit) → effective limit
        → WalletStore.consume(limit) → ConsumeResult { success, consumed, limit, remaining }
          → check() → DenialMeta.limit { max, consumed, remaining }
          → computeAccessSet() → AccessSet.entitlements[ent].meta.limit
            → encodeAccessSet() → JWT acl claim
              → decodeAccessSet() → client AccessSet
                → can().meta.limit → { max, consumed, remaining }

BillingPeriod ('month' | 'day' | 'hour')
  → PlanDef.limits[ent].per
  → calculateBillingPeriod(startedAt, per, now) → { periodStart, periodEnd }
  → WalletStore methods

OrgPlan.overrides
  → PlanStore.updateOverrides()
  → resolvePlanLimit(): max(override[ent].max, plan.limits[ent].max) → effective limit
```

---

## 7. E2E Acceptance Test

```ts
// Setup
const accessDef = defineAccess({
  hierarchy: ['Organization', 'Project'],
  roles: {
    Organization: ['owner', 'admin', 'member'],
    Project: ['manager', 'contributor', 'viewer'],
  },
  inheritance: {
    Organization: { owner: 'manager', admin: 'contributor', member: 'viewer' },
  },
  entitlements: {
    'project:create': { roles: ['admin', 'owner'], plans: ['free', 'pro'] },
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
  },
  plans: {
    free: {
      entitlements: ['project:create', 'project:view'],
      limits: { 'project:create': { per: 'month', max: 5 } },
    },
    pro: {
      entitlements: ['project:create', 'project:view'],
      limits: { 'project:create': { per: 'month', max: 100 } },
    },
  },
});

const closureStore = new InMemoryClosureStore();
const roleStore = new InMemoryRoleAssignmentStore();
const planStore = new InMemoryPlanStore();
const walletStore = new InMemoryWalletStore();

closureStore.addResource('Organization', 'org-1');
roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
planStore.assignPlan('org-1', 'free');

const orgResolver = async (resource?: ResourceRef) => {
  if (!resource) return null;
  // Walk up closure table to find Organization ancestor
  const ancestors = closureStore.getAncestors(resource.type, resource.id);
  const org = ancestors.find(a => a.type === 'Organization');
  return org?.id ?? null;
};

const ctx = createAccessContext({
  userId: 'user-1',
  accessDef,
  closureStore,
  roleStore,
  planStore,
  walletStore,
  orgResolver,
});

// Create 5 projects — all succeed
for (let i = 0; i < 5; i++) {
  expect(await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' })).toBe(true);
}

// 6th project — denied (limit reached)
expect(await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' })).toBe(false);

// Check includes limit info
const checkResult = await ctx.check('project:create', { type: 'Organization', id: 'org-1' });
expect(checkResult.allowed).toBe(false);
expect(checkResult.reasons).toContain('limit_reached');
expect(checkResult.meta?.limit).toEqual({ max: 5, consumed: 5, remaining: 0 });

// Upgrade to pro
planStore.assignPlan('org-1', 'pro');

// 6th project now succeeds (pro has limit 100)
expect(await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' })).toBe(true);

// @ts-expect-error - plans must reference known plan names in defineAccess
defineAccess({
  hierarchy: ['Org'],
  roles: { Org: ['admin'] },
  entitlements: { 'org:do': { roles: ['admin'], plans: ['nonexistent'] } },
  plans: { free: { entitlements: ['org:do'] } },
});
```

---

## 8. Implementation Plan

### Sub-Phase 8.1: Plan Definitions + PlanStore

**Goal:** Extend `defineAccess()` with plan config, create PlanStore interface + InMemoryPlanStore.

**Files to create:**
- `packages/server/src/auth/plan-store.ts` — PlanStore interface + InMemoryPlanStore
- `packages/server/src/auth/__tests__/plan-store.test.ts` — PlanStore tests

**Files to modify:**
- `packages/server/src/auth/define-access.ts` — Add `plans` to `DefineAccessInput` and `AccessDefinition`, add validation
- `packages/server/src/auth/__tests__/define-access.test.ts` — Plan validation tests

**Acceptance criteria (tests):**
1. `defineAccess()` accepts `plans` config and freezes it in `AccessDefinition`
2. Validation: plan entitlement must exist in `entitlements` config
3. Validation: limit key must reference an entitlement listed in plan's `entitlements`
4. `InMemoryPlanStore.assignPlan()` stores org → plan mapping
5. `InMemoryPlanStore.getPlan()` returns stored plan
6. `InMemoryPlanStore.updateOverrides()` merges overrides
7. `InMemoryPlanStore.removePlan()` clears org plan
8. `InMemoryPlanStore.dispose()` clears all data

**Quality gates:** `bun test --filter @vertz/server`, `bun run typecheck --filter @vertz/server`, `bunx biome check --write <changed-files>`

---

### Sub-Phase 8.2: Plan Layer Activation (Layer 4)

**Goal:** Un-stub Layer 4 in `can()` and `check()`. When an entitlement has `plans: [...]`, check that the org's plan includes it.

**Dependencies:** 8.1 (PlanStore, plan defs)

**Files to modify:**
- `packages/server/src/auth/access-context.ts` — Add `planStore`, `walletStore`, `orgResolver` to config; implement Layer 4 in `can()` and `check()`
- `packages/server/src/auth/__tests__/access-context.test.ts` — Plan layer tests

**Acceptance criteria (tests):**
1. `can()` returns false when entitlement requires plans but org has no plan assigned
2. `can()` returns false when entitlement requires plans and org plan does not include it
3. `can()` returns true when entitlement requires plans and org plan includes it
4. `check()` returns `plan_required` with `meta.requiredPlans` when plan check fails
5. Plan check skipped when entitlement has no `plans` field (backward compat)
6. Plan check skipped when no `planStore` configured (backward compat)
7. Expired plan → falls back to free plan (if `free` exists); denied if no free plan
8. `orgResolver` resolves org from resource via closure table walk-up

**Quality gates:** Same as 8.1

---

### Sub-Phase 8.3: WalletStore + canAndConsume()/unconsume()

**Goal:** Implement wallet tracking and atomic check-and-consume on AccessContext.

**Dependencies:** 8.2 (plan layer in can/check)

**Files to create:**
- `packages/server/src/auth/wallet-store.ts` — WalletStore interface + InMemoryWalletStore
- `packages/server/src/auth/__tests__/wallet-store.test.ts` — WalletStore tests
- `packages/server/src/auth/billing-period.ts` — Billing period calculation helpers
- `packages/server/src/auth/__tests__/billing-period.test.ts` — Period calculation tests

**Files to modify:**
- `packages/server/src/auth/access-context.ts` — Add `canAndConsume()` and `unconsume()` to AccessContext
- `packages/server/src/auth/__tests__/access-context.test.ts` — canAndConsume/unconsume tests

**Acceptance criteria (tests):**
1. `InMemoryWalletStore.consume()` returns `{ success: true }` when under limit
2. `InMemoryWalletStore.consume()` returns `{ success: false }` when at or over limit
3. `InMemoryWalletStore.consume()` lazily initializes wallet entry
4. `InMemoryWalletStore.unconsume()` decrements consumed count
5. `InMemoryWalletStore.unconsume()` does not go below 0
6. `InMemoryWalletStore.getConsumption()` returns current consumption
7. `calculateBillingPeriod()` anchors to plan started_at
8. `calculateBillingPeriod()` handles month/day/hour periods
9. `canAndConsume()` runs full can() check then atomically consumes
10. `canAndConsume()` returns false when can() fails (before wallet check)
11. `canAndConsume()` returns false when limit reached
12. `canAndConsume(amount: 3)` increments by specified amount
13. `unconsume()` rolls back wallet after operation failure
14. Per-customer override increases limit: `max(override, plan_limit)`
15. Entitlement without limits: `canAndConsume()` behaves like `can()` (always succeeds if plan allows)

**Quality gates:** Same as 8.1

---

### Sub-Phase 8.4: Wallet Layer in check() + Limit Visibility

**Goal:** Un-stub Layer 5 in `check()`, add limit info to AccessSet, update encoding/decoding, update client types.

**Dependencies:** 8.3 (wallet store, canAndConsume)

**Files to modify:**
- `packages/server/src/auth/access-context.ts` — Layer 5 (wallet) in `check()`
- `packages/server/src/auth/access-set.ts` — Add plan/wallet data to `computeAccessSet()`, update encode/decode for limit info
- `packages/server/src/auth/__tests__/access-set.test.ts` — Limit data in access set tests
- `packages/server/src/auth/__tests__/access-context.test.ts` — Layer 5 tests

**Acceptance criteria (tests):**
1. `check()` returns `limit_reached` with `meta.limit { max, consumed, remaining }` when wallet is exhausted
2. `check()` includes limit info even when allowed (remaining > 0)
3. `computeAccessSet()` includes limit info for plan-limited entitlements
4. `encodeAccessSet()` preserves `meta.limit` (not stripped like requiredRoles)
5. `decodeAccessSet()` restores `meta.limit` from encoded data
6. `can()` returns false when limit reached (Layer 5 short-circuit)

**Quality gates:** Same as 8.1

---

### Sub-Phase 8.5: Integration Tests + Exports + Changeset

**Goal:** E2E acceptance test, export new APIs, changeset.

**Dependencies:** 8.4 (all layers working)

**Files to create:**
- `packages/integration-tests/src/__tests__/auth-plans-wallet.test.ts` — E2E integration test

**Files to modify:**
- `packages/server/src/auth/index.ts` — Export PlanStore, WalletStore, InMemory implementations, billing helpers
- `packages/server/src/index.ts` — Re-export from auth
- `.changeset/<name>.md` — Changeset

**Acceptance criteria (tests):**
1. E2E: Assign org to free plan with limit 5/month → create 5 → 6th denied → upgrade to pro → 6th succeeds
2. E2E: `check()` returns plan_required when plan doesn't include entitlement
3. E2E: Per-customer override increases limit above plan default
4. E2E: Expired plan falls back to free
5. E2E: `unconsume()` rolls back after failed operation
6. Cross-package typecheck: `bun run typecheck --filter @vertz/integration-tests`
7. All public imports work: `InMemoryPlanStore`, `InMemoryWalletStore` from `@vertz/server`

**Quality gates:** `bun test`, `bun run typecheck`, `bun run lint`
