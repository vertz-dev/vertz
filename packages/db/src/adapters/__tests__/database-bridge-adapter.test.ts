import { describe, expect, it } from 'bun:test';
import { ok } from '@vertz/schema';
import type { DatabaseInstance } from '../../client/database';
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
// Mock DatabaseInstance
// ---------------------------------------------------------------------------

function createMockDb(
  overrides: Partial<DatabaseInstance<typeof models>> = {},
): DatabaseInstance<typeof models> {
  return {
    _models: models,
    _dialect: { paramPlaceholder: () => '?', quoteName: (n: string) => `"${n}"` },
    $tenantGraph: {
      root: null,
      directlyScoped: new Set(),
      indirectlyScoped: new Set(),
      shared: new Set(),
    },
    query: async () => ok({ rows: [], rowCount: 0 }),
    close: async () => {},
    isHealthy: async () => true,
    get: async () => ok(null),
    getRequired: async () => ok(null as never),
    getOrThrow: async () => ok(null as never),
    list: async () => ok([]),
    listAndCount: async () => ok({ data: [], total: 0 }),
    findOne: async () => ok(null),
    findOneRequired: async () => ok(null as never),
    findOneOrThrow: async () => ok(null as never),
    findMany: async () => ok([]),
    findManyAndCount: async () => ok({ data: [], total: 0 }),
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
    ...overrides,
  } as DatabaseInstance<typeof models>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createDatabaseBridgeAdapter', () => {
  it('get() delegates to db.get and unwraps Result', async () => {
    const mockUser = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    const db = createMockDb({
      get: async () => ok(mockUser),
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.get('u1');

    expect(result).toEqual(mockUser);
  });

  it('get() returns null when db.get returns ok(null)', async () => {
    const db = createMockDb({
      get: async () => ok(null),
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.get('nonexistent');

    expect(result).toBeNull();
  });

  it('list() delegates to db.listAndCount and unwraps Result', async () => {
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

  it('list() passes where and limit options to db.listAndCount', async () => {
    let capturedOptions: unknown;
    const db = createMockDb({
      listAndCount: async (_table: string, options?: unknown) => {
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

  it('create() delegates to db.create with { data } wrapper and unwraps Result', async () => {
    const inputData = { name: 'Charlie', email: 'charlie@example.com' };
    const createdRecord = { id: 'u3', ...inputData };
    let capturedOptions: unknown;

    const db = createMockDb({
      create: async (_table: string, options?: unknown) => {
        capturedOptions = options;
        return ok(createdRecord);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.create(inputData);

    expect(result).toEqual(createdRecord);
    expect(capturedOptions).toEqual({ data: inputData });
  });

  it('update() delegates to db.update with { where: { id }, data } and unwraps Result', async () => {
    const updateData = { name: 'Alice Updated' };
    const updatedRecord = { id: 'u1', name: 'Alice Updated', email: 'alice@example.com' };
    let capturedOptions: unknown;

    const db = createMockDb({
      update: async (_table: string, options?: unknown) => {
        capturedOptions = options;
        return ok(updatedRecord);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.update('u1', updateData);

    expect(result).toEqual(updatedRecord);
    expect(capturedOptions).toEqual({ where: { id: 'u1' }, data: updateData });
  });

  it('delete() delegates to db.delete with { where: { id } } and unwraps Result', async () => {
    const deletedRecord = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    let capturedOptions: unknown;

    const db = createMockDb({
      delete: async (_table: string, options?: unknown) => {
        capturedOptions = options;
        return ok(deletedRecord);
      },
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.delete('u1');

    expect(result).toEqual(deletedRecord);
    expect(capturedOptions).toEqual({ where: { id: 'u1' } });
  });

  it('delete() returns null when db.delete returns an error', async () => {
    const db = createMockDb({
      delete: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'not found' } }),
    });

    const adapter = createDatabaseBridgeAdapter(db, 'users');
    const result = await adapter.delete('nonexistent');

    expect(result).toBeNull();
  });
});
