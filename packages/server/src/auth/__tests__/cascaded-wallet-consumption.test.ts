import { beforeEach, describe, expect, it } from 'bun:test';
import { createAccessContext } from '../access-context';
import type { AncestorChainEntry } from '../access-set';
import { calculateBillingPeriod } from '../billing-period';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import { InMemorySubscriptionStore } from '../subscription-store';
import { InMemoryWalletStore } from '../wallet-store';

// ============================================================================
// Shared setup: 2-level hierarchy (account -> project)
// ============================================================================

const accessDef = defineAccess({
  entities: {
    account: { roles: ['owner', 'admin'] },
    project: {
      roles: ['admin', 'member'],
      inherits: { 'account:owner': 'admin', 'account:admin': 'admin' },
    },
  },
  entitlements: {
    'project:ai-generate': { roles: ['admin', 'member'] },
  },
  plans: {
    'account-enterprise': {
      group: 'account-plans',
      level: 'account',
      features: ['project:ai-generate'],
      limits: {
        'ai-credits': { max: 10_000, gates: 'project:ai-generate', per: 'month' },
      },
    },
    'project-pro': {
      group: 'project-plans',
      level: 'project',
      features: ['project:ai-generate'],
      limits: {
        'ai-credits': { max: 500, gates: 'project:ai-generate', per: 'month' },
      },
    },
  },
  defaultPlans: {
    account: 'account-enterprise',
    project: 'project-pro',
  },
});

function createMockAncestorResolver(
  ancestors: Record<string, AncestorChainEntry[]>,
): (tenantLevel: string, tenantId: string) => Promise<AncestorChainEntry[]> {
  return async (_tenantLevel: string, tenantId: string) => ancestors[tenantId] ?? [];
}

// Use a fixed startedAt so billing period is deterministic
const fixedStartedAt = new Date('2026-01-01T00:00:00Z');

