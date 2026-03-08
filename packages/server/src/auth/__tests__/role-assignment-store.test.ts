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
  it('assigns a role to a user on a resource', () => {
    const store = new InMemoryRoleAssignmentStore();
    store.assign('user-1', 'Organization', 'org-1', 'admin');

    const roles = store.getRoles('user-1', 'Organization', 'org-1');
    expect(roles).toEqual(['admin']);
  });

  it('revokes a role from a user on a resource', () => {
    const store = new InMemoryRoleAssignmentStore();
    store.assign('user-1', 'Organization', 'org-1', 'admin');
    store.revoke('user-1', 'Organization', 'org-1', 'admin');

    const roles = store.getRoles('user-1', 'Organization', 'org-1');
    expect(roles).toEqual([]);
  });

  it('supports multiple roles on same resource', () => {
    const store = new InMemoryRoleAssignmentStore();
    store.assign('user-1', 'Organization', 'org-1', 'admin');
    store.assign('user-1', 'Organization', 'org-1', 'member');

    const roles = store.getRoles('user-1', 'Organization', 'org-1');
    expect(roles).toContain('admin');
    expect(roles).toContain('member');
    expect(roles).toHaveLength(2);
  });

  it('does not duplicate role assignments', () => {
    const store = new InMemoryRoleAssignmentStore();
    store.assign('user-1', 'Organization', 'org-1', 'admin');
    store.assign('user-1', 'Organization', 'org-1', 'admin');

    const roles = store.getRoles('user-1', 'Organization', 'org-1');
    expect(roles).toEqual(['admin']);
  });

  it('computes effective role with inheritance (most permissive wins)', () => {
    const closureStore = new InMemoryClosureStore();
    closureStore.addResource('Organization', 'org-1');
    closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

    const effectiveRole = roleStore.getEffectiveRole(
      'user-1',
      'Team',
      'team-1',
      accessDef,
      closureStore,
    );
    // admin on Org inherits to editor on Team
    expect(effectiveRole).toBe('editor');
  });

  it('effective role: direct assignment wins over less permissive inherited role', () => {
    const closureStore = new InMemoryClosureStore();
    closureStore.addResource('Organization', 'org-1');
    closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    roleStore.assign('user-1', 'Organization', 'org-1', 'member'); // inherits viewer
    roleStore.assign('user-1', 'Team', 'team-1', 'lead'); // direct lead

    const effectiveRole = roleStore.getEffectiveRole(
      'user-1',
      'Team',
      'team-1',
      accessDef,
      closureStore,
    );
    // direct lead is more permissive than inherited viewer → lead wins
    expect(effectiveRole).toBe('lead');
  });

  it('effective role: inherited role wins over less permissive direct assignment', () => {
    const closureStore = new InMemoryClosureStore();
    closureStore.addResource('Organization', 'org-1');
    closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    roleStore.assign('user-1', 'Organization', 'org-1', 'admin'); // inherits editor
    roleStore.assign('user-1', 'Team', 'team-1', 'viewer'); // direct viewer

    const effectiveRole = roleStore.getEffectiveRole(
      'user-1',
      'Team',
      'team-1',
      accessDef,
      closureStore,
    );
    // inherited editor is more permissive than direct viewer → editor wins
    expect(effectiveRole).toBe('editor');
  });

  it('effective role returns null when no roles assigned', () => {
    const closureStore = new InMemoryClosureStore();
    closureStore.addResource('Organization', 'org-1');

    const roleStore = new InMemoryRoleAssignmentStore();

    const effectiveRole = roleStore.getEffectiveRole(
      'user-1',
      'Organization',
      'org-1',
      accessDef,
      closureStore,
    );
    expect(effectiveRole).toBeNull();
  });

  it('effective role resolves through multiple inheritance levels', () => {
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

    const roleStore = new InMemoryRoleAssignmentStore();
    roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

    const effectiveRole = roleStore.getEffectiveRole(
      'user-1',
      'Project',
      'proj-1',
      accessDef,
      closureStore,
    );
    // admin on Org → editor on Team → contributor on Project
    expect(effectiveRole).toBe('contributor');
  });

  it('dispose clears all assignments', () => {
    const store = new InMemoryRoleAssignmentStore();
    store.assign('user-1', 'Organization', 'org-1', 'admin');
    store.dispose();

    const roles = store.getRoles('user-1', 'Organization', 'org-1');
    expect(roles).toEqual([]);
  });
});
