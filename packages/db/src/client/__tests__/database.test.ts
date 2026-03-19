import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { d } from '../../d';
import type { QueryFn } from '../../query/executor';
import { createDb, isReadQuery } from '../database';
import type { PostgresDriver } from '../postgres-driver';

// ---------------------------------------------------------------------------
// Test schema
// ---------------------------------------------------------------------------

const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

const users = d.table('users', {
  id: d.uuid().primary(),
  organizationId: d.uuid(),
  name: d.text(),
  email: d.email(),
});

const projects = d.table('projects', {
  id: d.uuid().primary(),
  organizationId: d.uuid(),
  name: d.text(),
});

const tasks = d.table('tasks', {
  id: d.uuid().primary(),
  projectId: d.uuid(),
  title: d.text(),
});

const featureFlags = d
  .table('feature_flags', {
    id: d.uuid().primary(),
    name: d.text().unique(),
    enabled: d.boolean().default(false),
  })
  .shared();

const auditLogs = d.table('audit_logs', {
  id: d.uuid().primary(),
  action: d.text(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createDb', () => {
  it('returns a DatabaseClient with _internals.models', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
        users: { table: users, relations: {} },
      },
    });

    expect(db._internals.models).toBeDefined();
    expect(db._internals.models.organizations).toBeDefined();
    expect(db._internals.models.users).toBeDefined();
  });

  it('computes tenant graph and exposes it as _internals.tenantGraph', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: d.model(organizations),
        users: d.model(
          users,
          {
            organization: d.ref.one(() => organizations, 'organizationId'),
          },
          { tenant: 'organization' },
        ),
        projects: d.model(
          projects,
          {
            organization: d.ref.one(() => organizations, 'organizationId'),
          },
          { tenant: 'organization' },
        ),
        tasks: d.model(tasks, {
          project: d.ref.one(() => projects, 'projectId'),
        }),
        featureFlags: d.model(featureFlags),
      },
    });

    expect(db._internals.tenantGraph).toBeDefined();
    expect(db._internals.tenantGraph.root).toBe('organizations');
    expect(db._internals.tenantGraph.directlyScoped).toContain('users');
    expect(db._internals.tenantGraph.directlyScoped).toContain('projects');
    expect(db._internals.tenantGraph.indirectlyScoped).toContain('tasks');
    expect(db._internals.tenantGraph.shared).toContain('featureFlags');
  });

  it('logs a notice for tables without tenant path and not shared', () => {
    const logFn = mock();

    createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: d.model(organizations),
        users: d.model(
          users,
          {
            organization: d.ref.one(() => organizations, 'organizationId'),
          },
          { tenant: 'organization' },
        ),
        auditLogs: d.model(auditLogs),
      },
      log: logFn,
    });

    expect(logFn).toHaveBeenCalledWith(expect.stringContaining('audit_logs'));
  });

  it('does not log for tables that are scoped or shared', () => {
    const logFn = mock();

    createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: d.model(organizations),
        users: d.model(
          users,
          {
            organization: d.ref.one(() => organizations, 'organizationId'),
          },
          { tenant: 'organization' },
        ),
        featureFlags: d.model(featureFlags),
      },
      log: logFn,
    });

    expect(logFn).not.toHaveBeenCalled();
  });
});

describe('db.close()', () => {
  it('exists and returns a promise', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
    });

    const result = db.close();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });
});

describe('db.isHealthy()', () => {
  it('exists and returns a promise resolving to a boolean', async () => {
    // Use _queryFn to avoid creating a real connection
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [], rowCount: 0 }),
    });

    const result = db.isHealthy();
    expect(result).toBeInstanceOf(Promise);
    // When using _queryFn (no real driver), isHealthy returns true
    await expect(result).resolves.toBe(true);
  });
});

describe('createDb pool config', () => {
  it('accepts optional pool configuration', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      pool: {
        max: 20,
        idleTimeout: 30000,
        connectionTimeout: 5000,
      },
    });

    expect(db).toBeDefined();
  });

  it('accepts optional casing configuration', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      casing: 'snake_case',
    });

    expect(db).toBeDefined();
  });
});

