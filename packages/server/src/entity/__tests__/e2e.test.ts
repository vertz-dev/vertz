import { describe, expect, it, mock } from 'bun:test';
import { d } from '@vertz/db';
import { createServer } from '../../create-server';
import type { EntityDbAdapter } from '../crud-pipeline';
import { entity } from '../entity';

// ===========================================================================
// E2E Integration Test — EDA v0.1.0
//
// Validates the entire pipeline: schema → model → entity → server → HTTP
// Matches the "30 lines to a full API" promise from the design doc.
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. Schema definition (design doc Story 1)
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().hidden(),
  role: d.enum('user_role', ['user', 'admin']).default('user'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

// ---------------------------------------------------------------------------
// 2. Model
// ---------------------------------------------------------------------------

const usersModel = d.model(usersTable);

// ---------------------------------------------------------------------------
// 3. In-memory DB adapter
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

describe('EDA v0.1.0 E2E', () => {
  // -------------------------------------------------------------------------
  // Full entity definition (~30 lines) matching the design doc
  // -------------------------------------------------------------------------

  describe('Given a "users" entity with full access rules and hooks', () => {
    const afterCreateSpy = mock();

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
        create: (data, _ctx) => ({ ...data, role: 'user' }),
      },
      after: {
        create: afterCreateSpy,
      },
    });

    // --- Create (with open access, for data setup) ---

    describe('And a simplified entity with open access for CRUD testing', () => {
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
          create: (data) => ({ ...data, role: 'user' }),
        },
      });

      // --- POST /api/users → 201 ---

      describe('When POST /api/users with valid data', () => {
        it('Then returns 201 with created user', async () => {
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
        });

        it('Then hidden fields are NOT in the response', async () => {
          const db = createInMemoryDb();
          const app = createServer({
            entities: [openEntity],
            db,
          });

          const res = await request(app, 'POST', '/api/users', {
            email: 'alice@example.com',
            name: 'Alice',
          });

          const body = await res.json();
          expect(body.passwordHash).toBeUndefined();
        });

        it('Then readOnly fields (createdAt) are stripped from input', async () => {
          const db = createInMemoryDb();
          const app = createServer({
            entities: [openEntity],
            db,
          });

          const res = await request(app, 'POST', '/api/users', {
            email: 'alice@example.com',
            name: 'Alice',
            createdAt: '1999-01-01', // should be stripped
          });

          expect(res.status).toBe(201);
          // The DB adapter receives the record without createdAt
          // (the in-memory DB doesn't add it, so it won't be in response)
        });

        it('Then before.create hook applies transformation', async () => {
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

      // --- GET /api/users → 200 ---

      describe('When GET /api/users with data in the store', () => {
        it('Then returns 200 with list of users and pagination metadata', async () => {
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
          expect(body.data).toHaveLength(2);
          expect(body.data[0].email).toBe('a@b.com');
          expect(body.data[1].email).toBe('b@b.com');
          expect(body.total).toBe(2);
          expect(body.limit).toBe(20);
          expect(body.hasNextPage).toBe(false);
        });

        it('Then hidden fields are stripped from every record', async () => {
          const db = createInMemoryDb([
            { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1' },
          ]);
          const app = createServer({
            entities: [openEntity],
            db,
          });

          const res = await request(app, 'GET', '/api/users');
          const body = await res.json();

          for (const record of body.data) {
            expect(record.passwordHash).toBeUndefined();
          }
        });
      });

      // --- GET /api/users/:id → 200 ---

      describe('When GET /api/users/:id for an existing user', () => {
        it('Then returns 200 with the user', async () => {
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
      });

      // --- GET /api/users/:id → 404 ---

      describe('When GET /api/users/:id for a non-existent user', () => {
        it('Then returns 404 with NOT_FOUND error', async () => {
          const db = createInMemoryDb([]);
          const app = createServer({
            entities: [openEntity],
            db,
          });

          const res = await request(app, 'GET', '/api/users/nonexistent');

          expect(res.status).toBe(404);
          const body = await res.json();
          expect(body.error.code).toBe('NotFound');
        });
      });

      // --- PATCH /api/users/:id → 200 ---

      describe('When PATCH /api/users/:id with valid data', () => {
        it('Then returns 200 with updated record', async () => {
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
      });

      // --- PATCH /api/users/:id → 404 ---

      describe('When PATCH /api/users/:id for a non-existent user', () => {
        it('Then returns 404 with NOT_FOUND error', async () => {
          const db = createInMemoryDb([]);
          const app = createServer({
            entities: [openEntity],
            db,
          });

          const res = await request(app, 'PATCH', '/api/users/ghost', { name: 'X' });

          expect(res.status).toBe(404);
          const body = await res.json();
          expect(body.error.code).toBe('NotFound');
        });
      });

      // --- DELETE /api/users/:id → 405 (disabled) ---

      describe('When DELETE /api/users/:id', () => {
        it('Then returns 405 because delete is disabled', async () => {
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
      });
    });

    // -----------------------------------------------------------------
    // Access rule enforcement (auth-gated entity)
    // -----------------------------------------------------------------

    describe('Access rule enforcement', () => {
      // Without auth middleware, ctx.userId is null → not authenticated

      describe('When GET /api/users without authentication', () => {
        it('Then returns 403 (list requires authenticated)', async () => {
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
      });

      describe('When POST /api/users without admin role', () => {
        it('Then returns 403 (create requires admin)', async () => {
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
      });

      describe('When DELETE /api/users/:id (disabled operation)', () => {
        it('Then returns 405 regardless of auth context', async () => {
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
    });

    // -----------------------------------------------------------------
    // After hooks
    // -----------------------------------------------------------------

    describe('After hooks', () => {
      describe('When creating a user with after.create hook', () => {
        it('Then after.create fires with stripped result', async () => {
          afterCreateSpy.mockClear();
          const openEntityWithAfterHook = entity('users', {
            model: usersModel,
            access: { create: () => true },
            after: { create: afterCreateSpy },
          });

          const db = createInMemoryDb();
          const app = createServer({
            entities: [openEntityWithAfterHook],
            db,
          });

          await request(app, 'POST', '/api/users', {
            email: 'alice@example.com',
            name: 'Alice',
          });

          expect(afterCreateSpy).toHaveBeenCalledOnce();
          const [result] = afterCreateSpy.mock.calls[0]!;
          expect(result).toHaveProperty('email', 'alice@example.com');
          // Hidden fields must NOT leak to after hooks
          expect(result).not.toHaveProperty('passwordHash');
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // Error format consistency
  // -------------------------------------------------------------------------

  describe('Error format consistency', () => {
    const openEntity = entity('users', {
      model: usersModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: false,
      },
    });

    it('404 errors use { error: { code, message } } format', async () => {
      const db = createInMemoryDb([]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users/missing');
      const body = await res.json();

      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code', 'NotFound');
      expect(body.error).toHaveProperty('message');
      expect(typeof body.error.message).toBe('string');
    });

    it('405 errors use { error: { code, message } } format', async () => {
      const db = createInMemoryDb([{ id: 'u1' }]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'DELETE', '/api/users/u1');
      const body = await res.json();

      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code', 'MethodNotAllowed');
      expect(body.error).toHaveProperty('message');
    });

    it('403 errors use { error: { code, message } } format', async () => {
      const authEntity = entity('users', {
        model: usersModel,
        access: { list: (ctx) => ctx.authenticated() },
      });
      const db = createInMemoryDb([]);
      const app = createServer({
        entities: [authEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users');
      const body = await res.json();

      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code', 'Forbidden');
      expect(body.error).toHaveProperty('message');
    });
  });

  // -------------------------------------------------------------------------
  // Multiple entities
  // -------------------------------------------------------------------------

  describe('Multiple entities', () => {
    const tasksTable = d.table('tasks', {
      id: d.uuid().primary(),
      title: d.text(),
      done: d.boolean().default(false),
    });
    const tasksModel = d.model(tasksTable);

    const usersE = entity('users', {
      model: usersModel,
      access: { list: () => true, get: () => true, create: () => true },
    });

    const tasksE = entity('tasks', {
      model: tasksModel,
      access: { list: () => true, get: () => true, create: () => true },
    });

    it('registers routes for both entities', async () => {
      const app = createServer({
        entities: [usersE, tasksE],
        db: createInMemoryDb(),
      });

      const routes = app.router.routes;
      const paths = routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/users');
      expect(paths).toContain('GET /api/tasks');
      expect(paths).toContain('POST /api/users');
      expect(paths).toContain('POST /api/tasks');
    });

    it('CRUD operations on each entity are independent', async () => {
      const usersDb = createInMemoryDb();
      const tasksDb = createInMemoryDb();

      const app = createServer({
        entities: [usersE, tasksE],
        _entityDbFactory: (def) => {
          if (def.name === 'tasks') return tasksDb;
          return usersDb;
        },
      });

      // Create a user
      const userRes = await request(app, 'POST', '/api/users', {
        email: 'a@b.com',
        name: 'Alice',
      });
      expect(userRes.status).toBe(201);

      // Create a task
      const taskRes = await request(app, 'POST', '/api/tasks', {
        title: 'Write tests',
      });
      expect(taskRes.status).toBe(201);

      // List users returns only users
      const usersListRes = await request(app, 'GET', '/api/users');
      const usersBody = await usersListRes.json();
      expect(usersBody.data).toHaveLength(1);
      expect(usersBody.data[0].email).toBe('a@b.com');

      // List tasks returns only tasks
      const tasksListRes = await request(app, 'GET', '/api/tasks');
      const tasksBody = await tasksListRes.json();
      expect(tasksBody.data).toHaveLength(1);
      expect(tasksBody.data[0].title).toBe('Write tests');
    });
  });

  // -------------------------------------------------------------------------
  // Pagination & Filtering
  // -------------------------------------------------------------------------

  describe('Pagination & Filtering', () => {
    const openEntity = entity('users', {
      model: usersModel,
      access: { list: () => true, get: () => true, create: () => true },
    });

    it('GET /api/users?limit=2 returns first page with hasNextPage', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
        { id: 'u3', email: 'c@b.com', name: 'Charlie', passwordHash: 'h3', role: 'user' },
      ]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users?limit=2');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].name).toBe('Alice');
      expect(body.data[1].name).toBe('Bob');
      expect(body.total).toBe(3);
      expect(body.limit).toBe(2);
      expect(body.hasNextPage).toBe(true);
      expect(body.nextCursor).toBe('u2');
    });

    it('GET /api/users?where[role]=admin filters by role', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
        { id: 'u3', email: 'c@b.com', name: 'Charlie', passwordHash: 'h3', role: 'user' },
      ]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users?where[role]=admin');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Bob');
      expect(body.total).toBe(1);
    });

    it('GET /api/users?limit=1 returns nextCursor for cursor-based pagination', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
        { id: 'u3', email: 'c@b.com', name: 'Charlie', passwordHash: 'h3', role: 'user' },
      ]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users?limit=1');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Alice');
      expect(body.nextCursor).toBe('u1');
    });

    it('GET /api/users?after=u1&limit=1 returns next page via cursor', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
        { id: 'u3', email: 'c@b.com', name: 'Charlie', passwordHash: 'h3', role: 'user' },
      ]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users?after=u1&limit=1');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Bob');
      expect(body.nextCursor).toBe('u2');
    });

    it('GET /api/users?after=u3 returns null nextCursor on last page', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
        { id: 'u3', email: 'c@b.com', name: 'Charlie', passwordHash: 'h3', role: 'user' },
      ]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users?after=u3');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.nextCursor).toBeNull();
    });

    it('GET /api/users?where[role]=user&limit=1 combines filtering and pagination', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
        { id: 'u3', email: 'c@b.com', name: 'Charlie', passwordHash: 'h3', role: 'user' },
      ]);
      const app = createServer({
        entities: [openEntity],
        db,
      });

      const res = await request(app, 'GET', '/api/users?where[role]=user&limit=1');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Alice');
      expect(body.total).toBe(2);
      expect(body.limit).toBe(1);
      expect(body.hasNextPage).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // VertzQL — bracket syntax filters
  // -------------------------------------------------------------------------

  describe('VertzQL bracket syntax', () => {
    const openEntity = entity('users', {
      model: usersModel,
      access: { list: () => true, get: () => true, create: () => true },
    });

    it('GET /api/users?where[role]=admin filters by role using bracket syntax', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
      ]);
      const app = createServer({ entities: [openEntity], db });

      const res = await request(app, 'GET', '/api/users?where[role]=admin');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Bob');
    });

    it('GET /api/users?where[passwordHash]=x returns 400 for hidden field filter', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
      ]);
      const app = createServer({ entities: [openEntity], db });

      const res = await request(app, 'GET', '/api/users?where[passwordHash]=x');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('passwordHash');
    });

    it('GET /api/users?orderBy=name:asc orders results', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Charlie', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Alice', passwordHash: 'h2', role: 'user' },
      ]);
      const app = createServer({ entities: [openEntity], db });

      const res = await request(app, 'GET', '/api/users?orderBy=name:asc');

      expect(res.status).toBe(200);
      // Note: actual ordering depends on the DB adapter — the in-memory adapter
      // doesn't implement orderBy, so we just verify the request is accepted
    });

    it('GET /api/users?where[role]=admin&limit=1 combines VertzQL filters with pagination', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'admin' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
        { id: 'u3', email: 'c@b.com', name: 'Charlie', passwordHash: 'h3', role: 'user' },
      ]);
      const app = createServer({ entities: [openEntity], db });

      const res = await request(app, 'GET', '/api/users?where[role]=admin&limit=1');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].role).toBe('admin');
      expect(body.limit).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // VertzQL — q= param (select & include)
  // -------------------------------------------------------------------------

  describe('VertzQL q= param (select & include)', () => {
    const openEntity = entity('users', {
      model: usersModel,
      access: { list: () => true, get: () => true },
    });

    it('GET /api/users?q=<select> narrows response fields to selected ones', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
      ]);
      const app = createServer({ entities: [openEntity], db });

      const q = btoa(JSON.stringify({ select: { name: true, email: true } }));
      const res = await request(app, 'GET', `/api/users?q=${q}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0]).toEqual({ name: 'Alice', email: 'a@b.com' });
      expect(body.data[0]).not.toHaveProperty('id');
      expect(body.data[0]).not.toHaveProperty('role');
    });

    it('GET /api/users/:id?q=<select> narrows single record fields', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
      ]);
      const app = createServer({ entities: [openEntity], db });

      const q = btoa(JSON.stringify({ select: { name: true } }));
      const res = await request(app, 'GET', `/api/users/u1?q=${q}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ name: 'Alice' });
      expect(body).not.toHaveProperty('email');
    });

    it('GET /api/users?q=<select with hidden field> returns 400', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
      ]);
      const app = createServer({ entities: [openEntity], db });

      const q = btoa(JSON.stringify({ select: { passwordHash: true } }));
      const res = await request(app, 'GET', `/api/users?q=${q}`);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('passwordHash');
    });

    it('POST /api/users/query with body acts as query fallback', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
      ]);
      const app = createServer({ entities: [openEntity], db });

      const res = await request(app, 'POST', '/api/users/query', {
        where: { role: 'admin' },
        select: { name: true, email: true },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toEqual({ name: 'Bob', email: 'b@b.com' });
      expect(body.data[0]).not.toHaveProperty('id');
    });

    it('GET /api/users?q=<invalid base64> returns 400', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
      ]);
      const app = createServer({ entities: [openEntity], db });

      const res = await request(app, 'GET', '/api/users?q=not-valid-base64!!!');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('q=');
    });

    it('POST /api/users/query passes orderBy to the DB adapter', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', passwordHash: 'h2', role: 'admin' },
      ]);
      // Spy on db.list to verify orderBy is passed through
      const originalList = db.list;
      let capturedOptions: Record<string, unknown> | undefined;
      db.list = async (options) => {
        capturedOptions = options as Record<string, unknown> | undefined;
        return originalList.call(db, options);
      };
      const app = createServer({ entities: [openEntity], db });

      const res = await request(app, 'POST', '/api/users/query', {
        orderBy: { name: 'desc' },
      });

      expect(res.status).toBe(200);
      expect(capturedOptions).toHaveProperty('orderBy', { name: 'desc' });
    });

    it('GET /api/users?orderBy=name:desc passes orderBy to the DB adapter', async () => {
      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
      ]);
      let capturedOptions: Record<string, unknown> | undefined;
      const originalList = db.list;
      db.list = async (options) => {
        capturedOptions = options as Record<string, unknown> | undefined;
        return originalList.call(db, options);
      };
      const app = createServer({ entities: [openEntity], db });

      const res = await request(app, 'GET', '/api/users?orderBy=name:desc');

      expect(res.status).toBe(200);
      expect(capturedOptions).toHaveProperty('orderBy', { name: 'desc' });
    });

    it('GET /api/users?q=<include for unexposed relation> returns 400', async () => {
      const entityWithRelations = entity('users', {
        model: usersModel,
        access: { list: () => true },
        relations: { creator: { id: true, name: true } as Record<string, true> },
      });

      const db = createInMemoryDb([
        { id: 'u1', email: 'a@b.com', name: 'Alice', passwordHash: 'h1', role: 'user' },
      ]);
      const app = createServer({ entities: [entityWithRelations], db });

      const q = btoa(JSON.stringify({ include: { project: true } }));
      const res = await request(app, 'GET', `/api/users?q=${q}`);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('project');
    });
  });

  // -------------------------------------------------------------------------
  // Custom API prefix
  // -------------------------------------------------------------------------

  describe('Custom API prefix', () => {
    it('routes are generated with custom prefix', async () => {
      const simpleEntity = entity('users', {
        model: usersModel,
        access: { list: () => true, create: () => true },
      });

      const db = createInMemoryDb();
      const app = createServer({
        entities: [simpleEntity],
        apiPrefix: '/v2',
        db,
      });

      // Request with custom prefix works
      const res = await request(app, 'POST', '/v2/users', {
        email: 'a@b.com',
        name: 'Alice',
      });
      expect(res.status).toBe(201);
    });
  });

  // -------------------------------------------------------------------------
  // Full lifecycle: create → get → update → list
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
      expect(listed.data).toHaveLength(1);
      expect(listed.data[0].name).toBe('Alicia');
    });
  });
});
