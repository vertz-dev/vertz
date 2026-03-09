/**
 * Integration test — Plans & Wallet (Phase 8) [#1022]
 *
 * Validates the full plan/wallet lifecycle end-to-end:
 * - defineAccess() with plans configuration
 * - PlanStore / WalletStore with InMemory implementations
 * - Plan check (Layer 4) in can() and check()
 * - Wallet check (Layer 5) with limit visibility
 * - canAndConsume() / unconsume() atomic operations
 * - Plan expiration with free fallback
 * - Per-customer overrides (max of override, plan_limit)
 * - computeAccessSet() with limit info enrichment
 * - Billing period calculation
 * - encode/decode round-trip preserves limit data
 *
 * Uses public package imports only (@vertz/server).
 */
import { describe, expect, it } from 'bun:test';
import {
  calculateBillingPeriod,
  computeAccessSet,
  createAccessContext,
  decodeAccessSet,
  defineAccess,
  encodeAccessSet,
  InMemoryClosureStore,
  InMemoryPlanStore,
  InMemoryRoleAssignmentStore,
  InMemoryWalletStore,
} from '@vertz/server';

// ============================================================================
// Setup — entity-centric config
// ============================================================================

const accessDef = defineAccess({
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
  },
  entitlements: {
    'organization:create-project': {
      roles: ['admin', 'owner'],
      plans: ['pro', 'enterprise'],
    },
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit': { roles: ['contributor', 'manager'], plans: ['pro', 'enterprise'] },
    'project:delete': { roles: ['manager'] },
    'organization:use': { roles: [] },
  },
  plans: {
    free: {
      entitlements: ['project:view', 'organization:use'],
    },
    pro: {
      entitlements: [
        'organization:create-project',
        'project:view',
        'project:edit',
        'project:delete',
        'organization:use',
      ],
      limits: {
        'organization:create-project': { per: 'month', max: 10 },
      },
    },
    enterprise: {
      entitlements: [
        'organization:create-project',
        'project:view',
        'project:edit',
        'project:delete',
        'organization:use',
      ],
      limits: {
        'organization:create-project': { per: 'month', max: 100 },
      },
    },
  },
});

function createTestStores() {
  const roleStore = new InMemoryRoleAssignmentStore();
  const closureStore = new InMemoryClosureStore();
  const planStore = new InMemoryPlanStore();
  const walletStore = new InMemoryWalletStore();
  return { roleStore, closureStore, planStore, walletStore };
}

async function setupHierarchy(closureStore: InstanceType<typeof InMemoryClosureStore>) {
  await closureStore.addResource('organization', 'org-1');
  await closureStore.addResource('team', 'team-1', {
    parentType: 'organization',
    parentId: 'org-1',
  });
  await closureStore.addResource('project', 'proj-1', {
    parentType: 'team',
    parentId: 'team-1',
  });
}

// ============================================================================
// Plan Layer (L4) — can() / check()
// ============================================================================

describe('Plans & Wallet — Plan Layer (L4)', () => {
  it('can() denies entitlement when plan does not include it', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    await planStore.assignPlan('org-1', 'free');

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      planStore,
      walletStore,
      orgResolver: async () => 'org-1',
    });

    // admin has role, but free plan doesn't include organization:create-project
    const allowed = await ctx.can('organization:create-project', {
      type: 'project',
      id: 'proj-1',
    });
    expect(allowed).toBe(false);
  });

  it('can() allows entitlement when plan includes it', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    await planStore.assignPlan('org-1', 'pro');

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      planStore,
      walletStore,
      orgResolver: async () => 'org-1',
    });

    // admin -> editor -> contributor via inheritance; pro plan includes project:edit
    const allowed = await ctx.can('project:edit', { type: 'project', id: 'proj-1' });
    expect(allowed).toBe(true);
  });

  it('check() returns plan_required reason with requiredPlans meta', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    await planStore.assignPlan('org-1', 'free');

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      planStore,
      walletStore,
      orgResolver: async () => 'org-1',
    });

    const result = await ctx.check('organization:create-project', {
      type: 'project',
      id: 'proj-1',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('plan_required');
    expect(result.meta?.requiredPlans).toContain('pro');
    expect(result.meta?.requiredPlans).toContain('enterprise');
  });

  it('expired plan falls back to free', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    // Assign pro plan that expired yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await planStore.assignPlan('org-1', 'pro', new Date('2025-01-01'), yesterday);

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      planStore,
      walletStore,
      orgResolver: async () => 'org-1',
    });

    // Pro plan expired -> fallback to free -> organization:create-project not in free
    const allowed = await ctx.can('organization:create-project', {
      type: 'project',
      id: 'proj-1',
    });
    expect(allowed).toBe(false);
  });
});

// ============================================================================
// Wallet Layer (L5) — can() / check() with limits
// ============================================================================

