import { describe, expect, it } from '@vertz/test';
import { InMemoryClosureStore } from '../closure-store';
import type { AccessDefinition } from '../define-access';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';

const accessDef: AccessDefinition = Object.freeze({
  hierarchy: Object.freeze(['organization', 'team', 'project', 'task']),
  entities: Object.freeze({
    organization: Object.freeze({ roles: Object.freeze(['owner', 'admin', 'member']) }),
    team: Object.freeze({
      roles: Object.freeze(['lead', 'editor', 'viewer']),
      inherits: Object.freeze({
        'organization:owner': 'lead',
        'organization:admin': 'editor',
        'organization:member': 'viewer',
      }),
    }),
    project: Object.freeze({
      roles: Object.freeze(['manager', 'contributor', 'viewer']),
      inherits: Object.freeze({
        'team:lead': 'manager',
        'team:editor': 'contributor',
        'team:viewer': 'viewer',
      }),
    }),
    task: Object.freeze({
      roles: Object.freeze(['assignee', 'viewer']),
      inherits: Object.freeze({
        'project:manager': 'assignee',
        'project:contributor': 'assignee',
        'project:viewer': 'viewer',
      }),
    }),
  }),
  roles: Object.freeze({
    organization: Object.freeze(['owner', 'admin', 'member']),
    team: Object.freeze(['lead', 'editor', 'viewer']),
    project: Object.freeze(['manager', 'contributor', 'viewer']),
    task: Object.freeze(['assignee', 'viewer']),
  }),
  inheritance: Object.freeze({
    organization: Object.freeze({ owner: 'lead', admin: 'editor', member: 'viewer' }),
    team: Object.freeze({ lead: 'manager', editor: 'contributor', viewer: 'viewer' }),
    project: Object.freeze({ manager: 'assignee', contributor: 'assignee', viewer: 'viewer' }),
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
    await store.assign('user-1', 'organization', 'org-1', 'admin');

    const roles = await store.getRoles('user-1', 'organization', 'org-1');
    expect(roles).toEqual(['admin']);
  });

  it('revokes a role from a user on a resource', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'organization', 'org-1', 'admin');
    await store.revoke('user-1', 'organization', 'org-1', 'admin');

    const roles = await store.getRoles('user-1', 'organization', 'org-1');
    expect(roles).toEqual([]);
  });

  it('supports multiple roles on same resource', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'organization', 'org-1', 'admin');
    await store.assign('user-1', 'organization', 'org-1', 'member');

    const roles = await store.getRoles('user-1', 'organization', 'org-1');
    expect(roles).toContain('admin');
    expect(roles).toContain('member');
    expect(roles).toHaveLength(2);
  });

  it('does not duplicate role assignments', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'organization', 'org-1', 'admin');
    await store.assign('user-1', 'organization', 'org-1', 'admin');

    const roles = await store.getRoles('user-1', 'organization', 'org-1');
    expect(roles).toEqual(['admin']);
  });

  it('computes effective role with inheritance (most permissive wins)', async () => {
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'team',
      'team-1',
      accessDef,
      closureStore,
    );
    // admin on org inherits to editor on team
    expect(effectiveRole).toBe('editor');
  });

  it('effective role: direct assignment wins over less permissive inherited role', async () => {
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    await roleStore.assign('user-1', 'organization', 'org-1', 'member'); // inherits viewer
    await roleStore.assign('user-1', 'team', 'team-1', 'lead'); // direct lead

    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'team',
      'team-1',
      accessDef,
      closureStore,
    );
    // direct lead is more permissive than inherited viewer → lead wins
    expect(effectiveRole).toBe('lead');
  });

  it('effective role: inherited role wins over less permissive direct assignment', async () => {
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin'); // inherits editor
    await roleStore.assign('user-1', 'team', 'team-1', 'viewer'); // direct viewer

    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'team',
      'team-1',
      accessDef,
      closureStore,
    );
    // inherited editor is more permissive than direct viewer → editor wins
    expect(effectiveRole).toBe('editor');
  });

  it('effective role returns null when no roles assigned', async () => {
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('organization', 'org-1');

    const roleStore = new InMemoryRoleAssignmentStore();

    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'organization',
      'org-1',
      accessDef,
      closureStore,
    );
    expect(effectiveRole).toBeNull();
  });

  it('effective role resolves through multiple inheritance levels', async () => {
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

    const roleStore = new InMemoryRoleAssignmentStore();
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'project',
      'proj-1',
      accessDef,
      closureStore,
    );
    // admin on org → editor on team → contributor on project
    expect(effectiveRole).toBe('contributor');
  });

  it('dispose clears all assignments', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'organization', 'org-1', 'admin');
    store.dispose();

    const roles = await store.getRoles('user-1', 'organization', 'org-1');
    expect(roles).toEqual([]);
  });

  it('getRolesForUser returns all assignments for a user', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'organization', 'org-1', 'admin');
    await store.assign('user-1', 'team', 'team-1', 'lead');
    await store.assign('user-2', 'organization', 'org-1', 'member');

    const assignments = await store.getRolesForUser('user-1');
    expect(assignments).toHaveLength(2);
    expect(assignments).toContainEqual({
      userId: 'user-1',
      resourceType: 'organization',
      resourceId: 'org-1',
      role: 'admin',
    });
    expect(assignments).toContainEqual({
      userId: 'user-1',
      resourceType: 'team',
      resourceId: 'team-1',
      role: 'lead',
    });
  });

  it('getRolesForUser returns empty array for unknown user', async () => {
    const store = new InMemoryRoleAssignmentStore();
    await store.assign('user-1', 'organization', 'org-1', 'admin');

    const assignments = await store.getRolesForUser('user-999');
    expect(assignments).toEqual([]);
  });
});