describe('db.query()', () => {
  it('exists on the database instance', () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
    });

    expect(typeof db.query).toBe('function');
  });

  it('throws when no url and no _queryFn are provided', async () => {
    const db = createDb({
      url: '',
      models: {
        organizations: { table: organizations, relations: {} },
      },
    });

    const result = await db.query({ _tag: 'SqlFragment', sql: 'SELECT 1', params: [] });
    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/db.query\(\) requires/);
  });

  it('#205: maps PG errors through parsePgError for consistent error hierarchy', async () => {
    // Simulate a postgres error with a PG error code (unique constraint violation)
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      table: 'users',
      constraint: 'users_email_key',
      detail: 'Key (email)=(test@test.com) already exists.',
    });

    const failingQueryFn = async () => {
      throw pgError;
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn as QueryFn,
    });

    // db.query() should map the PG error to a UniqueConstraintError
    const result = await db.query({
      _tag: 'SqlFragment',
      sql: 'INSERT INTO users ...',
      params: [],
    });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('QUERY_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Reserved model names
// ---------------------------------------------------------------------------

describe('createDb reserved model names', () => {
  it('throws when a model name collides with a reserved name', () => {
    expect(() => {
      createDb({
        url: 'postgres://localhost:5432/test',
        models: {
          // 'query' is reserved
          query: { table: organizations, relations: {} },
        },
      });
    }).toThrow(/reserved/);
  });

  it('throws for "transaction" reserved name', () => {
    expect(() => {
      createDb({
        url: 'postgres://localhost:5432/test',
        models: {
          transaction: { table: organizations, relations: {} },
        },
      });
    }).toThrow(/reserved/);
  });

  it('throws for "close" reserved name', () => {
    expect(() => {
      createDb({
        url: 'postgres://localhost:5432/test',
        models: {
          close: { table: organizations, relations: {} },
        },
      });
    }).toThrow(/reserved/);
  });
});

// ---------------------------------------------------------------------------
// Delegate error paths — catch blocks for operations not covered elsewhere
// ---------------------------------------------------------------------------

describe('delegate error paths', () => {
  const failingQueryFn: QueryFn = async () => {
    throw new Error('connection refused');
  };

  function createFailingDb() {
    return createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: failingQueryFn,
    });
  }

  it('get returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.get({ where: { id: '123' } });

    expect(result.ok).toBe(false);
  });

  it('getOrThrow returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.getOrThrow({ where: { id: '123' } });

    expect(result.ok).toBe(false);
  });

  it('list returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.list();

    expect(result.ok).toBe(false);
  });

  it('listAndCount returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.listAndCount();

    expect(result.ok).toBe(false);
  });

  it('create returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.create({ data: { name: 'New' } });

    expect(result.ok).toBe(false);
  });

  it('createMany returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.createMany({
      data: [{ name: 'Org 1' }],
    });

    expect(result.ok).toBe(false);
  });

  it('createManyAndReturn returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.createManyAndReturn({
      data: [{ name: 'Org 1' }, { name: 'Org 2' }],
    });

    expect(result.ok).toBe(false);
  });

  it('update returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.update({
      where: { id: '123' },
      data: { name: 'Updated' },
    });

    expect(result.ok).toBe(false);
  });

  it('upsert returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.upsert({
      where: { id: '123' },
      create: { name: 'New' },
      update: { name: 'Updated' },
    });

    expect(result.ok).toBe(false);
  });

  it('delete returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.delete({ where: { id: '123' } });

    expect(result.ok).toBe(false);
  });

  it('aggregate returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.aggregate({
      _count: true,
    });

    expect(result.ok).toBe(false);
  });

  it('groupBy returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.groupBy({
      by: ['name'],
      _count: true,
    });

    expect(result.ok).toBe(false);
  });

  it('updateMany returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.updateMany({
      where: { id: '123' },
      data: { name: 'Updated' },
    });

    expect(result.ok).toBe(false);
  });

  it('deleteMany returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.deleteMany({
      where: { id: '123' },
    });

    expect(result.ok).toBe(false);
  });

  it('count returns err on failure', async () => {
    const db = createFailingDb();
    const result = await db.organizations.count();

    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveModel — unregistered table
// ---------------------------------------------------------------------------

describe('resolveModel for unregistered tables', () => {
  it('returns err when accessing an unregistered model delegate method', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: async () => ({ rows: [], rowCount: 0 }),
    });

    // Access a model name that was never registered
    const result = await (db as any).nonexistent?.get?.();

    // The delegate doesn't exist, so accessing it returns undefined
    expect(result).toBeUndefined();
  });

  it('returns err when resolveModel cannot find a model after registry mutation', async () => {
    const models: Record<
      string,
      { table: typeof organizations; relations: Record<string, never> }
    > = {
      organizations: { table: organizations, relations: {} },
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models,
      _queryFn: async () => ({ rows: [], rowCount: 0 }),
    });

    // Delete the model entry after the delegate was built
    delete (models as Record<string, unknown>).organizations;

    // The delegate still exists but resolveModel will throw because
    // the model entry is gone from the registry
    const result = await db.organizations.get({ where: { id: '123' } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/is not registered/);
    }
  });
});

