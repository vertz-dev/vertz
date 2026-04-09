import { beforeEach, describe, expect, it } from '@vertz/test';
import { createAccessContext } from '../access-context';
import type { AncestorChainEntry } from '../access-set';
import { calculateBillingPeriod } from '../billing-period';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { InMemoryFlagStore } from '../flag-store';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import { InMemorySubscriptionStore } from '../subscription-store';
import { InMemoryWalletStore } from '../wallet-store';

// ============================================================================
// Shared setup: 2-level hierarchy (account -> project)
// ============================================================================

function createMockAncestorResolver(
  ancestors: Record<string, AncestorChainEntry[]>,
): (tenantLevel: string, tenantId: string) => Promise<AncestorChainEntry[]> {
  return async (_tenantLevel: string, tenantId: string) => ancestors[tenantId] ?? [];
}

const fixedStartedAt = new Date('2026-01-01T00:00:00Z');

describe('Feature: Multi-level access context (#1829)', () => {
  // ============================================================================
  // Flag resolution: deepest wins
  // ============================================================================

  describe('Given a 2-level hierarchy with flags at both levels', () => {
    const accessDef = defineAccess({
      entities: {
        account: { roles: ['owner'] },
        project: {
          roles: ['admin', 'member'],
          inherits: { 'account:owner': 'admin' },
        },
      },
      entitlements: {
        'project:ai-generate': { roles: ['admin', 'member'], flags: ['beta_ai'] },
      },
    });

    let closureStore: InMemoryClosureStore;
    let roleStore: InMemoryRoleAssignmentStore;
    let flagStore: InMemoryFlagStore;

    beforeEach(async () => {
      closureStore = new InMemoryClosureStore();
      roleStore = new InMemoryRoleAssignmentStore();
      flagStore = new InMemoryFlagStore();

      await closureStore.addResource('account', 'acct-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'account',
        parentId: 'acct-1',
      });
      await roleStore.assign('user-1', 'project', 'proj-1', 'admin');
    });

    describe('When account enables flag and project disables it', () => {
      it('Then ctx.can() returns false (deepest wins)', async () => {
        flagStore.setFlag('account', 'acct-1', 'beta_ai', true);
        flagStore.setFlag('project', 'proj-1', 'beta_ai', false);

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          flagStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.can('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result).toBe(false);
      });
    });

    describe('When account disables flag but project enables it', () => {
      it('Then ctx.can() returns true (deepest wins)', async () => {
        flagStore.setFlag('account', 'acct-1', 'beta_ai', false);
        flagStore.setFlag('project', 'proj-1', 'beta_ai', true);

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          flagStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.can('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result).toBe(true);
      });
    });

    describe('When only account has the flag (project has no override)', () => {
      it('Then ctx.can() inherits from account', async () => {
        flagStore.setFlag('account', 'acct-1', 'beta_ai', true);
        // project has no flag set — should inherit from account

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          flagStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.can('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result).toBe(true);
      });
    });

    describe('When ctx.check() is called with multi-level flags', () => {
      it('Then returns flag_disabled with disabled flag names', async () => {
        flagStore.setFlag('account', 'acct-1', 'beta_ai', true);
        flagStore.setFlag('project', 'proj-1', 'beta_ai', false);

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          flagStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.check('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain('flag_disabled');
      });
    });
  });

  // ============================================================================
  // Plan feature resolution: inherit mode (default)
  // ============================================================================

  describe('Given a 2-level hierarchy with plans at both levels', () => {
    const accessDef = defineAccess({
      entities: {
        account: { roles: ['owner'] },
        project: {
          roles: ['admin', 'member'],
          inherits: { 'account:owner': 'admin' },
        },
      },
      entitlements: {
        'project:ai-generate': { roles: ['admin', 'member'] },
        'project:custom-domain': { roles: ['admin'], featureResolution: 'local' },
      },
      plans: {
        'account-enterprise': {
          group: 'account-plans',
          level: 'account',
          features: ['project:ai-generate', 'project:custom-domain'],
        },
        'account-free': {
          group: 'account-plans',
          level: 'account',
          features: [],
        },
        'project-pro': {
          group: 'project-plans',
          level: 'project',
          features: ['project:ai-generate'],
        },
        'project-free': {
          group: 'project-plans',
          level: 'project',
          features: [],
        },
      },
      defaultPlans: {
        account: 'account-free',
        project: 'project-free',
      },
    });

    let closureStore: InMemoryClosureStore;
    let roleStore: InMemoryRoleAssignmentStore;
    let subscriptionStore: InMemorySubscriptionStore;

    beforeEach(async () => {
      closureStore = new InMemoryClosureStore();
      roleStore = new InMemoryRoleAssignmentStore();
      subscriptionStore = new InMemorySubscriptionStore();

      await closureStore.addResource('account', 'acct-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'account',
        parentId: 'acct-1',
      });
      await roleStore.assign('user-1', 'project', 'proj-1', 'admin');
    });

    describe('When feature is only on account plan (inherit mode)', () => {
      it('Then ctx.can() returns true — inherits from ancestor', async () => {
        await subscriptionStore.assign('account', 'acct-1', 'account-enterprise', fixedStartedAt);
        await subscriptionStore.assign('project', 'proj-1', 'project-free', fixedStartedAt);

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        // project:ai-generate has default inherit resolution — account-enterprise has it
        const result = await ctx.can('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result).toBe(true);
      });
    });

    describe('When feature is on project plan but not account (inherit mode)', () => {
      it('Then ctx.can() returns true — found at project level', async () => {
        await subscriptionStore.assign('account', 'acct-1', 'account-free', fixedStartedAt);
        await subscriptionStore.assign('project', 'proj-1', 'project-pro', fixedStartedAt);

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.can('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result).toBe(true);
      });
    });

    describe('When feature is on neither plan (inherit mode)', () => {
      it('Then ctx.can() returns false', async () => {
        await subscriptionStore.assign('account', 'acct-1', 'account-free', fixedStartedAt);
        await subscriptionStore.assign('project', 'proj-1', 'project-free', fixedStartedAt);

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.can('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result).toBe(false);
      });
    });

    // featureResolution: 'local' — only check deepest level
    describe('When feature is only on account plan (local mode)', () => {
      it('Then ctx.can() returns false — local only checks deepest level', async () => {
        await subscriptionStore.assign('account', 'acct-1', 'account-enterprise', fixedStartedAt);
        await subscriptionStore.assign('project', 'proj-1', 'project-free', fixedStartedAt);

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        // project:custom-domain has featureResolution: 'local' — only project plan matters
        const result = await ctx.can('project:custom-domain', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result).toBe(false);
      });
    });

    describe('When ctx.check() is called with multi-level plans (inherit)', () => {
      it('Then returns plan_required when no level has the feature', async () => {
        await subscriptionStore.assign('account', 'acct-1', 'account-free', fixedStartedAt);
        await subscriptionStore.assign('project', 'proj-1', 'project-free', fixedStartedAt);

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.check('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain('plan_required');
      });
    });

    describe('When ctx.check() is called with multi-level plans (inherit, allowed)', () => {
      it('Then returns allowed when ancestor has the feature', async () => {
        await subscriptionStore.assign('account', 'acct-1', 'account-enterprise', fixedStartedAt);
        await subscriptionStore.assign('project', 'proj-1', 'project-free', fixedStartedAt);

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.check('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result.allowed).toBe(true);
        expect(result.reasons).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // Limit cascade: check limits at all ancestor levels
  // ============================================================================

  describe('Given a 2-level hierarchy with limits at both levels', () => {
    const accessDef = defineAccess({
      entities: {
        account: { roles: ['owner'] },
        project: {
          roles: ['admin', 'member'],
          inherits: { 'account:owner': 'admin' },
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
            'ai-credits': { max: 1000, gates: 'project:ai-generate', per: 'month' },
          },
        },
        'project-pro': {
          group: 'project-plans',
          level: 'project',
          features: ['project:ai-generate'],
          limits: {
            'ai-credits': { max: 100, gates: 'project:ai-generate', per: 'month' },
          },
        },
      },
      defaultPlans: {
        account: 'account-enterprise',
        project: 'project-pro',
      },
    });

    let closureStore: InMemoryClosureStore;
    let roleStore: InMemoryRoleAssignmentStore;
    let subscriptionStore: InMemorySubscriptionStore;
    let walletStore: InMemoryWalletStore;

    beforeEach(async () => {
      closureStore = new InMemoryClosureStore();
      roleStore = new InMemoryRoleAssignmentStore();
      subscriptionStore = new InMemorySubscriptionStore();
      walletStore = new InMemoryWalletStore();

      await closureStore.addResource('account', 'acct-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'account',
        parentId: 'acct-1',
      });
      await roleStore.assign('user-1', 'project', 'proj-1', 'admin');
      await subscriptionStore.assign('account', 'acct-1', 'account-enterprise', fixedStartedAt);
      await subscriptionStore.assign('project', 'proj-1', 'project-pro', fixedStartedAt);
    });

    function getBillingPeriod() {
      return calculateBillingPeriod(fixedStartedAt, 'month');
    }

    describe('When project limit is exceeded but account is not', () => {
      it('Then ctx.can() returns false', async () => {
        const { periodStart, periodEnd } = getBillingPeriod();
        // Consume 100 at project level (hit limit of 100)
        await walletStore.consume(
          'project',
          'proj-1',
          'ai-credits',
          periodStart,
          periodEnd,
          100,
          100,
        );

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.can('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result).toBe(false);
      });
    });

    describe('When account limit is exceeded but project is not', () => {
      it('Then ctx.can() returns false — ancestor limit blocks', async () => {
        const { periodStart, periodEnd } = getBillingPeriod();
        // Consume 1000 at account level (hit limit of 1000)
        await walletStore.consume(
          'account',
          'acct-1',
          'ai-credits',
          periodStart,
          periodEnd,
          1000,
          1000,
        );

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.can('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result).toBe(false);
      });
    });

    describe('When neither limit is exceeded', () => {
      it('Then ctx.can() returns true', async () => {
        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.can('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result).toBe(true);
      });
    });

    describe('When ctx.check() is called and account limit is exceeded', () => {
      it('Then returns limit_reached from the ancestor level', async () => {
        const { periodStart, periodEnd } = getBillingPeriod();
        await walletStore.consume(
          'account',
          'acct-1',
          'ai-credits',
          periodStart,
          periodEnd,
          1000,
          1000,
        );

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.check('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain('limit_reached');
      });
    });
  });

  // ==========================================================================
  // Expired subscription with per-level defaults (#2287)
  // ==========================================================================

  describe('Given differing global vs per-level defaultPlans and an expired subscription', () => {
    // Global defaultPlan = 'free' (low limits)
    // Per-level defaultPlans.account = 'account-enterprise' (high limits)
    // When account subscription expires, resolveAllLimitStates should use
    // the per-level default (account-enterprise), not the global (free).
    const accessDef = defineAccess({
      entities: {
        account: { roles: ['owner'] },
        project: {
          roles: ['admin', 'member'],
          inherits: { 'account:owner': 'admin' },
        },
      },
      entitlements: {
        'project:ai-generate': { roles: ['admin', 'member'] },
      },
      plans: {
        free: {
          group: 'account-plans',
          level: 'account',
          features: ['project:ai-generate'],
          limits: {
            'ai-credits': { max: 5, gates: 'project:ai-generate', per: 'month' },
          },
        },
        'account-enterprise': {
          group: 'account-plans',
          level: 'account',
          features: ['project:ai-generate'],
          limits: {
            'ai-credits': { max: 1000, gates: 'project:ai-generate', per: 'month' },
          },
        },
        'project-pro': {
          group: 'project-plans',
          level: 'project',
          features: ['project:ai-generate'],
          limits: {
            'ai-credits': { max: 100, gates: 'project:ai-generate', per: 'month' },
          },
        },
      },
      defaultPlan: 'free',
      defaultPlans: {
        account: 'account-enterprise',
        project: 'project-pro',
      },
    });

    let closureStore: InMemoryClosureStore;
    let roleStore: InMemoryRoleAssignmentStore;
    let subscriptionStore: InMemorySubscriptionStore;
    let walletStore: InMemoryWalletStore;

    beforeEach(async () => {
      closureStore = new InMemoryClosureStore();
      roleStore = new InMemoryRoleAssignmentStore();
      subscriptionStore = new InMemorySubscriptionStore();
      walletStore = new InMemoryWalletStore();

      await closureStore.addResource('account', 'acct-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'account',
        parentId: 'acct-1',
      });
      await roleStore.assign('user-1', 'project', 'proj-1', 'admin');

      // Account subscription is expired → should fall back to defaultPlans.account
      await subscriptionStore.assign(
        'account',
        'acct-1',
        'account-enterprise',
        fixedStartedAt,
        new Date('2026-02-01T00:00:00Z'), // expired
      );
      // Project subscription is active
      await subscriptionStore.assign('project', 'proj-1', 'project-pro', fixedStartedAt);
    });

    function getBillingPeriod() {
      return calculateBillingPeriod(fixedStartedAt, 'month');
    }

    describe('When account subscription is expired and consumption is under level-specific default limit', () => {
      it('Then ctx.can() returns true (uses account-enterprise default, max=1000, not free max=5)', async () => {
        const { periodStart, periodEnd } = getBillingPeriod();
        // Consume 10 credits at account level — under enterprise limit (1000) but over free limit (5)
        await walletStore.consume(
          'account',
          'acct-1',
          'ai-credits',
          periodStart,
          periodEnd,
          1000,
          10,
        );

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.can('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        // With the bug: resolveAllLimitStates uses global 'free' (max=5), so 10 > 5 → false
        // After fix: resolveAllLimitStates uses level 'account-enterprise' (max=1000), so 10 < 1000 → true
        expect(result).toBe(true);
      });
    });

    describe('When account subscription is expired and ctx.check() is called', () => {
      it('Then check() uses the level-specific default plan for limit resolution', async () => {
        const { periodStart, periodEnd } = getBillingPeriod();
        // Consume 10 credits — over free (5) but under enterprise (1000)
        await walletStore.consume(
          'account',
          'acct-1',
          'ai-credits',
          periodStart,
          periodEnd,
          1000,
          10,
        );

        const ctx = createAccessContext({
          userId: 'user-1',
          accessDef,
          closureStore,
          roleStore,
          subscriptionStore,
          walletStore,
          orgResolver: () => Promise.resolve({ type: 'project', id: 'proj-1' }),
          tenantLevel: 'project',
          ancestorResolver: createMockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        const result = await ctx.check('project:ai-generate', {
          type: 'project',
          id: 'proj-1',
        });
        // Should be allowed because level-specific default (account-enterprise, max=1000) is used
        expect(result.allowed).toBe(true);
        expect(result.reasons).not.toContain('limit_reached');
      });
    });
  });
});
