import { DbRoleAssignmentStore } from '../db-role-assignment-store';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import { roleAssignmentStoreTests } from './shared-role-assignment-store.tests';
import { createTestDb } from './test-db-helper';

roleAssignmentStoreTests('InMemory', async () => ({
  store: new InMemoryRoleAssignmentStore(),
  cleanup: async () => {},
}));

roleAssignmentStoreTests('SQLite', async () => {
  const testDb = await createTestDb();
  return {
    store: new DbRoleAssignmentStore(testDb.db),
    cleanup: testDb.cleanup,
  };
});
