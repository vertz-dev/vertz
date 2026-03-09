import { describe, expect, it } from 'bun:test';
import type { ResourceRef } from '../access-context';
import { createAccessContext } from '../access-context';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { InMemoryFlagStore } from '../flag-store';
import { InMemoryPlanStore } from '../plan-store';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import { InMemoryWalletStore } from '../wallet-store';

async function setup() {
  const accessDef = defineAccess({
    hierarchy: ['Organization', 'Team', 'Project', 'Task'],
    roles: {
      Organization: ['owner', 'admin', 'member'],
      Team: ['lead', 'editor', 'viewer'],
      Project: ['manager', 'contributor', 'viewer'],
      Task: ['assignee', 'viewer'],
    },
    inheritance: {
      Organization: { owner: 'lead', admin: 'editor', member: 'viewer' },
      Team: { lead: 'manager', editor: 'contributor', viewer: 'viewer' },
      Project: { manager: 'assignee', contributor: 'assignee', viewer: 'viewer' },
    },
    entitlements: {
      'project:view': { roles: ['viewer', 'contributor', 'manager'] },
      'project:edit': { roles: ['contributor', 'manager'] },
      'project:delete': { roles: ['manager'] },
      'project:export': { roles: ['manager'], plans: ['enterprise'], flags: ['export-v2'] },
      'task:view': { roles: ['viewer', 'assignee'] },
      'task:edit': { roles: ['assignee'] },
    },
    plans: {
      enterprise: {
        entitlements: [
          'project:view',
          'project:edit',
          'project:delete',
          'project:export',
          'task:view',
          'task:edit',
        ],
      },
    },
  });

  const closureStore = new InMemoryClosureStore();
  const roleStore = new InMemoryRoleAssignmentStore();

  // Build resource hierarchy
  await closureStore.addResource('Organization', 'org-1');
  await closureStore.addResource('Team', 'team-1', {
    parentType: 'Organization',
    parentId: 'org-1',
  });
  await closureStore.addResource('Project', 'proj-1', {
    parentType: 'Team',
    parentId: 'team-1',
  });
  await closureStore.addResource('Task', 'task-1', {
    parentType: 'Project',
    parentId: 'proj-1',
  });

  return { accessDef, closureStore, roleStore };
}

