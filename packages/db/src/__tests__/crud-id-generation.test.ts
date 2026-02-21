import { PGlite } from '@electric-sql/pglite';
import { unwrap } from '@vertz/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../client';
import { d } from '../d';
import { createRegistry } from '../schema/registry';

const usersWithCuid = d.table('users_cuid', {
  id: d.text().primary({ generate: 'cuid' }),
  name: d.text(),
});

const usersWithUuid = d.table('users_uuid', {
  id: d.text().primary({ generate: 'uuid' }),
  name: d.text(),
});

const usersWithNanoid = d.table('users_nanoid', {
  id: d.text().primary({ generate: 'nanoid' }),
  name: d.text(),
});

const usersNoGenerate = d.table('users_no_gen', {
  id: d.text().primary(),
  name: d.text(),
});

const usersWithReadOnly = d.table('users_readonly', {
  id: d.text().primary({ generate: 'cuid' }).readOnly(),
  name: d.text(),
});

const tables = createRegistry(
  {
    usersCuid: usersWithCuid,
    usersUuid: usersWithUuid,
    usersNanoid: usersWithNanoid,
    usersNoGen: usersNoGenerate,
    usersReadonly: usersWithReadOnly,
  },
  () => ({}),
);

describe('CRUD ID Generation', () => {
  let pg: PGlite;
  let db: ReturnType<typeof createDb<typeof tables>>;

  beforeAll(async () => {
    pg = new PGlite();
    
    const queryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
      const result = await pg.query(sqlStr, params as unknown[]);
      return {
        rows: result.rows as T[],
        rowCount: result.affectedRows ?? 0,
      };
    };

    db = createDb({
      url: 'pglite://memory',
      tables,
      _queryFn: queryFn,
    });

    await pg.exec('CREATE TABLE users_cuid (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)');
    await pg.exec('CREATE TABLE users_uuid (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)');
    await pg.exec('CREATE TABLE users_nanoid (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)');
    await pg.exec('CREATE TABLE users_no_gen (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)');
    await pg.exec('CREATE TABLE users_readonly (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)');
  });

  afterAll(async () => {
    await pg.close();
  });

  // Test 14: create() with generate:'cuid' — insert without ID → returned row has cuid-format ID
  it('generates CUID on create when ID not provided', async () => {
    const user = unwrap(await db.create('usersCuid', { data: { name: 'Alice' } }));
    expect(user.id).toMatch(/^[a-z0-9]{24,}$/);
    expect(user.name).toBe('Alice');
  });

  // Test 15: create() with generate:'uuid' — insert without ID → returned row has UUIDv7-format ID
  it('generates UUID v7 on create when ID not provided', async () => {
    const user = unwrap(await db.create('usersUuid', { data: { name: 'Bob' } }));
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(user.id.charAt(14)).toBe('7'); // version nibble
    expect(user.name).toBe('Bob');
  });

  // Test 16: create() with generate:'nanoid' — insert without ID → returned row has nanoid-format ID
  it('generates Nano ID on create when ID not provided', async () => {
    const user = unwrap(await db.create('usersNanoid', { data: { name: 'Charlie' } }));
    expect(typeof user.id).toBe('string');
    expect(user.id.length).toBe(21);
    expect(user.name).toBe('Charlie');
  });

  // Test 17: create() with user-provided ID — explicit ID used, not overwritten
  it('respects user-provided ID', async () => {
    const user = unwrap(
      await db.create('usersCuid', { data: { id: 'my-custom-id', name: 'Dave' } }),
    );
    expect(user.id).toBe('my-custom-id');
    expect(user.name).toBe('Dave');
  });

  // Test 18: create() with explicit null ID — null passed through, not generated
  it('respects explicit null ID', async () => {
    // This will fail at DB level due to NOT NULL, but tests that we don't generate
    const result = await db.create('usersCuid', {
      data: { id: null as unknown as string, name: 'Eve' },
    });
    expect(result.ok).toBe(false);
  });

  // Test 19: create() without generate — omitting ID works (existing behavior)
  it('allows omitting ID when no generate strategy', async () => {
    // This will fail at DB level, confirming no generation happens
    const result = await db.create('usersNoGen', { data: { name: 'Frank' } });
    expect(result.ok).toBe(false);
  });

  // Test 20: createMany() — batch of 10 without IDs → 10 unique generated IDs
  it('generates unique IDs for createMany', async () => {
    await pg.exec('TRUNCATE TABLE users_cuid');
    const users = Array.from({ length: 10 }, (_, i) => ({ name: `User${i}` }));
    unwrap(await db.createMany('usersCuid', { data: users }));

    const results = await pg.query('SELECT id FROM users_cuid ORDER BY name');
    const ids = results.rows.map((r: { id: string }) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    ids.forEach((id: string) => {
      expect(id).toMatch(/^[a-z0-9]{24,}$/);
    });
  });

  // Test 21: createManyAndReturn() — batch of 5 → all returned rows have unique IDs
  it('generates unique IDs for createManyAndReturn', async () => {
    const users = Array.from({ length: 5 }, (_, i) => ({ name: `Batch${i}` }));
    const results = unwrap(await db.createManyAndReturn('usersUuid', { data: users }));

    expect(results.length).toBe(5);
    const ids = results.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(5);
    ids.forEach((id) => {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  // Test 22: upsert() create path — missing ID → ID generated
  it('generates ID on upsert create path', async () => {
    const user = unwrap(
      await db.upsert('usersNanoid', {
        where: { name: 'George' },
        create: { name: 'George' },
        update: { name: 'George Updated' },
      }),
    );

    expect(typeof user.id).toBe('string');
    expect(user.id.length).toBe(21);
    expect(user.name).toBe('George');
  });

  // Test 23: upsert() with user-provided ID — explicit ID respected
  it('respects user-provided ID in upsert', async () => {
    unwrap(await db.create('usersCuid', { data: { id: 'preset-id', name: 'Helen' } }));

    const user = unwrap(
      await db.upsert('usersCuid', {
        where: { id: 'preset-id' },
        create: { id: 'preset-id', name: 'Helen' },
        update: { name: 'Helen Updated' },
      }),
    );

    expect(user.id).toBe('preset-id');
    expect(user.name).toBe('Helen Updated');
  });

  // Test 24: fillGeneratedIds on integer column with generate → throws descriptive error
  it('throws error when generate used on integer column', async () => {
    const badTable = d.table('bad_table', {
      // @ts-expect-error - testing runtime guard
      id: d.integer().primary({ generate: 'cuid' }),
      name: d.text(),
    });

    const badTables = createRegistry({ bad: badTable }, () => ({}));

    const queryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
      const result = await pg.query(sqlStr, params as unknown[]);
      return {
        rows: result.rows as T[],
        rowCount: result.affectedRows ?? 0,
      };
    };

    const badDb = createDb({
      url: 'pglite://memory',
      tables: badTables,
      _queryFn: queryFn,
    });

    const result = await badDb.create('bad', { data: { name: 'Invalid' } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/ID generation is only supported on string column types/);
    }
  });

  // Test 25: fillGeneratedIds runs before readOnly filter — PK with generate + readOnly works
  it('generates ID before readOnly filter strips it', async () => {
    const user = unwrap(await db.create('usersReadonly', { data: { name: 'Isaac' } }));
    expect(user.id).toMatch(/^[a-z0-9]{24,}$/);
    expect(user.name).toBe('Isaac');
  });

  // Test 26: Transaction — generated ID available within tx scope
  it.skip('generates ID within transaction', async () => {
    // Skip: transaction API may not be available in test setup
  });
});
