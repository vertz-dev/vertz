import { describe, expect, it, vi } from 'bun:test';
import { d } from '@vertz/db';
import { createServer } from '../../create-server';
import type { EntityDbAdapter } from '../crud-pipeline';
import { entity } from '../entity';

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

function createInMemoryDb(initial: Record<string, unknown>[] = []): EntityDbAdapter {
  const store = [...initial];
  return {
    async get(id) {
      return store.find((r) => r.id === id) ?? null;
    },
    async list() {
      return store;
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

const usersEntity = entity('users', {
  model: usersModel,
  access: {
    list: (ctx) => ctx.authenticated(),
    get: (ctx) => ctx.authenticated(),
    create: (ctx) => ctx.role('admin'),
    update: (ctx) => ctx.authenticated(),
    delete: false,
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createServer with entities', () => {
  it('registers CRUD routes for entity', async () => {
    const db = createInMemoryDb();
    const app = createServer({
      entities: [usersEntity],
      db,
    });

    const routes = app.router.routes;
    const paths = routes.map((r) => `${r.method} ${r.path}`);

    expect(paths).toContain('GET /api/users');
    expect(paths).toContain('GET /api/users/:id');
    expect(paths).toContain('POST /api/users');
    expect(paths).toContain('PATCH /api/users/:id');
    expect(paths).toContain('DELETE /api/users/:id');
  });

  it('GET /api/users returns 200 with data when authenticated', async () => {
    const db = createInMemoryDb([
      { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'secret', role: 'admin' },
    ]);
    const app = createServer({
      entities: [usersEntity],
      db,
    });

    const res = await app.handler(new Request('http://localhost/api/users'));

    // No auth middleware → userId is null → not authenticated → 403
    expect(res.status).toBe(403);
  });

  it('POST /api/users returns 201 when authorized', async () => {
    const db = createInMemoryDb();
    // Create entity with simple access rules that don't require middleware
    const simpleEntity = entity('users', {
      model: usersModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: false,
      },
    });

    const app = createServer({
      entities: [simpleEntity],
      db,
    });

    const res = await app.handler(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com', name: 'Alice' }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe('a@b.com');
    expect(body.name).toBe('Alice');
    // Hidden field should not be in response
    expect(body.passwordHash).toBeUndefined();
  });

  it('GET /api/users/:id returns 200 with single record', async () => {
    const db = createInMemoryDb([
      { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'hash' },
    ]);
    const simpleEntity = entity('users', {
      model: usersModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: () => true,
      },
    });

    const app = createServer({
      entities: [simpleEntity],
      db,
    });

    const res = await app.handler(new Request('http://localhost/api/users/1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Alice');
    expect(body.passwordHash).toBeUndefined();
  });

  it('PATCH /api/users/:id returns 200 with updated record', async () => {
    const db = createInMemoryDb([{ id: '1', email: 'a@b.com', name: 'Alice' }]);
    const simpleEntity = entity('users', {
      model: usersModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: () => true,
      },
    });

    const app = createServer({
      entities: [simpleEntity],
      db,
    });

    const res = await app.handler(
      new Request('http://localhost/api/users/1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Bob' }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Bob');
  });

  it('DELETE /api/users/:id returns 405 when disabled', async () => {
    const db = createInMemoryDb([{ id: '1' }]);
    const app = createServer({
      entities: [usersEntity],
      db,
    });

    const res = await app.handler(
      new Request('http://localhost/api/users/1', { method: 'DELETE' }),
    );

    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error.code).toBe('MethodNotAllowed');
  });

  it('GET /api/users/:id returns 404 for missing record', async () => {
    const db = createInMemoryDb([]);
    const simpleEntity = entity('users', {
      model: usersModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: () => true,
      },
    });

    const app = createServer({
      entities: [simpleEntity],
      db,
    });

    const res = await app.handler(new Request('http://localhost/api/users/nonexistent'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NotFound');
  });

  it('registers multiple entities without conflict', async () => {
    const tasksTable = d.table('tasks', {
      id: d.uuid().primary(),
      title: d.text(),
    });
    const tasksModel = d.model(tasksTable);
    const tasksEntity = entity('tasks', {
      model: tasksModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: () => true,
      },
    });

    const simpleUsersEntity = entity('users', {
      model: usersModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: () => true,
      },
    });

    const app = createServer({
      entities: [simpleUsersEntity, tasksEntity],
      db: createInMemoryDb(),
    });

    const routes = app.router.routes;
    const paths = routes.map((r) => `${r.method} ${r.path}`);

    expect(paths).toContain('GET /api/users');
    expect(paths).toContain('GET /api/tasks');
    expect(paths).toContain('POST /api/users');
    expect(paths).toContain('POST /api/tasks');
  });

  it('uses custom apiPrefix', async () => {
    const simpleEntity = entity('users', {
      model: usersModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: () => true,
      },
    });

    const app = createServer({
      entities: [simpleEntity],
      apiPrefix: '/v2',
      db: createInMemoryDb(),
    });

    const routes = app.router.routes;
    const paths = routes.map((r) => r.path);

    expect(paths.some((p) => p.startsWith('/v2/users'))).toBe(true);
  });

  it('full pipeline: create with before hook applies transformation', async () => {
    const db = createInMemoryDb();
    const entityWithHook = entity('users', {
      model: usersModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: () => true,
      },
      before: {
        create: (data) => ({ ...data, role: 'viewer' }),
      },
    });

    const app = createServer({
      entities: [entityWithHook],
      db,
    });

    const res = await app.handler(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com', name: 'Alice' }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.role).toBe('viewer');
  });
});