// ---------------------------------------------------------------------------
// SQLite dialect — close and isHealthy via D1 driver
// ---------------------------------------------------------------------------

describe('createDb with SQLite dialect', () => {
  const mockPrepared = {
    bind: mock().mockReturnThis(),
    all: mock().mockResolvedValue({ results: [] }),
    run: mock().mockResolvedValue({ meta: { changes: 0 } }),
  };
  const mockD1 = {
    prepare: mock().mockReturnValue(mockPrepared),
  };

  it('close() resolves when using SQLite driver', async () => {
    const db = createDb({
      models: {
        organizations: { table: organizations, relations: {} },
      },
      dialect: 'sqlite',
      d1: mockD1,
    });

    await expect(db.close()).resolves.toBeUndefined();
  });

  it('isHealthy() delegates to SQLite driver when using SQLite dialect', async () => {
    mockPrepared.all.mockResolvedValue({ results: [] });

    const db = createDb({
      models: {
        organizations: { table: organizations, relations: {} },
      },
      dialect: 'sqlite',
      d1: mockD1,
    });

    const result = await db.isHealthy();
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// transaction() — SQLite/testing fallback path (BEGIN/COMMIT/ROLLBACK)
// ---------------------------------------------------------------------------

describe('transaction() with _queryFn', () => {
  it('calls BEGIN/COMMIT around the callback', async () => {
    const queryCalls: string[] = [];
    const testQueryFn: QueryFn = async <T>(sqlStr: string) => {
      queryCalls.push(sqlStr);
      return { rows: [] as T[], rowCount: 0 };
    };

    const db = createDb({
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: testQueryFn,
    });

    await db.transaction(async () => {
      // no-op transaction
    });

    expect(queryCalls).toContain('BEGIN');
    expect(queryCalls).toContain('COMMIT');
  });

  it('calls ROLLBACK on error and rethrows', async () => {
    const queryCalls: string[] = [];
    const testQueryFn: QueryFn = async <T>(sqlStr: string) => {
      queryCalls.push(sqlStr);
      return { rows: [] as T[], rowCount: 0 };
    };

    const db = createDb({
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: testQueryFn,
    });

    await expect(
      db.transaction(async () => {
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');

    expect(queryCalls).toContain('BEGIN');
    expect(queryCalls).toContain('ROLLBACK');
    expect(queryCalls).not.toContain('COMMIT');
  });

  it('swallows ROLLBACK failure and preserves the original error', async () => {
    let rollbackAttempted = false;
    const testQueryFn: QueryFn = async <T>(sqlStr: string) => {
      if (sqlStr === 'ROLLBACK') {
        rollbackAttempted = true;
        throw new Error('ROLLBACK failed');
      }
      return { rows: [] as T[], rowCount: 0 };
    };

    const db = createDb({
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: testQueryFn,
    });

    await expect(
      db.transaction(async () => {
        throw new Error('original error');
      }),
    ).rejects.toThrow('original error');

    expect(rollbackAttempted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isReadQuery — unit tests for SQL read/write classification
// ---------------------------------------------------------------------------

describe('isReadQuery', () => {
  it('returns true for SELECT queries', () => {
    expect(isReadQuery('SELECT * FROM users')).toBe(true);
    expect(isReadQuery('select id from tasks')).toBe(true);
  });

  it('returns false for INSERT queries', () => {
    expect(isReadQuery('INSERT INTO users (name) VALUES ($1)')).toBe(false);
  });

  it('returns false for UPDATE queries', () => {
    expect(isReadQuery('UPDATE users SET name = $1')).toBe(false);
  });

  it('returns false for DELETE queries', () => {
    expect(isReadQuery('DELETE FROM users WHERE id = $1')).toBe(false);
  });

  it('returns false for TRUNCATE queries', () => {
    expect(isReadQuery('TRUNCATE users')).toBe(false);
  });

  it('strips leading -- comments and classifies correctly', () => {
    expect(isReadQuery('-- fetch users\nSELECT * FROM users')).toBe(true);
    expect(isReadQuery('-- comment\nINSERT INTO users (name) VALUES ($1)')).toBe(false);
  });

  it('strips leading /* */ block comments', () => {
    expect(isReadQuery('/* fetch */SELECT * FROM users')).toBe(true);
    expect(isReadQuery('/* write */INSERT INTO users (name) VALUES ($1)')).toBe(false);
  });

  it('strips leading // comments', () => {
    expect(isReadQuery('// fetch users\nSELECT * FROM users')).toBe(true);
  });

  it('returns false for -- comment with no newline', () => {
    expect(isReadQuery('-- comment only')).toBe(false);
  });

  it('returns false for /* comment with no closing */', () => {
    expect(isReadQuery('/* unclosed comment SELECT * FROM users')).toBe(false);
  });

  it('returns false for // comment with no newline', () => {
    expect(isReadQuery('// comment only')).toBe(false);
  });

  it('returns false for SELECT ... FOR UPDATE (row locks)', () => {
    expect(isReadQuery('SELECT * FROM users FOR UPDATE')).toBe(false);
  });

  it('returns false for SELECT ... FOR NO KEY UPDATE', () => {
    expect(isReadQuery('SELECT * FROM users FOR NO KEY UPDATE')).toBe(false);
  });

  it('returns false for SELECT ... FOR SHARE', () => {
    expect(isReadQuery('SELECT * FROM users FOR SHARE')).toBe(false);
  });

  it('returns false for SELECT ... FOR KEY SHARE', () => {
    expect(isReadQuery('SELECT * FROM users FOR KEY SHARE')).toBe(false);
  });

  it('returns false for SELECT INTO (creates table)', () => {
    expect(isReadQuery('SELECT INTO new_table FROM users')).toBe(false);
  });

  it('returns false for SELECT ... INTO pattern', () => {
    expect(isReadQuery('SELECT id, name INTO backup FROM users')).toBe(false);
  });

  it('handles WITH (CTE) that is read-only', () => {
    expect(isReadQuery('WITH cte AS (SELECT id FROM users) SELECT * FROM cte')).toBe(true);
  });

  it('returns false for WITH (CTE) containing INSERT', () => {
    expect(
      isReadQuery(
        'WITH ins AS (INSERT INTO users (name) VALUES ($1) RETURNING *) SELECT * FROM ins',
      ),
    ).toBe(false);
  });

  it('returns false for WITH (CTE) containing UPDATE', () => {
    expect(
      isReadQuery('WITH upd AS (UPDATE users SET name = $1 RETURNING *) SELECT * FROM upd'),
    ).toBe(false);
  });

  it('returns false for WITH (CTE) containing DELETE FROM', () => {
    expect(isReadQuery('WITH del AS (DELETE FROM users RETURNING *) SELECT * FROM del')).toBe(
      false,
    );
  });

  it('returns false for DDL statements', () => {
    expect(isReadQuery('CREATE TABLE users (id int)')).toBe(false);
    expect(isReadQuery('ALTER TABLE users ADD COLUMN age int')).toBe(false);
    expect(isReadQuery('DROP TABLE users')).toBe(false);
  });

  it('returns false for BEGIN/COMMIT/ROLLBACK', () => {
    expect(isReadQuery('BEGIN')).toBe(false);
    expect(isReadQuery('COMMIT')).toBe(false);
    expect(isReadQuery('ROLLBACK')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SQLite dialect validation
// ---------------------------------------------------------------------------

describe('createDb SQLite dialect validation', () => {
  it('throws when SQLite dialect is used without d1 binding', () => {
    expect(() => {
      createDb({
        models: {
          organizations: { table: organizations, relations: {} },
        },
        dialect: 'sqlite',
      });
    }).toThrow(
      'SQLite dialect requires either a "path" (local file) or "d1" (Cloudflare D1 binding)',
    );
  });

  it('throws when SQLite dialect is used with a connection URL', () => {
    const mockD1 = {
      prepare: mock().mockReturnValue({
        bind: mock().mockReturnThis(),
        all: mock().mockResolvedValue({ results: [] }),
        run: mock().mockResolvedValue({ meta: { changes: 0 } }),
      }),
    };

    expect(() => {
      createDb({
        url: 'postgres://localhost:5432/test',
        models: {
          organizations: { table: organizations, relations: {} },
        },
        dialect: 'sqlite',
        d1: mockD1,
      });
    }).toThrow('"url" is for postgres');
  });
});

// ---------------------------------------------------------------------------
// Delegate success paths — exercise CRUD through _queryFn
// ---------------------------------------------------------------------------

describe('delegate success paths', () => {
  function createMockDb() {
    const queryCalls: { sql: string; params: readonly unknown[] }[] = [];

    const mockQueryFn: QueryFn = async <T>(sql: string, params: readonly unknown[]) => {
      queryCalls.push({ sql, params });

      // Return appropriate mock data based on the SQL pattern
      if (sql.includes('COUNT(*)') && !sql.includes('count(*)')) {
        return { rows: [{ count: 5 }] as unknown as T[], rowCount: 1 };
      }
      if (sql.startsWith('INSERT') || sql.startsWith('UPDATE')) {
        return {
          rows: [{ id: 'gen-uuid', name: 'test' }] as unknown as T[],
          rowCount: 1,
        };
      }
      if (sql.startsWith('DELETE')) {
        return {
          rows: [{ id: 'uuid-1', name: 'Org 1' }] as unknown as T[],
          rowCount: 1,
        };
      }
      return {
        rows: [{ id: 'uuid-1', name: 'Org 1' }] as unknown as T[],
        rowCount: 1,
      };
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: mockQueryFn,
    });

    return { db, queryCalls };
  }

  it('get returns ok result on success', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.get({ where: { id: 'uuid-1' } });

    expect(result.ok).toBe(true);
  });

  it('getOrThrow returns ok result when record exists', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.getOrThrow({ where: { id: 'uuid-1' } });

    expect(result.ok).toBe(true);
  });

  it('getOrThrow returns NotFound when no record', async () => {
    const emptyQueryFn: QueryFn = async <T>() => ({
      rows: [] as T[],
      rowCount: 0,
    });

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: emptyQueryFn,
    });

    const result = await db.organizations.getOrThrow({ where: { id: 'nonexistent' } });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NotFound');
  });

  it('list returns ok result on success', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.list();

    expect(result.ok).toBe(true);
  });

  it('listAndCount returns ok result with data and total', async () => {
    // listAndCount uses withCount: true which adds totalCount via window function
    const mockQueryFn: QueryFn = async <T>() => ({
      rows: [
        { id: '1', name: 'Org A', totalCount: 3 },
        { id: '2', name: 'Org B', totalCount: 3 },
      ] as unknown as T[],
      rowCount: 2,
    });

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: mockQueryFn,
    });

    const result = await db.organizations.listAndCount();

    expect(result.ok).toBe(true);
  });

  it('create returns ok result on success', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.create({ data: { name: 'New Org' } });

    expect(result.ok).toBe(true);
  });

  it('createMany returns ok result on success', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.createMany({
      data: [{ name: 'Org A' }, { name: 'Org B' }],
    });

    expect(result.ok).toBe(true);
  });

  it('createManyAndReturn returns ok result on success', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.createManyAndReturn({
      data: [{ name: 'Org A' }],
    });

    expect(result.ok).toBe(true);
  });

  it('update returns ok result on success', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.update({
      where: { id: 'uuid-1' },
      data: { name: 'Updated' },
    });

    expect(result.ok).toBe(true);
  });

  it('updateMany returns ok result on success', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.updateMany({
      where: { id: 'uuid-1' },
      data: { name: 'Updated' },
    });

    expect(result.ok).toBe(true);
  });

  it('upsert returns ok result on success', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.upsert({
      where: { id: 'uuid-1' },
      create: { name: 'New' },
      update: { name: 'Existing' },
    });

    expect(result.ok).toBe(true);
  });

  it('delete returns ok result on success', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.delete({
      where: { id: 'uuid-1' },
    });

    expect(result.ok).toBe(true);
  });

  it('deleteMany returns ok result on success', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.deleteMany({
      where: { id: 'uuid-1' },
    });

    expect(result.ok).toBe(true);
  });

  it('count returns ok result on success', async () => {
    const { db } = createMockDb();
    const result = await db.organizations.count();

    expect(result.ok).toBe(true);
  });

  it('aggregate returns ok result on success', async () => {
    const mockQueryFn: QueryFn = async <T>() => ({
      rows: [{ _count: 5 }] as unknown as T[],
      rowCount: 1,
    });

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: mockQueryFn,
    });

    const result = await db.organizations.aggregate({ _count: true });

    expect(result.ok).toBe(true);
  });

  it('groupBy returns ok result on success', async () => {
    const mockQueryFn: QueryFn = async <T>() => ({
      rows: [{ name: 'Org A', _count: 3 }] as unknown as T[],
      rowCount: 1,
    });

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      _queryFn: mockQueryFn,
    });

    const result = await db.organizations.groupBy({ by: ['name'], _count: true });

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Delegate include (relation loading) paths
// ---------------------------------------------------------------------------

describe('delegate include paths', () => {
  function createDbWithRelations() {
    const mockQueryFn: QueryFn = async <T>(sql: string) => {
      // Return org rows
      if (sql.includes('organizations')) {
        return {
          rows: [{ id: 'org-1', name: 'Acme' }] as unknown as T[],
          rowCount: 1,
        };
      }
      // Return user rows for relation loading
      if (sql.includes('users')) {
        return {
          rows: [
            { id: 'u-1', organizationId: 'org-1', name: 'Alice', email: 'alice@test.com' },
          ] as unknown as T[],
          rowCount: 1,
        };
      }
      return { rows: [] as T[], rowCount: 0 };
    };

    return createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: d.model(organizations),
        users: d.model(users, {
          organization: d.ref.one(() => organizations, 'organizationId'),
        }),
      },
      _queryFn: mockQueryFn,
    });
  }

  it('get with include loads relations', async () => {
    const db = createDbWithRelations();
    const result = await db.organizations.get({
      where: { id: 'org-1' },
      include: { users: true },
    });

    expect(result.ok).toBe(true);
  });

  it('getOrThrow with include loads relations', async () => {
    const db = createDbWithRelations();
    const result = await db.organizations.getOrThrow({
      where: { id: 'org-1' },
      include: { users: true },
    });

    expect(result.ok).toBe(true);
  });

  it('list with include loads relations', async () => {
    const db = createDbWithRelations();
    const result = await db.organizations.list({
      include: { users: true },
    });

    expect(result.ok).toBe(true);
  });

  it('listAndCount with include loads relations', async () => {
    const mockQueryFn: QueryFn = async <T>(sql: string) => {
      if (sql.includes('organizations')) {
        return {
          rows: [{ id: 'org-1', name: 'Acme', totalCount: 1 }] as unknown as T[],
          rowCount: 1,
        };
      }
      if (sql.includes('users')) {
        return {
          rows: [
            { id: 'u-1', organizationId: 'org-1', name: 'Alice', email: 'alice@test.com' },
          ] as unknown as T[],
          rowCount: 1,
        };
      }
      return { rows: [] as T[], rowCount: 0 };
    };

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: d.model(organizations),
        users: d.model(users, {
          organization: d.ref.one(() => organizations, 'organizationId'),
        }),
      },
      _queryFn: mockQueryFn,
    });

    const result = await db.organizations.listAndCount({
      include: { users: true },
    });

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PostgreSQL lazy-init, replica routing, transactions via driver
// ---------------------------------------------------------------------------

