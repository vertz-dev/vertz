/**
 * Integration test — Resource Hierarchy with defineAccess() [#1020]
 *
 * Validates the Phase 6 RBAC & Access Control system end-to-end:
 * - defineAccess() configuration with hierarchy, roles, inheritance, entitlements
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
// Setup — mirrors the design doc example
// ============================================================================

const access = defineAccess({
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
    'org:create-team': { roles: ['admin', 'owner'] },
    'team:invite': { roles: ['lead', 'admin', 'owner'] },
  },
  plans: {
    enterprise: {
      entitlements: [
        'project:view', 'project:edit', 'project:delete', 'project:export',
        'task:view', 'task:edit', 'org:create-team', 'team:invite',
      ],
    },
  },
});

function buildHierarchy() {
  const closureStore = new InMemoryClosureStore();
  const roleStore = new InMemoryRoleAssignmentStore();

  // Build: Org → Team → Project → Task
  closureStore.addResource('Organization', 'org-1');
  closureStore.addResource('Team', 'team-1', {
    parentType: 'Organization',
    parentId: 'org-1',
  });
  closureStore.addResource('Project', 'proj-1', {
    parentType: 'Team',
    parentId: 'team-1',
  });
  closureStore.addResource('Task', 'task-1', {
    parentType: 'Project',
    parentId: 'proj-1',
  });

  return { closureStore, roleStore };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Resource Hierarchy — E2E Integration', () => {
  describe('Acceptance: Org admin inherits down the hierarchy', () => {
    it('admin on Org inherits editor on Team and contributor on Project', async () => {
      const { closureStore, roleStore } = buildHierarchy();
      roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      // admin → editor (Team) → contributor (Project)
      // contributor can edit projects
      expect(await ctx.can('project:edit', { type: 'Project', id: 'proj-1' })).toBe(true);

      // contributor cannot delete projects (only manager)
      expect(await ctx.can('project:delete', { type: 'Project', id: 'proj-1' })).toBe(false);

      // viewer on Task (via contributor → assignee on Task? No — contributor → assignee via Project inheritance)
      // Actually: admin → editor (Team) → contributor (Project) → assignee (Task)
      expect(await ctx.can('task:edit', { type: 'Task', id: 'task-1' })).toBe(true);
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
          hierarchy: ['A', 'B', 'C', 'D', 'E'],
          roles: { A: ['r'], B: ['r'], C: ['r'], D: ['r'], E: ['r'] },
          entitlements: {},
        });
      }).toThrow('Hierarchy depth must not exceed 4 levels');
    });
  });

  describe('ctx.can() — role-based checks', () => {
    it('returns true when user role grants entitlement', async () => {
      const { closureStore, roleStore } = buildHierarchy();
      roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      expect(await ctx.can('project:edit', { type: 'Project', id: 'proj-1' })).toBe(true);
    });

    it('returns false when user lacks required role', async () => {
      const { closureStore, roleStore } = buildHierarchy();
      roleStore.assign('user-1', 'Project', 'proj-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      expect(await ctx.can('project:edit', { type: 'Project', id: 'proj-1' })).toBe(false);
    });

    it('returns false for unauthenticated user', async () => {
      const { closureStore, roleStore } = buildHierarchy();

      const ctx = createAccessContext({
        userId: null,
        accessDef: access,
        closureStore,
        roleStore,
      });

      expect(await ctx.can('project:view', { type: 'Project', id: 'proj-1' })).toBe(false);
    });
  });

  describe('ctx.check() — structured denial reasons', () => {
    it('returns allowed=true with empty reasons when granted', async () => {
      const { closureStore, roleStore } = buildHierarchy();
      roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:edit', { type: 'Project', id: 'proj-1' });
      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('returns role_required with meta when denied', async () => {
      const { closureStore, roleStore } = buildHierarchy();
      roleStore.assign('user-1', 'Project', 'proj-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:delete', { type: 'Project', id: 'proj-1' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('role_required');
      expect(result.meta?.requiredRoles).toEqual(['manager']);
    });

    it('returns not_authenticated for null user', async () => {
      const { closureStore, roleStore } = buildHierarchy();

      const ctx = createAccessContext({
        userId: null,
        accessDef: access,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:view', { type: 'Project', id: 'proj-1' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('not_authenticated');
    });
  });

  describe('ctx.authorize() — throws on denial', () => {
    it('does not throw when authorized', async () => {
      const { closureStore, roleStore } = buildHierarchy();
      roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      await expect(
        ctx.authorize('project:edit', { type: 'Project', id: 'proj-1' }),
      ).resolves.toBeUndefined();
    });

    it('throws AuthorizationError when denied', async () => {
      const { closureStore, roleStore } = buildHierarchy();

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      await expect(
        ctx.authorize('project:edit', { type: 'Project', id: 'proj-1' }),
      ).rejects.toThrow('Not authorized');
    });
  });

  describe('ctx.canAll() — bulk check', () => {
    it('returns map of entitlement+resource → boolean', async () => {
      const { closureStore, roleStore } = buildHierarchy();
      roleStore.assign('user-1', 'Project', 'proj-1', 'contributor');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
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
  });

  describe('Role inheritance — additive model', () => {
    it('most permissive role wins across direct + inherited', async () => {
      const { closureStore, roleStore } = buildHierarchy();
      // Member on org → viewer on team (inherited)
      roleStore.assign('user-1', 'Organization', 'org-1', 'member');
      // Direct lead on team (more permissive)
      roleStore.assign('user-1', 'Team', 'team-1', 'lead');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      // lead → manager on Project → can delete
      expect(await ctx.can('project:delete', { type: 'Project', id: 'proj-1' })).toBe(true);
    });

    it('inherited role wins over less permissive direct assignment', async () => {
      const { closureStore, roleStore } = buildHierarchy();
      // Admin on org → editor on team (inherited)
      roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
      // Direct viewer on team (less permissive)
      roleStore.assign('user-1', 'Team', 'team-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef: access,
        closureStore,
        roleStore,
      });

      // editor → contributor on Project → can edit
      expect(await ctx.can('project:edit', { type: 'Project', id: 'proj-1' })).toBe(true);
    });
  });

  describe('Closure table integrity', () => {
    it('insert maintains ancestor paths', () => {
      const closureStore = new InMemoryClosureStore();
      closureStore.addResource('Organization', 'org-1');
      closureStore.addResource('Team', 'team-1', {
        parentType: 'Organization',
        parentId: 'org-1',
      });

      const ancestors = closureStore.getAncestors('Team', 'team-1');
      expect(ancestors).toContainEqual({ type: 'Team', id: 'team-1', depth: 0 });
      expect(ancestors).toContainEqual({ type: 'Organization', id: 'org-1', depth: 1 });
    });

    it('delete cascades closure rows', () => {
      const closureStore = new InMemoryClosureStore();
      closureStore.addResource('Organization', 'org-1');
      closureStore.addResource('Team', 'team-1', {
        parentType: 'Organization',
        parentId: 'org-1',
      });
      closureStore.addResource('Project', 'proj-1', {
        parentType: 'Team',
        parentId: 'team-1',
      });

      closureStore.removeResource('Team', 'team-1');

      const orgDescendants = closureStore.getDescendants('Organization', 'org-1');
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
