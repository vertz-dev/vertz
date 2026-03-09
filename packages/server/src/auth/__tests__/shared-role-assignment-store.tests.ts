/**
 * Shared test factory for RoleAssignmentStore behavioral parity.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { InMemoryClosureStore } from '../closure-store';
import type { AccessDefinition } from '../define-access';
import type { RoleAssignmentStore } from '../role-assignment-store';

const accessDef: AccessDefinition = Object.freeze({
  hierarchy: Object.freeze(['organization', 'team', 'project']),
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
  }),
  roles: Object.freeze({
    organization: Object.freeze(['owner', 'admin', 'member']),
    team: Object.freeze(['lead', 'editor', 'viewer']),
    project: Object.freeze(['manager', 'contributor', 'viewer']),
  }),
  inheritance: Object.freeze({
    organization: Object.freeze({ owner: 'lead', admin: 'editor', member: 'viewer' }),
    team: Object.freeze({ lead: 'manager', editor: 'contributor', viewer: 'viewer' }),
  }),
  entitlements: Object.freeze({
    'project:view': Object.freeze({ roles: ['viewer', 'contributor', 'manager'] }),
    'project:edit': Object.freeze({ roles: ['contributor', 'manager'] }),
  }),
  _planGatedEntitlements: Object.freeze(new Set<string>()),
  _entitlementToLimitKeys: Object.freeze({}),
});

export function roleAssignmentStoreTests(
  name: string,
  factory: () => Promise<{ store: RoleAssignmentStore; cleanup: () => Promise<void> }>,
) {
  describe(`RoleAssignmentStore: ${name}`, () => {
    let store: RoleAssignmentStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const result = await factory();
      store = result.store;
      cleanup = result.cleanup;
    });

    afterEach(async () => {
      store.dispose();
      await cleanup();
    });

    it('assigns and retrieves a role', async () => {
      await store.assign('user-1', 'project', 'proj-1', 'admin');
      const roles = await store.getRoles('user-1', 'project', 'proj-1');
      expect(roles).toContain('admin');
    });

    it('assign is idempotent', async () => {
      await store.assign('user-1', 'project', 'proj-1', 'admin');
      await store.assign('user-1', 'project', 'proj-1', 'admin');
      const roles = await store.getRoles('user-1', 'project', 'proj-1');
      expect(roles.filter((r) => r === 'admin')).toHaveLength(1);
    });

    it('revokes a role', async () => {
      await store.assign('user-1', 'project', 'proj-1', 'admin');
      await store.revoke('user-1', 'project', 'proj-1', 'admin');
      const roles = await store.getRoles('user-1', 'project', 'proj-1');
      expect(roles).not.toContain('admin');
    });

    it('returns empty for no assignments', async () => {
      const roles = await store.getRoles('user-99', 'project', 'proj-99');
      expect(roles).toHaveLength(0);
    });

    it('gets all roles for a user', async () => {
      await store.assign('user-1', 'project', 'proj-1', 'admin');
      await store.assign('user-1', 'org', 'org-1', 'owner');
      const assignments = await store.getRolesForUser('user-1');
      expect(assignments).toHaveLength(2);
    });

    it('multiple roles on same resource', async () => {
      await store.assign('user-1', 'project', 'proj-1', 'admin');
      await store.assign('user-1', 'project', 'proj-1', 'viewer');
      const roles = await store.getRoles('user-1', 'project', 'proj-1');
      expect(roles).toHaveLength(2);
      expect(roles).toContain('admin');
      expect(roles).toContain('viewer');
    });

    // getEffectiveRole tests
    it('getEffectiveRole resolves inherited role from parent', async () => {
      const closureStore = new InMemoryClosureStore();
      await closureStore.addResource('organization', 'org-1');
      await closureStore.addResource('team', 'team-1', {
        parentType: 'organization',
        parentId: 'org-1',
      });

      await store.assign('user-1', 'organization', 'org-1', 'admin');

      const effectiveRole = await store.getEffectiveRole(
        'user-1',
        'team',
        'team-1',
        accessDef,
        closureStore,
      );
      // admin on org inherits to editor on team
      expect(effectiveRole).toBe('editor');
    });

    it('getEffectiveRole returns null when no roles assigned', async () => {
      const closureStore = new InMemoryClosureStore();
      await closureStore.addResource('organization', 'org-1');

      const effectiveRole = await store.getEffectiveRole(
        'user-1',
        'organization',
        'org-1',
        accessDef,
        closureStore,
      );
      expect(effectiveRole).toBeNull();
    });

    it('getEffectiveRole picks most permissive role (direct > inherited)', async () => {
      const closureStore = new InMemoryClosureStore();
      await closureStore.addResource('organization', 'org-1');
      await closureStore.addResource('team', 'team-1', {
        parentType: 'organization',
        parentId: 'org-1',
      });

      await store.assign('user-1', 'organization', 'org-1', 'member'); // inherits viewer
      await store.assign('user-1', 'team', 'team-1', 'lead'); // direct lead

      const effectiveRole = await store.getEffectiveRole(
        'user-1',
        'team',
        'team-1',
        accessDef,
        closureStore,
      );
      // direct lead is more permissive than inherited viewer
      expect(effectiveRole).toBe('lead');
    });

    it('getEffectiveRole resolves through multiple levels', async () => {
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

      await store.assign('user-1', 'organization', 'org-1', 'admin');

      const effectiveRole = await store.getEffectiveRole(
        'user-1',
        'project',
        'proj-1',
        accessDef,
        closureStore,
      );
      // admin on org -> editor on team -> contributor on project
      expect(effectiveRole).toBe('contributor');
    });
  });
}