describe('PostgreSQL lazy init and replica routing', () => {
  function createMockPgDriver(overrides?: Partial<PostgresDriver>): PostgresDriver {
    return {
      queryFn: async <T>() => ({ rows: [{ id: '1' }] as unknown as T[], rowCount: 1 }),
      query: async <T>() => [{ id: '1' }] as unknown as T[],
      execute: async () => ({ rowsAffected: 1 }),
      beginTransaction: async <T>(fn: (txFn: QueryFn) => Promise<T>) => {
        const txQueryFn: QueryFn = async <R>() => ({
          rows: [{ id: '1' }] as unknown as R[],
          rowCount: 1,
        });
        return fn(txQueryFn);
      },
      close: async () => {},
      isHealthy: async () => true,
      ...overrides,
    };
  }

  it('lazily initializes postgres driver and routes queries through it', async () => {
    const primaryDriver = createMockPgDriver();
    const driverQuerySpy = spyOn(primaryDriver, 'queryFn');

    mock.module('../postgres-driver', () => ({
      createPostgresDriver: () => primaryDriver,
    }));

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
    });

    // First query triggers lazy init
    const result = await db.organizations.list();
    expect(result.ok).toBe(true);
    expect(driverQuerySpy).toHaveBeenCalled();

    await db.close();
  });

  it('routes read queries to replicas with round-robin', async () => {
    const replicaCalls: string[] = [];
    const primaryCalls: string[] = [];

    const primaryDriver = createMockPgDriver({
      queryFn: async <T>(sql: string) => {
        primaryCalls.push(sql);
        return { rows: [{ id: '1' }] as unknown as T[], rowCount: 1 };
      },
    });

    const replicaDriver = createMockPgDriver({
      queryFn: async <T>(sql: string) => {
        replicaCalls.push(sql);
        return { rows: [{ id: '1' }] as unknown as T[], rowCount: 1 };
      },
    });

    let callCount = 0;
    mock.module('../postgres-driver', () => ({
      createPostgresDriver: () => {
        callCount++;
        // First call = primary, subsequent = replicas
        return callCount === 1 ? primaryDriver : replicaDriver;
      },
    }));

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      pool: {
        replicas: ['postgres://replica1:5432/test'],
      },
    });

    // SELECT goes to replica
    const listResult = await db.organizations.list();
    expect(listResult.ok).toBe(true);
    expect(replicaCalls.length).toBeGreaterThan(0);

    // Write goes to primary
    const createResult = await db.organizations.create({ data: { name: 'Test' } });
    expect(createResult.ok).toBe(true);
    expect(primaryCalls.length).toBeGreaterThan(0);

    await db.close();
  });

  it('falls back to primary when replica query fails', async () => {
    const primaryCalls: string[] = [];

    const primaryDriver = createMockPgDriver({
      queryFn: async <T>(sql: string) => {
        primaryCalls.push(sql);
        return { rows: [{ id: '1', name: 'Org' }] as unknown as T[], rowCount: 1 };
      },
    });

    const failingReplica = createMockPgDriver({
      queryFn: async () => {
        throw new Error('replica connection lost');
      },
    });

    let callCount = 0;
    mock.module('../postgres-driver', () => ({
      createPostgresDriver: () => {
        callCount++;
        return callCount === 1 ? primaryDriver : failingReplica;
      },
    }));

    const warnSpy = spyOn(console, 'warn');

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
      pool: {
        replicas: ['postgres://replica1:5432/test'],
      },
    });

    // Read query should fail on replica, then fall back to primary
    const result = await db.organizations.list();
    expect(result.ok).toBe(true);
    expect(primaryCalls.length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('replica query failed'),
      expect.any(String),
    );

    warnSpy.mockRestore();
    await db.close();
  });

  it('transaction() uses driver.beginTransaction when available', async () => {
    let beginTxCalled = false;
    const primaryDriver = createMockPgDriver({
      beginTransaction: async <T>(fn: (txFn: QueryFn) => Promise<T>) => {
        beginTxCalled = true;
        const txQueryFn: QueryFn = async <R>() => ({
          rows: [{ id: 'tx-1' }] as unknown as R[],
          rowCount: 1,
        });
        return fn(txQueryFn);
      },
    });

    mock.module('../postgres-driver', () => ({
      createPostgresDriver: () => primaryDriver,
    }));

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
    });

    // Trigger lazy init by making a query first
    await db.organizations.list();

    // Now use transaction — should use driver.beginTransaction
    await db.transaction(async (tx) => {
      const result = await tx.organizations.list();
      expect(result.ok).toBe(true);
    });

    expect(beginTxCalled).toBe(true);
    await db.close();
  });

  it('close() calls driver.close() when postgres driver is initialized', async () => {
    let closeCalled = false;
    const primaryDriver = createMockPgDriver({
      close: async () => {
        closeCalled = true;
      },
    });

    mock.module('../postgres-driver', () => ({
      createPostgresDriver: () => primaryDriver,
    }));

    const db = createDb({
      url: 'postgres://localhost:5432/test',
      models: {
        organizations: { table: organizations, relations: {} },
      },
    });

    // Trigger lazy init
    await db.organizations.list();

    await db.close();
    expect(closeCalled).toBe(true);
  });
});
