// ===========================================================================
// Entity Developer Walkthrough — Public API Validation Test
//
// This test validates that a developer can use the full EDA (Entity-Driven
// Architecture) flow using ONLY public imports from @vertz/server and
// @vertz/db. If anything is missing from the public exports, this file
// will fail to compile.
//
// This is NOT a duplicate of the internal E2E test (e2e.test.ts) — that
// test uses relative imports for fast inner-loop development. This test
// proves the public API surface is complete.
// ===========================================================================

import { d } from '@vertz/db';
import type { EntityDbAdapter } from '@vertz/server';
import { createServer, entity } from '@vertz/server';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// 1. Schema definition — using only public @vertz/db API
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().is('hidden'),
  role: d.enum('user_role', ['user', 'admin']).default('user'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

// ---------------------------------------------------------------------------
// 2. Model — using only public @vertz/db API
// ---------------------------------------------------------------------------

const usersModel = d.model(usersTable);

// ---------------------------------------------------------------------------
// 3. In-memory DB adapter — implements public EntityDbAdapter type
// ---------------------------------------------------------------------------

function createInMemoryDb(initial: Record<string, unknown>[] = []): EntityDbAdapter {
  const store = [...initial];
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
      const record = { id: `id-${store.length + 1}`, ...data, passwordHash: 'hashed' };
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
// Helper: make a request to the app
// ---------------------------------------------------------------------------

function request(
  app: ReturnType<typeof createServer>,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return app.handler(new Request(`http://localhost${path}`, init));
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Entity Developer Walkthrough (public API only)', () => {
  // -------------------------------------------------------------------------
  // Entity definition — uses only public @vertz/server API
  // -------------------------------------------------------------------------

  const afterCreateSpy = vi.fn();

  const usersEntity = entity('users', {
    model: usersModel,
    access: {
      list: (ctx) => ctx.authenticated(),
      get: (ctx) => ctx.authenticated(),
      create: (ctx) => ctx.role('admin'),
      update: (ctx, row) => row.id === ctx.userId || ctx.role('admin'),
      delete: false,
    },
    before: {
      create: (data, _ctx) => ({ ...data, role: 'user' as const }),
    },
    after: {
      create: afterCreateSpy,
    },
  });

  // -------------------------------------------------------------------------
  // CRUD operations (open access entity for data setup)
  // -------------------------------------------------------------------------

  describe('CRUD with open access', () => {
    const openEntity = entity('users', {
      model: usersModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: false,
      },
      before: {
        create: (data) => ({ ...data, role: 'user' as const }),
      },
    });

    it('POST creates a record and strips hidden fields from response', async () => {
      const db = createInMemoryDb();
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'POST', '/api/users', {
        email: 'alice@example.com',
        name: 'Alice',
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.email).toBe('alice@example.com');
      expect(body.name).toBe('Alice');
      expect(body.passwordHash).toBeUndefined();
    });

    it('GET list returns records with hidden fields stripped and pagination metadata', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
      ]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
      expect(body.items[0].email).toBe('a@b.com');
      for (const record of body.items) {
        expect(record.passwordHash).toBeUndefined();
      }
      expect(body.total).toBe(2);
      expect(body.limit).toBe(20);
      expect(body.hasNextPage).toBe(false);
    });

    it('GET by ID returns record with hidden fields stripped', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'alice@example.com', name: 'Alice', passwordHash: 'secret' },
      ]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users/u1');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Alice');
      expect(body.passwordHash).toBeUndefined();
    });

    it('PATCH updates a record', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'alice@example.com', name: 'Alice', passwordHash: 'h' },
      ]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'PATCH', '/api/users/u1', { name: 'Alicia' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Alicia');
      expect(body.passwordHash).toBeUndefined();
    });

    it('DELETE returns 405 when disabled', async () => {
      const db = createInMemoryDb([{ id: 'u1' }]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'DELETE', '/api/users/u1');

      expect(res.status).toBe(405);
      const body = await res.json();
      expect(body.error.code).toBe('MethodNotAllowed');
    });

    it('before.create hook transforms data', async () => {
      const db = createInMemoryDb();
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'POST', '/api/users', {
        email: 'alice@example.com',
        name: 'Alice',
        role: 'admin', // before hook forces role to 'user'
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.role).toBe('user');
    });
  });

  // -------------------------------------------------------------------------
  // Pagination & Filtering
  // -------------------------------------------------------------------------

  describe('Pagination & Filtering', () => {
    const paginatedEntity = entity('users', {
      model: usersModel,
      access: { list: () => true, get: () => true, create: () => true },
    });

    it('GET /api/users?limit=2 returns paginated results with hasNextPage', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
        { id: 'u3', email: 'c@b.com', name: 'Charlie', passwordHash: 'h3', role: 'user' },
      ]);
      const app = createServer({
        entities: [paginatedEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users?limit=2');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
      expect(body.items[0].name).toBe('Alice');
      expect(body.items[1].name).toBe('Bob');
      expect(body.total).toBe(3);
      expect(body.limit).toBe(2);
      expect(body.hasNextPage).toBe(true);
      expect(body.nextCursor).toBe('u2');
    });

    it('GET /api/users?where[role]=admin filters by query params', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
      ]);
      const app = createServer({
        entities: [paginatedEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users?where[role]=admin');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Bob');
      expect(body.total).toBe(1);
    });

    it('GET /api/users?limit=1 returns nextCursor for cursor-based pagination', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
        { id: 'u3', email: 'c@b.com', name: 'Charlie', passwordHash: 'h3', role: 'user' },
      ]);
      const app = createServer({
        entities: [paginatedEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users?limit=1');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Alice');
      expect(body.nextCursor).toBe('u1');
    });

    it('GET /api/users?after=u1&limit=1 fetches next page via cursor', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
        { id: 'u3', email: 'c@b.com', name: 'Charlie', passwordHash: 'h3', role: 'user' },
      ]);
      const app = createServer({
        entities: [paginatedEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users?after=u1&limit=1');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Bob');
      expect(body.nextCursor).toBe('u2');
    });

    it('GET /api/users?where[role]=user&limit=1 combines filtering with pagination', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
        { id: 'u3', email: 'c@b.com', name: 'Charlie', passwordHash: 'h3', role: 'user' },
      ]);
      const app = createServer({
        entities: [paginatedEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users?where[role]=user&limit=1');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Alice');
      expect(body.total).toBe(2);
      expect(body.limit).toBe(1);
      expect(body.hasNextPage).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Access rule enforcement
  // -------------------------------------------------------------------------

  describe('Access rule enforcement', () => {
    it('returns 403 when list requires authentication', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h' },
      ]);
      const app = createServer({
        entities: [usersEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users');

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('Forbidden');
    });

    it('returns 403 when create requires admin role', async () => {
      const db = createInMemoryDb();
      const app = createServer({
        entities: [usersEntity],
        db,
      });

      const res = await request(app, 'POST', '/api/users', {
        email: 'a@b.com',
        name: 'Alice',
      });

      expect(res.status).toBe(403);
    });

    it('returns 405 for disabled delete regardless of auth', async () => {
      const db = createInMemoryDb([{ id: 'u1' }]);
      const app = createServer({
        entities: [usersEntity],
        db,
      });

      const res = await request(app, 'DELETE', '/api/users/u1');

      expect(res.status).toBe(405);
      const body = await res.json();
      expect(body.error.code).toBe('MethodNotAllowed');
    });
  });

  // -------------------------------------------------------------------------
  // After hooks
  // -------------------------------------------------------------------------

  describe('After hooks', () => {
    it('after.create fires with hidden fields stripped', async () => {
      afterCreateSpy.mockClear();
      const entityWithAfterHook = entity('users', {
        model: usersModel,
        access: { create: () => true },
        after: { create: afterCreateSpy },
      });

      const db = createInMemoryDb();
      const app = createServer({
        entities: [entityWithAfterHook],
        db,
      });

      await request(app, 'POST', '/api/users', {
        email: 'alice@example.com',
        name: 'Alice',
      });

      expect(afterCreateSpy).toHaveBeenCalledOnce();
      const calls = afterCreateSpy.mock.calls;
      const [result] = calls[0] ?? [];
      expect(result).toHaveProperty('email', 'alice@example.com');
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  // -------------------------------------------------------------------------
  // Full CRUD lifecycle
  // -------------------------------------------------------------------------

  describe('Full CRUD lifecycle', () => {
    it('create → get → update → list flows correctly', async () => {
      const lifecycleEntity = entity('users', {
        model: usersModel,
        access: {
          list: () => true,
          get: () => true,
          create: () => true,
          update: () => true,
        },
      });

      const db = createInMemoryDb();
      const app = createServer({
        entities: [lifecycleEntity],
        db,
      });

      // 1. Create
      const createRes = await request(app, 'POST', '/api/users', {
        email: 'alice@example.com',
        name: 'Alice',
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      const userId = created.id;
      expect(userId).toBeDefined();

      // 2. Get
      const getRes = await request(app, 'GET', `/api/users/${userId}`);
      expect(getRes.status).toBe(200);
      const fetched = await getRes.json();
      expect(fetched.email).toBe('alice@example.com');

      // 3. Update
      const updateRes = await request(app, 'PATCH', `/api/users/${userId}`, {
        name: 'Alicia',
      });
      expect(updateRes.status).toBe(200);
      const updated = await updateRes.json();
      expect(updated.name).toBe('Alicia');

      // 4. List
      const listRes = await request(app, 'GET', '/api/users');
      expect(listRes.status).toBe(200);
      const listed = await listRes.json();
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0].name).toBe('Alicia');
    });
  });
});
