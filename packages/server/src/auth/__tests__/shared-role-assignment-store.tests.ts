/**
 * Shared test factory for RoleAssignmentStore behavioral parity.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { RoleAssignmentStore } from '../role-assignment-store';

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
  });
}