describe('Plans & Wallet — Wallet Layer (L5)', () => {
  it('can() denies when limit is reached', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    const planStart = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStart);

    // Consume all 10 units
    const { periodStart, periodEnd } = calculateBillingPeriod(planStart, 'month');
    await walletStore.consume(
      'org-1',
      'organization:create-project',
      periodStart,
      periodEnd,
      10,
      10,
    );

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      planStore,
      walletStore,
      orgResolver: async () => 'org-1',
    });

    const allowed = await ctx.can('organization:create-project', {
      type: 'project',
      id: 'proj-1',
    });
    expect(allowed).toBe(false);
  });

  it('check() returns limit_reached with limit meta', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    const planStart = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStart);

    const { periodStart, periodEnd } = calculateBillingPeriod(planStart, 'month');
    await walletStore.consume(
      'org-1',
      'organization:create-project',
      periodStart,
      periodEnd,
      10,
      10,
    );

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      planStore,
      walletStore,
      orgResolver: async () => 'org-1',
    });

    const result = await ctx.check('organization:create-project', {
      type: 'project',
      id: 'proj-1',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('limit_reached');
    expect(result.meta?.limit?.max).toBe(10);
    expect(result.meta?.limit?.consumed).toBe(10);
    expect(result.meta?.limit?.remaining).toBe(0);
  });
});

// ============================================================================
// canAndConsume() / unconsume()
// ============================================================================

describe('Plans & Wallet — canAndConsume / unconsume', () => {
  it('canAndConsume() atomically checks + increments wallet', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    const planStart = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStart);

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      planStore,
      walletStore,
      orgResolver: async () => 'org-1',
    });

    // First consume should succeed (0/10)
    // Use organization resource where user has admin role directly
    const result1 = await ctx.canAndConsume('organization:create-project', {
      type: 'organization',
      id: 'org-1',
    });
    expect(result1).toBe(true);

    // Verify consumption was recorded
    const { periodStart, periodEnd } = calculateBillingPeriod(planStart, 'month');
    const consumed = await walletStore.getConsumption(
      'org-1',
      'organization:create-project',
      periodStart,
      periodEnd,
    );
    expect(consumed).toBe(1);
  });

  it('canAndConsume() fails when limit reached', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    const planStart = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStart);

    // Pre-consume 10 (the limit)
    const { periodStart, periodEnd } = calculateBillingPeriod(planStart, 'month');
    await walletStore.consume(
      'org-1',
      'organization:create-project',
      periodStart,
      periodEnd,
      10,
      10,
    );

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      planStore,
      walletStore,
      orgResolver: async () => 'org-1',
    });

    const result = await ctx.canAndConsume('organization:create-project', {
      type: 'project',
      id: 'proj-1',
    });
    expect(result).toBe(false);

    // Wallet should not have been incremented
    const consumed = await walletStore.getConsumption(
      'org-1',
      'organization:create-project',
      periodStart,
      periodEnd,
    );
    expect(consumed).toBe(10);
  });

  it('unconsume() rolls back wallet consumption', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    const planStart = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStart);

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      planStore,
      walletStore,
      orgResolver: async () => 'org-1',
    });

    // Consume — use organization resource where user has admin role
    await ctx.canAndConsume('organization:create-project', {
      type: 'organization',
      id: 'org-1',
    });
    const { periodStart, periodEnd } = calculateBillingPeriod(planStart, 'month');
    expect(
      await walletStore.getConsumption(
        'org-1',
        'organization:create-project',
        periodStart,
        periodEnd,
      ),
    ).toBe(1);

    // Unconsume (rollback)
    await ctx.unconsume('organization:create-project', {
      type: 'organization',
      id: 'org-1',
    });
    expect(
      await walletStore.getConsumption(
        'org-1',
        'organization:create-project',
        periodStart,
        periodEnd,
      ),
    ).toBe(0);
  });
});

// ============================================================================
// Per-customer overrides
// ============================================================================

describe('Plans & Wallet — Per-customer overrides', () => {
  it('override increases the effective limit', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    const planStart = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStart);
    // Override: max 20 instead of plan's 10
    await planStore.updateOverrides('org-1', {
      'organization:create-project': { max: 20 },
    });

    // Pre-consume 15 (above plan limit of 10, but below override of 20)
    const { periodStart, periodEnd } = calculateBillingPeriod(planStart, 'month');
    await walletStore.consume(
      'org-1',
      'organization:create-project',
      periodStart,
      periodEnd,
      20,
      15,
    );

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      planStore,
      walletStore,
      orgResolver: async () => 'org-1',
    });

    // Should still be allowed because override raised the limit to 20
    // Use organization resource where user has admin role directly
    const allowed = await ctx.can('organization:create-project', {
      type: 'organization',
      id: 'org-1',
    });
    expect(allowed).toBe(true);
  });
});

// ============================================================================
// computeAccessSet() with limit enrichment
// ============================================================================

