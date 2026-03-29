import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { d } from '@vertz/db';
import type { TenantLevel } from '@vertz/db/client';
import { unwrap } from '@vertz/errors';
import { InMemoryClosureStore } from '../../auth/closure-store';
import { entity } from '../entity';
import { createCrudHandlers } from '../crud-pipeline';
import { createEntityContext } from '../context';

// ---------------------------------------------------------------------------
// Fixtures: 3-level tenant hierarchy (account -> project -> customer_tenant)
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

const customerTenantsTable = d
  .table('customer_tenants', {
    id: d.uuid().primary(),
    projectId: d.uuid(),
    name: d.text(),
  })
  .tenant();

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  projectId: d.uuid(),
  title: d.text(),
});

const accountsModel = d.model(accountsTable);
const projectsModel = d.model(projectsTable, {
  account: d.ref.one(() => accountsTable, 'accountId'),
});
const customerTenantsModel = d.model(customerTenantsTable, {
  project: d.ref.one(() => projectsTable, 'projectId'),
});
const tasksModel = d.model(tasksTable, {
  project: d.ref.one(() => projectsTable, 'projectId'),
});

// Tenant levels matching the 3-level hierarchy
const tenantLevels: readonly TenantLevel[] = [
  { key: 'account', tableName: 'accounts', parentFk: null, parentKey: null, depth: 0 },
  { key: 'project', tableName: 'projects', parentFk: 'accountId', parentKey: 'account', depth: 1 },
  {
    key: 'customer_tenant',
    tableName: 'customer_tenants',
    parentFk: 'projectId',
    parentKey: 'project',
    depth: 2,
  },
];

// ---------------------------------------------------------------------------
// Stub DB
// ---------------------------------------------------------------------------

function createStubDb(defaults: Record<string, unknown> = {}) {
  return {
    get: mock(async () => null),
    list: mock(async () => ({ data: [], total: 0 })),
    create: mock(async (data: Record<string, unknown>) => ({
      id: 'new-id',
      ...defaults,
      ...data,
    })),
    update: mock(async () => ({})),
    delete: mock(async () => null),
  };
}

// ---------------------------------------------------------------------------
// Context helper
// ---------------------------------------------------------------------------

function makeCtx(overrides: Record<string, unknown> = {}) {
  return createEntityContext(
    {
      userId: 'user-1',
      tenantId: 'acct-1',
      roles: [],
      ...overrides,
    },
    {},
  );
}

// ==========================================================================
// Tests
// ==========================================================================

