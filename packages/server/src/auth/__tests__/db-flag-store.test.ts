import { DbFlagStore } from '../db-flag-store';
import { InMemoryFlagStore } from '../flag-store';
import { flagStoreTests } from './shared-flag-store.tests';
import { createTestDb } from './test-db-helper';

flagStoreTests('InMemory', async () => ({
  store: new InMemoryFlagStore(),
  cleanup: async () => {},
}));

flagStoreTests('SQLite', async () => {
  const testDb = await createTestDb();
  return {
    store: new DbFlagStore(testDb.db),
    cleanup: testDb.cleanup,
  };
});
