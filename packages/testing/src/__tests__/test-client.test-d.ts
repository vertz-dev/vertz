import { describe, it } from 'bun:test';
import { d } from '@vertz/db';
import { createServer, entity, rules, service } from '@vertz/server';
import { createTestClient } from '../index';
import type { EntityTestProxy, ServiceTestProxy, TestClient } from '../test-client-types';

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

const echoBodySchema = {
  parse: (v: unknown) => ({ ok: true as const, data: v as { message: string } }),
};
const echoResponseSchema = {
  parse: (v: unknown) => ({ ok: true as const, data: v as { echo: string } }),
};
const healthResponseSchema = {
  parse: (v: unknown) => ({ ok: true as const, data: v as { status: string } }),
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

const healthService = service('health', {
  access: { check: rules.public },
  actions: {
    check: {
      response: healthResponseSchema,
      handler: async () => ({ status: 'ok' }),
    },
  },
});

// ---------------------------------------------------------------------------
// Type flow: EntityDefinition<TModel> → EntityTestProxy<TModel>
// ---------------------------------------------------------------------------

describe('Type flow: entity proxy', () => {
  it('entity proxy get() returns typed response body', () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => ({
        get: async () => null,
        list: async () => ({ data: [], total: 0 }),
        create: async (data: unknown) => data,
        update: async (_id: string, data: unknown) => data,
        delete: async () => null,
      }),
    });
    const client = createTestClient(server);
    const todos = client.entity(todosEntity);

    // Positive: proxy is correctly typed
    const _proxy: EntityTestProxy<typeof todosModel> = todos;
    void _proxy;
  });

  it('create() input is typed to $create_input', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => ({
        get: async () => null,
        list: async () => ({ data: [], total: 0 }),
        create: async (data: unknown) => data,
        update: async (_id: string, data: unknown) => data,
        delete: async () => null,
      }),
    });
    const client = createTestClient(server);
    const todos = client.entity(todosEntity);

    // @ts-expect-error — missing required 'title' field
    todos.create({});
  });

  it('entity() rejects non-EntityDefinition argument', () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => ({
        get: async () => null,
        list: async () => ({ data: [], total: 0 }),
        create: async (data: unknown) => data,
        update: async (_id: string, data: unknown) => data,
        delete: async () => null,
      }),
    });
    const client = createTestClient(server);

    // @ts-expect-error — plain object is not an EntityDefinition
    client.entity({ name: 'fake' });
  });
});

// ---------------------------------------------------------------------------
// Type flow: ServiceDefinition<TActions> → ServiceTestProxy<TDef>
// ---------------------------------------------------------------------------

describe('Type flow: service proxy', () => {
  it('service proxy has typed action methods', () => {
    const server = createServer({ services: [echoService] });
    const client = createTestClient(server);
    const echo = client.service(echoService);

    // Positive: proxy has 'send' method
    const _proxy: ServiceTestProxy<typeof echoService> = echo;
    void _proxy;
  });

  it('action with body requires body argument', () => {
    const server = createServer({ services: [echoService] });
    const client = createTestClient(server);
    const echo = client.service(echoService);

    // @ts-expect-error — send() requires body argument
    echo.send();
  });

  it('action without body accepts optional options only', () => {
    const server = createServer({ services: [healthService] });
    const client = createTestClient(server);
    const health = client.service(healthService);

    // Positive: no-body action can be called with no args
    health.check();
  });
});

// ---------------------------------------------------------------------------
// Type flow: TestResponse discriminated union
// ---------------------------------------------------------------------------

describe('Type flow: TestResponse', () => {
  it('ok: true narrows body to typed response', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => ({
        get: async () => null,
        list: async () => ({ data: [], total: 0 }),
        create: async (data: unknown) => data,
        update: async (_id: string, data: unknown) => data,
        delete: async () => null,
      }),
    });
    const client = createTestClient(server);
    const todos = client.entity(todosEntity);
    const result = await todos.list();

    if (result.ok) {
      // Positive: body has items and total
      const _items: unknown[] = result.body.items;
      const _total: number = result.body.total;
      void _items;
      void _total;
    }
  });

  it('ok: false narrows body to ErrorBody', async () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => ({
        get: async () => null,
        list: async () => ({ data: [], total: 0 }),
        create: async (data: unknown) => data,
        update: async (_id: string, data: unknown) => data,
        delete: async () => null,
      }),
    });
    const client = createTestClient(server);
    const todos = client.entity(todosEntity);
    const result = await todos.get('nonexistent');

    if (!result.ok) {
      // Positive: error body shape
      const _error: string = result.body.error;
      const _message: string = result.body.message;
      const _code: number = result.body.statusCode;
      void _error;
      void _message;
      void _code;
    }
  });
});

// ---------------------------------------------------------------------------
// Type flow: TestClient interface
// ---------------------------------------------------------------------------

describe('Type flow: TestClient', () => {
  it('withHeaders returns TestClient', () => {
    const server = createServer({
      entities: [todosEntity],
      _entityDbFactory: () => ({
        get: async () => null,
        list: async () => ({ data: [], total: 0 }),
        create: async (data: unknown) => data,
        update: async (_id: string, data: unknown) => data,
        delete: async () => null,
      }),
    });
    const client = createTestClient(server);
    const _authed: TestClient = client.withHeaders({ authorization: 'Bearer tok' });
    void _authed;
  });
});
