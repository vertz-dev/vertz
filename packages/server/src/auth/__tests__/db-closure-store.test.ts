import { InMemoryClosureStore } from '../closure-store';
import { DbClosureStore } from '../db-closure-store';
import { closureStoreTests } from './shared-closure-store.tests';
import { createTestDb } from './test-db-helper';

closureStoreTests('InMemory', async () => ({
  store: new InMemoryClosureStore(),
  cleanup: async () => {},
}));

closureStoreTests('SQLite', async () => {
  const testDb = await createTestDb();
  return {
    store: new DbClosureStore(testDb.db),
    cleanup: testDb.cleanup,
  };
});