describe('Feature: Closure table auto-population', () => {
  let closureStore: InMemoryClosureStore;

  beforeEach(() => {
    closureStore = new InMemoryClosureStore();
  });

  describe('Given a 2-level hierarchy (account -> project) with closure store', () => {
    describe('When a project is created via CRUD pipeline', () => {
      it('Then closureStore has self-reference for the new project', async () => {
        // Account must exist in closure store so addResource can build ancestry
        await closureStore.addResource('account', 'acct-1');

        const def = entity('projects', {
          model: projectsModel,
          access: { create: () => true },
        });

        const db = createStubDb();
        db.create = mock(async (data: Record<string, unknown>) => ({
          id: 'proj-1',
          accountId: 'acct-1',
          name: 'My Project',
          ...data,
        }));

        const handlers = createCrudHandlers(def, db, {
          closureStore,
          tenantLevels,
        });

        const ctx = makeCtx({ tenantId: 'acct-1' });
        unwrap(await handlers.create(ctx, { accountId: 'acct-1', name: 'My Project' }));

        const ancestors = await closureStore.getAncestors('project', 'proj-1');
        const selfRef = ancestors.find(
          (a) => a.type === 'project' && a.id === 'proj-1' && a.depth === 0,
        );
        expect(selfRef).toBeDefined();
      });

      it('Then closureStore has entry: project -> account (depth 1)', async () => {
        // Account must exist in closure store so addResource can build ancestry
        await closureStore.addResource('account', 'acct-1');

        const def = entity('projects', {
          model: projectsModel,
          access: { create: () => true },
        });

        const db = createStubDb();
        db.create = mock(async (data: Record<string, unknown>) => ({
          id: 'proj-1',
          accountId: 'acct-1',
          name: 'My Project',
          ...data,
        }));

        const handlers = createCrudHandlers(def, db, {
          closureStore,
          tenantLevels,
        });

        const ctx = makeCtx({ tenantId: 'acct-1' });
        unwrap(await handlers.create(ctx, { accountId: 'acct-1', name: 'My Project' }));

        const ancestors = await closureStore.getAncestors('project', 'proj-1');
        const accountEntry = ancestors.find(
          (a) => a.type === 'account' && a.id === 'acct-1' && a.depth === 1,
        );
        expect(accountEntry).toBeDefined();
      });
    });
  });

  describe('Given a root tenant (account) created via CRUD pipeline', () => {
    it('Then closureStore has self-reference only (no parent)', async () => {
      const def = entity('accounts', {
        model: accountsModel,
        access: { create: () => true },
      });

      const db = createStubDb();
      db.create = mock(async (data: Record<string, unknown>) => ({
        id: 'acct-1',
        name: 'My Account',
        ...data,
      }));

      const handlers = createCrudHandlers(def, db, {
        closureStore,
        tenantLevels,
      });

      const ctx = makeCtx({ tenantId: null });
      unwrap(await handlers.create(ctx, { name: 'My Account' }));

      const ancestors = await closureStore.getAncestors('account', 'acct-1');
      // Should have self-reference only (depth 0)
      expect(ancestors).toHaveLength(1);
      expect(ancestors[0]!.type).toBe('account');
      expect(ancestors[0]!.id).toBe('acct-1');
      expect(ancestors[0]!.depth).toBe(0);
    });
  });

  describe('Given a 3-level hierarchy', () => {
    describe('When customer_tenant is created', () => {
      it('Then closureStore has entries at depth 1 and depth 2', async () => {
        // Pre-populate: account -> project already in closure store
        await closureStore.addResource('account', 'acct-1');
        await closureStore.addResource('project', 'proj-1', {
          parentType: 'account',
          parentId: 'acct-1',
        });

        const def = entity('customer-tenants', {
          model: customerTenantsModel,
          access: { create: () => true },
        });

        const db = createStubDb();
        db.create = mock(async (data: Record<string, unknown>) => ({
          id: 'ct-1',
          projectId: 'proj-1',
          name: 'Customer Tenant',
          ...data,
        }));

        const handlers = createCrudHandlers(def, db, {
          closureStore,
          tenantLevels,
        });

        const ctx = makeCtx({ tenantId: 'proj-1' });
        unwrap(await handlers.create(ctx, { projectId: 'proj-1', name: 'Customer Tenant' }));

        const ancestors = await closureStore.getAncestors('customer_tenant', 'ct-1');
        // Self (depth 0), project (depth 1), account (depth 2)
        expect(ancestors).toHaveLength(3);

        const projectEntry = ancestors.find((a) => a.type === 'project' && a.id === 'proj-1');
        expect(projectEntry).toBeDefined();
        expect(projectEntry!.depth).toBe(1);

        const accountEntry = ancestors.find((a) => a.type === 'account' && a.id === 'acct-1');
        expect(accountEntry).toBeDefined();
        expect(accountEntry!.depth).toBe(2);
      });
    });
  });

  describe('Given a non-tenant entity created', () => {
    it('Then closureStore is NOT called', async () => {
      const def = entity('tasks', {
        model: tasksModel,
        access: { create: () => true },
      });

      const db = createStubDb();
      db.create = mock(async (data: Record<string, unknown>) => ({
        id: 'task-1',
        projectId: 'proj-1',
        title: 'My Task',
        ...data,
      }));

      const addResourceSpy = spyOn(closureStore, 'addResource');

      const handlers = createCrudHandlers(def, db, {
        closureStore,
        tenantLevels,
      });

      const ctx = makeCtx({ tenantId: 'proj-1' });
      unwrap(await handlers.create(ctx, { projectId: 'proj-1', title: 'My Task' }));

      expect(addResourceSpy).not.toHaveBeenCalled();
    });
  });

  describe('Given a non-root tenant entity created without parent FK', () => {
    it('Then logs a warning and does NOT call closureStore', async () => {
      const def = entity('projects', {
        model: projectsModel,
        access: { create: () => true },
      });

      const db = createStubDb();
      // Result does NOT include accountId (parent FK)
      db.create = mock(async (data: Record<string, unknown>) => ({
        id: 'proj-1',
        name: 'Orphan Project',
        ...data,
      }));

      const addResourceSpy = spyOn(closureStore, 'addResource');
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const handlers = createCrudHandlers(def, db, {
        closureStore,
        tenantLevels,
      });

      // tenantId: null prevents the CRUD pipeline from auto-setting accountId
      const ctx = makeCtx({ tenantId: null });
      // Not passing accountId in data — simulates missing parent FK
      const result = await handlers.create(ctx, { name: 'Orphan Project' });

      // Entity should still be created
      expect(result.ok).toBe(true);
      // closureStore should NOT be called (no parent to link)
      expect(addResourceSpy).not.toHaveBeenCalled();
      // Warning should be logged
      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = warnSpy.mock.calls[0]![0] as string;
      expect(warnMsg).toContain('Tenant entity');
      expect(warnMsg).toContain('without parent FK');

      warnSpy.mockRestore();
    });
  });

  describe('Given closureStore.addResource throws', () => {
    it('Then entity is still created successfully', async () => {
      const def = entity('projects', {
        model: projectsModel,
        access: { create: () => true },
      });

      const db = createStubDb();
      db.create = mock(async (data: Record<string, unknown>) => ({
        id: 'proj-1',
        accountId: 'acct-1',
        name: 'My Project',
        ...data,
      }));

      // Make closureStore throw on addResource
      const failingClosureStore = new InMemoryClosureStore();
      spyOn(failingClosureStore, 'addResource').mockRejectedValue(new Error('DB connection lost'));
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const handlers = createCrudHandlers(def, db, {
        closureStore: failingClosureStore,
        tenantLevels,
      });

      const ctx = makeCtx({ tenantId: 'acct-1' });
      const result = await handlers.create(ctx, {
        accountId: 'acct-1',
        name: 'My Project',
      });

      // Entity creation should succeed despite closure store failure
      expect(result.ok).toBe(true);
      // Warning should be logged
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('Then a warning is logged', async () => {
      const def = entity('projects', {
        model: projectsModel,
        access: { create: () => true },
      });

      const db = createStubDb();
      db.create = mock(async (data: Record<string, unknown>) => ({
        id: 'proj-1',
        accountId: 'acct-1',
        name: 'My Project',
        ...data,
      }));

      const failingClosureStore = new InMemoryClosureStore();
      spyOn(failingClosureStore, 'addResource').mockRejectedValue(new Error('DB connection lost'));
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const handlers = createCrudHandlers(def, db, {
        closureStore: failingClosureStore,
        tenantLevels,
      });

      const ctx = makeCtx({ tenantId: 'acct-1' });
      await handlers.create(ctx, { accountId: 'acct-1', name: 'My Project' });

      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = warnSpy.mock.calls[0]![0] as string;
      expect(warnMsg).toContain('Failed to populate closure table');

      warnSpy.mockRestore();
    });
  });

  describe('Given closureStore.addResource throws for a root tenant entity', () => {
    it('Then entity is still created successfully', async () => {
      const def = entity('accounts', {
        model: accountsModel,
        access: { create: () => true },
      });

      const db = createStubDb();
      db.create = mock(async (data: Record<string, unknown>) => ({
        id: 'acct-fail',
        name: 'Failing Account',
        ...data,
      }));

      const failingClosureStore = new InMemoryClosureStore();
      spyOn(failingClosureStore, 'addResource').mockRejectedValue(new Error('DB connection lost'));
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const handlers = createCrudHandlers(def, db, {
        closureStore: failingClosureStore,
        tenantLevels,
      });

      const ctx = makeCtx({ tenantId: null });
      const result = await handlers.create(ctx, { name: 'Failing Account' });

      expect(result.ok).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = warnSpy.mock.calls[0]![0] as string;
      expect(warnMsg).toContain('Failed to populate closure table for root');

      warnSpy.mockRestore();
    });
  });

  describe('Given no closureStore provided (single-level backward compat)', () => {
    it('Then entity creation works without closure population', async () => {
      const def = entity('projects', {
        model: projectsModel,
        access: { create: () => true },
      });

      const db = createStubDb();
      db.create = mock(async (data: Record<string, unknown>) => ({
        id: 'proj-1',
        accountId: 'acct-1',
        name: 'My Project',
        ...data,
      }));

      // No closureStore in options
      const handlers = createCrudHandlers(def, db, {});

      const ctx = makeCtx({ tenantId: 'acct-1' });
      const result = await handlers.create(ctx, {
        accountId: 'acct-1',
        name: 'My Project',
      });

      expect(result.ok).toBe(true);
    });
  });
});
