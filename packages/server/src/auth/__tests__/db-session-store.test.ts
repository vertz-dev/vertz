import { DbSessionStore } from '../db-session-store';
import { InMemorySessionStore } from '../session-store';
import { sessionStoreTests } from './shared-session-store.tests';
import { createTestDb } from './test-db-helper';

// Run shared tests against InMemorySessionStore
sessionStoreTests('InMemory', async () => ({
  store: new InMemorySessionStore(),
  cleanup: async () => {},
}));

// Run shared tests against DbSessionStore (SQLite)
sessionStoreTests('SQLite', async () => {
  const testDb = await createTestDb();
  return {
    store: new DbSessionStore(testDb.db),
    cleanup: testDb.cleanup,
  };
});
