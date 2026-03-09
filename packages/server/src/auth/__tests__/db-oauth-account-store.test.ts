import { DbOAuthAccountStore } from '../db-oauth-account-store';
import { InMemoryOAuthAccountStore } from '../oauth-account-store';
import { oauthAccountStoreTests } from './shared-oauth-account-store.tests';
import { createTestDb } from './test-db-helper';

oauthAccountStoreTests('InMemory', async () => ({
  store: new InMemoryOAuthAccountStore(),
  cleanup: async () => {},
}));

oauthAccountStoreTests('SQLite', async () => {
  const testDb = await createTestDb();
  return {
    store: new DbOAuthAccountStore(testDb.db),
    cleanup: testDb.cleanup,
  };
});
