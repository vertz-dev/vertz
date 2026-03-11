import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from '@vertz/db/sql';
import { DbPlanStore } from '../db-plan-store';
import { InMemoryPlanStore } from '../plan-store';
import { planStoreTests } from './shared-plan-store.tests';
import { createTestDb, type TestDb } from './test-db-helper';

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

// ---------------------------------------------------------------------------
// Failure injection tests — verify transaction atomicity in DbPlanStore
// ---------------------------------------------------------------------------

describe('DbPlanStore transaction atomicity', () => {
  let testDb: TestDb;
  let store: DbPlanStore;

  beforeEach(async () => {
    testDb = await createTestDb();
    store = new DbPlanStore(testDb.db);
  });

  afterEach(async () => {
    store.dispose();
    await testDb.cleanup();
  });

  describe('assignPlan() rollback', () => {
    it('rolls back plan upsert when override clear fails', async () => {
      // Set up existing plan with overrides
      await store.assignPlan('org-1', 'free');
      await store.updateOverrides('org-1', { 'project:create': { max: 100 } });

      // Inject failure at the raw SQLite level: intercept prepare() to fail on DELETE FROM auth_overrides
      const origPrepare = testDb.rawDb.prepare.bind(testDb.rawDb);
      let deleteOverrideCallCount = 0;
      testDb.rawDb.prepare = ((sqlStr: string) => {
        if (sqlStr.includes('DELETE FROM auth_overrides') && deleteOverrideCallCount++ === 0) {
          throw new Error('Injected failure: override clear');
        }
        return origPrepare(sqlStr);
      }) as typeof testDb.rawDb.prepare;

      // assignPlan should fail
      await expect(store.assignPlan('org-1', 'pro')).rejects.toThrow('Injected failure');

      // Restore original
      testDb.rawDb.prepare = origPrepare;

      // Plan should remain unchanged (rolled back)
      const plan = await store.getPlan('org-1');
      expect(plan).not.toBeNull();
      expect(plan!.planId).toBe('free');
      expect(plan!.overrides).toEqual({ 'project:create': { max: 100 } });
    });
  });

  describe('removePlan() rollback', () => {
    it('rolls back plan delete when override delete fails', async () => {
      // Set up existing plan with overrides
      await store.assignPlan('org-1', 'free');
      await store.updateOverrides('org-1', { 'project:create': { max: 100 } });

      // Inject failure: make DELETE FROM auth_overrides fail at SQLite level
      const origPrepare = testDb.rawDb.prepare.bind(testDb.rawDb);
      testDb.rawDb.prepare = ((sqlStr: string) => {
        if (sqlStr.includes('DELETE FROM auth_overrides')) {
          throw new Error('Injected failure: override delete');
        }
        return origPrepare(sqlStr);
      }) as typeof testDb.rawDb.prepare;

      // removePlan should fail
      await expect(store.removePlan('org-1')).rejects.toThrow('Injected failure');

      // Restore original
      testDb.rawDb.prepare = origPrepare;

      // Plan should remain unchanged (rolled back)
      const plan = await store.getPlan('org-1');
      expect(plan).not.toBeNull();
      expect(plan!.planId).toBe('free');
    });
  });

  describe('updateOverrides() rollback', () => {
    it('rolls back when override write fails', async () => {
      // Set up existing plan with overrides
      await store.assignPlan('org-1', 'free');
      await store.updateOverrides('org-1', { 'project:create': { max: 100 } });

      // Inject failure: make UPDATE auth_overrides fail at SQLite level
      const origPrepare = testDb.rawDb.prepare.bind(testDb.rawDb);
      testDb.rawDb.prepare = ((sqlStr: string) => {
        if (sqlStr.includes('UPDATE auth_overrides')) {
          throw new Error('Injected failure: override update');
        }
        return origPrepare(sqlStr);
      }) as typeof testDb.rawDb.prepare;

      // updateOverrides should fail
      await expect(store.updateOverrides('org-1', { 'api:call': { max: 5000 } })).rejects.toThrow(
        'Injected failure',
      );

      // Restore original
      testDb.rawDb.prepare = origPrepare;

      // Overrides should remain unchanged (rolled back)
      const plan = await store.getPlan('org-1');
      expect(plan).not.toBeNull();
      expect(plan!.overrides).toEqual({ 'project:create': { max: 100 } });
    });
  });
});