describe('Plans & Wallet — AccessSet with limits', () => {
  it('computeAccessSet() includes limit info for plan-limited entitlements', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    const planStart = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStart);

    const { periodStart, periodEnd } = calculateBillingPeriod(planStart, 'month');
    await walletStore.consume(
      'org-1',
      'organization:create-project',
      periodStart,
      periodEnd,
      10,
      3,
    );

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
      planStore,
      walletStore,
      orgId: 'org-1',
    });

    expect(result.entitlements['organization:create-project'].allowed).toBe(true);
    expect(result.entitlements['organization:create-project'].meta?.limit?.max).toBe(10);
    expect(result.entitlements['organization:create-project'].meta?.limit?.consumed).toBe(3);
    expect(result.entitlements['organization:create-project'].meta?.limit?.remaining).toBe(7);
    // plan field should be populated from planStore (not null)
    expect(result.plan).toBe('pro');
  });

  it('encode/decode round-trip preserves limit data', async () => {
    const { roleStore, closureStore, planStore, walletStore } = createTestStores();
    await setupHierarchy(closureStore);
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    const planStart = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStart);

    const { periodStart, periodEnd } = calculateBillingPeriod(planStart, 'month');
    await walletStore.consume(
      'org-1',
      'organization:create-project',
      periodStart,
      periodEnd,
      10,
      5,
    );

    const original = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
      planStore,
      walletStore,
      orgId: 'org-1',
    });

    // Encode for JWT
    const encoded = encodeAccessSet(original);
    const json = JSON.stringify(encoded);

    // Simulate client deserialization
    const parsed = JSON.parse(json);
    const decoded = decodeAccessSet(parsed, accessDef);

    // Limit data is preserved through the round-trip
    expect(decoded.entitlements['organization:create-project'].allowed).toBe(true);
    expect(decoded.entitlements['organization:create-project'].meta?.limit?.max).toBe(10);
    expect(decoded.entitlements['organization:create-project'].meta?.limit?.consumed).toBe(5);
    expect(decoded.entitlements['organization:create-project'].meta?.limit?.remaining).toBe(5);
  });
});

// ============================================================================
// E2E Acceptance Test: free -> exhaust -> upgrade -> succeed
// ============================================================================

describe('Plans & Wallet — E2E Acceptance: free -> exhaust -> upgrade -> succeed', () => {
  it('assign org to free (limit 5), canAndConsume 5x, 6th denied, upgrade to pro, 6th succeeds', async () => {
    // Define access with free (limit 5) and pro (limit 100)
    const e2eAccessDef = defineAccess({
      entities: {
        organization: {
          roles: ['owner', 'admin'],
        },
        project: {
          roles: ['manager', 'contributor'],
          inherits: {
            'organization:owner': 'manager',
            'organization:admin': 'contributor',
          },
        },
      },
      entitlements: {
        'organization:create-project': {
          roles: ['admin', 'owner'],
          plans: ['free', 'pro'],
        },
        'project:view': { roles: ['contributor', 'manager'] },
      },
      plans: {
        free: {
          entitlements: ['organization:create-project', 'project:view'],
          limits: { 'organization:create-project': { per: 'month', max: 5 } },
        },
        pro: {
          entitlements: ['organization:create-project', 'project:view'],
          limits: { 'organization:create-project': { per: 'month', max: 100 } },
        },
      },
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    const planStore = new InMemoryPlanStore();
    const walletStore = new InMemoryWalletStore();

    await closureStore.addResource('organization', 'org-1');
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    // Step 1: Assign org to free plan with limit 5 projects/month
    await planStore.assignPlan('org-1', 'free');

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef: e2eAccessDef,
      closureStore,
      roleStore,
      planStore,
      walletStore,
      orgResolver: async () => 'org-1',
    });

    // Step 2: Create 5 projects via canAndConsume() — all succeed
    for (let i = 0; i < 5; i++) {
      const result = await ctx.canAndConsume('organization:create-project', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(true);
    }

    // Step 3: 6th project — denied (limit reached)
    const sixthDenied = await ctx.canAndConsume('organization:create-project', {
      type: 'organization',
      id: 'org-1',
    });
    expect(sixthDenied).toBe(false);

    // Step 4: Upgrade to pro (limit 100)
    await planStore.assignPlan('org-1', 'pro');

    // Step 5: 6th project now succeeds (pro limit is 100, only 5 consumed)
    const sixthAllowed = await ctx.canAndConsume('organization:create-project', {
      type: 'organization',
      id: 'org-1',
    });
    expect(sixthAllowed).toBe(true);
  });
});

// ============================================================================
// Billing period
// ============================================================================

describe('Plans & Wallet — Billing Period', () => {
  it('calculateBillingPeriod returns correct monthly period', () => {
    const startedAt = new Date('2026-01-15T00:00:00Z');
    const now = new Date('2026-03-20T00:00:00Z');

    const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month', now);

    // Started Jan 15, so period is Mar 15 - Apr 15
    expect(periodStart.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('calculateBillingPeriod returns correct daily period', () => {
    const startedAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-03T12:00:00Z');

    const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'day', now);

    // Day 3 starts at Jan 3 00:00, ends Jan 4 00:00
    expect(periodStart.toISOString()).toBe('2026-01-03T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-01-04T00:00:00.000Z');
  });
});
