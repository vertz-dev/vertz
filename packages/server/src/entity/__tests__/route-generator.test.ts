import { describe, expect, it, mock } from 'bun:test';
import { d } from '@vertz/db';
import type { EntityDbAdapter } from '../crud-pipeline';
import { EntityRegistry } from '../entity-registry';
import { generateEntityRoutes } from '../route-generator';
import type { EntityDefinition } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().is('hidden'),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  createdAt: d.timestamp().default('now').readOnly(),
});

const usersModel = d.model(usersTable);

function createMockDb(data: Record<string, unknown>[] = []): EntityDbAdapter {
  const store = [...data];
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
    async create(input) {
      const record = { id: 'generated-id', ...input };
      store.push(record);
      return record;
    },
    async update(id, input) {
      const existing = store.find((r) => r.id === id);
      if (!existing) return { id, ...input };
      Object.assign(existing, input);
      return existing;
    },
    async delete(id) {
      const idx = store.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      return store.splice(idx, 1)[0] ?? null;
    },
  };
}

function buildEntityDef(overrides: Partial<EntityDefinition> = {}): EntityDefinition {
  return {
    name: 'users',
    model: usersModel,
    access: {
      list: () => true,
      get: () => true,
      create: () => true,
      update: () => true,
      delete: () => true,
    },
    before: {},
    after: {},
    actions: {},
    relations: {},
    ...overrides,
  } as EntityDefinition;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateEntityRoutes', () => {
  describe('route generation', () => {
    it('generates 5 CRUD routes for an entity with all access rules', () => {
      const def = buildEntityDef();
      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const methods = routes.map((r) => `${r.method} ${r.path}`);
      expect(methods).toContain('GET /api/users');
      expect(methods).toContain('GET /api/users/:id');
      expect(methods).toContain('POST /api/users');
      expect(methods).toContain('PATCH /api/users/:id');
      expect(methods).toContain('DELETE /api/users/:id');
      expect(methods).toContain('POST /api/users/query');
      expect(methods).toHaveLength(6);
    });

    it('uses PATCH for updates, not PUT', () => {
      const def = buildEntityDef();
      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const updateRoute = routes.find(
        (r) => r.path === '/api/users/:id' && r.method !== 'GET' && r.method !== 'DELETE',
      );
      expect(updateRoute?.method).toBe('PATCH');
    });

    it('uses custom apiPrefix when provided', () => {
      const def = buildEntityDef();
      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db, { apiPrefix: '/v1' });

      expect(routes[0]?.path).toMatch(/^\/v1\/users/);
    });

    it('generates custom action routes as POST /api/{entity}/:id/{actionName}', () => {
      const def = buildEntityDef({
        access: {
          list: () => true,
          get: () => true,
          create: () => true,
          update: () => true,
          delete: () => true,
          resetPassword: () => true,
        },
        actions: {
          resetPassword: {
            body: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            response: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            handler: async () => ({ success: true }),
          },
        },
      } as unknown as Partial<EntityDefinition>);

      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const actionRoute = routes.find((r) => r.path.includes('resetPassword'));
      expect(actionRoute).toBeDefined();
      expect(actionRoute?.method).toBe('POST');
      expect(actionRoute?.path).toBe('/api/users/:id/resetPassword');
    });

    it('skips operations with no access rule (deny by default = no route)', () => {
      const def = buildEntityDef({
        access: {
          list: () => true,
          get: () => true,
          // create, update, delete have no access rules — no routes generated
        },
      });

      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const methods = routes.map((r) => `${r.method} ${r.path}`);
      expect(methods).toContain('GET /api/users');
      expect(methods).toContain('GET /api/users/:id');
      expect(methods).not.toContain('POST /api/users');
      expect(methods).not.toContain('PATCH /api/users/:id');
      expect(methods).not.toContain('DELETE /api/users/:id');
    });

    it('registers 405 handler for disabled operations (access: false)', () => {
      const def = buildEntityDef({
        access: {
          list: () => true,
          get: () => true,
          create: () => true,
          update: () => true,
          delete: false,
        },
      });

      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      // Delete route should still exist (to return 405)
      const deleteRoute = routes.find((r) => r.method === 'DELETE');
      expect(deleteRoute).toBeDefined();
    });
  });

  describe('handler execution', () => {
    it('list handler returns 200 with data array and pagination metadata', async () => {
      const def = buildEntityDef();
      const db = createMockDb([
        { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'secret', role: 'admin' },
      ]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');
      const response = await listRoute!.handler({
        params: {},
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.items).toHaveLength(1);
      // Hidden field should be stripped
      expect(body.items[0].passwordHash).toBeUndefined();
      // Pagination metadata
      expect(body.total).toBe(1);
      expect(body.limit).toBe(20);
      expect(body.hasNextPage).toBe(false);
    });

    it('list handler passes limit from query params', async () => {
      const def = buildEntityDef();
      const db = createMockDb([
        { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'secret' },
        { id: '2', email: 'b@b.com', name: 'Bob', passwordHash: 'secret' },
        { id: '3', email: 'c@b.com', name: 'Charlie', passwordHash: 'secret' },
      ]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');
      const response = await listRoute!.handler({
        params: {},
        body: undefined,
        query: { limit: '2' },
        headers: {},
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.items).toHaveLength(2);
      expect(body.items[0].name).toBe('Alice');
      expect(body.total).toBe(3);
      expect(body.limit).toBe(2);
      expect(body.hasNextPage).toBe(true);
    });

    it('list handler passes where[field]=value as where filter (VertzQL bracket syntax)', async () => {
      const def = buildEntityDef();
      const db = createMockDb([
        { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'secret', role: 'admin' },
        { id: '2', email: 'b@b.com', name: 'Bob', passwordHash: 'secret', role: 'viewer' },
      ]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');
      const response = await listRoute!.handler({
        params: {},
        body: undefined,
        query: { 'where[role]': 'admin' },
        headers: {},
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Alice');
      expect(body.total).toBe(1);
    });

    it('list handler ignores non-numeric limit (falls back to defaults)', async () => {
      const def = buildEntityDef();
      const db = createMockDb([
        { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'secret' },
        { id: '2', email: 'b@b.com', name: 'Bob', passwordHash: 'secret' },
      ]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');
      const response = await listRoute!.handler({
        params: {},
        body: undefined,
        query: { limit: 'abc' },
        headers: {},
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      // NaN value ignored — default limit=20 applied
      expect(body.items).toHaveLength(2);
      expect(body.limit).toBe(20);
      expect(body.hasNextPage).toBe(false);
    });

    it('list handler passes after from query params for cursor pagination', async () => {
      const def = buildEntityDef();
      const db = createMockDb([
        { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'secret' },
        { id: '2', email: 'b@b.com', name: 'Bob', passwordHash: 'secret' },
        { id: '3', email: 'c@b.com', name: 'Charlie', passwordHash: 'secret' },
      ]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');
      const response = await listRoute!.handler({
        params: {},
        body: undefined,
        query: { after: '1', limit: '1' },
        headers: {},
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Bob');
      expect(body.nextCursor).toBe('2');
    });

    it('list handler returns nextCursor in response', async () => {
      const def = buildEntityDef();
      const db = createMockDb([
        { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'secret' },
        { id: '2', email: 'b@b.com', name: 'Bob', passwordHash: 'secret' },
      ]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');
      const response = await listRoute!.handler({
        params: {},
        body: undefined,
        query: { limit: '1' },
        headers: {},
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.nextCursor).toBe('1');
    });

    it('get handler returns 200 with single record', async () => {
      const def = buildEntityDef();
      const db = createMockDb([
        { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'secret' },
      ]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const getRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users/:id');
      const response = await getRoute!.handler({
        params: { id: '1' },
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.name).toBe('Alice');
      expect(body.passwordHash).toBeUndefined();
    });

    it('get handler returns 404 for missing record', async () => {
      const def = buildEntityDef();
      const db = createMockDb([]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const getRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users/:id');
      const response = await getRoute!.handler({
        params: { id: 'nonexistent' },
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe('NotFound');
    });

    it('create handler returns 201 with created record', async () => {
      const def = buildEntityDef();
      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const createRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users');
      const response = await createRoute!.handler({
        params: {},
        body: { email: 'a@b.com', name: 'Alice' },
        query: {},
        headers: {},
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.email).toBe('a@b.com');
    });

    it('create handler strips readOnly fields from input', async () => {
      const def = buildEntityDef();
      const createSpy = mock(async (data: Record<string, unknown>) => ({
        id: '1',
        ...data,
      }));
      const db = createMockDb();
      db.create = createSpy;

      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const createRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users');
      await createRoute!.handler({
        params: {},
        body: { email: 'a@b.com', name: 'Alice', createdAt: '2025-01-01' },
        query: {},
        headers: {},
      });

      // createdAt is readOnly — should be stripped before reaching the DB
      expect(createSpy).toHaveBeenCalledTimes(1);
      const dbInput = createSpy.mock.calls[0]![0];
      expect(dbInput.createdAt).toBeUndefined();
      expect(dbInput.email).toBe('a@b.com');
    });

    it('update handler returns 200 with updated record', async () => {
      const def = buildEntityDef();
      const db = createMockDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const updateRoute = routes.find((r) => r.method === 'PATCH');
      const response = await updateRoute!.handler({
        params: { id: '1' },
        body: { name: 'Bob' },
        query: {},
        headers: {},
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.name).toBe('Bob');
    });

    it('delete handler returns 204 with null body', async () => {
      const def = buildEntityDef();
      const db = createMockDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const deleteRoute = routes.find((r) => r.method === 'DELETE');
      const response = await deleteRoute!.handler({
        params: { id: '1' },
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(204);
    });

    it('disabled delete handler returns 405', async () => {
      const def = buildEntityDef({
        access: {
          list: () => true,
          get: () => true,
          create: () => true,
          update: () => true,
          delete: false,
        },
      });
      const db = createMockDb([{ id: '1' }]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const deleteRoute = routes.find((r) => r.method === 'DELETE');
      const response = await deleteRoute!.handler({
        params: { id: '1' },
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(405);
      const body = await response.json();
      expect(body.error.code).toBe('MethodNotAllowed');
    });

    it('disabled list handler returns 405', async () => {
      const def = buildEntityDef({
        access: {
          list: false,
          get: () => true,
          create: () => true,
          update: () => true,
          delete: () => true,
        },
      });
      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');
      const response = await listRoute!.handler({
        params: {},
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(405);
      const body = await response.json();
      expect(body.error.code).toBe('MethodNotAllowed');
      expect(body.error.message).toContain('list');
    });

    it('disabled get handler returns 405', async () => {
      const def = buildEntityDef({
        access: {
          list: () => true,
          get: false,
          create: () => true,
          update: () => true,
          delete: () => true,
        },
      });
      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const getRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users/:id');
      const response = await getRoute!.handler({
        params: { id: '1' },
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(405);
      const body = await response.json();
      expect(body.error.code).toBe('MethodNotAllowed');
      expect(body.error.message).toContain('get');
    });

    it('disabled create handler returns 405', async () => {
      const def = buildEntityDef({
        access: {
          list: () => true,
          get: () => true,
          create: false,
          update: () => true,
          delete: () => true,
        },
      });
      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const createRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users');
      const response = await createRoute!.handler({
        params: {},
        body: { email: 'test@test.com' },
        query: {},
        headers: {},
      });

      expect(response.status).toBe(405);
      const body = await response.json();
      expect(body.error.code).toBe('MethodNotAllowed');
      expect(body.error.message).toContain('create');
    });

    it('disabled update handler returns 405', async () => {
      const def = buildEntityDef({
        access: {
          list: () => true,
          get: () => true,
          create: () => true,
          update: false,
          delete: () => true,
        },
      });
      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const updateRoute = routes.find((r) => r.method === 'PATCH');
      const response = await updateRoute!.handler({
        params: { id: '1' },
        body: { name: 'Updated' },
        query: {},
        headers: {},
      });

      expect(response.status).toBe(405);
      const body = await response.json();
      expect(body.error.code).toBe('MethodNotAllowed');
      expect(body.error.message).toContain('update');
    });

    it('disabled custom action handler returns 405', async () => {
      const def = buildEntityDef({
        access: {
          list: () => true,
          get: () => true,
          create: () => true,
          update: () => true,
          delete: () => true,
          resetPassword: false,
        },
        actions: {
          resetPassword: {
            body: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            response: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            handler: async () => ({ success: true }),
          },
        },
      } as unknown as Partial<EntityDefinition>);

      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const actionRoute = routes.find((r) => r.path.includes('resetPassword'));
      const response = await actionRoute!.handler({
        params: { id: '1' },
        body: {},
        query: {},
        headers: {},
      });

      expect(response.status).toBe(405);
      const body = await response.json();
      expect(body.error.code).toBe('MethodNotAllowed');
      expect(body.error.message).toContain('resetPassword');
    });

    it('list handler returns error response when DB throws', async () => {
      const def = buildEntityDef();
      const db = createMockDb();
      db.list = async () => {
        throw new Error('DB connection lost');
      };
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');
      const response = await listRoute!.handler({
        params: {},
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('get handler returns error response when DB throws', async () => {
      const def = buildEntityDef();
      const db = createMockDb();
      db.get = async () => {
        throw new Error('DB connection lost');
      };
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const getRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users/:id');
      const response = await getRoute!.handler({
        params: { id: '1' },
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('create handler returns error response when DB throws', async () => {
      const def = buildEntityDef();
      const db = createMockDb();
      db.create = async () => {
        throw new Error('DB connection lost');
      };
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const createRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users');
      const response = await createRoute!.handler({
        params: {},
        body: { email: 'a@b.com', name: 'Alice' },
        query: {},
        headers: {},
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('update handler returns error response when DB throws', async () => {
      const def = buildEntityDef();
      const db = createMockDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
      db.update = async () => {
        throw new Error('DB connection lost');
      };
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const updateRoute = routes.find((r) => r.method === 'PATCH');
      const response = await updateRoute!.handler({
        params: { id: '1' },
        body: { name: 'Bob' },
        query: {},
        headers: {},
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('delete handler returns error response when DB throws', async () => {
      const def = buildEntityDef();
      const db = createMockDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
      db.delete = async () => {
        throw new Error('DB connection lost');
      };
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const deleteRoute = routes.find((r) => r.method === 'DELETE');
      const response = await deleteRoute!.handler({
        params: { id: '1' },
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('custom action handler returns error response when action throws', async () => {
      const def = buildEntityDef({
        access: {
          list: () => true,
          get: () => true,
          create: () => true,
          update: () => true,
          delete: () => true,
          resetPassword: () => true,
        },
        actions: {
          resetPassword: {
            body: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            response: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            handler: async () => {
              throw new Error('Action failed');
            },
          },
        },
      } as unknown as Partial<EntityDefinition>);

      const db = createMockDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const actionRoute = routes.find((r) => r.path.includes('resetPassword'));
      const response = await actionRoute!.handler({
        params: { id: '1' },
        body: {},
        query: {},
        headers: {},
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('access denied returns 403', async () => {
      const def = buildEntityDef({
        access: {
          list: () => false, // deny access
          get: () => true,
          create: () => true,
          update: () => true,
          delete: () => true,
        },
      });
      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');
      const response = await listRoute!.handler({
        params: {},
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe('Forbidden');
    });

    it('custom action handler executes and returns 200', async () => {
      const handler = mock(async () => ({ success: true }));
      const def = buildEntityDef({
        access: {
          list: () => true,
          get: () => true,
          create: () => true,
          update: () => true,
          delete: () => true,
          resetPassword: () => true,
        },
        actions: {
          resetPassword: {
            body: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            response: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            handler,
          },
        },
      } as unknown as Partial<EntityDefinition>);

      const db = createMockDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const actionRoute = routes.find((r) => r.path.includes('resetPassword'));
      const response = await actionRoute!.handler({
        params: { id: '1' },
        body: { newPassword: 'secret123' },
        query: {},
        headers: {},
      });

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it('generates GET route for action with method: "GET"', () => {
      const def = buildEntityDef({
        access: {
          list: () => true,
          stats: () => true,
        },
        actions: {
          stats: {
            method: 'GET',
            path: 'stats',
            body: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            response: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            handler: async () => ({ count: 5 }),
          },
        },
      } as unknown as Partial<EntityDefinition>);

      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const statsRoute = routes.find((r) => r.path.includes('stats') && !r.path.includes('query'));
      expect(statsRoute).toBeDefined();
      expect(statsRoute?.method).toBe('GET');
      expect(statsRoute?.path).toBe('/api/users/stats');
    });

    it('generates collection-level action path from actionDef.path', () => {
      const def = buildEntityDef({
        access: {
          list: () => true,
          bulkDelete: () => true,
        },
        actions: {
          bulkDelete: {
            method: 'POST',
            path: 'bulk-delete',
            body: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            response: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            handler: async () => ({ deleted: 3 }),
          },
        },
      } as unknown as Partial<EntityDefinition>);

      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const bulkRoute = routes.find((r) => r.path.includes('bulk-delete'));
      expect(bulkRoute).toBeDefined();
      expect(bulkRoute?.method).toBe('POST');
      expect(bulkRoute?.path).toBe('/api/users/bulk-delete');
    });

    it('GET action reads input from ctx.query instead of ctx.body', async () => {
      const handler = mock(async () => ({ count: 5 }));
      const def = buildEntityDef({
        access: {
          stats: () => true,
        },
        actions: {
          stats: {
            method: 'GET',
            path: 'stats',
            body: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            response: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
            handler,
          },
        },
      } as unknown as Partial<EntityDefinition>);

      const db = createMockDb();
      const registry = new EntityRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const statsRoute = routes.find((r) => r.path.includes('stats'));
      const response = await statsRoute!.handler({
        params: {},
        body: { shouldNotBeUsed: true },
        query: { status: 'completed' },
        headers: {},
      });

      expect(response.status).toBe(200);
      // The handler should have received query data, not body data
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
