/**
 * Integration test — Resource Hierarchy with defineAccess() [#1072]
 *
 * Validates the entity-centric RBAC & Access Control system end-to-end:
 * - defineAccess() configuration with entities, inherits, and entitlements
 * - Closure table for resource hierarchy
 * - Role assignment store with inheritance resolution
 * - Access context (can/check/authorize/canAll)
 * - Rules builders
 *
 * Uses public package imports only (@vertz/server).
 */
import { describe, expect, it } from 'bun:test';
import {
  createAccessContext,
  defineAccess,
  InMemoryClosureStore,
  InMemoryRoleAssignmentStore,
  rules,
} from '@vertz/server';

// ============================================================================
// Setup — entity-centric config
// ============================================================================

const access = defineAccess({
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
    'organization:create-team': { roles: ['admin', 'owner'] },
    'team:invite': { roles: ['lead', 'editor'] },
  },
});

async function buildHierarchy() {
  const closureStore = new InMemoryClosureStore();
  const roleStore = new InMemoryRoleAssignmentStore();

  // Build: organization → team → project → task
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

  return { closureStore, roleStore };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Resource Hierarchy — E2E Integration', () => {
  describe('Acceptance: Org admin inherits down the hierarchy', () => {
    it('admin on org inherits editor on team and contributor on project', async () => {
      const { closureStore, roleStore } = await buildHierarchy();
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      // admin → editor (team) → contributor (project)
      expect(await ctx.can('project:edit', { type: 'project', id: 'proj-1' })).toBe(true);

      // contributor cannot delete projects (only manager)
      expect(await ctx.can('project:delete', { type: 'project', id: 'proj-1' })).toBe(false);

      // admin → editor (team) → contributor (project) → assignee (task)
      expect(await ctx.can('task:edit', { type: 'task', id: 'task-1' })).toBe(true);
    });
  });

  describe('defineAccess() config', () => {
    it('returns frozen config', () => {
      expect(Object.isFrozen(access)).toBe(true);
      expect(Object.isFrozen(access.hierarchy)).toBe(true);
      expect(Object.isFrozen(access.entitlements)).toBe(true);
    });

    it('rejects hierarchy deeper than 4 levels', () => {
      expect(() => {
        defineAccess({
          entities: {
            a: { roles: ['r'] },
            b: { roles: ['r'], inherits: { 'a:r': 'r' } },
            c: { roles: ['r'], inherits: { 'b:r': 'r' } },
            d: { roles: ['r'], inherits: { 'c:r': 'r' } },
            e: { roles: ['r'], inherits: { 'd:r': 'r' } },
          },
          entitlements: {},
        });
      }).toThrow('Hierarchy depth must not exceed 4 levels');
    });

    it('entity names are lowercase in the new API', () => {
      expect(access.hierarchy).toContain('organization');
      expect(access.hierarchy).toContain('team');
      expect(access.hierarchy).toContain('project');
      expect(access.hierarchy).toContain('task');
    });
  });

  describe('ctx.can() — role-based checks', () => {
    it('returns true when user role grants entitlement', async () => {
      const { closureStore, roleStore } = await buildHierarchy();
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      expect(await ctx.can('project:edit', { type: 'project', id: 'proj-1' })).toBe(true);
    });

    it('returns false when user lacks required role', async () => {
      const { closureStore, roleStore } = await buildHierarchy();
      await roleStore.assign('user-1', 'project', 'proj-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      expect(await ctx.can('project:edit', { type: 'project', id: 'proj-1' })).toBe(false);
    });

    it('returns false for unauthenticated user', async () => {
      const { closureStore, roleStore } = await buildHierarchy();

      const ctx = createAccessContext({
        userId: null,
        accessDef: access,
        closureStore,
        roleStore,
      });

      expect(await ctx.can('project:view', { type: 'project', id: 'proj-1' })).toBe(false);
    });
  });

  describe('ctx.check() — structured denial reasons', () => {
    it('returns allowed=true with empty reasons when granted', async () => {
      const { closureStore, roleStore } = await buildHierarchy();
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:edit', { type: 'project', id: 'proj-1' });
      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('returns role_required with meta when denied', async () => {
      const { closureStore, roleStore } = await buildHierarchy();
      await roleStore.assign('user-1', 'project', 'proj-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:delete', { type: 'project', id: 'proj-1' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('role_required');
      expect(result.meta?.requiredRoles).toEqual(['manager']);
    });

    it('returns not_authenticated for null user', async () => {
      const { closureStore, roleStore } = await buildHierarchy();

      const ctx = createAccessContext({
        userId: null,
        accessDef: access,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:view', { type: 'project', id: 'proj-1' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('not_authenticated');
    });
  });

  describe('ctx.authorize() — throws on denial', () => {
    it('does not throw when authorized', async () => {
      const { closureStore, roleStore } = await buildHierarchy();
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      await expect(
        ctx.authorize('project:edit', { type: 'project', id: 'proj-1' }),
      ).resolves.toBeUndefined();
    });

    it('throws AuthorizationError when denied', async () => {
      const { closureStore, roleStore } = await buildHierarchy();

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      await expect(
        ctx.authorize('project:edit', { type: 'project', id: 'proj-1' }),
      ).rejects.toThrow('Not authorized');
    });
  });

  describe('ctx.canAll() — bulk check', () => {
    it('returns map of entitlement+resource → boolean', async () => {
      const { closureStore, roleStore } = await buildHierarchy();
      await roleStore.assign('user-1', 'project', 'proj-1', 'contributor');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
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

  describe('Role inheritance — additive model', () => {
    it('most permissive role wins across direct + inherited', async () => {
      const { closureStore, roleStore } = await buildHierarchy();
      await roleStore.assign('user-1', 'organization', 'org-1', 'member');
      await roleStore.assign('user-1', 'team', 'team-1', 'lead');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      // lead → manager on project → can delete
      expect(await ctx.can('project:delete', { type: 'project', id: 'proj-1' })).toBe(true);
    });

    it('inherited role wins over less permissive direct assignment', async () => {
      const { closureStore, roleStore } = await buildHierarchy();
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await roleStore.assign('user-1', 'team', 'team-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      // editor → contributor on project → can edit
      expect(await ctx.can('project:edit', { type: 'project', id: 'proj-1' })).toBe(true);
    });
  });

  describe('Closure table integrity', () => {
    it('insert maintains ancestor paths', async () => {
      const closureStore = new InMemoryClosureStore();
      await closureStore.addResource('organization', 'org-1');
      await closureStore.addResource('team', 'team-1', {
        parentType: 'organization',
        parentId: 'org-1',
      });

      const ancestors = await closureStore.getAncestors('team', 'team-1');
      expect(ancestors).toContainEqual({ type: 'team', id: 'team-1', depth: 0 });
      expect(ancestors).toContainEqual({ type: 'organization', id: 'org-1', depth: 1 });
    });

    it('delete cascades closure rows', async () => {
      const closureStore = new InMemoryClosureStore();
      await closureStore.addResource('organization', 'org-1');
      await closureStore.addResource('team', 'team-1', {
        parentType: 'organization',
        parentId: 'org-1',
      });
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'team',
        parentId: 'team-1',
      });

      await closureStore.removeResource('team', 'team-1');

      const orgDescendants = await closureStore.getDescendants('organization', 'org-1');
      expect(orgDescendants).toHaveLength(1); // only self
    });
  });

  describe('rules.* builders', () => {
    it('creates composable rule structures', () => {
      const isOwner = rules.where({ createdBy: rules.user.id });
      const isNotArchived = rules.where({ archived: false });

      const rule = rules.all(rules.entitlement('project:edit'), rules.any(isOwner, isNotArchived));

      expect(rule.type).toBe('all');
      expect(rule.rules).toHaveLength(2);
      expect(rule.rules[0].type).toBe('entitlement');
      expect(rule.rules[1].type).toBe('any');
    });

    it('supports fva and authenticated rules', () => {
      const rule = rules.all(rules.authenticated(), rules.fva(600), rules.role('admin', 'owner'));

      expect(rule.type).toBe('all');
      expect(rule.rules).toHaveLength(3);
    });
  });
});
