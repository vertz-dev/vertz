import { describe, expect, it } from 'bun:test';
import { createAccessContext } from '../access-context';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';

function setup() {
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
  });

  const closureStore = new InMemoryClosureStore();
  const roleStore = new InMemoryRoleAssignmentStore();

  // Build resource hierarchy
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

  return { accessDef, closureStore, roleStore };
}

describe('createAccessContext', () => {
  describe('can()', () => {
    it('returns true when user role grants entitlement on resource', async () => {
      const { accessDef, closureStore, roleStore } = setup();
      roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

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
      const { accessDef, closureStore, roleStore } = setup();
      roleStore.assign('user-1', 'Project', 'proj-1', 'viewer');

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
      const { accessDef, closureStore, roleStore } = setup();

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
      const { accessDef, closureStore, roleStore } = setup();
      roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
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
      const { accessDef, closureStore, roleStore } = setup();
      roleStore.assign('user-1', 'Organization', 'org-1', 'member');
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

    it('stubs plan and flag checks (always pass for now)', async () => {
      const { accessDef, closureStore, roleStore } = setup();
      roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      // project:export requires plans: ['enterprise'] and flags: ['export-v2']
      // Both are stubbed to always pass in this phase
      const result = await ctx.can('project:export', {
        type: 'Project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });
  });

  describe('check()', () => {
    it('returns allowed=true with empty reasons when granted', async () => {
      const { accessDef, closureStore, roleStore } = setup();
      roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

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
      const { accessDef, closureStore, roleStore } = setup();
      roleStore.assign('user-1', 'Project', 'proj-1', 'viewer');

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
      const { accessDef, closureStore, roleStore } = setup();

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
      const { accessDef, closureStore, roleStore } = setup();
      roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

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
      const { accessDef, closureStore, roleStore } = setup();
      roleStore.assign('user-1', 'Project', 'proj-1', 'viewer');

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
      const { accessDef, closureStore, roleStore } = setup();
      roleStore.assign('user-1', 'Project', 'proj-1', 'contributor');

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
      const { accessDef, closureStore, roleStore } = setup();

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
});
