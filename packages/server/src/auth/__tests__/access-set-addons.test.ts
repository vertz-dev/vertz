/**
 * Access Set Add-on & Limit Edge Cases — Coverage hardening for auth/access-set.ts
 * Tests: add-on features, limit stacking, unlimited limits, lifetime limits
 */

import { describe, expect, it } from 'bun:test';
import { computeAccessSet } from '../access-set';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import { InMemorySubscriptionStore } from '../subscription-store';
import { InMemoryWalletStore } from '../wallet-store';

const accessDef = defineAccess({
  entities: {
    organization: { roles: ['owner', 'admin', 'member'] },
  },
  entitlements: {
    'organization:export': { roles: ['admin', 'owner'] },
    'organization:create-project': { roles: ['admin', 'owner'] },
    'organization:invite': { roles: ['admin', 'owner'] },
  },
  plans: {
    pro: {
      group: 'base',
      features: ['organization:export', 'organization:create-project', 'organization:invite'],
      limits: {
        projects: { max: 10, gates: 'organization:create-project', per: 'month' },
        invites: { max: 5, gates: 'organization:invite', per: 'month' },
      },
    },
    extra_projects: {
      addOn: true,
      features: ['organization:export'],
      limits: {
        projects: { max: 5, gates: 'organization:create-project', per: 'month' },
      },
    },
    unlimited_base: {
      group: 'base',
      features: ['organization:create-project'],
      limits: {
        projects: { max: -1, gates: 'organization:create-project', per: 'month' },
      },
    },
    lifetime_plan: {
      group: 'base',
      features: ['organization:create-project'],
      limits: {
        projects: { max: 100, gates: 'organization:create-project' },
      },
    },
  },
  defaultPlan: 'pro',
});

function createStores() {
  const roleStore = new InMemoryRoleAssignmentStore();
  const closureStore = new InMemoryClosureStore();
  const subscriptionStore = new InMemorySubscriptionStore();
  const walletStore = new InMemoryWalletStore();
  return { roleStore, closureStore, subscriptionStore, walletStore };
}

describe('Access Set Add-on & Limit Edge Cases', () => {
  describe('Given an add-on with extra features attached to a tenant', () => {
    describe('When computeAccessSet is called', () => {
      it('Then accumulates add-on features into the effective feature set (lines 200-203)', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();

        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        await subscriptionStore.assign('tenant', 'org-1', 'pro', new Date('2026-01-01'));
        await subscriptionStore.attachAddOn('tenant', 'org-1', 'extra_projects');

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        // Add-on features (organization:export) should still be allowed
        expect(result.entitlements['organization:export'].allowed).toBe(true);
      });
    });
  });

  describe('Given an add-on that adds extra limit capacity', () => {
    describe('When computeAccessSet is called', () => {
      it('Then stacks add-on limits onto base plan (lines 239-244)', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();

        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        await subscriptionStore.assign('tenant', 'org-1', 'pro', new Date('2026-01-01'));
        await subscriptionStore.attachAddOn('tenant', 'org-1', 'extra_projects');

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        // Base 10 + add-on 5 = 15
        const limitMeta = result.entitlements['organization:create-project'].meta?.limit;
        expect(limitMeta).toBeDefined();
        expect(limitMeta!.max).toBe(15);
      });
    });
  });

  describe('Given a base plan with unlimited limit (max: -1) and an add-on attached', () => {
    describe('When computeAccessSet is called', () => {
      it('Then breaks from add-on loop early and reports unlimited metadata (lines 242, 250-259)', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();

        // Use unlimited_base plan which has max: -1 for projects
        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        await subscriptionStore.assign('tenant', 'org-1', 'unlimited_base', new Date('2026-01-01'));
        // Attach an add-on to hit line 242 (effectiveMax === -1 break)
        await subscriptionStore.attachAddOn('tenant', 'org-1', 'extra_projects');

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        const limitMeta = result.entitlements['organization:create-project'].meta?.limit;
        expect(limitMeta).toBeDefined();
        expect(limitMeta!.max).toBe(-1);
        expect(limitMeta!.consumed).toBe(0);
        expect(limitMeta!.remaining).toBe(-1);
      });
    });
  });

  describe('Given a plan with lifetime limits (no per field)', () => {
    describe('When computeAccessSet is called', () => {
      it('Then uses subscription start to far-future end for period (lines 263-265)', async () => {
        const { roleStore, closureStore, subscriptionStore, walletStore } = createStores();

        await closureStore.addResource('organization', 'org-1');
        await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
        const startDate = new Date('2026-01-01');
        await subscriptionStore.assign('tenant', 'org-1', 'lifetime_plan', startDate);

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef,
          roleStore,
          closureStore,
          subscriptionStore,
          walletStore,
          tenantId: 'org-1',
        });

        const limitMeta = result.entitlements['organization:create-project'].meta?.limit;
        expect(limitMeta).toBeDefined();
        // With 0 consumed and max 100, remaining should be 100
        expect(limitMeta!.max).toBe(100);
        expect(limitMeta!.consumed).toBe(0);
        expect(limitMeta!.remaining).toBe(100);
      });
    });
  });
});
