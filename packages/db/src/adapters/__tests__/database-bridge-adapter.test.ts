import { describe, expect, it } from 'bun:test';
import { ok } from '@vertz/schema';
import type { DatabaseClient, ModelDelegate } from '../../client/database';
import { d } from '../../d';
import { createDatabaseBridgeAdapter } from '../database-bridge-adapter';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.text(),
});

const models = { users: d.model(usersTable) };

// ---------------------------------------------------------------------------
// Mock DatabaseClient
// ---------------------------------------------------------------------------

function createMockDelegate(
  overrides: Partial<ModelDelegate<(typeof models)['users']>> = {},
): ModelDelegate<(typeof models)['users']> {
  return {
    get: async () => ok(null),
    getOrThrow: async () => ok(null as never),
    list: async () => ok([]),
    listAndCount: async () => ok({ data: [], total: 0 }),
    create: async () => ok({} as never),
    createMany: async () => ok({ count: 0 }),
    createManyAndReturn: async () => ok([]),
    update: async () => ok({} as never),
    updateMany: async () => ok({ count: 0 }),
    upsert: async () => ok({} as never),
    delete: async () => ok({} as never),
    deleteMany: async () => ok({ count: 0 }),
    count: async () => ok(0),
    aggregate: async () => ok({} as never),
    groupBy: async () => ok([] as never),
    ...overrides,
  } as ModelDelegate<(typeof models)['users']>;
}

