import { DbPlanStore } from '../db-plan-store';
import { InMemoryPlanStore } from '../plan-store';
import { planStoreTests } from './shared-plan-store.tests';
import { createTestDb } from './test-db-helper';

planStoreTests('InMemory', async () => ({
  store: new InMemoryPlanStore(),
  cleanup: async () => {},
}));

planStoreTests('SQLite', async () => {
  const testDb = await createTestDb();
  return {
    store: new DbPlanStore(testDb.db),
    cleanup: testDb.cleanup,
  };
});
