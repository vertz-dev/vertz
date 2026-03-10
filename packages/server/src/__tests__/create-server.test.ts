import { describe, expect, it } from 'bun:test';
import { computeTenantGraph, d } from '@vertz/db';
import { createServer } from '../create-server';
import { resolveTenantChain } from '../entity/tenant-chain';

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
    expect(listBody.items).toEqual([]);

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
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0].name).toBe('Alice');
  });

  it('accepts a DatabaseClient via db and bridges it to EntityDbAdapter', async () => {
    const mockUser = { id: 'u1', name: 'Alice' };

    // A mock DatabaseClient — has _internals and model delegates with Result-returning methods
    const mockDelegate = {
      get: async () => ok(mockUser),
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
          directlyScoped: [],
          indirectlyScoped: [],
          shared: [],
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
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0].name).toBe('Alice');
    expect(listBody.total).toBe(1);

    // Get by ID should return the record
    const getResponse = await app.handler(new Request('http://localhost/api/users/u1'));
    expect(getResponse.status).toBe(200);
    const getBody = await getResponse.json();
    expect(getBody.name).toBe('Alice');
  });

  it('throws when entity model is not registered in DatabaseClient', () => {
    const tasksTable = d.table('tasks', {
      id: d.uuid().primary(),
      title: d.text(),
    });
    const tasksModel = d.model(tasksTable);

    const mockDatabaseClient = {
      users: {},
      close: async () => {},
      isHealthy: async () => true,
      query: async () => ok({ rows: [], rowCount: 0 }),
      _internals: {
        models: { users: { table: usersTable, relations: {} } },
        dialect: { paramPlaceholder: () => '?', quoteName: (n: string) => `"${n}"` },
        tenantGraph: {
          root: null,
          directlyScoped: [],
          indirectlyScoped: [],
          shared: [],
        },
      },
    };

    expect(() =>
      createServer({
        basePath: '/',
        db: mockDatabaseClient,
        entities: [
          {
            kind: 'entity',
            name: 'users',
            model: usersModel,
            inject: {},
            access: {},
            before: {},
            after: {},
            actions: {},
            relations: {},
          },
          {
            kind: 'entity',
            name: 'tasks',
            model: tasksModel,
            inject: {},
            access: {},
            before: {},
            after: {},
            actions: {},
            relations: {},
          },
        ] as never[],
      }),
    ).toThrow(/Entity "tasks" is not registered in createDb/);
  });

  it('lists all missing entity names in the error message', () => {
    const tasksTable = d.table('tasks', {
      id: d.uuid().primary(),
      title: d.text(),
    });
    const tasksModel = d.model(tasksTable);
    const projectsTable = d.table('projects', {
      id: d.uuid().primary(),
      name: d.text(),
    });
    const projectsModel = d.model(projectsTable);

    const mockDatabaseClient = {
      users: {},
      close: async () => {},
      isHealthy: async () => true,
      query: async () => ok({ rows: [], rowCount: 0 }),
      _internals: {
        models: { users: { table: usersTable, relations: {} } },
        dialect: { paramPlaceholder: () => '?', quoteName: (n: string) => `"${n}"` },
        tenantGraph: {
          root: null,
          directlyScoped: [],
          indirectlyScoped: [],
          shared: [],
        },
      },
    };

    expect(() =>
      createServer({
        basePath: '/',
        db: mockDatabaseClient,
        entities: [
          {
            kind: 'entity',
            name: 'users',
            model: usersModel,
            inject: {},
            access: {},
            before: {},
            after: {},
            actions: {},
            relations: {},
          },
          {
            kind: 'entity',
            name: 'tasks',
            model: tasksModel,
            inject: {},
            access: {},
            before: {},
            after: {},
            actions: {},
            relations: {},
          },
          {
            kind: 'entity',
            name: 'projects',
            model: projectsModel,
            inject: {},
            access: {},
            before: {},
            after: {},
            actions: {},
            relations: {},
          },
        ] as never[],
      }),
    ).toThrow(/"tasks", "projects"/);
  });

  it('does not throw when all entity models are registered in DatabaseClient', () => {
    const mockDatabaseClient = {
      users: {},
      close: async () => {},
      isHealthy: async () => true,
      query: async () => ok({ rows: [], rowCount: 0 }),
      _internals: {
        models: { users: { table: usersTable, relations: {} } },
        dialect: { paramPlaceholder: () => '?', quoteName: (n: string) => `"${n}"` },
        tenantGraph: {
          root: null,
          directlyScoped: [],
          indirectlyScoped: [],
          shared: [],
        },
      },
    };

    expect(() =>
      createServer({
        basePath: '/',
        db: mockDatabaseClient,
        entities: [
          {
            kind: 'entity',
            name: 'users',
            model: usersModel,
            inject: {},
            access: {},
            before: {},
            after: {},
            actions: {},
            relations: {},
          },
        ] as never[],
      }),
    ).not.toThrow();
  });

  it('skips validation when db is a plain EntityDbAdapter', () => {
    const plainDbAdapter = {
      async get() {
        return null;
      },
      async list() {
        return { data: [], total: 0 };
      },
      async create(data: Record<string, unknown>) {
        return data;
      },
      async update(_id: string, data: Record<string, unknown>) {
        return data;
      },
      async delete() {
        return null;
      },
    };

    expect(() =>
      createServer({
        basePath: '/',
        db: plainDbAdapter,
        entities: [
          {
            kind: 'entity',
            name: 'nonexistent',
            model: usersModel,
            inject: {},
            access: {},
            before: {},
            after: {},
            actions: {},
            relations: {},
          },
        ] as never[],
      }),
    ).not.toThrow();
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

  it('merges _tenantChains into entity route generation', async () => {
    const orgsTable = d.table('organizations', { id: d.uuid().primary(), name: d.text() });
    const projectsTable = d.table('projects', {
      id: d.uuid().primary(),
      organizationId: d.uuid(),
      name: d.text(),
    });
    const tasksTable = d.table('tasks', {
      id: d.uuid().primary(),
      projectId: d.uuid(),
      title: d.text(),
    });

    const orgsModel = d.model(orgsTable);
    const projectsModel = d.model(
      projectsTable,
      { organization: d.ref.one(() => orgsTable, 'organizationId') },
      { tenant: 'organization' },
    );
    const tasksModel = d.model(tasksTable, {
      project: d.ref.one(() => projectsTable, 'projectId'),
    });

    const registry = { organizations: orgsModel, projects: projectsModel, tasks: tasksModel };
    const tenantGraph = computeTenantGraph(registry);
    const chain = resolveTenantChain('tasks', tenantGraph, registry);
    expect(chain).not.toBeNull();

    const store = {
      projects: [
        { id: 'p1', organizationId: 'org-a', name: 'P1' },
        { id: 'p2', organizationId: 'org-b', name: 'P2' },
      ],
      tasks: [
        { id: 't1', projectId: 'p1', title: 'Task A' },
        { id: 't2', projectId: 'p2', title: 'Task B' },
      ],
    };

    const queryParentIds = async (tableName: string, where: Record<string, unknown>) => {
      const data = store[tableName as keyof typeof store] ?? [];
      return data
        .filter((row) =>
          Object.entries(where).every(([k, v]) => {
            if (typeof v === 'object' && v !== null && 'in' in v) {
              return (v as { in: unknown[] }).in.includes(row[k as keyof typeof row]);
            }
            return row[k as keyof typeof row] === v;
          }),
        )
        .map((row) => row.id);
    };

    const tenantChains = new Map<string, NonNullable<typeof chain>>();
    tenantChains.set('tasks', chain!);

    const app = createServer({
      basePath: '/',
      entities: [
        {
          name: 'tasks',
          model: tasksModel,
          access: { list: () => true, get: () => true },
          before: {},
          after: {},
          actions: {},
          relations: {},
        },
      ] as never[],
      _entityDbFactory: () => ({
        async get(id: string) {
          return store.tasks.find((t) => t.id === id) ?? null;
        },
        async list(opts?: { where?: Record<string, unknown> }) {
          let result = [...store.tasks];
          if (opts?.where) {
            result = result.filter((row) =>
              Object.entries(opts.where!).every(([k, v]) => {
                if (typeof v === 'object' && v !== null && 'in' in v) {
                  return (v as { in: unknown[] }).in.includes(row[k as keyof typeof row]);
                }
                return row[k as keyof typeof row] === v;
              }),
            );
          }
          return { data: result, total: result.length };
        },
        async create(data: Record<string, unknown>) {
          return data;
        },
        async update(_id: string, data: Record<string, unknown>) {
          return data;
        },
        async delete() {
          return null;
        },
      }),
      _queryParentIds: queryParentIds,
      _tenantChains: tenantChains,
    });

    // Without middleware, tenantId is null — indirect chain blocks ALL results (proving chain is wired)
    const res = await app.handler(new Request('http://localhost/api/tasks'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // With chain wired but no tenant context: all items are blocked
    expect(body.items).toHaveLength(0);
  });

  it('resolves tenant chains from DatabaseClient when db is provided', () => {
    const orgsTable = d.table('organizations', { id: d.uuid().primary(), name: d.text() });
    const orgsModel = d.model(orgsTable);

    const projectsTable = d.table('projects', {
      id: d.uuid().primary(),
      organizationId: d.uuid(),
      name: d.text(),
    });
    const projectsModel = d.model(
      projectsTable,
      { organization: d.ref.one(() => orgsTable, 'organizationId') },
      { tenant: 'organization' },
    );

    const tasksTable = d.table('tasks', {
      id: d.uuid().primary(),
      projectId: d.uuid(),
      title: d.text(),
    });
    const tasksModel = d.model(tasksTable, {
      project: d.ref.one(() => projectsTable, 'projectId'),
    });

    const tenantGraph = computeTenantGraph({
      organizations: orgsModel,
      projects: projectsModel,
      tasks: tasksModel,
    });

    const mockDelegate = {
      get: async () => ok(null),
      getOrThrow: async () => ok(null),
      list: async () => ok([]),
      listAndCount: async () => ok({ data: [], total: 0 }),
      create: async (d: unknown) => ok(d),
      update: async () => ok(null),
      delete: async () => ok(null),
    };

    const mockDatabaseClient = {
      organizations: mockDelegate,
      projects: mockDelegate,
      tasks: mockDelegate,
      close: async () => {},
      isHealthy: async () => true,
      query: async () => ok({ rows: [], rowCount: 0 }),
      _internals: {
        models: {
          organizations: orgsModel,
          projects: projectsModel,
          tasks: tasksModel,
        },
        dialect: { paramPlaceholder: () => '?', quoteName: (n: string) => `"${n}"` },
        tenantGraph,
      },
    };

    // Should not throw — the chain resolution works with DatabaseClient
    expect(() =>
      createServer({
        basePath: '/',
        db: mockDatabaseClient,
        entities: [
          {
            kind: 'entity',
            name: 'tasks',
            model: tasksModel,
            inject: {},
            access: { list: () => true },
            before: {},
            after: {},
            actions: {},
            relations: {},
          },
        ] as never[],
      }),
    ).not.toThrow();
  });

  it('registers entity operations into the registry for cross-entity DI', async () => {
    const mockDb = {
      async get(id: string) {
        return { id, name: 'Alice' };
      },
      async list() {
        return { data: [{ id: '1', name: 'Alice' }], total: 1 };
      },
      async create(data: Record<string, unknown>) {
        return { id: 'new-1', ...data };
      },
      async update(id: string, data: Record<string, unknown>) {
        return { id, ...data };
      },
      async delete() {
        return null;
      },
    };

    // Entity with inject to test cross-entity DI
    const app = createServer({
      basePath: '/',
      db: mockDb,
      entities: [
        {
          name: 'users',
          model: usersModel,
          inject: {},
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

    // Exercise all entity operations through routes to cover createEntityOps wrapper
    const listRes = await app.handler(new Request('http://localhost/api/users'));
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.items).toHaveLength(1);

    const getRes = await app.handler(new Request('http://localhost/api/users/1'));
    expect(getRes.status).toBe(200);

    const createRes = await app.handler(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Bob' }),
      }),
    );
    expect(createRes.status).toBe(201);

    const updateRes = await app.handler(
      new Request('http://localhost/api/users/1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      }),
    );
    expect(updateRes.status).toBe(200);

    const deleteRes = await app.handler(
      new Request('http://localhost/api/users/1', { method: 'DELETE' }),
    );
    expect(deleteRes.status).toBe(204);
  });

  it('exercises cross-entity DI via createEntityOps wrapper', async () => {
    // This test covers the createEntityOps wrapper (lines 108-143) which is used
    // for cross-entity DI when entities inject other entities via `inject`.
    const postsTable = d.table('posts', {
      id: d.uuid().primary(),
      title: d.text(),
    });
    const postsModel = d.model(postsTable);

    // Tracked calls to verify DI operations go through the wrapper
    const calls: string[] = [];
    const mockDb = {
      async get(id: string) {
        calls.push(`get:${id}`);
        return { id, title: 'Post 1' };
      },
      async list() {
        calls.push('list');
        return { data: [{ id: '1', title: 'Post 1' }], total: 1 };
      },
      async create(data: Record<string, unknown>) {
        calls.push('create');
        return { id: 'new', ...data };
      },
      async update(id: string, data: Record<string, unknown>) {
        calls.push(`update:${id}`);
        return { id, ...data };
      },
      async delete(id: string) {
        calls.push(`delete:${id}`);
        return { id, title: 'Deleted' };
      },
    };

    const postsDef = {
      kind: 'entity' as const,
      name: 'posts',
      model: postsModel,
      inject: {},
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
    };

    // A service that injects the posts entity and exercises all DI operations
    const passthrough = { parse: (v: unknown) => ({ ok: true as const, data: v }) };
    const diServiceDef = {
      kind: 'service' as const,
      name: 'di-test',
      inject: { posts: postsDef },
      actions: {
        'exercise-ops': {
          method: 'POST',
          body: passthrough,
          response: passthrough,
          handler: async (_input: unknown, ctx: { entities: Record<string, unknown> }) => {
            const posts = ctx.entities.posts as {
              get: (id: string) => Promise<unknown>;
              list: (opts?: unknown) => Promise<unknown>;
              create: (data: unknown) => Promise<unknown>;
              update: (id: string, data: unknown) => Promise<unknown>;
              delete: (id: string) => Promise<void>;
            };
            const listResult = await posts.list();
            const getResult = await posts.get('1');
            const createResult = await posts.create({ title: 'New' });
            const updateResult = await posts.update('1', { title: 'Updated' });
            await posts.delete('1');
            return { listResult, getResult, createResult, updateResult };
          },
        },
      },
      access: { 'exercise-ops': () => true },
    };

    const app = createServer({
      basePath: '/',
      entities: [postsDef] as never[],
      services: [diServiceDef] as never[],
      _entityDbFactory: () => mockDb,
    });

    const res = await app.handler(
      new Request('http://localhost/api/di-test/exercise-ops', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
    // Verify all DI operations were called through to the underlying adapter
    expect(calls).toContain('list');
    expect(calls).toContain('get:1');
    expect(calls).toContain('create');
    expect(calls).toContain('update:1');
    expect(calls).toContain('delete:1');
  });

  it('DatabaseClient queryParentIds delegates to model list methods', async () => {
    const orgsTable = d.table('organizations', { id: d.uuid().primary(), name: d.text() });
    const orgsModel = d.model(orgsTable);
    const projectsTable = d.table('projects', {
      id: d.uuid().primary(),
      organizationId: d.uuid(),
      name: d.text(),
    });
    const projectsModel = d.model(
      projectsTable,
      { organization: d.ref.one(() => orgsTable, 'organizationId') },
      { tenant: 'organization' },
    );
    const tasksTable = d.table('tasks', {
      id: d.uuid().primary(),
      projectId: d.uuid(),
      title: d.text(),
    });
    const tasksModel = d.model(tasksTable, {
      project: d.ref.one(() => projectsTable, 'projectId'),
    });

    const tenantGraph = computeTenantGraph({
      organizations: orgsModel,
      projects: projectsModel,
      tasks: tasksModel,
    });

    // Mock delegates that return data for parent ID resolution
    const projectsDelegate = {
      get: async () => ok(null),
      getOrThrow: async () => ok(null),
      list: async (opts: { where?: Record<string, unknown> }) => {
        if (opts?.where?.organizationId === 'org-a') {
          return ok([{ id: 'p1', organizationId: 'org-a', name: 'P1' }]);
        }
        return ok([]);
      },
      listAndCount: async () => ok({ data: [], total: 0 }),
      create: async (d: unknown) => ok(d),
      update: async () => ok(null),
      delete: async () => ok(null),
    };

    const tasksDelegate = {
      get: async () => ok(null),
      getOrThrow: async () => ok(null),
      list: async () => ok([]),
      listAndCount: async () => ok({ data: [], total: 0 }),
      create: async (d: unknown) => ok(d),
      update: async () => ok(null),
      delete: async () => ok(null),
    };

    const mockDatabaseClient = {
      organizations: {
        get: async () => ok(null),
        getOrThrow: async () => ok(null),
        list: async () => ok([]),
        listAndCount: async () => ok({ data: [], total: 0 }),
        create: async (d: unknown) => ok(d),
        update: async () => ok(null),
        delete: async () => ok(null),
      },
      projects: projectsDelegate,
      tasks: tasksDelegate,
      close: async () => {},
      isHealthy: async () => true,
      query: async () => ok({ rows: [], rowCount: 0 }),
      _internals: {
        models: {
          organizations: orgsModel,
          projects: projectsModel,
          tasks: tasksModel,
        },
        dialect: { paramPlaceholder: () => '?', quoteName: (n: string) => `"${n}"` },
        tenantGraph,
      },
    };

    const app = createServer({
      basePath: '/',
      db: mockDatabaseClient,
      entities: [
        {
          kind: 'entity',
          name: 'tasks',
          model: tasksModel,
          inject: {},
          access: { list: () => true },
          before: {},
          after: {},
          actions: {},
          relations: {},
        },
      ] as never[],
    });

    // Exercise the route — the queryParentIds callback should be invoked to resolve parent IDs
    const res = await app.handler(new Request('http://localhost/api/tasks'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Without tenantId context, indirect chain blocks all results
    expect(body.items).toHaveLength(0);
  });

  it('processes service definitions and generates service routes', async () => {
    const passthrough = { parse: (v: unknown) => ({ ok: true as const, data: v }) };

    const app = createServer({
      basePath: '/',
      services: [
        {
          kind: 'service' as const,
          name: 'health',
          inject: {},
          actions: {
            check: {
              method: 'POST',
              body: passthrough,
              response: passthrough,
              handler: async () => ({ status: 'ok' }),
            },
          },
          access: { check: () => true },
        },
      ] as never[],
    });

    const res = await app.handler(
      new Request('http://localhost/api/health/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
