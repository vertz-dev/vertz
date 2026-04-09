/**
 * End-to-end acceptance test for Phase 2: Multi-level billing + access set (#1787)
 *
 * Verifies the full flow:
 *   defineAccess with multi-level plans
 *   → assign subscriptions per level
 *   → computeAccessSet with ancestorResolver
 *   → AccessSet.plans per billing level
 *   → feature resolution (inherit vs local)
 *   → encode/decode round-trip
 */

import { describe, expect, it } from '@vertz/test';
import type { AncestorChainEntry } from '../access-set';
import { computeAccessSet, decodeAccessSet, encodeAccessSet } from '../access-set';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import { InMemorySubscriptionStore } from '../subscription-store';

// ============================================================================
// Shared config: SaaS platform with account → project hierarchy
// ============================================================================

const accessDef = defineAccess({
  entities: {
    account: { roles: ['owner', 'admin', 'member'] },
    project: {
      roles: ['admin', 'editor', 'viewer'],
      inherits: {
        'account:owner': 'admin',
        'account:admin': 'admin',
        'account:member': 'viewer',
      },
    },
  },
  entitlements: {
    // Account-level entitlements
    'account:manage': { roles: ['owner', 'admin'] },
    'account:create-project': { roles: ['owner', 'admin', 'member'] },
    // Project-level entitlements
    'project:view': { roles: ['viewer', 'editor', 'admin'] },
    'project:edit': { roles: ['editor', 'admin'] },
    'project:ai-generate': { roles: ['editor', 'admin'] },
    // Local-only entitlement — only checked at project level
    'project:custom-domain': {
      roles: ['admin'],
      featureResolution: 'local',
    },
  },
  plans: {
    // Account-level plans
    enterprise: {
      level: 'account',
      group: 'account-plans',
      features: ['account:create-project', 'project:ai-generate', 'project:custom-domain'],
    },
    starter: {
      level: 'account',
      group: 'account-plans',
      features: ['account:create-project'],
    },
    // Project-level plans
    pro: {
      level: 'project',
      group: 'project-plans',
      features: ['project:ai-generate', 'project:custom-domain'],
    },
    free: {
      level: 'project',
      group: 'project-plans',
      // No features gated
    },
  },
  defaultPlans: {
    account: 'starter',
    project: 'free',
  },
});

function createStores() {
  const roleStore = new InMemoryRoleAssignmentStore();
  const closureStore = new InMemoryClosureStore();
  const subscriptionStore = new InMemorySubscriptionStore();
  return { roleStore, closureStore, subscriptionStore };
}

function mockAncestorResolver(
  ancestors: Record<string, AncestorChainEntry[]>,
): (tenantLevel: string, tenantId: string) => Promise<AncestorChainEntry[]> {
  return async (_level: string, id: string) => ancestors[id] ?? [];
}

// ============================================================================
// E2E: Full multi-level billing flow
// ============================================================================

