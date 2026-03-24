import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import { createServer, entity, rules, service } from '@vertz/server';
import { createTestClient } from '../index';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const todosTable = d.table('todos', {
  id: d.uuid().primary(),
  title: d.text(),
  completed: d.boolean().default(false),
});

const todosModel = d.model(todosTable);

const todosEntity = entity('todos', {
  model: todosModel,
  access: {
    list: rules.public,
    get: rules.public,
    create: rules.public,
    update: rules.public,
    delete: rules.public,
  },
});

const healthResponseSchema = {
  parse: (v: unknown) => ({ ok: true as const, data: v as { status: string; timestamp: number } }),
};

const healthService = service('health', {
  access: { check: rules.public },
  actions: {
    check: {
      response: healthResponseSchema,
      handler: async () => ({ status: 'ok', timestamp: Date.now() }),
    },
  },
});

const echoBodySchema = {
  parse: (v: unknown) => ({ ok: true as const, data: v as { message: string } }),
};
const echoResponseSchema = {
  parse: (v: unknown) => ({ ok: true as const, data: v as { echo: string } }),
};

const echoService = service('echo', {
  access: { send: rules.public },
  actions: {
    send: {
      body: echoBodySchema,
      response: echoResponseSchema,
      handler: async (input: { message: string }) => ({ echo: input.message }),
    },
  },
});

function createInMemoryDb() {
  const store: Record<string, Record<string, unknown>> = {};
  return {
    async get(id: string) {
      return store[id] ?? null;
    },
    async list() {
      const items = Object.values(store);
      return { data: items, total: items.length };
    },
    async create(data: Record<string, unknown>) {
      const id = `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const record = { id, ...data };
      store[id] = record;
      return record;
    },
    async update(id: string, data: Record<string, unknown>) {
      const existing = store[id];
      if (!existing) return null;
      Object.assign(existing, data);
      return { ...existing };
    },
    async delete(id: string) {
      const existing = store[id];
      if (!existing) return null;
      delete store[id];
      return existing;
    },
  };
}

// ---------------------------------------------------------------------------
// createTestClient basics
// ---------------------------------------------------------------------------

describe('createTestClient', () => {
  it('returns a client object with entity, service, and HTTP methods', () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);

    expect(typeof client.entity).toBe('function');
    expect(typeof client.service).toBe('function');
    expect(typeof client.withHeaders).toBe('function');
    expect(typeof client.get).toBe('function');
    expect(typeof client.post).toBe('function');
    expect(typeof client.put).toBe('function');
    expect(typeof client.patch).toBe('function');
    expect(typeof client.delete).toBe('function');
    expect(typeof client.head).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Entity proxy
// ---------------------------------------------------------------------------

describe('Entity proxy', () => {
  it('create() sends POST and returns status 201 with body', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);
    const todos = client.entity(todosEntity);

    const result = await todos.create({ title: 'Buy milk' });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(201);
    if (result.ok) {
      expect(result.body.title).toBe('Buy milk');
      expect(result.body.id).toBeDefined();
    }
  });

  it('list() sends GET and returns items array', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);
    const todos = client.entity(todosEntity);

    await todos.create({ title: 'Item 1' });
    const result = await todos.list();
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    if (result.ok) {
      expect(result.body.items.length).toBeGreaterThanOrEqual(1);
      expect(result.body.total).toBeGreaterThanOrEqual(1);
    }
  });

  it('get() sends GET with id and returns entity', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);
    const todos = client.entity(todosEntity);

    const created = await todos.create({ title: 'Test' });
    if (!created.ok) throw new Error('Setup failed');

    const result = await todos.get(created.body.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.title).toBe('Test');
    }
  });

  it('update() sends PATCH with id and returns updated entity', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);
    const todos = client.entity(todosEntity);

    const created = await todos.create({ title: 'Test' });
    if (!created.ok) throw new Error('Setup failed');

    const result = await todos.update(created.body.id, { completed: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.completed).toBe(true);
    }
  });

  it('delete() sends DELETE with id and returns 204', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);
    const todos = client.entity(todosEntity);

    const created = await todos.create({ title: 'Delete me' });
    if (!created.ok) throw new Error('Setup failed');

    const result = await todos.delete(created.body.id);
    expect(result.status).toBe(204);
  });

  it('get() returns ok: false for nonexistent entity', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);
    const todos = client.entity(todosEntity);

    const result = await todos.get('nonexistent');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Service proxy
// ---------------------------------------------------------------------------

describe('Service proxy', () => {
  it('provides direct method access for service actions', async () => {
    const server = createServer({
      services: [healthService],
    });
    const client = createTestClient(server);
    const health = client.service(healthService);

    const result = await health.check();
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    if (result.ok) {
      expect(result.body.status).toBe('ok');
      expect(result.body.timestamp).toBeDefined();
    }
  });

  it('sends body for actions with body schema', async () => {
    const server = createServer({
      services: [echoService],
    });
    const client = createTestClient(server);
    const echo = client.service(echoService);

    const result = await echo.send({ message: 'hello' });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    if (result.ok) {
      expect(result.body.echo).toBe('hello');
    }
  });

  it('returns undefined for non-existent action names', () => {
    const server = createServer({
      services: [healthService],
    });
    const client = createTestClient(server);
    const health = client.service(healthService);

    expect((health as Record<string, unknown>).nonExistent).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Raw HTTP methods
// ---------------------------------------------------------------------------

describe('Raw HTTP methods', () => {
  it('client.post() sends request and returns TestResponse', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);

    const result = await client.post('/api/todos', { body: { title: 'Raw' } });
    expect(result.status).toBe(201);
    expect(result.ok).toBe(true);
  });

  it('client.get() sends request', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);

    const result = await client.get('/api/todos');
    expect(result.status).toBe(200);
  });

  it('client.put() sends request', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);

    // PUT to a non-existent route returns 404
    const result = await client.put('/api/todos/fake-id', { body: { title: 'Updated' } });
    expect(result.status).toBeDefined();
  });

  it('client.patch() sends request', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);
    const created = await client.post('/api/todos', { body: { title: 'Patch me' } });
    if (!created.ok) throw new Error('Setup failed');
    const id = (created.body as Record<string, unknown>).id;

    const result = await client.patch(`/api/todos/${id}`, { body: { completed: true } });
    expect(result.ok).toBe(true);
  });

  it('client.delete() sends request', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);
    const created = await client.post('/api/todos', { body: { title: 'Delete me' } });
    if (!created.ok) throw new Error('Setup failed');
    const id = (created.body as Record<string, unknown>).id;

    const result = await client.delete(`/api/todos/${id}`);
    expect(result.status).toBe(204);
  });

  it('client.head() sends request', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);

    const result = await client.head('/api/todos');
    // HEAD returns no body
    expect(result.status).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// withHeaders
// ---------------------------------------------------------------------------

describe('withHeaders', () => {
  it('returns a new client — original is unmodified', () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);
    const authed = client.withHeaders({ authorization: 'Bearer tok' });

    expect(authed).not.toBe(client);
    expect(typeof authed.entity).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// TestResponse.raw
// ---------------------------------------------------------------------------

describe('TestResponse.raw', () => {
  it('provides the original Response object', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => createInMemoryDb(),
    });
    const client = createTestClient(server);

    const result = await client.get('/api/todos');
    expect(result.raw).toBeInstanceOf(Response);
  });
});
