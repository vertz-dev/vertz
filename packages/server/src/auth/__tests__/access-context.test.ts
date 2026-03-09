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
    entities: {
      organization: { roles: ['owner', 'admin', 'member'] },
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
      task: {
        roles: ['assignee', 'viewer'],
        inherits: {
          'project:manager': 'assignee',
          'project:contributor': 'assignee',
          'project:viewer': 'viewer',
        },
      },
    },
    entitlements: {
      'project:view': { roles: ['viewer', 'contributor', 'manager'] },
      'project:edit': { roles: ['contributor', 'manager'] },
      'project:delete': { roles: ['manager'] },
      'project:export': { roles: ['manager'], flags: ['export-v2'] },
      'task:view': { roles: ['viewer', 'assignee'] },
      'task:edit': { roles: ['assignee'] },
    },
  });

  const closureStore = new InMemoryClosureStore();
  const roleStore = new InMemoryRoleAssignmentStore();

  // Build resource hierarchy
  await closureStore.addResource('organization', 'org-1');
  await closureStore.addResource('team', 'team-1', {
    parentType: 'organization',
    parentId: 'org-1',
  });
  await closureStore.addResource('project', 'proj-1', {
    parentType: 'team',
    parentId: 'team-1',
  });
  await closureStore.addResource('task', 'task-1', {
    parentType: 'project',
    parentId: 'proj-1',
  });

  return { accessDef, closureStore, roleStore };
}

describe('createAccessContext', () => {
  describe('can()', () => {
    it('returns true when user role grants entitlement on resource', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });

    it('returns false when user lacks required role', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'project',
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
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(false);
    });

    it('resolves inherited roles via hierarchy', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      // admin on org → editor on team → contributor on project

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(true); // contributor can edit
    });

    it('denies when inherited role is insufficient', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'organization', 'org-1', 'member');
      // member on org → viewer on team → viewer on project

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(false); // viewer cannot edit
    });

    it('plan check skipped when no planStore configured (backward compat)', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      // project:export requires flags: ['export-v2']
      // Without flagStore configured, flag check is skipped
      const result = await ctx.can('project:export', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });
  });

  describe('plan layer (Layer 4)', () => {
    async function setupWithPlans() {
      const accessDef = defineAccess({
        entities: {
          organization: { roles: ['owner', 'admin', 'member'] },
          project: {
            roles: ['manager', 'contributor', 'viewer'],
            inherits: {
              'organization:owner': 'manager',
              'organization:admin': 'contributor',
              'organization:member': 'viewer',
            },
          },
        },
        entitlements: {
          'organization:create-project': { roles: ['admin', 'owner'] },
          'project:view': { roles: ['viewer', 'contributor', 'manager'] },
          'project:export': { roles: ['manager'] },
        },
        plans: {
          free: {
            entitlements: ['organization:create-project', 'project:view'],
          },
          pro: {
            entitlements: ['organization:create-project', 'project:view', 'project:export'],
            limits: {
              'organization:create-project': { per: 'month', max: 10 },
            },
          },
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      const planStore = new InMemoryPlanStore();
      const walletStore = new InMemoryWalletStore();

      await closureStore.addResource('organization', 'org-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'organization',
        parentId: 'org-1',
      });

      const orgResolver = async (resource?: ResourceRef) => 'org-1';

      return { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver };
    }

    it('can() passes when plan includes entitlement', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        await setupWithPlans();
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'pro');

      // Set entitlement plans field to reference pro
      const accessDefWithPlans = defineAccess({
        entities: {
          organization: { roles: ['owner', 'admin', 'member'] },
          project: {
            roles: ['manager', 'contributor', 'viewer'],
            inherits: {
              'organization:owner': 'manager',
              'organization:admin': 'contributor',
              'organization:member': 'viewer',
            },
          },
        },
        entitlements: {
          'organization:create-project': { roles: ['admin', 'owner'] },
          'project:view': { roles: ['viewer', 'contributor', 'manager'] },
          'project:export': { roles: ['manager'] },
        },
        plans: {
          free: {
            entitlements: ['organization:create-project', 'project:view'],
          },
          pro: {
            entitlements: ['organization:create-project', 'project:view', 'project:export'],
          },
        },
      });

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: accessDefWithPlans,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.can('organization:create-project', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(true);
    });
  });

  describe('check()', () => {
    it('returns allowed=true with empty reasons when granted', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:edit', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('returns role_required when denied', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:delete', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(false);
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
        type: 'project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('not_authenticated');
    });
  });

  describe('authorize()', () => {
    it('does not throw when authorized', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      await expect(
        ctx.authorize('project:edit', { type: 'project', id: 'proj-1' }),
      ).resolves.toBeUndefined();
    });

    it('throws AuthorizationError when denied', async () => {
      const { accessDef, closureStore, roleStore } = await setup();

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      await expect(
        ctx.authorize('project:edit', { type: 'project', id: 'proj-1' }),
      ).rejects.toThrow('Not authorized');
    });
  });

  describe('canAll()', () => {
    it('returns map of entitlement+resource → boolean', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'contributor');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const results = await ctx.canAll([
        { entitlement: 'project:view', resource: { type: 'project', id: 'proj-1' } },
        { entitlement: 'project:edit', resource: { type: 'project', id: 'proj-1' } },
        { entitlement: 'project:delete', resource: { type: 'project', id: 'proj-1' } },
      ]);

      expect(results.get('project:view:proj-1')).toBe(true);
      expect(results.get('project:edit:proj-1')).toBe(true);
      expect(results.get('project:delete:proj-1')).toBe(false);
    });
  });

  describe('most permissive role wins', () => {
    it('direct assignment wins over less permissive inherited role', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'organization', 'org-1', 'member'); // inherits viewer
      await roleStore.assign('user-1', 'team', 'team-1', 'lead'); // direct lead

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      // lead → manager on project → can delete
      expect(await ctx.can('project:delete', { type: 'project', id: 'proj-1' })).toBe(true);
    });

    it('inherited role wins over less permissive direct assignment', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin'); // inherits editor
      await roleStore.assign('user-1', 'team', 'team-1', 'viewer'); // direct viewer

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      // editor → contributor on project → can edit
      expect(await ctx.can('project:edit', { type: 'project', id: 'proj-1' })).toBe(true);
    });
  });

  describe('flag layer (Layer 1)', () => {
    it('flag disabled → can() returns false', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      const flagStore = new InMemoryFlagStore();
      flagStore.setFlag('org-1', 'export-v2', false);
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const orgResolver = async () => 'org-1';

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      const result = await ctx.can('project:export', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(false);
    });

    it('flag enabled → can() returns true', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      const flagStore = new InMemoryFlagStore();
      flagStore.setFlag('org-1', 'export-v2', true);
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const orgResolver = async () => 'org-1';

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      const result = await ctx.can('project:export', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });
  });
});