describe('Feature: Cascaded wallet consumption', () => {
  let closureStore: InMemoryClosureStore;
  let roleStore: InMemoryRoleAssignmentStore;
  let subscriptionStore: InMemorySubscriptionStore;
  let walletStore: InMemoryWalletStore;

  beforeEach(async () => {
    closureStore = new InMemoryClosureStore();
    roleStore = new InMemoryRoleAssignmentStore();
    subscriptionStore = new InMemorySubscriptionStore();
    walletStore = new InMemoryWalletStore();

    // Setup hierarchy: account-1 -> project-1
    await closureStore.addResource('account', 'acct-1');
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'account',
      parentId: 'acct-1',
    });

    // Assign roles
    await roleStore.assign('user-1', 'project', 'proj-1', 'admin');

    // Assign plans with fixed start date
    await subscriptionStore.assign('account', 'acct-1', 'account-enterprise', fixedStartedAt);
    await subscriptionStore.assign('project', 'proj-1', 'project-pro', fixedStartedAt);
  });

  function getBillingPeriod() {
    return calculateBillingPeriod(fixedStartedAt, 'month');
  }

  describe('Given account (10,000 credits) + project (500 credits)', () => {
    describe('When consuming 1 credit at project level', () => {
      it('Then increments at BOTH project and account levels', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
          tenantLevel: 'project',
        });

        const result = await ctx.canAndConsume('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });

        expect(result).toBe(true);

        // Check both levels were incremented
        const { periodStart, periodEnd } = getBillingPeriod();
        const projectConsumed = await walletStore.getConsumption(
          'proj-1',
          'ai-credits',
          periodStart,
          periodEnd,
        );
        const accountConsumed = await walletStore.getConsumption(
          'acct-1',
          'ai-credits',
          periodStart,
          periodEnd,
        );

        expect(projectConsumed).toBe(1);
        expect(accountConsumed).toBe(1);
      });
    });

    describe('When project reaches 500 limit', () => {
      it('Then canAndConsume returns false and account is NOT incremented', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
          tenantLevel: 'project',
        });

        // Pre-consume 500 credits at project level and 500 at account
        const { periodStart, periodEnd } = getBillingPeriod();
        await walletStore.consume('proj-1', 'ai-credits', periodStart, periodEnd, 500, 500);
        await walletStore.consume('acct-1', 'ai-credits', periodStart, periodEnd, 10_000, 500);

        const result = await ctx.canAndConsume('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });

        expect(result).toBe(false);

        // Account should NOT have been incremented further
        const accountConsumed = await walletStore.getConsumption(
          'acct-1',
          'ai-credits',
          periodStart,
          periodEnd,
        );
        expect(accountConsumed).toBe(500); // Unchanged
      });
    });

    describe('When account reaches 10,000 across all projects', () => {
      it('Then canAndConsume returns false and project is NOT incremented', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
          tenantLevel: 'project',
        });

        // Pre-consume 10,000 credits at account level
        const { periodStart, periodEnd } = getBillingPeriod();
        await walletStore.consume('acct-1', 'ai-credits', periodStart, periodEnd, 10_000, 10_000);

        const result = await ctx.canAndConsume('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });

        expect(result).toBe(false);

        // Project should NOT have been incremented
        const projectConsumed = await walletStore.getConsumption(
          'proj-1',
          'ai-credits',
          periodStart,
          periodEnd,
        );
        expect(projectConsumed).toBe(0); // Unchanged
      });
    });
  });

  describe('Given two projects under same account (enterprise: 10,000 credits)', () => {
    beforeEach(async () => {
      await closureStore.addResource('project', 'proj-2', {
        parentType: 'account',
        parentId: 'acct-1',
      });
      await roleStore.assign('user-1', 'project', 'proj-2', 'admin');
      await subscriptionStore.assign('project', 'proj-2', 'project-pro', fixedStartedAt);
    });

    describe('When project_a consumes 9,500 and project_b tries to consume 501', () => {
      it('Then project_b is denied at account level', async () => {
        const { periodStart, periodEnd } = getBillingPeriod();
        // Project A consumed 500 at project level, 9,500 at account level
        await walletStore.consume('proj-1', 'ai-credits', periodStart, periodEnd, 500, 500);
        await walletStore.consume('acct-1', 'ai-credits', periodStart, periodEnd, 10_000, 9_500);

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-2' }),
          ancestorResolver: createMockAncestorResolver({
            'proj-2': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
          tenantLevel: 'project',
        });

        const result = await ctx.canAndConsume(
          'project:ai-generate',
          { type: 'project', id: 'proj-2' },
          501,
        );

        expect(result).toBe(false);

        // Account total remains 9,500
        const accountConsumed = await walletStore.getConsumption(
          'acct-1',
          'ai-credits',
          periodStart,
          periodEnd,
        );
        expect(accountConsumed).toBe(9_500);
      });
    });
  });

  describe('Given unconsume after cascaded consume', () => {
    it('Then decrements at all ancestor levels', async () => {
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        subscriptionStore,
        walletStore,
        orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
        ancestorResolver: createMockAncestorResolver({
          'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
        }),
        tenantLevel: 'project',
      });

      // Consume
      await ctx.canAndConsume('project:ai-generate', { type: 'project', id: 'proj-1' });

      // Unconsume
      await ctx.unconsume('project:ai-generate', { type: 'project', id: 'proj-1' });

      // Both levels should be back to 0
      const { periodStart, periodEnd } = getBillingPeriod();
      const projectConsumed = await walletStore.getConsumption(
        'proj-1',
        'ai-credits',
        periodStart,
        periodEnd,
      );
      const accountConsumed = await walletStore.getConsumption(
        'acct-1',
        'ai-credits',
        periodStart,
        periodEnd,
      );

      expect(projectConsumed).toBe(0);
      expect(accountConsumed).toBe(0);
    });
  });

  describe('Given user at account level (no project selected)', () => {
    it('Then consumes at account level only', async () => {
      // Need role at account level
      await roleStore.assign('user-1', 'account', 'acct-1', 'admin');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        subscriptionStore,
        walletStore,
        orgResolver: () => Promise.resolve({ type: 'account', id: 'acct-1' }),
        ancestorResolver: createMockAncestorResolver({
          'acct-1': [], // Root — no ancestors
        }),
        tenantLevel: 'account',
      });

      const result = await ctx.canAndConsume('project:ai-generate', {
        type: 'account',
        id: 'acct-1',
      });

      expect(result).toBe(true);

      // Only account-level consumption
      const { periodStart, periodEnd } = getBillingPeriod();
      const accountConsumed = await walletStore.getConsumption(
        'acct-1',
        'ai-credits',
        periodStart,
        periodEnd,
      );
      expect(accountConsumed).toBe(1);
    });
  });

  describe('Given 3-level hierarchy: agency → org → brand', () => {
    const threeLevelDef = defineAccess({
      entities: {
        agency: { roles: ['owner'] },
        org: {
          roles: ['admin'],
          inherits: { 'agency:owner': 'admin' },
        },
        brand: {
          roles: ['editor'],
          inherits: { 'org:admin': 'editor' },
        },
      },
      entitlements: {
        'brand:ai-generate': { roles: ['editor'] },
      },
      plans: {
        'agency-platform': {
          group: 'agency-plans',
          level: 'agency',
          features: ['brand:ai-generate'],
          limits: {
            'ai-credits': { max: 1000, gates: 'brand:ai-generate', per: 'month' },
          },
        },
        'org-standard': {
          group: 'org-plans',
          level: 'org',
          features: ['brand:ai-generate'],
          limits: {
            'ai-credits': { max: 500, gates: 'brand:ai-generate', per: 'month' },
          },
        },
        'brand-basic': {
          group: 'brand-plans',
          level: 'brand',
          features: ['brand:ai-generate'],
          limits: {
            'ai-credits': { max: 200, gates: 'brand:ai-generate', per: 'month' },
          },
        },
      },
      defaultPlans: {
        agency: 'agency-platform',
        org: 'org-standard',
        brand: 'brand-basic',
      },
    });

    it('Then consumes at all 3 levels', async () => {
      // Setup 3-level hierarchy
      const localClosure = new InMemoryClosureStore();
      const localRole = new InMemoryRoleAssignmentStore();
      const localSub = new InMemorySubscriptionStore();
      const localWallet = new InMemoryWalletStore();

      await localClosure.addResource('agency', 'agency-1');
      await localClosure.addResource('org', 'org-1', {
        parentType: 'agency',
        parentId: 'agency-1',
      });
      await localClosure.addResource('brand', 'brand-1', {
        parentType: 'org',
        parentId: 'org-1',
      });
      await localRole.assign('user-1', 'brand', 'brand-1', 'editor');
      await localSub.assign('agency', 'agency-1', 'agency-platform', fixedStartedAt);
      await localSub.assign('org', 'org-1', 'org-standard', fixedStartedAt);
      await localSub.assign('brand', 'brand-1', 'brand-basic', fixedStartedAt);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: threeLevelDef,
        closureStore: localClosure,
        roleStore: localRole,
        subscriptionStore: localSub,
        walletStore: localWallet,
        orgResolver: () => Promise.resolve({ type: 'brand', id: 'brand-1' }),
        ancestorResolver: createMockAncestorResolver({
          'brand-1': [
            { type: 'org', id: 'org-1', depth: 1 },
            { type: 'agency', id: 'agency-1', depth: 2 },
          ],
        }),
        tenantLevel: 'brand',
      });

      const result = await ctx.canAndConsume('brand:ai-generate', {
        type: 'brand',
        id: 'brand-1',
      });
      expect(result).toBe(true);

      // Verify all 3 levels incremented
      const { periodStart, periodEnd } = calculateBillingPeriod(fixedStartedAt, 'month');
      const brandConsumed = await localWallet.getConsumption(
        'brand-1', 'ai-credits', periodStart, periodEnd,
      );
      const orgConsumed = await localWallet.getConsumption(
        'org-1', 'ai-credits', periodStart, periodEnd,
      );
      const agencyConsumed = await localWallet.getConsumption(
        'agency-1', 'ai-credits', periodStart, periodEnd,
      );

      expect(brandConsumed).toBe(1);
      expect(orgConsumed).toBe(1);
      expect(agencyConsumed).toBe(1);
    });

    it('Then mid-level denial rolls back root but skips leaf', async () => {
      const localClosure = new InMemoryClosureStore();
      const localRole = new InMemoryRoleAssignmentStore();
      const localSub = new InMemorySubscriptionStore();
      const localWallet = new InMemoryWalletStore();

      await localClosure.addResource('agency', 'agency-1');
      await localClosure.addResource('org', 'org-1', {
        parentType: 'agency',
        parentId: 'agency-1',
      });
      await localClosure.addResource('brand', 'brand-1', {
        parentType: 'org',
        parentId: 'org-1',
      });
      await localRole.assign('user-1', 'brand', 'brand-1', 'editor');
      await localSub.assign('agency', 'agency-1', 'agency-platform', fixedStartedAt);
      await localSub.assign('org', 'org-1', 'org-standard', fixedStartedAt);
      await localSub.assign('brand', 'brand-1', 'brand-basic', fixedStartedAt);

      // Exhaust org-level limit (500)
      const { periodStart, periodEnd } = calculateBillingPeriod(fixedStartedAt, 'month');
      await localWallet.consume('org-1', 'ai-credits', periodStart, periodEnd, 500, 500);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: threeLevelDef,
        closureStore: localClosure,
        roleStore: localRole,
        subscriptionStore: localSub,
        walletStore: localWallet,
        orgResolver: () => Promise.resolve({ type: 'brand', id: 'brand-1' }),
        ancestorResolver: createMockAncestorResolver({
          'brand-1': [
            { type: 'org', id: 'org-1', depth: 1 },
            { type: 'agency', id: 'agency-1', depth: 2 },
          ],
        }),
        tenantLevel: 'brand',
      });

      const result = await ctx.canAndConsume('brand:ai-generate', {
        type: 'brand',
        id: 'brand-1',
      });
      expect(result).toBe(false);

      // Agency should have been rolled back (consumed then unconsumed)
      const agencyConsumed = await localWallet.getConsumption(
        'agency-1', 'ai-credits', periodStart, periodEnd,
      );
      expect(agencyConsumed).toBe(0);

      // Brand should NOT have been touched (never reached)
      const brandConsumed = await localWallet.getConsumption(
        'brand-1', 'ai-credits', periodStart, periodEnd,
      );
      expect(brandConsumed).toBe(0);
    });
  });

  describe('Given single-level tenancy', () => {
    it('Then canAndConsume works unchanged', async () => {
      const singleLevelDef = defineAccess({
        entities: {
          workspace: { roles: ['admin', 'member'] },
        },
        entitlements: {
          'workspace:create-prompt': { roles: ['admin', 'member'] },
        },
        plans: {
          free: {
            group: 'main',
            features: ['workspace:create-prompt'],
            limits: {
              prompts: { max: 50, gates: 'workspace:create-prompt', per: 'month' },
            },
          },
        },
        defaultPlan: 'free',
      });

      await roleStore.assign('user-1', 'workspace', 'ws-1', 'admin');
      await subscriptionStore.assign('tenant', 'org-1', 'free', fixedStartedAt);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: singleLevelDef,
        closureStore,
        roleStore,
        subscriptionStore,
        walletStore,
        orgResolver: () => Promise.resolve({ type: 'org', id: 'org-1' }),
        // No ancestorResolver, no tenantLevel — single-level
      });

      const result = await ctx.canAndConsume('workspace:create-prompt', {
        type: 'workspace',
        id: 'ws-1',
      });

      expect(result).toBe(true);
    });
  });
});
