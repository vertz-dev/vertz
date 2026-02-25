import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import { createServer } from '../create-server';

const ok = <T>(data: T) => ({ ok: true as const, data });

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
});

const usersModel = d.model(usersTable);

describe('createServer', () => {
  it('creates server with entities using noop DB adapter when no factory provided', () => {
    const app = createServer({
      basePath: '/',
      entities: [
        {
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
        },
      ] as never[],
    });

    expect(app).toBeDefined();
    expect(app.handler).toBeTypeOf('function');
  });

  it('noop DB adapter serves requests when no factory provided', async () => {
    const app = createServer({
      basePath: '/',
      entities: [
        {
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
        },
      ] as never[],
    });

    // Exercise the noop adapter by hitting the list endpoint
    const listResponse = await app.handler(new Request('http://localhost/api/users'));
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.data).toEqual([]);

    // Exercise noop get (returns null → 404)
    const getResponse = await app.handler(new Request('http://localhost/api/users/123'));
    expect(getResponse.status).toBe(404);

    // Exercise noop create
    const createResponse = await app.handler(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' }),
      }),
    );
    expect(createResponse.status).toBe(201);

    // Exercise noop update — entity doesn't exist in noop, returns error
    const updateResponse = await app.handler(
      new Request('http://localhost/api/users/123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bob' }),
      }),
    );
    expect(updateResponse.status).toBe(404);

    // Exercise noop delete — entity doesn't exist in noop, returns 404
    const deleteResponse = await app.handler(
      new Request('http://localhost/api/users/123', { method: 'DELETE' }),
    );
    expect(deleteResponse.status).toBe(404);
  });

  it('creates server without entities when entities array is empty', () => {
    const app = createServer({
      basePath: '/',
      entities: [],
    });

    expect(app).toBeDefined();
  });

  it('creates server without entities when entities is undefined', () => {
    const app = createServer({
      basePath: '/',
    });

    expect(app).toBeDefined();
  });

  it('accepts db property as public API for entity DB adapter', async () => {
    const mockDb = {
      async get() {
        return { id: '1', name: 'Alice' };
      },
      async list() {
        return { data: [{ id: '1', name: 'Alice' }], total: 1 };
      },
      async create(data: Record<string, unknown>) {
        return { id: '1', ...data };
      },
      async update(_id: string, data: Record<string, unknown>) {
        return { id: '1', ...data };
      },
      async delete() {
        return { id: '1', name: 'Alice' };
      },
    };

    const app = createServer({
      basePath: '/',
      db: mockDb,
      entities: [
        {
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
        },
      ] as never[],
    });

    const listResponse = await app.handler(new Request('http://localhost/api/users'));
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].name).toBe('Alice');
  });

  it('accepts a DatabaseClient via db and bridges it to EntityDbAdapter', async () => {
    const mockUser = { id: 'u1', name: 'Alice' };

    // A mock DatabaseClient — has _internals and model delegates with Result-returning methods
    const mockDelegate = {
      get: async () => ok(mockUser),
      getOrThrow: async () => ok(mockUser),
      getOrThrow: async () => ok(mockUser),
      list: async () => ok([mockUser]),
      listAndCount: async () => ok({ data: [mockUser], total: 1 }),
      create: async () => ok(mockUser),
      update: async () => ok(mockUser),
      delete: async () => ok(mockUser),
    };

    const mockDatabaseClient = {
      users: mockDelegate,
      close: async () => {},
      isHealthy: async () => true,
      query: async () => ok({ rows: [], rowCount: 0 }),
      _internals: {
        models: { users: { table: usersTable } },
        dialect: { paramPlaceholder: () => '?', quoteName: (n: string) => `"${n}"` },
        tenantGraph: {
          root: null,
          directlyScoped: new Set(),
          indirectlyScoped: new Set(),
          shared: new Set(),
        },
      },
    };

    const app = createServer({
      basePath: '/',
      db: mockDatabaseClient,
      entities: [
        {
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
        },
      ] as never[],
    });

    // The bridge adapter should delegate to the DatabaseClient's users.listAndCount
    const listResponse = await app.handler(new Request('http://localhost/api/users'));
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].name).toBe('Alice');
    expect(listBody.total).toBe(1);

    // Get by ID should return the record
    const getResponse = await app.handler(new Request('http://localhost/api/users/u1'));
    expect(getResponse.status).toBe(200);
    const getBody = await getResponse.json();
    expect(getBody.name).toBe('Alice');
  });

  it('uses default /api prefix when apiPrefix is not specified', () => {
    const app = createServer({
      basePath: '/',
      entities: [
        {
          name: 'users',
          model: usersModel,
          access: { list: () => true },
          before: {},
          after: {},
          actions: {},
          relations: {},
        },
      ] as never[],
    });

    expect(app).toBeDefined();
  });
});