function createMockDb(
  delegateOverrides: Partial<ModelDelegate<(typeof models)['users']>> = {},
): DatabaseClient<typeof models> {
  return {
    users: createMockDelegate(delegateOverrides),
    query: async () => ok({ rows: [], rowCount: 0 }),
    close: async () => {},
    isHealthy: async () => true,
    _internals: {
      models,
      dialect: { paramPlaceholder: () => '?', quoteName: (n: string) => `"${n}"` },
      tenantGraph: {
        root: null,
        directlyScoped: new Set(),
        indirectlyScoped: new Set(),
        shared: new Set(),
      },
    },
  } as DatabaseClient<typeof models>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createDatabaseBridgeAdapter', () => {
  it('get() delegates to delegate.get and unwraps Result', async () => {
    const mockUser = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    const db = createMockDb({
      get: async () => ok(mockUser),
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.get('u1');

    expect(result).toEqual(mockUser);
  });

  it('get() returns null when delegate.get returns ok(null)', async () => {
    const db = createMockDb({
      get: async () => ok(null),
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.get('nonexistent');

    expect(result).toBeNull();
  });

  it('list() delegates to delegate.listAndCount and unwraps Result', async () => {
    const mockUsers = [
      { id: 'u1', name: 'Alice', email: 'alice@example.com' },
      { id: 'u2', name: 'Bob', email: 'bob@example.com' },
    ];
    const db = createMockDb({
      listAndCount: async () => ok({ data: mockUsers, total: 2 }),
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.list();

    expect(result).toEqual({ data: mockUsers, total: 2 });
  });

  it('list() passes where and limit options to delegate.listAndCount', async () => {
    let capturedOptions: unknown;
    const db = createMockDb({
      listAndCount: async (options?: unknown) => {
        capturedOptions = options;
        return ok({ data: [], total: 0 });
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.list({ where: { name: 'Alice' }, limit: 10 });

    expect(capturedOptions).toEqual(
      expect.objectContaining({ where: { name: 'Alice' }, limit: 10 }),
    );
  });

  it('create() delegates to delegate.create with { data } wrapper and unwraps Result', async () => {
    const inputData = { name: 'Charlie', email: 'charlie@example.com' };
    const createdRecord = { id: 'u3', ...inputData };
    let capturedOptions: unknown;

    const db = createMockDb({
      create: async (options?: unknown) => {
        capturedOptions = options;
        return ok(createdRecord);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.create(inputData);

    expect(result).toEqual(createdRecord);
    expect(capturedOptions).toEqual({ data: inputData });
  });

  it('update() delegates to delegate.update with { where: { id }, data } and unwraps Result', async () => {
    const updateData = { name: 'Alice Updated' };
    const updatedRecord = { id: 'u1', name: 'Alice Updated', email: 'alice@example.com' };
    let capturedOptions: unknown;

    const db = createMockDb({
      update: async (options?: unknown) => {
        capturedOptions = options;
        return ok(updatedRecord);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.update('u1', updateData);

    expect(result).toEqual(updatedRecord);
    expect(capturedOptions).toEqual({ where: { id: 'u1' }, data: updateData });
  });

  it('update() merges where option into delegate.update alongside id', async () => {
    const updateData = { name: 'Alice Updated' };
    const updatedRecord = { id: 'u1', name: 'Alice Updated', email: 'alice@example.com' };
    let capturedOptions: unknown;

    const db = createMockDb({
      update: async (options?: unknown) => {
        capturedOptions = options;
        return ok(updatedRecord);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.update('u1', updateData, { where: { email: 'alice@example.com' } });

    expect(capturedOptions).toEqual({
      where: { email: 'alice@example.com', id: 'u1' },
      data: updateData,
    });
  });

  it('update() without options still delegates with { id } only', async () => {
    const updateData = { name: 'Alice Updated' };
    const updatedRecord = { id: 'u1', name: 'Alice Updated', email: 'alice@example.com' };
    let capturedOptions: unknown;

    const db = createMockDb({
      update: async (options?: unknown) => {
        capturedOptions = options;
        return ok(updatedRecord);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.update('u1', updateData);

    expect(capturedOptions).toEqual({ where: { id: 'u1' }, data: updateData });
  });

  it('delete() merges where option into delegate.delete alongside id', async () => {
    const deletedRecord = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    let capturedOptions: unknown;

    const db = createMockDb({
      delete: async (options?: unknown) => {
        capturedOptions = options;
        return ok(deletedRecord);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.delete('u1', { where: { name: 'Alice' } });

    expect(capturedOptions).toEqual({ where: { name: 'Alice', id: 'u1' } });
  });

  it('delete() without options still delegates with { id } only', async () => {
    const deletedRecord = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    let capturedOptions: unknown;

    const db = createMockDb({
      delete: async (options?: unknown) => {
        capturedOptions = options;
        return ok(deletedRecord);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.delete('u1');

    expect(capturedOptions).toEqual({ where: { id: 'u1' } });
  });

  it('delete() delegates to delegate.delete with { where: { id } } and unwraps Result', async () => {
    const deletedRecord = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    let capturedOptions: unknown;

    const db = createMockDb({
      delete: async (options?: unknown) => {
        capturedOptions = options;
        return ok(deletedRecord);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.delete('u1');

    expect(result).toEqual(deletedRecord);
    expect(capturedOptions).toEqual({ where: { id: 'u1' } });
  });

  it('delete() returns null when delegate.delete returns an error', async () => {
    const db = createMockDb({
      delete: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } }),
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.delete('nonexistent');

    expect(result).toBeNull();
  });

  it('get() returns null when delegate.get returns an error result', async () => {
    const db = createMockDb({
      get: async () => ({
        ok: false as const,
        error: { code: 'QUERY_ERROR' as const, message: 'connection failed' },
      }),
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.get('u1');

    expect(result).toBeNull();
  });

  it('list() throws when delegate.listAndCount returns an error result', async () => {
    const errorObj = { code: 'QUERY_ERROR' as const, message: 'connection failed' };
    const db = createMockDb({
      listAndCount: async () => ({
        ok: false as const,
        error: errorObj,
      }),
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await expect(adapter.list()).rejects.toEqual(errorObj);
  });

  it('create() throws when delegate.create returns an error result', async () => {
    const errorObj = { code: 'CONSTRAINT_ERROR' as const, message: 'duplicate key' };
    const db = createMockDb({
      create: async () => ({
        ok: false as const,
        error: errorObj,
      }),
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await expect(adapter.create({ name: 'Test', email: 'test@x.com' })).rejects.toEqual(errorObj);
  });

  it('update() throws when delegate.update returns an error result', async () => {
    const errorObj = { code: 'CONSTRAINT_ERROR' as const, message: 'constraint violation' };
    const db = createMockDb({
      update: async () => ({
        ok: false as const,
        error: errorObj,
      }),
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await expect(adapter.update('u1', { name: 'Updated' })).rejects.toEqual(errorObj);
  });

  it('get() merges where option into delegate.get alongside id', async () => {
    let capturedOptions: unknown;
    const mockUser = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    const db = createMockDb({
      get: async (options?: unknown) => {
        capturedOptions = options;
        return ok(mockUser);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.get('u1', { where: { name: 'Alice' } });

    expect(capturedOptions).toEqual(
      expect.objectContaining({ where: { name: 'Alice', id: 'u1' } }),
    );
  });

  it('get() merges include and where options into delegate.get', async () => {
    let capturedOptions: unknown;
    const mockUser = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    const db = createMockDb({
      get: async (options?: unknown) => {
        capturedOptions = options;
        return ok(mockUser);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.get('u1', { include: { posts: true }, where: { email: 'alice@example.com' } });

    expect(capturedOptions).toEqual({
      where: { email: 'alice@example.com', id: 'u1' },
      include: { posts: true },
    });
  });

  it('get() without where still delegates with { id } only', async () => {
    let capturedOptions: unknown;
    const mockUser = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    const db = createMockDb({
      get: async (options?: unknown) => {
        capturedOptions = options;
        return ok(mockUser);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.get('u1');

    expect(capturedOptions).toEqual({ where: { id: 'u1' } });
  });

  it('get() passes include option to delegate.get', async () => {
    let capturedOptions: unknown;
    const mockUser = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    const db = createMockDb({
      get: async (options?: unknown) => {
        capturedOptions = options;
        return ok(mockUser);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.get('u1', { include: { posts: true } });

    expect(capturedOptions).toEqual(
      expect.objectContaining({ where: { id: 'u1' }, include: { posts: true } }),
    );
  });

  it('get() id is never overwritten by where conditions (spread order safety)', async () => {
    let capturedOptions: unknown;
    const mockUser = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    const db = createMockDb({
      get: async (options?: unknown) => {
        capturedOptions = options;
        return ok(mockUser);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    // Even if where contains 'id', the primary key id should always win
    await adapter.get('u1', { where: { id: 'malicious-id' } as Record<string, unknown> });

    expect((capturedOptions as { where: Record<string, unknown> }).where.id).toBe('u1');
  });

  // -------------------------------------------------------------------------
  // Composite ID (Record<string, string>) support
  // -------------------------------------------------------------------------

  it('get() with Record<string, string> spreads into where clause', async () => {
    let capturedOptions: unknown;
    const mockUser = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    const db = createMockDb({
      get: async (options?: unknown) => {
        capturedOptions = options;
        return ok(mockUser);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.get({ projectId: 'p1', userId: 'u1' });

    expect(capturedOptions).toEqual({ where: { projectId: 'p1', userId: 'u1' } });
  });

  it('update() with Record<string, string> spreads into where clause', async () => {
    let capturedOptions: unknown;
    const db = createMockDb({
      update: async (options?: unknown) => {
        capturedOptions = options;
        return ok({} as never);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.update({ projectId: 'p1', userId: 'u1' }, { name: 'Updated' });

    expect(capturedOptions).toMatchObject({ where: { projectId: 'p1', userId: 'u1' } });
  });

  it('delete() with Record<string, string> spreads into where clause', async () => {
    let capturedOptions: unknown;
    const db = createMockDb({
      delete: async (options?: unknown) => {
        capturedOptions = options;
        return ok({} as never);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.delete({ projectId: 'p1', userId: 'u1' });

    expect(capturedOptions).toEqual({ where: { projectId: 'p1', userId: 'u1' } });
  });

  it('get() with Record ID merges with options.where', async () => {
    let capturedOptions: unknown;
    const mockUser = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    const db = createMockDb({
      get: async (options?: unknown) => {
        capturedOptions = options;
        return ok(mockUser);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.get(
      { projectId: 'p1', userId: 'u1' },
      { where: { active: true } as Record<string, unknown> },
    );

    expect(capturedOptions).toEqual({
      where: { active: true, projectId: 'p1', userId: 'u1' },
    });
  });

  // -------------------------------------------------------------------------
  // Cursor forwarding
  // -------------------------------------------------------------------------

  it('list() forwards after cursor to delegate as cursor option', async () => {
    let capturedOptions: unknown;
    const db = createMockDb({
      listAndCount: async (options?: unknown) => {
        capturedOptions = options;
        return ok({ data: [], total: 0 });
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.list({ after: 'cursor-123' });

    expect(capturedOptions).toMatchObject({ cursor: { id: 'cursor-123' } });
  });

  it('list() passes orderBy and include options to delegate.listAndCount', async () => {
    let capturedOptions: unknown;
    const db = createMockDb({
      listAndCount: async (options?: unknown) => {
        capturedOptions = options;
        return ok({ data: [], total: 0 });
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    await adapter.list({
      orderBy: { name: 'asc' },
      include: { posts: true },
    });

    expect(capturedOptions).toEqual(
      expect.objectContaining({
        orderBy: { name: 'asc' },
        include: { posts: true },
      }),
    );
  });
});
