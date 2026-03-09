import { describe, expect, it } from 'bun:test';
import { InMemoryClosureStore } from '../closure-store';
import type { AccessDefinition } from '../define-access';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';

const accessDef: AccessDefinition = Object.freeze({
  hierarchy: Object.freeze(['Organization', 'Team', 'Project', 'Task']),
  roles: Object.freeze({
    Organization: Object.freeze(['owner', 'admin', 'member']),
    Team: Object.freeze(['lead', 'editor', 'viewer']),
    Project: Object.freeze(['manager', 'contributor', 'viewer']),
    Task: Object.freeze(['assignee', 'viewer']),
  }),
  inheritance: Object.freeze({
    Organization: Object.freeze({ owner: 'lead', admin: 'editor', member: 'viewer' }),
    Team: Object.freeze({ lead: 'manager', editor: 'contributor', viewer: 'viewer' }),
    Project: Object.freeze({ manager: 'assignee', contributor: 'assignee', viewer: 'viewer' }),
  }),
  entitlements: Object.freeze({
    'project:view': Object.freeze({ roles: ['viewer', 'contributor', 'manager'] }),
    'project:edit': Object.freeze({ roles: ['contributor', 'manager'] }),
    'project:delete': Object.freeze({ roles: ['manager'] }),
  }),
});

describe('InMemoryRoleAssignmentStore', () => {
  it('assigns a role to a user on a resource', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'Organization', 'org-1', 'admin');

    const roles = await store.getRoles('user-1', 'Organization', 'org-1');
    expect(roles).toEqual(['admin']);
  });

  it('revokes a role from a user on a resource', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'Organization', 'org-1', 'admin');
    await store.revoke('user-1', 'Organization', 'org-1', 'admin');

    const roles = await store.getRoles('user-1', 'Organization', 'org-1');
    expect(roles).toEqual([]);
  });

  it('supports multiple roles on same resource', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'Organization', 'org-1', 'admin');
    await store.assign('user-1', 'Organization', 'org-1', 'member');

    const roles = await store.getRoles('user-1', 'Organization', 'org-1');
    expect(roles).toContain('admin');
    expect(roles).toContain('member');
    expect(roles).toHaveLength(2);
  });

  it('does not duplicate role assignments', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'Organization', 'org-1', 'admin');
    await store.assign('user-1', 'Organization', 'org-1', 'admin');

    const roles = await store.getRoles('user-1', 'Organization', 'org-1');
    expect(roles).toEqual(['admin']);
  });

  it('computes effective role with inheritance (most permissive wins)', async () => {
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('Organization', 'org-1');
    await closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'Team',
      'team-1',
      accessDef,
      closureStore,
    );
    // admin on Org inherits to editor on Team
    expect(effectiveRole).toBe('editor');
  });

  it('effective role: direct assignment wins over less permissive inherited role', async () => {
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('Organization', 'org-1');
    await closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    await roleStore.assign('user-1', 'Organization', 'org-1', 'member'); // inherits viewer
    await roleStore.assign('user-1', 'Team', 'team-1', 'lead'); // direct lead

    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'Team',
      'team-1',
      accessDef,
      closureStore,
    );
    // direct lead is more permissive than inherited viewer → lead wins
    expect(effectiveRole).toBe('lead');
  });

  it('effective role: inherited role wins over less permissive direct assignment', async () => {
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('Organization', 'org-1');
    await closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    await roleStore.assign('user-1', 'Organization', 'org-1', 'admin'); // inherits editor
    await roleStore.assign('user-1', 'Team', 'team-1', 'viewer'); // direct viewer

    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'Team',
      'team-1',
      accessDef,
      closureStore,
    );
    // inherited editor is more permissive than direct viewer → editor wins
    expect(effectiveRole).toBe('editor');
  });

  it('effective role returns null when no roles assigned', async () => {
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('Organization', 'org-1');

    const roleStore = new InMemoryRoleAssignmentStore();

    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'Organization',
      'org-1',
      accessDef,
      closureStore,
    );
    expect(effectiveRole).toBeNull();
  });

  it('effective role resolves through multiple inheritance levels', async () => {
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('Organization', 'org-1');
    await closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });
    await closureStore.addResource('Project', 'proj-1', {
      parentType: 'Team',
      parentId: 'team-1',
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'Project',
      'proj-1',
      accessDef,
      closureStore,
    );
    // admin on Org → editor on Team → contributor on Project
    expect(effectiveRole).toBe('contributor');
  });

  it('dispose clears all assignments', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'Organization', 'org-1', 'admin');
    store.dispose();

    const roles = await store.getRoles('user-1', 'Organization', 'org-1');
    expect(roles).toEqual([]);
  });

  it('getRolesForUser returns all assignments for a user', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'Organization', 'org-1', 'admin');
    await store.assign('user-1', 'Team', 'team-1', 'lead');
    await store.assign('user-2', 'Organization', 'org-1', 'member');

    const assignments = await store.getRolesForUser('user-1');
    expect(assignments).toHaveLength(2);
    expect(assignments).toContainEqual({
      userId: 'user-1',
      resourceType: 'Organization',
      resourceId: 'org-1',
      role: 'admin',
    });
    expect(assignments).toContainEqual({
      userId: 'user-1',
      resourceType: 'Team',
      resourceId: 'team-1',
      role: 'lead',
    });
  });

  it('getRolesForUser returns empty array for unknown user', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'Organization', 'org-1', 'admin');

    const assignments = await store.getRolesForUser('user-999');
    expect(assignments).toEqual([]);
  });
});
