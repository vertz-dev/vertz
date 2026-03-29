/**
 * Tests for batch consumption optimization in computeAccessSet (#1831)
 *
 * Verifies that computeAccessSet uses getBatchConsumption instead of
 * individual getConsumption calls, grouped by billing period.
 */

import { describe, expect, it } from 'bun:test';
import { computeAccessSet } from '../access-set';
import { calculateBillingPeriod } from '../billing-period';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import { InMemorySubscriptionStore } from '../subscription-store';
import { InMemoryWalletStore } from '../wallet-store';

// ============================================================================
// Helpers
// ============================================================================

function createStores() {
  const roleStore = new InMemoryRoleAssignmentStore();
  const closureStore = new InMemoryClosureStore();
  const subscriptionStore = new InMemorySubscriptionStore();
  const walletStore = new InMemoryWalletStore();
  return { roleStore, closureStore, subscriptionStore, walletStore };
}

// ============================================================================
// Single-level batch consumption
// ============================================================================

describe('Feature: single-level batch consumption in computeAccessSet (#1831)', () => {
  const singleLimitDef = defineAccess({
    entities: {
      organization: { roles: ['owner', 'admin'] },
    },
    entitlements: {
      'organization:create-project': { roles: ['admin', 'owner'] },
      'organization:view': { roles: ['admin', 'owner'] },
    },
    plans: {
      pro: {
        group: 'main',
        features: ['organization:create-project', 'organization:view'],
        limits: {
          projects: { max: 10, gates: 'organization:create-project', per: 'month' },
        },
      },
    },
  });

  describe('Given a plan with one limited entitlement and partial consumption', () => {
    describe('When computeAccessSet is called with walletStore', () => {
      it('Then includes correct limit meta (consumed/remaining)', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('tenant', 'org-1', 'pro', startedAt);

        const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month');
        await walletStore.consume('tenant', 'org-1', 'projects', periodStart, periodEnd, 10, 3);

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef: singleLimitDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        expect(result.entitlements['organization:create-project'].allowed).toBe(true);
        expect(result.entitlements['organization:create-project'].meta?.limit).toEqual({
          key: 'projects',
          max: 10,
          consumed: 3,
          remaining: 7,
        });
      });

      it('Then calls getBatchConsumption instead of getConsumption', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('tenant', 'org-1', 'pro', startedAt);

        let batchCalls = 0;
        let individualCalls = 0;
        const originalBatch = walletStore.getBatchConsumption.bind(walletStore);
        const originalIndividual = walletStore.getConsumption.bind(walletStore);

        walletStore.getBatchConsumption = (
          ...args: Parameters<typeof walletStore.getBatchConsumption>
        ) => {
          batchCalls++;
          return originalBatch(...args);
        };
        walletStore.getConsumption = (...args: Parameters<typeof walletStore.getConsumption>) => {
          individualCalls++;
          return originalIndividual(...args);
        };

        await computeAccessSet({
          userId: 'user-1',
          accessDef: singleLimitDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        expect(batchCalls).toBe(1);
        expect(individualCalls).toBe(0);
      });
    });
  });

  // Multi-limit plan for batch tests
  const multiLimitDef = defineAccess({
    entities: {
      organization: { roles: ['owner', 'admin'] },
    },
    entitlements: {
      'organization:create-project': { roles: ['admin', 'owner'] },
      'organization:create-team': { roles: ['admin', 'owner'] },
      'organization:view': { roles: ['admin', 'owner'] },
    },
    plans: {
      pro: {
        group: 'main',
        features: ['organization:create-project', 'organization:create-team', 'organization:view'],
        limits: {
          projects: { max: 10, gates: 'organization:create-project', per: 'month' },
          teams: { max: 5, gates: 'organization:create-team', per: 'month' },
        },
      },
    },
  });

  describe('Given a plan with multiple limited entitlements (same period)', () => {
    describe('When computeAccessSet is called', () => {
      it('Then fetches all consumption in one batch call', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('tenant', 'org-1', 'pro', startedAt);

        let batchCallCount = 0;
        const originalBatch = walletStore.getBatchConsumption.bind(walletStore);
        walletStore.getBatchConsumption = (
          ...args: Parameters<typeof walletStore.getBatchConsumption>
        ) => {
          batchCallCount++;
          return originalBatch(...args);
        };

        await computeAccessSet({
          userId: 'user-1',
          accessDef: multiLimitDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        expect(batchCallCount).toBe(1);
      });

      it('Then enriches each entitlement with its respective consumed value', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('tenant', 'org-1', 'pro', startedAt);

        const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month');
        await walletStore.consume('tenant', 'org-1', 'projects', periodStart, periodEnd, 10, 3);
        await walletStore.consume('tenant', 'org-1', 'teams', periodStart, periodEnd, 5, 2);

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef: multiLimitDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        expect(result.entitlements['organization:create-project'].meta?.limit).toEqual({
          key: 'projects',
          max: 10,
          consumed: 3,
          remaining: 7,
        });
        expect(result.entitlements['organization:create-team'].meta?.limit).toEqual({
          key: 'teams',
          max: 5,
          consumed: 2,
          remaining: 3,
        });
      });
    });
  });

  // Mixed-period plan
  const mixedPeriodDef = defineAccess({
    entities: {
      organization: { roles: ['owner', 'admin'] },
    },
    entitlements: {
      'organization:create-project': { roles: ['admin', 'owner'] },
      'organization:api-call': { roles: ['admin', 'owner'] },
      'organization:view': { roles: ['admin', 'owner'] },
    },
    plans: {
      pro: {
        group: 'main',
        features: ['organization:create-project', 'organization:api-call', 'organization:view'],
        limits: {
          projects: { max: 10, gates: 'organization:create-project', per: 'month' },
          'api-calls': { max: 1000, gates: 'organization:api-call', per: 'day' },
        },
      },
    },
  });

  describe('Given a plan with limits using different billing periods', () => {
    describe('When computeAccessSet is called', () => {
      it('Then groups by period and calls getBatchConsumption per group', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('tenant', 'org-1', 'pro', startedAt);

        let batchCallCount = 0;
        const originalBatch = walletStore.getBatchConsumption.bind(walletStore);
        walletStore.getBatchConsumption = (
          ...args: Parameters<typeof walletStore.getBatchConsumption>
        ) => {
          batchCallCount++;
          return originalBatch(...args);
        };

        await computeAccessSet({
          userId: 'user-1',
          accessDef: mixedPeriodDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        // 'month' and 'day' produce different periods → 2 batch calls
        expect(batchCallCount).toBe(2);
      });

      it('Then enriches each entitlement with correct consumed value for its period', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('tenant', 'org-1', 'pro', startedAt);

        const monthPeriod = calculateBillingPeriod(startedAt, 'month');
        const dayPeriod = calculateBillingPeriod(startedAt, 'day');
        await walletStore.consume(
          'tenant',
          'org-1',
          'projects',
          monthPeriod.periodStart,
          monthPeriod.periodEnd,
          10,
          4,
        );
        await walletStore.consume(
          'tenant',
          'org-1',
          'api-calls',
          dayPeriod.periodStart,
          dayPeriod.periodEnd,
          1000,
          150,
        );

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef: mixedPeriodDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        expect(result.entitlements['organization:create-project'].meta?.limit).toEqual({
          key: 'projects',
          max: 10,
          consumed: 4,
          remaining: 6,
        });
        expect(result.entitlements['organization:api-call'].meta?.limit).toEqual({
          key: 'api-calls',
          max: 1000,
          consumed: 150,
          remaining: 850,
        });
      });
    });
  });

  // Lifetime + monthly mix
  const lifetimeMixDef = defineAccess({
    entities: {
      organization: { roles: ['owner', 'admin'] },
    },
    entitlements: {
      'organization:create-project': { roles: ['admin', 'owner'] },
      'organization:storage-upload': { roles: ['admin', 'owner'] },
      'organization:view': { roles: ['admin', 'owner'] },
    },
    plans: {
      pro: {
        group: 'main',
        features: [
          'organization:create-project',
          'organization:storage-upload',
          'organization:view',
        ],
        limits: {
          projects: { max: 10, gates: 'organization:create-project', per: 'month' },
          storage: { max: 50, gates: 'organization:storage-upload' }, // no per = lifetime
        },
      },
    },
  });

  describe('Given a plan with a lifetime limit (no per) and a monthly limit', () => {
    describe('When computeAccessSet is called', () => {
      it('Then issues separate batch calls for lifetime and monthly periods', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('tenant', 'org-1', 'pro', startedAt);

        let batchCallCount = 0;
        const originalBatch = walletStore.getBatchConsumption.bind(walletStore);
        walletStore.getBatchConsumption = (
          ...args: Parameters<typeof walletStore.getBatchConsumption>
        ) => {
          batchCallCount++;
          return originalBatch(...args);
        };

        await computeAccessSet({
          userId: 'user-1',
          accessDef: lifetimeMixDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        // lifetime period != monthly period → 2 batch calls
        expect(batchCallCount).toBe(2);
      });
    });
  });

  describe('Given limit reached (consumed >= max)', () => {
    describe('When computeAccessSet is called', () => {
      it('Then denies with limit_reached reason', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('tenant', 'org-1', 'pro', startedAt);

        const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month');
        await walletStore.consume('tenant', 'org-1', 'projects', periodStart, periodEnd, 10, 10);

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef: singleLimitDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        expect(result.entitlements['organization:create-project'].allowed).toBe(false);
        expect(result.entitlements['organization:create-project'].reasons).toContain(
          'limit_reached',
        );
        expect(result.entitlements['organization:create-project'].meta?.limit?.remaining).toBe(0);
      });
    });
  });

  // Unlimited plan
  const unlimitedDef = defineAccess({
    entities: {
      organization: { roles: ['owner', 'admin'] },
    },
    entitlements: {
      'organization:create-project': { roles: ['admin', 'owner'] },
      'organization:view': { roles: ['admin', 'owner'] },
    },
    plans: {
      enterprise: {
        group: 'main',
        features: ['organization:create-project', 'organization:view'],
        limits: {
          projects: { max: -1, gates: 'organization:create-project', per: 'month' },
        },
      },
    },
  });

  describe('Given unlimited entitlement (max = -1)', () => {
    describe('When computeAccessSet is called', () => {
      it('Then skips wallet call and sets consumed=0, remaining=-1', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        await subscriptionStore.assign('tenant', 'org-1', 'enterprise');

        let batchCallCount = 0;
        const originalBatch = walletStore.getBatchConsumption.bind(walletStore);
        walletStore.getBatchConsumption = (
          ...args: Parameters<typeof walletStore.getBatchConsumption>
        ) => {
          batchCallCount++;
          return originalBatch(...args);
        };

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef: unlimitedDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        expect(batchCallCount).toBe(0);
        expect(result.entitlements['organization:create-project'].meta?.limit).toEqual({
          key: 'projects',
          max: -1,
          consumed: 0,
          remaining: -1,
        });
      });
    });
  });

  describe('Given no limited entitlements', () => {
    describe('When computeAccessSet is called', () => {
      it('Then does not call getBatchConsumption', async () => {
        const noLimitDef = defineAccess({
          entities: {
            organization: { roles: ['owner', 'admin'] },
          },
          entitlements: {
            'organization:view': { roles: ['admin', 'owner'] },
          },
          plans: {
            free: {
              group: 'main',
              features: ['organization:view'],
            },
          },
        });

        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        await subscriptionStore.assign('tenant', 'org-1', 'free');

        let batchCallCount = 0;
        const originalBatch = walletStore.getBatchConsumption.bind(walletStore);
        walletStore.getBatchConsumption = (
          ...args: Parameters<typeof walletStore.getBatchConsumption>
        ) => {
          batchCallCount++;
          return originalBatch(...args);
        };

        await computeAccessSet({
          userId: 'user-1',
          accessDef: noLimitDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        expect(batchCallCount).toBe(0);
      });
    });
  });
});

// ============================================================================
// Multi-level batch consumption
// ============================================================================

describe('Feature: multi-level batch consumption in computeAccessSet (#1831)', () => {
  const multiLevelDef = defineAccess({
    entities: {
      account: { roles: ['owner', 'admin'] },
      project: {
        roles: ['admin', 'editor'],
        inherits: {
          'account:owner': 'admin',
          'account:admin': 'editor',
        },
      },
    },
    entitlements: {
      'account:create-project': { roles: ['owner', 'admin'] },
      'account:api-call': { roles: ['owner', 'admin'] },
      'project:view': { roles: ['admin', 'editor'] },
    },
    plans: {
      pro: {
        level: 'project',
        group: 'project-plans',
        features: ['account:create-project', 'account:api-call'],
        limits: {
          projects: { max: 10, gates: 'account:create-project', per: 'month' },
          'api-calls': { max: 500, gates: 'account:api-call', per: 'month' },
        },
      },
    },
    defaultPlans: {
      project: 'pro',
    },
  });

  function mockAncestorResolver(
    ancestors: Record<string, { type: string; id: string; depth: number }[]>,
  ) {
    return async (_level: string, id: string) => ancestors[id] ?? [];
  }

  describe('Given multi-level setup with limited entitlements at deepest level', () => {
    describe('When computeAccessSet is called with ancestorResolver', () => {
      it('Then uses getBatchConsumption for deepest level limits', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('account', 'acct-1');
        await closureStore.addResource('project', 'proj-1', {
          parentType: 'account',
          parentId: 'acct-1',
        });
        await roleStore.assign('user-1', 'account', 'acct-1', 'owner');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('project', 'proj-1', 'pro', startedAt);

        let batchCalls = 0;
        let individualCalls = 0;
        const originalBatch = walletStore.getBatchConsumption.bind(walletStore);
        const originalIndividual = walletStore.getConsumption.bind(walletStore);
        walletStore.getBatchConsumption = (
          ...args: Parameters<typeof walletStore.getBatchConsumption>
        ) => {
          batchCalls++;
          return originalBatch(...args);
        };
        walletStore.getConsumption = (...args: Parameters<typeof walletStore.getConsumption>) => {
          individualCalls++;
          return originalIndividual(...args);
        };

        await computeAccessSet({
          userId: 'user-1',
          accessDef: multiLevelDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'proj-1',
          tenantLevel: 'project',
          ancestorResolver: mockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        expect(batchCalls).toBe(1);
        expect(individualCalls).toBe(0);
      });

      it('Then enriches limit meta correctly', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('account', 'acct-1');
        await closureStore.addResource('project', 'proj-1', {
          parentType: 'account',
          parentId: 'acct-1',
        });
        await roleStore.assign('user-1', 'account', 'acct-1', 'owner');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('project', 'proj-1', 'pro', startedAt);

        const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month');
        await walletStore.consume('project', 'proj-1', 'projects', periodStart, periodEnd, 10, 4);
        await walletStore.consume(
          'project',
          'proj-1',
          'api-calls',
          periodStart,
          periodEnd,
          500,
          120,
        );

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef: multiLevelDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'proj-1',
          tenantLevel: 'project',
          ancestorResolver: mockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        expect(result.entitlements['account:create-project'].meta?.limit).toEqual({
          key: 'projects',
          max: 10,
          consumed: 4,
          remaining: 6,
        });
        expect(result.entitlements['account:api-call'].meta?.limit).toEqual({
          key: 'api-calls',
          max: 500,
          consumed: 120,
          remaining: 380,
        });
      });
    });
  });

  describe('Given multi-level with limit reached', () => {
    describe('When computeAccessSet is called', () => {
      it('Then denies with limit_reached reason', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('account', 'acct-1');
        await closureStore.addResource('project', 'proj-1', {
          parentType: 'account',
          parentId: 'acct-1',
        });
        await roleStore.assign('user-1', 'account', 'acct-1', 'owner');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('project', 'proj-1', 'pro', startedAt);

        const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month');
        await walletStore.consume('project', 'proj-1', 'projects', periodStart, periodEnd, 10, 10);

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef: multiLevelDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'proj-1',
          tenantLevel: 'project',
          ancestorResolver: mockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        expect(result.entitlements['account:create-project'].allowed).toBe(false);
        expect(result.entitlements['account:create-project'].reasons).toContain('limit_reached');
        expect(result.entitlements['account:create-project'].meta?.limit?.remaining).toBe(0);
      });
    });
  });

  // Mixed-period multi-level
  const mixedPeriodMultiDef = defineAccess({
    entities: {
      account: { roles: ['owner', 'admin'] },
      project: {
        roles: ['admin', 'editor'],
        inherits: {
          'account:owner': 'admin',
          'account:admin': 'editor',
        },
      },
    },
    entitlements: {
      'account:create-project': { roles: ['owner', 'admin'] },
      'account:api-call': { roles: ['owner', 'admin'] },
      'project:view': { roles: ['admin', 'editor'] },
    },
    plans: {
      pro: {
        level: 'project',
        group: 'project-plans',
        features: ['account:create-project', 'account:api-call'],
        limits: {
          projects: { max: 10, gates: 'account:create-project', per: 'month' },
          'api-calls': { max: 1000, gates: 'account:api-call', per: 'day' },
        },
      },
    },
    defaultPlans: {
      project: 'pro',
    },
  });

  describe('Given multi-level with limits using different periods', () => {
    describe('When computeAccessSet is called', () => {
      it('Then groups by period and uses batch consumption per group', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();
        await closureStore.addResource('account', 'acct-1');
        await closureStore.addResource('project', 'proj-1', {
          parentType: 'account',
          parentId: 'acct-1',
        });
        await roleStore.assign('user-1', 'account', 'acct-1', 'owner');
        const startedAt = new Date('2026-01-01T00:00:00Z');
        await subscriptionStore.assign('project', 'proj-1', 'pro', startedAt);

        let batchCalls = 0;
        const originalBatch = walletStore.getBatchConsumption.bind(walletStore);
        walletStore.getBatchConsumption = (
          ...args: Parameters<typeof walletStore.getBatchConsumption>
        ) => {
          batchCalls++;
          return originalBatch(...args);
        };

        await computeAccessSet({
          userId: 'user-1',
          accessDef: mixedPeriodMultiDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'proj-1',
          tenantLevel: 'project',
          ancestorResolver: mockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        // 'month' and 'day' → 2 batch calls
        expect(batchCalls).toBe(2);
      });
    });
  });
});