describe('createAccessContext', () => {
  describe('can()', () => {
    it('returns true when user role grants entitlement on resource', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });

    it('returns false when user lacks required role', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'Project', 'proj-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(false);
    });

    it('returns false for unauthenticated user', async () => {
      const { accessDef, closureStore, roleStore } = await setup();

      const ctx = createAccessContext({
        userId: null,
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:view', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(false);
    });

    it('resolves inherited roles via hierarchy', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      // admin on Org → editor on Team → contributor on Project

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(true); // contributor can edit
    });

    it('denies when inherited role is insufficient', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'member');
      // member on Org → viewer on Team → viewer on Project

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(false); // viewer cannot edit
    });

    it('plan check skipped when no planStore configured (backward compat)', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      // project:export requires plans: ['enterprise'] and flags: ['export-v2']
      // Without planStore configured, plan check is skipped
      const result = await ctx.can('project:export', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });
  });

  describe('plan layer (Layer 4)', () => {
    async function setupWithPlans() {
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
          'project:export': { roles: ['manager'], plans: ['pro'] },
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
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      const planStore = new InMemoryPlanStore();

      await closureStore.addResource('Organization', 'org-1');
      await closureStore.addResource('Project', 'proj-1', {
        parentType: 'Organization',
        parentId: 'org-1',
      });

      const orgResolver = async (resource?: ResourceRef) => {
        if (!resource) return null;
        const ancestors = await closureStore.getAncestors(resource.type, resource.id);
        const org = ancestors.find((a) => a.type === 'Organization');
        return org?.id ?? null;
      };

      return { accessDef, closureStore, roleStore, planStore, orgResolver };
    }

    it('can() returns false when entitlement requires plans but org has no plan', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        orgResolver,
      });

      const result = await ctx.can('project:create', { type: 'Organization', id: 'org-1' });
      expect(result).toBe(false);
    });

    it('can() returns true when org plan includes the entitlement', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        orgResolver,
      });

      const result = await ctx.can('project:create', { type: 'Organization', id: 'org-1' });
      expect(result).toBe(true);
    });

    it('can() returns false when org plan does not include the entitlement', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'owner');
      await planStore.assignPlan('org-1', 'free');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        orgResolver,
      });

      // project:export requires plans: ['pro'], free doesn't include it
      const result = await ctx.can('project:export', { type: 'Organization', id: 'org-1' });
      expect(result).toBe(false);
    });

    it('plan check skipped when entitlement has no plans field', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      // No plan assigned — but project:view has no plans requirement
      // admin on Org → contributor on Project via inheritance
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        orgResolver,
      });

      const result = await ctx.can('project:view', { type: 'Project', id: 'proj-1' });
      expect(result).toBe(true);
    });

    it('check() returns plan_required with requiredPlans meta when plan denies', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'owner');
      await planStore.assignPlan('org-1', 'free');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        orgResolver,
      });

      const result = await ctx.check('project:export', { type: 'Organization', id: 'org-1' });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('plan_required');
      expect(result.meta?.requiredPlans).toEqual(['pro']);
    });

    it('per-customer override increases limit above plan default', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');
      await planStore.updateOverrides('org-1', {
        'project:create': { max: 200 },
      });

      const walletStore = new InMemoryWalletStore();
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // Free plan limit is 5, override is 200 → effective limit is max(200, 5) = 200
      // Consume 6 should succeed
      for (let i = 0; i < 6; i++) {
        const result = await ctx.canAndConsume('project:create', {
          type: 'Organization',
          id: 'org-1',
        });
        expect(result).toBe(true);
      }
    });

    it('canAndConsume returns false when limit reached', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const walletStore = new InMemoryWalletStore();
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // Free plan: limit 5/month for project:create
      for (let i = 0; i < 5; i++) {
        expect(
          await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' }),
        ).toBe(true);
      }
      // 6th should fail
      expect(await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' })).toBe(
        false,
      );
    });

    it('canAndConsume returns false when can() fails (before wallet check)', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'member');
      await planStore.assignPlan('org-1', 'free');

      const walletStore = new InMemoryWalletStore();
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // member lacks admin/owner role for project:create
      const result = await ctx.canAndConsume('project:create', {
        type: 'Organization',
        id: 'org-1',
      });
      expect(result).toBe(false);
    });

    it('canAndConsume with custom amount increments by that amount', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const walletStore = new InMemoryWalletStore();
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // Consume 3 at once (limit is 5)
      expect(
        await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' }, 3),
      ).toBe(true);
      // Consume 3 more should fail (3 + 3 > 5)
      expect(
        await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' }, 3),
      ).toBe(false);
      // Consume 2 more should succeed (3 + 2 = 5)
      expect(
        await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' }, 2),
      ).toBe(true);
    });

    it('unconsume rolls back wallet after operation failure', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const walletStore = new InMemoryWalletStore();
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // Consume all 5
      for (let i = 0; i < 5; i++) {
        await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' });
      }
      // At limit
      expect(await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' })).toBe(
        false,
      );

      // Rollback one
      await ctx.unconsume('project:create', { type: 'Organization', id: 'org-1' });

      // Now we should be able to consume one more
      expect(await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' })).toBe(
        true,
      );
    });

    it('entitlement without limits: canAndConsume behaves like can()', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'pro');

      const walletStore = new InMemoryWalletStore();
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // project:export in pro plan has no limits
      // admin → contributor on Project (via inheritance), but manager required for export
      // Let's use a direct role assignment
      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');
      const result = await ctx.canAndConsume('project:export', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });

    it('check() returns limit_reached with meta when wallet exhausted', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const walletStore = new InMemoryWalletStore();
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // Fill up the wallet
      for (let i = 0; i < 5; i++) {
        await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' });
      }

      const result = await ctx.check('project:create', { type: 'Organization', id: 'org-1' });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('limit_reached');
      expect(result.meta?.limit).toEqual({ max: 5, consumed: 5, remaining: 0 });
    });

    it('check() includes limit info when allowed (remaining > 0)', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const walletStore = new InMemoryWalletStore();
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // Consume 3 of 5
      for (let i = 0; i < 3; i++) {
        await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' });
      }

      const result = await ctx.check('project:create', { type: 'Organization', id: 'org-1' });
      expect(result.allowed).toBe(true);
      expect(result.meta?.limit).toEqual({ max: 5, consumed: 3, remaining: 2 });
    });

    it('can() returns false when limit reached (Layer 5 short-circuit)', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const walletStore = new InMemoryWalletStore();
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // Fill up the wallet
      for (let i = 0; i < 5; i++) {
        await ctx.canAndConsume('project:create', { type: 'Organization', id: 'org-1' });
      }

      // can() should now return false (Layer 5 short-circuit)
      const result = await ctx.can('project:create', { type: 'Organization', id: 'org-1' });
      expect(result).toBe(false);
    });

    it('expired plan falls back to free plan', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } = await setupWithPlans();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      // Assign pro plan that's already expired
      await planStore.assignPlan(
        'org-1',
        'pro',
        new Date('2025-01-01'),
        new Date('2025-06-01'), // expired
      );

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        orgResolver,
      });

      // project:export requires plans: ['pro'], but expired pro falls back to free
      // free doesn't include project:export
      const exportResult = await ctx.can('project:export', {
        type: 'Organization',
        id: 'org-1',
      });
      expect(exportResult).toBe(false);

      // project:create is in free plan, should still work
      const createResult = await ctx.can('project:create', {
        type: 'Organization',
        id: 'org-1',
      });
      expect(createResult).toBe(true);
    });
  });

  describe('check()', () => {
    it('returns allowed=true with empty reasons when granted', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:edit', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
      expect(result.reason).toBeUndefined();
    });

    it('returns role_required when user lacks role', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'Project', 'proj-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:delete', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('role_required');
      expect(result.reason).toBe('role_required');
      expect(result.meta?.requiredRoles).toEqual(['manager']);
    });

    it('returns not_authenticated for null user', async () => {
      const { accessDef, closureStore, roleStore } = await setup();

      const ctx = createAccessContext({
        userId: null,
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:view', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('not_authenticated');
      expect(result.reason).toBe('not_authenticated');
    });
  });

  describe('authorize()', () => {
    it('does not throw when authorized', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      await expect(
        ctx.authorize('project:edit', { type: 'Project', id: 'proj-1' }),
      ).resolves.toBeUndefined();
    });

    it('throws AuthorizationError when denied', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'Project', 'proj-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      await expect(
        ctx.authorize('project:delete', { type: 'Project', id: 'proj-1' }),
      ).rejects.toThrow('Not authorized');
    });
  });

  describe('canAll()', () => {
    it('returns map of entitlement+resource → boolean', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'Project', 'proj-1', 'contributor');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const results = await ctx.canAll([
        { entitlement: 'project:view', resource: { type: 'Project', id: 'proj-1' } },
        { entitlement: 'project:edit', resource: { type: 'Project', id: 'proj-1' } },
        { entitlement: 'project:delete', resource: { type: 'Project', id: 'proj-1' } },
      ]);

      expect(results.get('project:view:proj-1')).toBe(true);
      expect(results.get('project:edit:proj-1')).toBe(true);
      expect(results.get('project:delete:proj-1')).toBe(false);
    });

    it('enforces max 100 checks', async () => {
      const { accessDef, closureStore, roleStore } = await setup();

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const checks = Array.from({ length: 101 }, (_, i) => ({
        entitlement: 'project:view',
        resource: { type: 'Project', id: `proj-${i}` },
      }));

      await expect(ctx.canAll(checks)).rejects.toThrow('canAll() is limited to 100 checks');
    });
  });

  describe('flag layer (Layer 1)', () => {
    async function setupWithFlags() {
      const accessDef = defineAccess({
        hierarchy: ['Organization', 'Project'],
        roles: {
          Organization: ['owner', 'admin'],
          Project: ['manager', 'contributor'],
        },
        inheritance: {
          Organization: { owner: 'manager', admin: 'contributor' },
        },
        entitlements: {
          'project:view': { roles: ['contributor', 'manager'] },
          'project:export': { roles: ['manager'], flags: ['export-v2'] },
          'project:ai': { roles: ['contributor', 'manager'], flags: ['ai-assist'] },
          'project:beta': {
            roles: ['manager'],
            flags: ['beta-feature', 'beta-ui'],
          },
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      const flagStore = new InMemoryFlagStore();

      await closureStore.addResource('Organization', 'org-1');
      await closureStore.addResource('Project', 'proj-1', {
        parentType: 'Organization',
        parentId: 'org-1',
      });

      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const orgResolver = async (resource?: ResourceRef) => {
        if (!resource) return null;
        const ancestors = await closureStore.getAncestors(resource.type, resource.id);
        const org = ancestors.find((a) => a.type === 'Organization');
        return org?.id ?? null;
      };

      return { accessDef, closureStore, roleStore, flagStore, orgResolver };
    }

    it('can() returns false when entitlement flag is disabled', async () => {
      const { accessDef, closureStore, roleStore, flagStore, orgResolver } = await setupWithFlags();
      flagStore.setFlag('org-1', 'export-v2', false);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      const result = await ctx.can('project:export', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(false);
    });

    it('can() returns true when entitlement flag is enabled', async () => {
      const { accessDef, closureStore, roleStore, flagStore, orgResolver } = await setupWithFlags();
      flagStore.setFlag('org-1', 'export-v2', true);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      const result = await ctx.can('project:export', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });

    it('can() passes when entitlement has no flags (backward compat)', async () => {
      const { accessDef, closureStore, roleStore, flagStore, orgResolver } = await setupWithFlags();

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      // project:view has no flags requirement
      const result = await ctx.can('project:view', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });

    it('can() requires all flags to be enabled (multiple flags)', async () => {
      const { accessDef, closureStore, roleStore, flagStore, orgResolver } = await setupWithFlags();
      flagStore.setFlag('org-1', 'beta-feature', true);
      flagStore.setFlag('org-1', 'beta-ui', false); // one of two flags off

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      const result = await ctx.can('project:beta', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(false);

      // Enable both flags
      flagStore.setFlag('org-1', 'beta-ui', true);
      const result2 = await ctx.can('project:beta', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result2).toBe(true);
    });

    it('check() returns flag_disabled reason with meta.disabledFlags', async () => {
      const { accessDef, closureStore, roleStore, flagStore, orgResolver } = await setupWithFlags();
      flagStore.setFlag('org-1', 'export-v2', false);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      const result = await ctx.check('project:export', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('flag_disabled');
      expect(result.meta?.disabledFlags).toEqual(['export-v2']);
    });

    it('check() returns multiple disabled flags in meta', async () => {
      const { accessDef, closureStore, roleStore, flagStore, orgResolver } = await setupWithFlags();
      flagStore.setFlag('org-1', 'beta-feature', false);
      flagStore.setFlag('org-1', 'beta-ui', false);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      const result = await ctx.check('project:beta', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('flag_disabled');
      expect(result.meta?.disabledFlags).toEqual(['beta-feature', 'beta-ui']);
    });

    it('can() denies global check (no resource) when roles are required', async () => {
      const { accessDef, closureStore, roleStore, flagStore, orgResolver } = await setupWithFlags();

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      // project:view requires roles but no resource provided → deny
      const result = await ctx.can('project:view');
      expect(result).toBe(false);
    });

    it('check() returns flag_disabled with all flags when orgId cannot be resolved', async () => {
      const { accessDef, closureStore, roleStore, flagStore, orgResolver } = await setupWithFlags();
      flagStore.setFlag('org-1', 'export-v2', true);

      // orgResolver returns null for unknown resources
      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      // Use a resource that the orgResolver can't resolve to an org
      const result = await ctx.check('project:export', {
        type: 'Unknown',
        id: 'unknown-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('flag_disabled');
      expect(result.meta?.disabledFlags).toEqual(['export-v2']);
    });

    it('check() returns role_required for global check (no resource)', async () => {
      const { accessDef, closureStore, roleStore, flagStore, orgResolver } = await setupWithFlags();

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      const result = await ctx.check('project:view');
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('role_required');
      expect(result.meta?.requiredRoles).toEqual(['contributor', 'manager']);
    });

    it('check() returns role_required for unknown entitlement', async () => {
      const { accessDef, closureStore, roleStore, flagStore, orgResolver } = await setupWithFlags();

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      const result = await ctx.check('nonexistent:action', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('role_required');
    });
  });

  describe('canAndConsume edge cases', () => {
    async function setupWithPlansAndFlags() {
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
          'project:export': { roles: ['manager'], plans: ['pro'] },
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
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      const planStore = new InMemoryPlanStore();
      const walletStore = new InMemoryWalletStore();

      await closureStore.addResource('Organization', 'org-1');
      await closureStore.addResource('Project', 'proj-1', {
        parentType: 'Organization',
        parentId: 'org-1',
      });

      const orgResolver = async (resource?: ResourceRef) => {
        if (!resource) return null;
        const ancestors = await closureStore.getAncestors(resource.type, resource.id);
        const org = ancestors.find((a) => a.type === 'Organization');
        return org?.id ?? null;
      };

      return { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver };
    }

    it('canAndConsume returns true when no wallet/plan infrastructure', async () => {
      const { accessDef, closureStore, roleStore } = await setupWithPlansAndFlags();
      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        // No planStore, walletStore, orgResolver
      });

      const result = await ctx.canAndConsume('project:view', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });

    it('canAndConsume returns false when orgId cannot be resolved', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        await setupWithPlansAndFlags();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // Use a resource with no ancestors → orgResolver returns null
      const result = await ctx.canAndConsume('project:create', {
        type: 'Unknown',
        id: 'unknown',
      });
      expect(result).toBe(false);
    });

    it('canAndConsume returns false when plan does not include entitlement', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        await setupWithPlansAndFlags();
      // Assign manager directly on Project (satisfies role requirement for project:export)
      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');
      await planStore.assignPlan('org-1', 'free'); // free doesn't include project:export

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // Roles pass (manager), but plan check fails (free doesn't include project:export)
      const result = await ctx.canAndConsume('project:export', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(false);
    });

    it('can() returns false when plan does not include entitlement (Layer 4)', async () => {
      const { accessDef, closureStore, roleStore, planStore, orgResolver } =
        await setupWithPlansAndFlags();
      // Assign manager directly on Project (satisfies role requirement for project:export)
      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');
      await planStore.assignPlan('org-1', 'free'); // free doesn't include project:export

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        orgResolver,
      });

      // Roles pass, but plan denies (free plan doesn't include project:export)
      const result = await ctx.can('project:export', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(false);
    });

    it('unconsume is a no-op without wallet/plan infrastructure', async () => {
      const { accessDef, closureStore, roleStore } = await setupWithPlansAndFlags();
      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      // Should not throw
      await ctx.unconsume('project:view', { type: 'Project', id: 'proj-1' });
    });

    it('unconsume is a no-op when entitlement has no plans', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        await setupWithPlansAndFlags();
      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // project:view has no plans — unconsume should be no-op
      await ctx.unconsume('project:view', { type: 'Project', id: 'proj-1' });
    });

    it('unconsume is a no-op when orgId cannot be resolved', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        await setupWithPlansAndFlags();
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // Unknown resource → orgResolver returns null
      await ctx.unconsume('project:create', { type: 'Unknown', id: 'unknown' });
    });
  });

  describe('check() edge cases', () => {
    it('check() plan_required when orgResolver returns null', async () => {
      const accessDef = defineAccess({
        hierarchy: ['Organization', 'Project'],
        roles: {
          Organization: ['owner'],
          Project: ['manager'],
        },
        inheritance: {
          Organization: { owner: 'manager' },
        },
        entitlements: {
          'project:export': { roles: ['manager'], plans: ['pro'] },
        },
        plans: {
          pro: { entitlements: ['project:export'] },
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      const planStore = new InMemoryPlanStore();

      await closureStore.addResource('Organization', 'org-1');
      await closureStore.addResource('Project', 'proj-1', {
        parentType: 'Organization',
        parentId: 'org-1',
      });
      await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        orgResolver: async () => null, // Always returns null
      });

      const result = await ctx.check('project:export', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('plan_required');
    });

    it('canAll uses entitlement as key when no resource provided', async () => {
      const accessDef = defineAccess({
        hierarchy: ['Organization'],
        roles: { Organization: ['admin'] },
        entitlements: {
          'org:settings': { roles: ['admin'] },
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      await closureStore.addResource('Organization', 'org-1');
      await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      // No resource — key should just be the entitlement name
      const results = await ctx.canAll([{ entitlement: 'org:settings' }]);
      // Global check with roles required but no resource → deny
      expect(results.get('org:settings')).toBe(false);
    });
  });
});