describe('E2E: Multi-level billing + access set (#1787)', () => {
  describe('Given account on enterprise + project on pro', () => {
    it('computes plans per level and allows all features', async () => {
      const { roleStore, closureStore, subscriptionStore } = createStores();
      await closureStore.addResource('account', 'acct-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'account',
        parentId: 'acct-1',
      });
      await roleStore.assign('user-1', 'account', 'acct-1', 'owner');
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

      // Plans per level
      expect(result.plans).toEqual({ account: 'enterprise', project: 'pro' });
      expect(result.plan).toBe('pro'); // backward compat: deepest level

      // All features allowed
      expect(result.entitlements['account:create-project'].allowed).toBe(true);
      expect(result.entitlements['project:ai-generate'].allowed).toBe(true);
      expect(result.entitlements['project:custom-domain'].allowed).toBe(true);
    });
  });

  describe('Given account on enterprise + project on free (inherit resolution)', () => {
    it('inherits ai-generate from account enterprise plan', async () => {
      const { roleStore, closureStore, subscriptionStore } = createStores();
      await closureStore.addResource('account', 'acct-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'account',
        parentId: 'acct-1',
      });
      await roleStore.assign('user-1', 'account', 'acct-1', 'owner');
      await subscriptionStore.assign('account', 'acct-1', 'enterprise');
      await subscriptionStore.assign('project', 'proj-1', 'free');

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

      expect(result.plans).toEqual({ account: 'enterprise', project: 'free' });

      // project:ai-generate uses default 'inherit' — enterprise has it
      expect(result.entitlements['project:ai-generate'].allowed).toBe(true);

      // project:custom-domain uses 'local' — free plan doesn't have it
      expect(result.entitlements['project:custom-domain'].allowed).toBe(false);
      expect(result.entitlements['project:custom-domain'].reasons).toContain('plan_required');
    });
  });

  describe('Given account on starter + project on pro (local resolution)', () => {
    it('project:custom-domain allowed via project pro plan (local)', async () => {
      const { roleStore, closureStore, subscriptionStore } = createStores();
      await closureStore.addResource('account', 'acct-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'account',
        parentId: 'acct-1',
      });
      await roleStore.assign('user-1', 'account', 'acct-1', 'owner');
      await subscriptionStore.assign('account', 'acct-1', 'starter');
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

      expect(result.plans).toEqual({ account: 'starter', project: 'pro' });

      // project:custom-domain is 'local' — pro plan has it
      expect(result.entitlements['project:custom-domain'].allowed).toBe(true);

      // project:ai-generate is 'inherit' — both starter (no) and pro (yes) → allowed
      expect(result.entitlements['project:ai-generate'].allowed).toBe(true);
    });
  });

  describe('Given account on starter + project on free (most restrictive)', () => {
    it('denies plan-gated features not in any plan', async () => {
      const { roleStore, closureStore, subscriptionStore } = createStores();
      await closureStore.addResource('account', 'acct-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'account',
        parentId: 'acct-1',
      });
      await roleStore.assign('user-1', 'account', 'acct-1', 'owner');
      await subscriptionStore.assign('account', 'acct-1', 'starter');
      await subscriptionStore.assign('project', 'proj-1', 'free');

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

      expect(result.plans).toEqual({ account: 'starter', project: 'free' });

      // account:create-project is in starter's features (inherit) → allowed
      expect(result.entitlements['account:create-project'].allowed).toBe(true);

      // project:ai-generate is NOT in starter or free → denied
      expect(result.entitlements['project:ai-generate'].allowed).toBe(false);
      expect(result.entitlements['project:ai-generate'].reasons).toContain('plan_required');

      // project:custom-domain is 'local', not in free → denied
      expect(result.entitlements['project:custom-domain'].allowed).toBe(false);

      // Non-plan-gated entitlements still work
      expect(result.entitlements['project:view'].allowed).toBe(true);
      expect(result.entitlements['account:manage'].allowed).toBe(true);
    });
  });

  describe('Given encode/decode round-trip with multi-level plans', () => {
    it('preserves plans and entitlements through JWT encoding cycle', async () => {
      const { roleStore, closureStore, subscriptionStore } = createStores();
      await closureStore.addResource('account', 'acct-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'account',
        parentId: 'acct-1',
      });
      await roleStore.assign('user-1', 'account', 'acct-1', 'owner');
      await subscriptionStore.assign('account', 'acct-1', 'enterprise');
      await subscriptionStore.assign('project', 'proj-1', 'pro');

      const original = await computeAccessSet({
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

      // Encode → JSON → parse → decode (simulates JWT round-trip)
      const encoded = encodeAccessSet(original);
      const json = JSON.stringify(encoded);
      const parsed = JSON.parse(json);
      const decoded = decodeAccessSet(parsed, accessDef);

      // Plans preserved
      expect(decoded.plans).toEqual({ account: 'enterprise', project: 'pro' });
      expect(decoded.plan).toBe('pro');

      // All entitlement statuses preserved
      for (const name of Object.keys(accessDef.entitlements)) {
        expect(decoded.entitlements[name].allowed).toBe(original.entitlements[name].allowed);
      }
    });
  });

  describe('Given defineAccess validation', () => {
    it('validates _billingLevels and defaultPlans in frozen config', () => {
      expect(accessDef._billingLevels).toBeDefined();
      expect(accessDef._billingLevels.account).toEqual(['enterprise', 'starter']);
      expect(accessDef._billingLevels.project).toEqual(['pro', 'free']);
      expect(accessDef.defaultPlans).toEqual({ account: 'starter', project: 'free' });

      // featureResolution preserved
      expect(accessDef.entitlements['project:custom-domain'].featureResolution).toBe('local');
      expect(accessDef.entitlements['project:ai-generate'].featureResolution).toBeUndefined();
    });
  });
});
