import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from '@vertz/db/sql';
import { DbFlagStore } from '../db-flag-store';
import { InMemoryFlagStore } from '../flag-store';
import { flagStoreTests } from './shared-flag-store.tests';
import type { TestDb } from './test-db-helper';
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

describe('DbFlagStore.loadFlags()', () => {
  let testDb: TestDb;
  let store: DbFlagStore;

  beforeEach(async () => {
    testDb = await createTestDb();
    store = new DbFlagStore(testDb.db);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('hydrates cache from DB rows', async () => {
    // Insert flags directly into the DB
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    await testDb.db.query(
      sql`INSERT INTO auth_flags (id, tenant_id, flag, enabled) VALUES (${id1}, ${'org-1'}, ${'beta'}, ${1})`,
    );
    await testDb.db.query(
      sql`INSERT INTO auth_flags (id, tenant_id, flag, enabled) VALUES (${id2}, ${'org-1'}, ${'alpha'}, ${0})`,
    );

    await store.loadFlags();

    expect(store.getFlag('org-1', 'beta')).toBe(true);
    expect(store.getFlag('org-1', 'alpha')).toBe(false);
  });

  it('hydrates flags for multiple tenants', async () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    await testDb.db.query(
      sql`INSERT INTO auth_flags (id, tenant_id, flag, enabled) VALUES (${id1}, ${'org-1'}, ${'feat'}, ${1})`,
    );
    await testDb.db.query(
      sql`INSERT INTO auth_flags (id, tenant_id, flag, enabled) VALUES (${id2}, ${'org-2'}, ${'feat'}, ${0})`,
    );

    await store.loadFlags();

    expect(store.getFlag('org-1', 'feat')).toBe(true);
    expect(store.getFlag('org-2', 'feat')).toBe(false);
  });

  it('clears old cache before loading', async () => {
    // Insert a flag via setFlag (which persists to DB)
    store.setFlag('org-1', 'old-flag', true);

    // Wait for fire-and-forget write to complete
    await new Promise((r) => setTimeout(r, 50));

    // Delete the row from DB directly so loadFlags gets an empty set
    await testDb.db.query(
      sql`DELETE FROM auth_flags WHERE tenant_id = ${'org-1'} AND flag = ${'old-flag'}`,
    );

    // loadFlags should clear cache and reload from DB (which is now empty)
    await store.loadFlags();

    expect(store.getFlag('org-1', 'old-flag')).toBe(false);
  });
});
