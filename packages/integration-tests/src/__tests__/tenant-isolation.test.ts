// ===========================================================================
// Tenant Isolation Integration Test
//
// Validates that tenant-scoped entities properly isolate data across tenants.
// These tests exercise the full pipeline: schema → model → entity → server → HTTP
// with middleware that sets userId/tenantId on the request context.
//
// Security-critical: Cross-tenant data leakage is a vulnerability.
// ===========================================================================

import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import type { EntityDbAdapter } from '@vertz/server';
import { createMiddleware, createServer, entity, rules } from '@vertz/server';

// ---------------------------------------------------------------------------
// 1. Schema — tenant-scoped entity (has tenantId column)
// ---------------------------------------------------------------------------

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  tenantId: d.text(),
  title: d.text(),
  status: d.text().default('open'),
  createdBy: d.text(),
});

const tasksModel = d.model(tasksTable);

// ---------------------------------------------------------------------------
// 2. In-memory DB adapter with proper where filtering
// ---------------------------------------------------------------------------

function createInMemoryDb(initial: Record<string, unknown>[] = []): EntityDbAdapter {
  const store = initial.map((r) => ({ ...r }));
  return {
    async get(id) {
      return store.find((r) => r.id === id) ?? null;
    },
    async list(options?: { where?: Record<string, unknown>; limit?: number; after?: string }) {
      let result = [...store];
      const where = options?.where;
      if (where) {
        result = result.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
      }
      const total = result.length;
      if (options?.after) {
        const afterIdx = result.findIndex((r) => r.id === options.after);
        result = afterIdx >= 0 ? result.slice(afterIdx + 1) : [];
      }
      if (options?.limit !== undefined) {
        result = result.slice(0, options.limit);
      }
      return { data: result, total };
    },
    async create(data) {
      const record = { id: `id-${store.length + 1}`, ...data };
      store.push(record);
      return record;
    },
    async update(id, data) {
      const existing = store.find((r) => r.id === id);
      if (!existing) return { id, ...data };
      Object.assign(existing, data);
      return { ...existing };
    },
    async delete(id) {
      const idx = store.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      return store.splice(idx, 1)[0] ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Auth middleware — sets userId, tenantId, roles from headers
// ---------------------------------------------------------------------------

const tenantAuthMiddleware = createMiddleware({
  name: 'tenant-auth',
  handler: (ctx): Record<string, unknown> => {
    const headers = ctx.headers as Record<string, string | undefined>;
    const userId = headers['x-user-id'] ?? null;
    const tenantId = headers['x-tenant-id'] ?? null;
    const roles = headers['x-roles'] ? (headers['x-roles'] as string).split(',') : [];
    return { userId, tenantId, roles };
  },
});

// ---------------------------------------------------------------------------
// 4. Helper: make a request with tenant context
// ---------------------------------------------------------------------------

function request(
  app: ReturnType<typeof createServer>,
  method: string,
  path: string,
  options?: {
    body?: Record<string, unknown>;
    userId?: string;
    tenantId?: string;
    roles?: string[];
  },
): Promise<Response> {
  const init: RequestInit = { method, headers: {} as Record<string, string> };
  const headers = init.headers as Record<string, string>;

  if (options?.body) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  if (options?.userId) headers['x-user-id'] = options.userId;
  if (options?.tenantId) headers['x-tenant-id'] = options.tenantId;
  if (options?.roles) headers['x-roles'] = options.roles.join(',');

  return app.handler(new Request(`http://localhost${path}`, init));
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Tenant Isolation', () => {
  // Seed data: tasks belonging to two different tenants
  const seedData = [
    { id: 't1', tenantId: 'tenant-a', title: 'Task A1', status: 'open', createdBy: 'user-a1' },
    { id: 't2', tenantId: 'tenant-a', title: 'Task A2', status: 'done', createdBy: 'user-a2' },
    { id: 't3', tenantId: 'tenant-b', title: 'Task B1', status: 'open', createdBy: 'user-b1' },
    { id: 't4', tenantId: 'tenant-b', title: 'Task B2', status: 'open', createdBy: 'user-b2' },
  ];

  // -------------------------------------------------------------------------
  // Auto-detected tenant scoping (tenantId column → tenantScoped: true)
  // -------------------------------------------------------------------------

  describe('Given a tenant-scoped entity with rules.authenticated() access', () => {
    const tasksEntity = entity('tasks', {
      model: tasksModel,
      access: {
        list: rules.authenticated(),
        get: rules.authenticated(),
        create: rules.authenticated(),
        update: rules.authenticated(),
        delete: rules.authenticated(),
      },
    });

    function createApp(initial: Record<string, unknown>[] = []) {
      const db = createInMemoryDb(initial);
      return createServer({ entities: [tasksEntity], db }).middlewares([tenantAuthMiddleware]);
    }

    // --- LIST isolation ---

    describe('When tenant-a lists tasks', () => {
      it('Then only tenant-a tasks are returned', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'GET', '/api/tasks', {
          userId: 'user-a1',
          tenantId: 'tenant-a',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.items).toHaveLength(2);
        expect(body.items.every((t: Record<string, unknown>) => t.tenantId === 'tenant-a')).toBe(
          true,
        );
        expect(body.items.map((t: Record<string, unknown>) => t.title)).toEqual([
          'Task A1',
          'Task A2',
        ]);
      });

      it('Then tenant-b tasks are NOT visible', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'GET', '/api/tasks', {
          userId: 'user-a1',
          tenantId: 'tenant-a',
        });

        const body = await res.json();
        const titles = body.items.map((t: Record<string, unknown>) => t.title);
        expect(titles).not.toContain('Task B1');
        expect(titles).not.toContain('Task B2');
      });
    });

    describe('When tenant-b lists tasks', () => {
      it('Then only tenant-b tasks are returned', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'GET', '/api/tasks', {
          userId: 'user-b1',
          tenantId: 'tenant-b',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.items).toHaveLength(2);
        expect(body.items.every((t: Record<string, unknown>) => t.tenantId === 'tenant-b')).toBe(
          true,
        );
      });
    });

    // --- GET isolation (cross-tenant returns 404, NOT 403) ---

    describe('When tenant-a tries to GET a tenant-b task', () => {
      it('Then returns 404 (not 403) to prevent information leakage', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'GET', '/api/tasks/t3', {
          userId: 'user-a1',
          tenantId: 'tenant-a',
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error.code).toBe('NotFound');
      });
    });

    describe('When tenant-a GETs their own task', () => {
      it('Then returns 200 with the task', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'GET', '/api/tasks/t1', {
          userId: 'user-a1',
          tenantId: 'tenant-a',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.title).toBe('Task A1');
        expect(body.tenantId).toBe('tenant-a');
      });
    });

    // --- UPDATE isolation ---

    describe('When tenant-a tries to UPDATE a tenant-b task', () => {
      it('Then returns 404 to prevent cross-tenant modification', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'PATCH', '/api/tasks/t3', {
          body: { title: 'Hacked!' },
          userId: 'user-a1',
          tenantId: 'tenant-a',
        });

        expect(res.status).toBe(404);
      });
    });

    describe('When tenant-a updates their own task', () => {
      it('Then returns 200 with updated data', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'PATCH', '/api/tasks/t1', {
          body: { title: 'Updated A1' },
          userId: 'user-a1',
          tenantId: 'tenant-a',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.title).toBe('Updated A1');
      });
    });

    // --- DELETE isolation ---

    describe('When tenant-a tries to DELETE a tenant-b task', () => {
      it('Then returns 404 to prevent cross-tenant deletion', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'DELETE', '/api/tasks/t4', {
          userId: 'user-a1',
          tenantId: 'tenant-a',
        });

        expect(res.status).toBe(404);
      });
    });

    describe('When tenant-a deletes their own task', () => {
      it('Then returns 204', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'DELETE', '/api/tasks/t1', {
          userId: 'user-a1',
          tenantId: 'tenant-a',
        });

        expect(res.status).toBe(204);
      });
    });

    // --- CREATE auto-sets tenantId ---

    describe('When tenant-a creates a new task', () => {
      it('Then tenantId is auto-set from context (not from input)', async () => {
        const app = createApp();
        const res = await request(app, 'POST', '/api/tasks', {
          body: { title: 'New Task', createdBy: 'user-a1' },
          userId: 'user-a1',
          tenantId: 'tenant-a',
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.tenantId).toBe('tenant-a');
        expect(body.title).toBe('New Task');
      });

      it('Then tenantId cannot be spoofed via request body', async () => {
        const app = createApp();
        const res = await request(app, 'POST', '/api/tasks', {
          body: { title: 'Spoofed', tenantId: 'tenant-b', createdBy: 'user-a1' },
          userId: 'user-a1',
          tenantId: 'tenant-a',
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        // tenantId should be from context (tenant-a), not from body (tenant-b)
        expect(body.tenantId).toBe('tenant-a');
      });
    });

    // --- Unauthenticated access denied ---

    describe('When an unauthenticated user tries to list tasks', () => {
      it('Then returns 403', async () => {
        const app = createApp(seedData);
        // No userId or tenantId headers
        const res = await request(app, 'GET', '/api/tasks');

        expect(res.status).toBe(403);
      });
    });
  });

  // -------------------------------------------------------------------------
  // rules.where() pushed to DB query for list
  // -------------------------------------------------------------------------

  describe('Given a tenant-scoped entity with rules.where() access', () => {
    const ownedTasksEntity = entity('tasks', {
      model: tasksModel,
      access: {
        list: rules.all(rules.authenticated(), rules.where({ createdBy: rules.user.id })),
        get: rules.authenticated(),
        create: rules.authenticated(),
      },
    });

    function createApp(initial: Record<string, unknown>[] = []) {
      const db = createInMemoryDb(initial);
      return createServer({ entities: [ownedTasksEntity], db }).middlewares([tenantAuthMiddleware]);
    }

    describe('When user-a1 lists tasks', () => {
      it('Then only tasks where createdBy matches userId are returned', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'GET', '/api/tasks', {
          userId: 'user-a1',
          tenantId: 'tenant-a',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        // Should only see tasks created by user-a1 AND in tenant-a
        expect(body.items).toHaveLength(1);
        expect(body.items[0].title).toBe('Task A1');
        expect(body.items[0].createdBy).toBe('user-a1');
      });
    });

    describe('When user-a2 lists tasks', () => {
      it('Then only their own tasks in their tenant are returned', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'GET', '/api/tasks', {
          userId: 'user-a2',
          tenantId: 'tenant-a',
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.items).toHaveLength(1);
        expect(body.items[0].title).toBe('Task A2');
        expect(body.items[0].createdBy).toBe('user-a2');
      });
    });

    describe('When an unauthenticated user tries to list', () => {
      it('Then returns 403 (authenticated rule within all() is still enforced)', async () => {
        const app = createApp(seedData);
        const res = await request(app, 'GET', '/api/tasks');

        expect(res.status).toBe(403);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Admin entity — tenantScoped: false (cross-tenant access)
  // -------------------------------------------------------------------------

  describe('Given an admin entity with tenantScoped: false over the same table', () => {
    const adminTasksEntity = entity('admin-tasks', {
      model: tasksModel,
      table: 'tasks',
      tenantScoped: false,
      access: {
        list: rules.authenticated(),
        get: rules.authenticated(),
      },
    });

    const regularTasksEntity = entity('tasks', {
      model: tasksModel,
      access: {
        list: rules.authenticated(),
        get: rules.authenticated(),
        create: rules.authenticated(),
      },
    });

    it('Admin entity lists ALL tasks across tenants', async () => {
      const sharedDb = createInMemoryDb(seedData);
      const app = createServer({
        entities: [regularTasksEntity, adminTasksEntity],
        _entityDbFactory: () => sharedDb,
      }).middlewares([tenantAuthMiddleware]);

      const res = await request(app, 'GET', '/api/admin-tasks', {
        userId: 'admin-1',
        tenantId: 'tenant-a',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // Admin entity sees ALL 4 tasks (no tenant filter)
      expect(body.items).toHaveLength(4);
    });

    it('Regular entity still filters by tenant', async () => {
      const sharedDb = createInMemoryDb(seedData);
      const app = createServer({
        entities: [regularTasksEntity, adminTasksEntity],
        _entityDbFactory: () => sharedDb,
      }).middlewares([tenantAuthMiddleware]);

      const res = await request(app, 'GET', '/api/tasks', {
        userId: 'user-a1',
        tenantId: 'tenant-a',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // Regular entity sees only tenant-a tasks (2)
      expect(body.items).toHaveLength(2);
      expect(body.items.every((t: Record<string, unknown>) => t.tenantId === 'tenant-a')).toBe(
        true,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Explicit tenantScoped: false opt-out
  // -------------------------------------------------------------------------

  describe('Given an entity with tenantId column but tenantScoped: false', () => {
    const crossTenantEntity = entity('tasks', {
      model: tasksModel,
      tenantScoped: false,
      access: {
        list: rules.authenticated(),
        get: rules.authenticated(),
      },
    });

    it('Lists all tasks regardless of tenant context', async () => {
      const db = createInMemoryDb(seedData);
      const app = createServer({ entities: [crossTenantEntity], db }).middlewares([
        tenantAuthMiddleware,
      ]);

      const res = await request(app, 'GET', '/api/tasks', {
        userId: 'user-a1',
        tenantId: 'tenant-a',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(4);
    });

    it('GETs any task regardless of tenant', async () => {
      const db = createInMemoryDb(seedData);
      const app = createServer({ entities: [crossTenantEntity], db }).middlewares([
        tenantAuthMiddleware,
      ]);

      // tenant-a user can get tenant-b task
      const res = await request(app, 'GET', '/api/tasks/t3', {
        userId: 'user-a1',
        tenantId: 'tenant-a',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenantId).toBe('tenant-b');
    });
  });

  // -------------------------------------------------------------------------
  // Descriptor access rules (rules.role, rules.entitlement)
  // -------------------------------------------------------------------------

  describe('Given a tenant-scoped entity with rules.role() access', () => {
    const roleTasksEntity = entity('tasks', {
      model: tasksModel,
      access: {
        list: rules.role('admin', 'viewer'),
        get: rules.role('admin', 'viewer'),
        create: rules.role('admin'),
        delete: rules.role('admin'),
      },
    });

    function createApp(initial: Record<string, unknown>[] = []) {
      const db = createInMemoryDb(initial);
      return createServer({ entities: [roleTasksEntity], db }).middlewares([tenantAuthMiddleware]);
    }

    it('Viewer can list tasks in their tenant', async () => {
      const app = createApp(seedData);
      const res = await request(app, 'GET', '/api/tasks', {
        userId: 'user-a1',
        tenantId: 'tenant-a',
        roles: ['viewer'],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
    });

    it('User without matching role gets 403', async () => {
      const app = createApp(seedData);
      const res = await request(app, 'GET', '/api/tasks', {
        userId: 'user-a1',
        tenantId: 'tenant-a',
        roles: ['editor'], // not admin or viewer
      });

      expect(res.status).toBe(403);
    });

    it('Admin can create in their tenant, tenantId auto-set', async () => {
      const app = createApp();
      const res = await request(app, 'POST', '/api/tasks', {
        body: { title: 'Admin Task', createdBy: 'admin-1' },
        userId: 'admin-1',
        tenantId: 'tenant-a',
        roles: ['admin'],
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.tenantId).toBe('tenant-a');
    });

    it('Non-admin cannot create (403)', async () => {
      const app = createApp();
      const res = await request(app, 'POST', '/api/tasks', {
        body: { title: 'Unauthorized', createdBy: 'user-a1' },
        userId: 'user-a1',
        tenantId: 'tenant-a',
        roles: ['viewer'],
      });

      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Comprehensive multi-tenant lifecycle
  // -------------------------------------------------------------------------

  describe('Multi-tenant lifecycle: create, read, isolate, delete', () => {
    const lifecycleEntity = entity('tasks', {
      model: tasksModel,
      access: {
        list: rules.authenticated(),
        get: rules.authenticated(),
        create: rules.authenticated(),
        update: rules.authenticated(),
        delete: rules.authenticated(),
      },
    });

    it('Full lifecycle with two tenants sharing the same DB', async () => {
      const db = createInMemoryDb();
      const app = createServer({ entities: [lifecycleEntity], db }).middlewares([
        tenantAuthMiddleware,
      ]);

      // 1. Tenant A creates a task
      const createA = await request(app, 'POST', '/api/tasks', {
        body: { title: 'Task from A', createdBy: 'user-a' },
        userId: 'user-a',
        tenantId: 'tenant-a',
      });
      expect(createA.status).toBe(201);
      const taskA = await createA.json();

      // 2. Tenant B creates a task
      const createB = await request(app, 'POST', '/api/tasks', {
        body: { title: 'Task from B', createdBy: 'user-b' },
        userId: 'user-b',
        tenantId: 'tenant-b',
      });
      expect(createB.status).toBe(201);
      const taskB = await createB.json();

      // 3. Tenant A lists — only sees their task
      const listA = await request(app, 'GET', '/api/tasks', {
        userId: 'user-a',
        tenantId: 'tenant-a',
      });
      const bodyA = await listA.json();
      expect(bodyA.items).toHaveLength(1);
      expect(bodyA.items[0].title).toBe('Task from A');

      // 4. Tenant B lists — only sees their task
      const listB = await request(app, 'GET', '/api/tasks', {
        userId: 'user-b',
        tenantId: 'tenant-b',
      });
      const bodyB = await listB.json();
      expect(bodyB.items).toHaveLength(1);
      expect(bodyB.items[0].title).toBe('Task from B');

      // 5. Tenant A cannot get tenant B's task
      const crossGet = await request(app, 'GET', `/api/tasks/${taskB.id}`, {
        userId: 'user-a',
        tenantId: 'tenant-a',
      });
      expect(crossGet.status).toBe(404);

      // 6. Tenant A cannot update tenant B's task
      const crossUpdate = await request(app, 'PATCH', `/api/tasks/${taskB.id}`, {
        body: { title: 'Hacked!' },
        userId: 'user-a',
        tenantId: 'tenant-a',
      });
      expect(crossUpdate.status).toBe(404);

      // 7. Tenant A cannot delete tenant B's task
      const crossDelete = await request(app, 'DELETE', `/api/tasks/${taskB.id}`, {
        userId: 'user-a',
        tenantId: 'tenant-a',
      });
      expect(crossDelete.status).toBe(404);

      // 8. Tenant A can update their own task
      const updateA = await request(app, 'PATCH', `/api/tasks/${taskA.id}`, {
        body: { title: 'Updated by A' },
        userId: 'user-a',
        tenantId: 'tenant-a',
      });
      expect(updateA.status).toBe(200);
      const updatedA = await updateA.json();
      expect(updatedA.title).toBe('Updated by A');

      // 9. Tenant A deletes their own task
      const deleteA = await request(app, 'DELETE', `/api/tasks/${taskA.id}`, {
        userId: 'user-a',
        tenantId: 'tenant-a',
      });
      expect(deleteA.status).toBe(204);

      // 10. Tenant B's task is unaffected
      const getB = await request(app, 'GET', `/api/tasks/${taskB.id}`, {
        userId: 'user-b',
        tenantId: 'tenant-b',
      });
      expect(getB.status).toBe(200);
      const fetchedB = await getB.json();
      expect(fetchedB.title).toBe('Task from B');
    });
  });
});
