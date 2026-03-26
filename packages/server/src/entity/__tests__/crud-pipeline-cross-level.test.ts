import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { d } from '@vertz/db';
import type { TenantLevel } from '@vertz/db';
import { InMemoryClosureStore } from '../../auth/closure-store';
import { entity } from '../entity';
import { createCrudHandlers } from '../crud-pipeline';
import { createEntityContext } from '../context';

// ---------------------------------------------------------------------------
// Fixtures: 2-level hierarchy (account -> project)
// Entity 'settings' is scoped to account (has accountId FK to .tenant() table)
// ---------------------------------------------------------------------------

const accountsTable = d
  .table('accounts', {
    id: d.uuid().primary(),
    name: d.text(),
  })
  .tenant();

const projectsTable = d
  .table('projects', {
    id: d.uuid().primary(),
    accountId: d.uuid(),
    name: d.text(),
  })
  .tenant();

// Settings entity — scoped to account level via accountId FK
const settingsTable = d.table('settings', {
  id: d.uuid().primary(),
  accountId: d.uuid(),
  key: d.text(),
  value: d.text(),
});

const settingsModel = d.model(settingsTable, {
  account: d.ref.one(() => accountsTable, 'accountId'),
});

const tenantLevels: readonly TenantLevel[] = [
  { key: 'account', tableName: 'accounts', parentFk: null, parentKey: null, depth: 0 },
  {
    key: 'project',
    tableName: 'projects',
    parentFk: 'accountId',
    parentKey: 'account',
    depth: 1,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubDb() {
  return {
    get: mock(async () => null),
    list: mock(async () => ({ data: [], total: 0 })),
    create: mock(async (data: Record<string, unknown>) => ({
      id: 'new-id',
      ...data,
    })),
    update: mock(async () => ({})),
    delete: mock(async () => null),
  };
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  return createEntityContext(
    {
      userId: 'user-1',
      tenantId: 'proj-1',
      tenantLevel: 'project',
      roles: [],
      ...overrides,
    },
    {},
  );
}

// ==========================================================================
// Tests
// ==========================================================================

describe('Feature: Level-aware tenant filtering', () => {
  let closureStore: InMemoryClosureStore;

  beforeEach(async () => {
    closureStore = new InMemoryClosureStore();
    await closureStore.addResource('account', 'acct-1');
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'account',
      parentId: 'acct-1',
    });
  });

  describe('Given entity scoped to account, user scoped to project (child)', () => {
    it('Then list filters by accountId resolved from ancestor chain', async () => {
      const def = entity('settings', {
        model: settingsModel,
        access: { list: () => true },
      });

      const db = createStubDb();
      const handlers = createCrudHandlers(def, db, {
        closureStore,
        tenantLevels,
      });

      const ctx = makeCtx({ tenantId: 'proj-1', tenantLevel: 'project' });
      await handlers.list(ctx);

      // db.list is called with { where, orderBy, limit, after, include }
      expect(db.list).toHaveBeenCalledTimes(1);
      const listOpts = db.list.mock.calls[0]![0] as Record<string, unknown>;
      const where = listOpts.where as Record<string, unknown>;
      // Should use ancestor account ID, NOT the current project tenantId
      expect(where.accountId).toBe('acct-1');
    });
  });

  describe('Given entity scoped to project, user scoped to project (same level)', () => {
    it('Then list filters by projectId = ctx.tenantId (existing behavior)', async () => {
      const tasksTable = d.table('tasks', {
        id: d.uuid().primary(),
        projectId: d.uuid(),
        title: d.text(),
      });
      const tasksModel = d.model(tasksTable, {
        project: d.ref.one(() => projectsTable, 'projectId'),
      });

      const def = entity('tasks', {
        model: tasksModel,
        access: { list: () => true },
      });

      const db = createStubDb();
      const handlers = createCrudHandlers(def, db, {
        closureStore,
        tenantLevels,
      });

      const ctx = makeCtx({ tenantId: 'proj-1', tenantLevel: 'project' });
      await handlers.list(ctx);

      expect(db.list).toHaveBeenCalledTimes(1);
      const listOpts = db.list.mock.calls[0]![0] as Record<string, unknown>;
      const where = listOpts.where as Record<string, unknown>;
      expect(where.projectId).toBe('proj-1');
    });
  });

  describe('Given single-level tenancy (no tenantLevel in context)', () => {
    it('Then behavior is identical to pre-multi-level', async () => {
      const def = entity('settings', {
        model: settingsModel,
        access: { list: () => true },
      });

      const db = createStubDb();
      // No closureStore/tenantLevels — single level
      const handlers = createCrudHandlers(def, db, {});

      const ctx = makeCtx({ tenantId: 'acct-1', tenantLevel: undefined });
      await handlers.list(ctx);

      expect(db.list).toHaveBeenCalledTimes(1);
      const listOpts = db.list.mock.calls[0]![0] as Record<string, unknown>;
      const where = listOpts.where as Record<string, unknown>;
      expect(where.accountId).toBe('acct-1');
    });
  });
});
