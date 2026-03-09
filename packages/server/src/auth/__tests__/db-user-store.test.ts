import { DbUserStore } from '../db-user-store';
import { InMemoryUserStore } from '../user-store';
import { userStoreTests } from './shared-user-store.tests';
import { createTestDb } from './test-db-helper';

// Run shared tests against InMemoryUserStore
userStoreTests('InMemory', async () => ({
  store: new InMemoryUserStore(),
  cleanup: async () => {},
}));

// Run shared tests against DbUserStore (SQLite)
userStoreTests('SQLite', async () => {
  const testDb = await createTestDb();
  return {
    store: new DbUserStore(testDb.db),
    cleanup: testDb.cleanup,
  };
});
