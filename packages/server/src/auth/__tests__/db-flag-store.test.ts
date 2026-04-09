import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
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
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    await testDb.db.query(
      sql`INSERT INTO auth_flags (id, resource_type, resource_id, flag, enabled) VALUES (${id1}, ${'tenant'}, ${'org-1'}, ${'beta'}, ${1})`,
    );
    await testDb.db.query(
      sql`INSERT INTO auth_flags (id, resource_type, resource_id, flag, enabled) VALUES (${id2}, ${'tenant'}, ${'org-1'}, ${'alpha'}, ${0})`,
    );

    await store.loadFlags();

    expect(store.getFlag('tenant', 'org-1', 'beta')).toBe(true);
    expect(store.getFlag('tenant', 'org-1', 'alpha')).toBe(false);
  });

  it('hydrates flags for multiple resources', async () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    await testDb.db.query(
      sql`INSERT INTO auth_flags (id, resource_type, resource_id, flag, enabled) VALUES (${id1}, ${'tenant'}, ${'org-1'}, ${'feat'}, ${1})`,
    );
    await testDb.db.query(
      sql`INSERT INTO auth_flags (id, resource_type, resource_id, flag, enabled) VALUES (${id2}, ${'tenant'}, ${'org-2'}, ${'feat'}, ${0})`,
    );

    await store.loadFlags();

    expect(store.getFlag('tenant', 'org-1', 'feat')).toBe(true);
    expect(store.getFlag('tenant', 'org-2', 'feat')).toBe(false);
  });

  it('hydrates flags for different resource types', async () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    await testDb.db.query(
      sql`INSERT INTO auth_flags (id, resource_type, resource_id, flag, enabled) VALUES (${id1}, ${'account'}, ${'id-1'}, ${'beta'}, ${1})`,
    );
    await testDb.db.query(
      sql`INSERT INTO auth_flags (id, resource_type, resource_id, flag, enabled) VALUES (${id2}, ${'project'}, ${'id-1'}, ${'beta'}, ${0})`,
    );

    await store.loadFlags();

    expect(store.getFlag('account', 'id-1', 'beta')).toBe(true);
    expect(store.getFlag('project', 'id-1', 'beta')).toBe(false);
  });

  it('clears old cache before loading', async () => {
    const id = crypto.randomUUID();
    await testDb.db.query(
      sql`INSERT INTO auth_flags (id, resource_type, resource_id, flag, enabled) VALUES (${id}, ${'tenant'}, ${'org-1'}, ${'old-flag'}, ${1})`,
    );
    await store.loadFlags();
    expect(store.getFlag('tenant', 'org-1', 'old-flag')).toBe(true);

    await testDb.db.query(
      sql`DELETE FROM auth_flags WHERE resource_type = ${'tenant'} AND resource_id = ${'org-1'} AND flag = ${'old-flag'}`,
    );

    await store.loadFlags();

    expect(store.getFlag('tenant', 'org-1', 'old-flag')).toBe(false);
  });

  it('persists with ON CONFLICT on (resource_type, resource_id, flag) triple', async () => {
    store.setFlag('tenant', 'org-1', 'beta', true);
    // Wait for fire-and-forget to complete
    await new Promise((r) => setTimeout(r, 50));

    store.setFlag('tenant', 'org-1', 'beta', false);
    await new Promise((r) => setTimeout(r, 50));

    // Reload from DB to verify upsert worked
    const freshStore = new DbFlagStore(testDb.db);
    await freshStore.loadFlags();
    expect(freshStore.getFlag('tenant', 'org-1', 'beta')).toBe(false);
  });
});
