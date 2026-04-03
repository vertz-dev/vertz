import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { d } from '@vertz/db';
import { rules } from '../../auth/rules';
import { response } from '../../response';
import type { EntityDbAdapter } from '../crud-pipeline';
import type { EntityOperations } from '../entity-operations';
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
    ...overrides,
  } as EntityDefinition;
}

function stubEntityOps(): EntityOperations {
  return {
    async get() {
      return {} as never;
    },
    async list() {
      return { items: [], total: 0, limit: 20, nextCursor: null, hasNextPage: false };
    },
    async create() {
      return {} as never;
    },
    async update() {
      return {} as never;
    },
    async delete() {},
  } as EntityOperations;
}

function createTestRegistry(entityName = 'users'): EntityRegistry {
  const registry = new EntityRegistry();
  registry.register(entityName, stubEntityOps());
  return registry;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateEntityRoutes', () => {
  describe('route generation', () => {
    it('generates 5 CRUD routes for an entity with all access rules', () => {
      const def = buildEntityDef();
      const db = createMockDb();
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const updateRoute = routes.find(
        (r) => r.path === '/api/users/:id' && r.method !== 'GET' && r.method !== 'DELETE',
      );
      expect(updateRoute?.method).toBe('PATCH');
    });

    it('uses custom apiPrefix when provided', () => {
      const def = buildEntityDef();
      const db = createMockDb();
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const actionRoute = routes.find((r) => r.path.includes('resetPassword'));
      expect(actionRoute).toBeDefined();
      expect(actionRoute?.method).toBe('POST');
      expect(actionRoute?.path).toBe('/api/users/:id/resetPassword');
    });

    it('skips operations with no access rule (deny by default = no route)', () => {
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const def = buildEntityDef({
          access: {
            list: () => true,
            get: () => true,
            // create, update, delete have no access rules — no routes generated
          },
        });

        const db = createMockDb();
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);

        const methods = routes.map((r) => `${r.method} ${r.path}`);
        expect(methods).toContain('GET /api/users');
        expect(methods).toContain('GET /api/users/:id');
        expect(methods).not.toContain('POST /api/users');
        expect(methods).not.toContain('PATCH /api/users/:id');
        expect(methods).not.toContain('DELETE /api/users/:id');
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('logs warnings for skipped CRUD operations due to missing access rules', () => {
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const def = buildEntityDef({
          access: {
            list: () => true,
            get: () => true,
            // create, update, delete have no access rules
          },
        });

        const db = createMockDb();
        const registry = createTestRegistry();
        generateEntityRoutes(def, registry, db);

        // Should warn for create, update, delete
        const warnings = warnSpy.mock.calls.map((c) => c[0]);
        expect(warnings.some((w: string) => w.includes('"create"') && w.includes('"users"'))).toBe(
          true,
        );
        expect(warnings.some((w: string) => w.includes('"update"') && w.includes('"users"'))).toBe(
          true,
        );
        expect(warnings.some((w: string) => w.includes('"delete"') && w.includes('"users"'))).toBe(
          true,
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('logs warning for skipped custom action due to missing access rule', () => {
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const def = buildEntityDef({
          access: {
            list: () => true,
            // resetPassword has no access rule
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
        const registry = createTestRegistry();
        generateEntityRoutes(def, registry, db);

        const warnings = warnSpy.mock.calls.map((c) => c[0]);
        expect(
          warnings.some((w: string) => w.includes('"resetPassword"') && w.includes('"users"')),
        ).toBe(true);
      } finally {
        warnSpy.mockRestore();
      }
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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

    it('create handler rejects readOnly fields with validation error', async () => {
      const def = buildEntityDef();
      const createSpy = mock(async (data: Record<string, unknown>) => ({
        id: '1',
        ...data,
      }));
      const db = createMockDb();
      db.create = createSpy;

      const registry = createTestRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const createRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users');
      const response = await createRoute!.handler({
        params: {},
        body: { email: 'a@b.com', name: 'Alice', createdAt: '2025-01-01' },
        query: {},
        headers: {},
      });

      // createdAt is readOnly — rejected by strict validation
      expect(response.status).toBe(422);
      // DB create should NOT be called — validation rejects before DB access
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('update handler returns 200 with updated record', async () => {
      const def = buildEntityDef();
      const db = createMockDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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
      const registry = createTestRegistry();
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

// ---------------------------------------------------------------------------
// Phase 3: Include pass-through (#1130)
// ---------------------------------------------------------------------------

describe('Feature: Include pass-through in route handlers (#1130)', () => {
  describe('Given a GET /api/users request with q= containing include', () => {
    describe('When the request is processed', () => {
      it('Then the db.list receives include in its options', async () => {
        const listSpy = mock(async (options?: Record<string, unknown>) => ({
          data: [{ id: 'u1', name: 'Alice', email: 'a@b.com', role: 'user' }],
          total: 1,
        }));
        const db: EntityDbAdapter = {
          ...createMockDb(),
          list: listSpy,
        };
        const def = buildEntityDef({
          expose: { select: { id: true, name: true }, include: { posts: true } },
        });
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');

        const structural = { include: { posts: true } };
        const q = btoa(JSON.stringify(structural));

        await listRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: {},
          query: { q },
          headers: {},
        });

        expect(listSpy).toHaveBeenCalledTimes(1);
        const callArgs = listSpy.mock.calls[0]![0] as Record<string, unknown>;
        expect(callArgs.include).toEqual({ posts: true });
      });
    });
  });

  describe('Given a POST /api/users/query with include in body', () => {
    describe('When the request is processed', () => {
      it('Then the db.list receives include in its options', async () => {
        const listSpy = mock(async (options?: Record<string, unknown>) => ({
          data: [{ id: 'u1', name: 'Alice', email: 'a@b.com', role: 'user' }],
          total: 1,
        }));
        const db: EntityDbAdapter = {
          ...createMockDb(),
          list: listSpy,
        };
        const def = buildEntityDef({
          expose: {
            select: { id: true, name: true },
            include: {
              posts: {
                select: { title: true, status: true },
                allowWhere: { status: true },
                allowOrderBy: { createdAt: true },
              },
            },
          },
        });
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const queryRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users/query');

        await queryRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: {
            include: {
              posts: {
                where: { status: 'published' },
                orderBy: { createdAt: 'desc' },
                limit: 10,
              },
            },
          },
          query: {},
          headers: {},
        });

        expect(listSpy).toHaveBeenCalledTimes(1);
        const callArgs = listSpy.mock.calls[0]![0] as Record<string, unknown>;
        expect(callArgs.include).toEqual({
          posts: {
            where: { status: 'published' },
            orderBy: { createdAt: 'desc' },
            limit: 10,
          },
        });
      });
    });
  });

  describe('Given a GET /api/users/:id with q= containing include', () => {
    describe('When the request is processed', () => {
      it('Then the db.get receives include in its options', async () => {
        const getSpy = mock(async (_id: string, _options?: Record<string, unknown>) => ({
          id: 'u1',
          name: 'Alice',
          email: 'a@b.com',
          role: 'user',
        }));
        const db: EntityDbAdapter = {
          ...createMockDb(),
          get: getSpy,
        };
        const def = buildEntityDef({
          expose: { select: { id: true, name: true }, include: { posts: true } },
        });
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const getRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users/:id');

        const structural = { include: { posts: true } };
        const q = btoa(JSON.stringify(structural));

        await getRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: { id: 'u1' },
          body: {},
          query: { q },
          headers: {},
        });

        expect(getSpy).toHaveBeenCalledTimes(1);
        // get should receive (id, options) where options includes include
        expect(getSpy.mock.calls[0]![1]).toEqual({ include: { posts: true } });
      });
    });
  });

  // --- Entity-level expose validation ---

  describe('Given an entity with expose.allowWhere restricting filterable fields', () => {
    const def = buildEntityDef({
      expose: {
        select: { id: true, name: true, email: true, role: true },
        allowWhere: { role: true },
        allowOrderBy: { name: true },
      },
    } as Partial<EntityDefinition>);

    describe('When listing with a filter on a non-allowed field', () => {
      it('Then returns 400 with "not filterable" error', async () => {
        const db = createMockDb([
          { id: 'u1', name: 'Alice', email: 'a@b.com', role: 'admin', passwordHash: 'h' },
        ]);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');

        const resp = await listRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: {},
          query: { 'where[email]': 'a@b.com' },
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(400);
        expect(body.error.message).toContain('email');
        expect(body.error.message).toContain('not filterable');
      });
    });

    describe('When listing with a filter on an allowed field', () => {
      it('Then returns 200', async () => {
        const db = createMockDb([
          { id: 'u1', name: 'Alice', email: 'a@b.com', role: 'admin', passwordHash: 'h' },
        ]);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');

        const resp = await listRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: {},
          query: { 'where[role]': 'admin' },
          headers: {},
        });

        expect(resp.status).toBe(200);
      });
    });

    describe('When sorting by a non-allowed field', () => {
      it('Then returns 400 with "not sortable" error', async () => {
        const db = createMockDb([
          { id: 'u1', name: 'Alice', email: 'a@b.com', role: 'admin', passwordHash: 'h' },
        ]);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');

        const resp = await listRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: {},
          query: { orderBy: 'email:asc' },
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(400);
        expect(body.error.message).toContain('email');
        expect(body.error.message).toContain('not sortable');
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 2: Descriptor runtime evaluation (#expose)
// ---------------------------------------------------------------------------

describe('Feature: Expose descriptor runtime evaluation', () => {
  describe('Given an entity with expose.select containing a descriptor-guarded field', () => {
    describe('When list is called and user lacks the entitlement', () => {
      it('Then the descriptor-guarded field returns null in the response', async () => {
        const db = createMockDb([
          {
            id: 'emp-1',
            name: 'Alice',
            email: 'a@b.com',
            role: 'admin',
            passwordHash: 'hash',
            createdAt: '2024-01-01',
          },
        ]);
        const def = buildEntityDef({
          expose: {
            select: {
              id: true,
              name: true,
              email: rules.entitlement('hr:view-email'),
            },
          },
        } as Partial<EntityDefinition>);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');

        const resp = await listRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: {},
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(200);
        expect(body.items).toHaveLength(1);
        expect(body.items[0].id).toBe('emp-1');
        expect(body.items[0].name).toBe('Alice');
        // email should be null because user lacks 'hr:view-email' entitlement
        expect(body.items[0].email).toBeNull();
      });
    });

    describe('When get is called and user lacks the entitlement', () => {
      it('Then the descriptor-guarded field returns null in the response', async () => {
        const db = createMockDb([
          {
            id: 'emp-1',
            name: 'Alice',
            email: 'a@b.com',
            role: 'admin',
            passwordHash: 'hash',
            createdAt: '2024-01-01',
          },
        ]);
        const def = buildEntityDef({
          expose: {
            select: {
              id: true,
              name: true,
              email: rules.entitlement('hr:view-email'),
            },
          },
        } as Partial<EntityDefinition>);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const getRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users/:id');

        const resp = await getRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: { id: 'emp-1' },
          body: {},
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(200);
        expect(body.id).toBe('emp-1');
        expect(body.name).toBe('Alice');
        expect(body.email).toBeNull();
      });
    });
  });

  describe('Given an entity with expose.allowWhere containing a descriptor-guarded field', () => {
    describe('When list is called with a filter on the guarded field and user lacks the entitlement', () => {
      it('Then returns 400 with "not filterable" error', async () => {
        const db = createMockDb([
          { id: 'emp-1', name: 'Alice', email: 'a@b.com', role: 'admin', passwordHash: 'h' },
        ]);
        const def = buildEntityDef({
          expose: {
            select: { id: true, name: true, email: true },
            allowWhere: {
              name: true,
              email: rules.entitlement('hr:filter-email'),
            },
          },
        } as Partial<EntityDefinition>);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');

        const resp = await listRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: {},
          query: { 'where[email]': 'a@b.com' },
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(400);
        expect(body.error.message).toContain('email');
        expect(body.error.message).toContain('not filterable');
      });
    });
  });

  describe('Given an entity with expose.allowOrderBy containing a descriptor-guarded field', () => {
    describe('When list is called with sort on the guarded field and user lacks the entitlement', () => {
      it('Then returns 400 with "not sortable" error', async () => {
        const db = createMockDb([
          { id: 'emp-1', name: 'Alice', email: 'a@b.com', role: 'admin', passwordHash: 'h' },
        ]);
        const def = buildEntityDef({
          expose: {
            select: { id: true, name: true, email: true },
            allowOrderBy: {
              name: true,
              email: rules.entitlement('hr:sort-email'),
            },
          },
        } as Partial<EntityDefinition>);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');

        const resp = await listRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: {},
          query: { orderBy: 'email:asc' },
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(400);
        expect(body.error.message).toContain('email');
        expect(body.error.message).toContain('not sortable');
      });
    });
  });

  describe('Given an entity with expose containing only `true` values (no descriptors)', () => {
    describe('When list is called', () => {
      it('Then no evaluation happens and all fields are returned normally', async () => {
        const db = createMockDb([
          { id: 'emp-1', name: 'Alice', email: 'a@b.com', role: 'admin', passwordHash: 'h' },
        ]);
        const def = buildEntityDef({
          expose: {
            select: { id: true, name: true, email: true },
          },
        } as Partial<EntityDefinition>);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');

        const resp = await listRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: {},
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(200);
        expect(body.items[0].email).toBe('a@b.com');
      });
    });
  });

  describe('Given POST /query with a descriptor-guarded allowWhere field', () => {
    describe('When user lacks the entitlement and filters by that field', () => {
      it('Then returns 400 with "not filterable" error', async () => {
        const db = createMockDb([
          { id: 'emp-1', name: 'Alice', email: 'a@b.com', role: 'admin', passwordHash: 'h' },
        ]);
        const def = buildEntityDef({
          expose: {
            select: { id: true, name: true, email: true },
            allowWhere: {
              name: true,
              email: rules.entitlement('hr:filter-email'),
            },
          },
        } as Partial<EntityDefinition>);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const queryRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users/query');

        const resp = await queryRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: { where: { email: 'a@b.com' } },
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(400);
        expect(body.error.message).toContain('email');
        expect(body.error.message).toContain('not filterable');
      });
    });
  });

  describe('Given POST /query with descriptor-guarded select field', () => {
    describe('When user lacks the entitlement', () => {
      it('Then the descriptor-guarded field returns null in the response', async () => {
        const db = createMockDb([
          { id: 'emp-1', name: 'Alice', email: 'a@b.com', role: 'admin', passwordHash: 'h' },
        ]);
        const def = buildEntityDef({
          expose: {
            select: {
              id: true,
              name: true,
              email: rules.entitlement('hr:view-email'),
            },
          },
        } as Partial<EntityDefinition>);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const queryRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users/query');

        const resp = await queryRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: {},
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(200);
        expect(body.items[0].email).toBeNull();
      });
    });
  });

  describe('Given create response with descriptor-guarded select field', () => {
    describe('When user lacks the entitlement', () => {
      it('Then the descriptor-guarded field returns null in the create response', async () => {
        const db = createMockDb();
        const def = buildEntityDef({
          expose: {
            select: {
              id: true,
              name: true,
              email: rules.entitlement('hr:view-email'),
            },
          },
        } as Partial<EntityDefinition>);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const createRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users');

        const resp = await createRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: { name: 'Bob', email: 'bob@example.com' },
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(201);
        expect(body.name).toBe('Bob');
        expect(body.email).toBeNull();
      });
    });
  });

  describe('Given POST /query with an oversized cursor', () => {
    describe('When the after value exceeds 512 characters', () => {
      it('Then returns 400 with a BadRequest error', async () => {
        const db = createMockDb([{ id: '1', name: 'Alice', email: 'a@b.com', role: 'viewer' }]);
        const def = buildEntityDef();
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const queryRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users/query');

        const oversizedCursor = 'x'.repeat(513);
        const resp = await queryRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: { after: oversizedCursor },
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(400);
        expect(body.error.code).toBe('BadRequest');
        expect(body.error.message).toContain('cursor');
      });
    });

    describe('When the after value is exactly 512 characters', () => {
      it('Then accepts the cursor and returns 200', async () => {
        const db = createMockDb([{ id: '1', name: 'Alice', email: 'a@b.com', role: 'viewer' }]);
        const def = buildEntityDef();
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const queryRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users/query');

        const exactCursor = 'x'.repeat(512);
        const resp = await queryRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: { after: exactCursor },
          query: {},
          headers: {},
        });

        expect(resp.status).toBe(200);
      });
    });

    describe('When body.after is a non-string type', () => {
      it('Then returns 400 with a type error', async () => {
        const db = createMockDb([{ id: '1', name: 'Alice', email: 'a@b.com', role: 'viewer' }]);
        const def = buildEntityDef();
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const queryRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users/query');

        const resp = await queryRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: { after: 12345 },
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(400);
        expect(body.error.code).toBe('BadRequest');
        expect(body.error.message).toContain('cursor');
      });
    });
  });

  describe('Given update response with descriptor-guarded select field', () => {
    describe('When user lacks the entitlement', () => {
      it('Then the descriptor-guarded field returns null in the update response', async () => {
        const db = createMockDb([
          { id: 'emp-1', name: 'Alice', email: 'a@b.com', role: 'admin', passwordHash: 'h' },
        ]);
        const def = buildEntityDef({
          expose: {
            select: {
              id: true,
              name: true,
              email: rules.entitlement('hr:view-email'),
            },
          },
        } as Partial<EntityDefinition>);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const updateRoute = routes.find((r) => r.method === 'PATCH');

        const resp = await updateRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: { id: 'emp-1' },
          body: { name: 'Alice Updated' },
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(200);
        expect(body.name).toBe('Alice Updated');
        expect(body.email).toBeNull();
      });
    });
  });

  describe('Given POST /query with limit exceeding MAX_LIMIT', () => {
    describe('When the body contains limit: 999999', () => {
      it('Then clamps the limit to MAX_LIMIT (1000)', async () => {
        const items = Array.from({ length: 5 }, (_, i) => ({
          id: `id-${i}`,
          email: `u${i}@b.com`,
          name: `User ${i}`,
          passwordHash: 'h',
          role: 'viewer',
        }));
        const db = createMockDb(items);
        const def = buildEntityDef();
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const queryRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users/query');

        const resp = await queryRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: { limit: 999999 },
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(200);
        expect(body.limit).toBe(1000);
      });
    });

    describe('When the body contains limit: NaN', () => {
      it('Then treats it as no limit (uses default)', async () => {
        const db = createMockDb([
          { id: '1', email: 'a@b.com', name: 'A', passwordHash: 'h', role: 'viewer' },
        ]);
        const def = buildEntityDef();
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const queryRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users/query');

        const resp = await queryRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: { limit: Number.NaN },
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(200);
        expect(body.limit).toBe(20); // default limit
      });
    });

    describe('When the body contains a negative limit', () => {
      it('Then clamps to 0', async () => {
        const db = createMockDb([
          { id: '1', email: 'a@b.com', name: 'A', passwordHash: 'h', role: 'viewer' },
        ]);
        const def = buildEntityDef();
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);
        const queryRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users/query');

        const resp = await queryRoute!.handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: { limit: -5 },
          query: {},
          headers: {},
        });
        const body = await resp.json();

        expect(resp.status).toBe(200);
        expect(body.items).toHaveLength(0);
      });
    });
  });

  describe('Given access.list === false', () => {
    describe('When POST /query is called', () => {
      it('Then returns 405 MethodNotAllowed', async () => {
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
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);

        // Only one POST /query route should exist (the 405 handler)
        const queryRoutes = routes.filter(
          (r) => r.method === 'POST' && r.path === '/api/users/query',
        );
        expect(queryRoutes).toHaveLength(1);

        const resp = await queryRoutes[0].handler({
          userId: 'u1',
          tenantId: null,
          roles: [],
          params: {},
          body: {},
          query: {},
          headers: {},
        });

        expect(resp.status).toBe(405);
        const body = await resp.json();
        expect(body.error.code).toBe('MethodNotAllowed');
        expect(body.error.message).toContain('list');
      });
    });
  });

  describe('Given access.list === undefined', () => {
    it('Then POST /query route is not registered', () => {
      const def = buildEntityDef({
        access: {
          get: () => true,
          create: () => true,
          update: () => true,
          delete: () => true,
        },
      });
      const db = createMockDb();
      const registry = createTestRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const queryRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users/query');
      expect(queryRoute).toBeUndefined();
    });
  });

  describe('ctx.entity population', () => {
    it('before.create hook receives populated ctx.entity with CRUD methods', async () => {
      let capturedEntity: unknown = null;
      const def = buildEntityDef({
        before: {
          create: (data: unknown, ctx: { entity: unknown }) => {
            capturedEntity = ctx.entity;
            return data;
          },
        },
      });
      const db = createMockDb();
      const registry = createTestRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const createRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users');
      await createRoute!.handler({ body: { email: 'a@b.com', name: 'Alice' } });

      expect(capturedEntity).not.toBeNull();
      expect(typeof (capturedEntity as Record<string, unknown>).get).toBe('function');
      expect(typeof (capturedEntity as Record<string, unknown>).list).toBe('function');
      expect(typeof (capturedEntity as Record<string, unknown>).create).toBe('function');
      expect(typeof (capturedEntity as Record<string, unknown>).update).toBe('function');
      expect(typeof (capturedEntity as Record<string, unknown>).delete).toBe('function');
    });

    it('after.create hook receives populated ctx.entity', async () => {
      let capturedEntity: unknown = null;
      const def = buildEntityDef({
        after: {
          create: (_result: unknown, ctx: { entity: unknown }) => {
            capturedEntity = ctx.entity;
          },
        },
      });
      const db = createMockDb();
      const registry = createTestRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const createRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users');
      await createRoute!.handler({ body: { email: 'a@b.com', name: 'Alice' } });

      expect(capturedEntity).not.toBeNull();
      expect(typeof (capturedEntity as Record<string, unknown>).get).toBe('function');
    });

    it('after.update hook receives populated ctx.entity', async () => {
      let capturedEntity: unknown = null;
      const def = buildEntityDef({
        after: {
          update: (_prev: unknown, _next: unknown, ctx: { entity: unknown }) => {
            capturedEntity = ctx.entity;
          },
        },
      });
      const db = createMockDb([
        { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'secret', role: 'admin' },
      ]);
      const registry = createTestRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const updateRoute = routes.find((r) => r.method === 'PATCH' && r.path === '/api/users/:id');
      await updateRoute!.handler({ params: { id: '1' }, body: { name: 'Bob' } });

      expect(capturedEntity).not.toBeNull();
      expect(typeof (capturedEntity as Record<string, unknown>).update).toBe('function');
    });

    it('after.delete hook receives populated ctx.entity', async () => {
      let capturedEntity: unknown = null;
      const def = buildEntityDef({
        after: {
          delete: (_row: unknown, ctx: { entity: unknown }) => {
            capturedEntity = ctx.entity;
          },
        },
      });
      const db = createMockDb([
        { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'secret', role: 'admin' },
      ]);
      const registry = createTestRegistry();
      const routes = generateEntityRoutes(def, registry, db);

      const deleteRoute = routes.find((r) => r.method === 'DELETE' && r.path === '/api/users/:id');
      await deleteRoute!.handler({ params: { id: '1' } });

      expect(capturedEntity).not.toBeNull();
      expect(typeof (capturedEntity as Record<string, unknown>).delete).toBe('function');
    });

    it('ctx.entity is the same instance from the registry', async () => {
      const ops = stubEntityOps();
      let capturedEntity: unknown = null;
      const def = buildEntityDef({
        before: {
          create: (data: unknown, ctx: { entity: unknown }) => {
            capturedEntity = ctx.entity;
            return data;
          },
        },
      });
      const db = createMockDb();
      const registry = new EntityRegistry();
      registry.register('users', ops);
      const routes = generateEntityRoutes(def, registry, db);

      const createRoute = routes.find((r) => r.method === 'POST' && r.path === '/api/users');
      await createRoute!.handler({ body: { email: 'a@b.com', name: 'Alice' } });

      expect(capturedEntity).toBe(ops);
    });
  });

  // -------------------------------------------------------------------------
  // ResponseDescriptor tests for entity custom actions
  // -------------------------------------------------------------------------

  describe('Given an entity action handler that returns response()', () => {
    describe('When the action route is invoked', () => {
      it('Then HTTP response includes custom headers', async () => {
        const def = buildEntityDef({
          access: {
            list: () => true,
            get: () => true,
            create: () => true,
            update: () => true,
            delete: () => true,
            export: () => true,
          },
          actions: {
            export: {
              body: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
              response: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
              handler: async () =>
                response(
                  { url: 'https://example.com/export.csv' },
                  { headers: { 'X-Export-Id': 'exp-123' } },
                ),
            },
          },
        } as unknown as Partial<EntityDefinition>);

        const db = createMockDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);

        const actionRoute = routes.find((r) => r.path.includes('export'));
        const resp = await actionRoute!.handler({
          params: { id: '1' },
          body: {},
          query: {},
          headers: {},
        });

        expect(resp.headers.get('X-Export-Id')).toBe('exp-123');
        expect(resp.headers.get('content-type')).toBe('application/json');
        const body = await resp.json();
        expect(body.url).toBe('https://example.com/export.csv');
      });

      it('Then HTTP response uses custom status code', async () => {
        const def = buildEntityDef({
          access: {
            list: () => true,
            get: () => true,
            create: () => true,
            update: () => true,
            delete: () => true,
            enqueue: () => true,
          },
          actions: {
            enqueue: {
              body: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
              response: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
              handler: async () => response({ queued: true }, { status: 202 }),
            },
          },
        } as unknown as Partial<EntityDefinition>);

        const db = createMockDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);

        const actionRoute = routes.find((r) => r.path.includes('enqueue'));
        const resp = await actionRoute!.handler({
          params: { id: '1' },
          body: {},
          query: {},
          headers: {},
        });

        expect(resp.status).toBe(202);
      });

      it('Then content-type: application/json is preserved', async () => {
        const def = buildEntityDef({
          access: {
            list: () => true,
            get: () => true,
            create: () => true,
            update: () => true,
            delete: () => true,
            export: () => true,
          },
          actions: {
            export: {
              body: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
              response: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
              handler: async () =>
                response(
                  { url: 'https://example.com/export.csv' },
                  { headers: { 'Content-Type': 'text/csv' } },
                ),
            },
          },
        } as unknown as Partial<EntityDefinition>);

        const db = createMockDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);

        const actionRoute = routes.find((r) => r.path.includes('export'));
        const resp = await actionRoute!.handler({
          params: { id: '1' },
          body: {},
          query: {},
          headers: {},
        });

        expect(resp.headers.get('content-type')).toBe('application/json');
      });
    });
  });

  describe('Given an entity action handler that returns plain data', () => {
    describe('When the action route is invoked', () => {
      it('Then behavior is unchanged (backward compatible)', async () => {
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

        const db = createMockDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
        const registry = createTestRegistry();
        const routes = generateEntityRoutes(def, registry, db);

        const actionRoute = routes.find((r) => r.path.includes('resetPassword'));
        const resp = await actionRoute!.handler({
          params: { id: '1' },
          body: {},
          query: {},
          headers: {},
        });

        expect(resp.status).toBe(200);
        expect(resp.headers.get('content-type')).toBe('application/json');
        const body = await resp.json();
        expect(body.success).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // devMode error handling
  // ---------------------------------------------------------------------------

  describe('devMode error handling', () => {
    it('list handler exposes real error message when devMode is true', async () => {
      const def = buildEntityDef();
      const db = createMockDb();
      db.list = async () => {
        throw new Error('DB connection lost');
      };
      const registry = createTestRegistry();
      const routes = generateEntityRoutes(def, registry, db, { devMode: true });

      const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');
      const response = await listRoute!.handler({
        params: {},
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.code).toBe('InternalError');
      expect(body.error.message).toBe('DB connection lost');
      expect(body.error.stack).toBeDefined();
    });

    it('list handler hides error message when devMode is false', async () => {
      const def = buildEntityDef();
      const db = createMockDb();
      db.list = async () => {
        throw new Error('DB connection lost');
      };
      const registry = createTestRegistry();
      const routes = generateEntityRoutes(def, registry, db, { devMode: false });

      const listRoute = routes.find((r) => r.method === 'GET' && r.path === '/api/users');
      const response = await listRoute!.handler({
        params: {},
        body: undefined,
        query: {},
        headers: {},
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.code).toBe('InternalError');
      expect(body.error.message).toBe('An unexpected error occurred');
      expect(body.error.stack).toBeUndefined();
    });
  });
});
