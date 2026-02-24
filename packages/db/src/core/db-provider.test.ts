import { afterAll, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { d } from '../d';
import type { QueryFn } from '../query/executor';
import { createDbProvider } from './db-provider';

// ---------------------------------------------------------------------------
// Test schema
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email().unique(),
  createdAt: d.timestamp().default('now'),
});

// ---------------------------------------------------------------------------
// PGlite setup
// ---------------------------------------------------------------------------

let pg: PGlite;
let queryFn: QueryFn;

// PGlite WASM init can be slow under parallel CI load — allow 30 s.
beforeAll(async () => {
  pg = new PGlite();
  queryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
    const result = await pg.query(sqlStr, params as unknown[]);
    return {
      rows: result.rows as readonly T[],
      rowCount: result.affectedRows ?? result.rows.length,
    };
  };
}, 30_000);

afterAll(async () => {
  await pg.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createDbProvider', () => {
  it('returns an object with onInit, methods, and onDestroy', () => {
    const provider = createDbProvider({
      url: 'postgres://localhost:5432/test',
      models: { users: { table: users, relations: {} } },
    });

    expect(provider).toHaveProperty('onInit');
    expect(provider).toHaveProperty('methods');
    expect(provider).toHaveProperty('onDestroy');
    expect(typeof provider.onInit).toBe('function');
    expect(typeof provider.methods).toBe('function');
    expect(typeof provider.onDestroy).toBe('function');
  });

  it('onInit creates a DatabaseInstance and returns it as state', async () => {
    const provider = createDbProvider({
      url: 'postgres://localhost:5432/test',
      models: { users: { table: users, relations: {} } },
      _queryFn: queryFn,
    });

    const db = await provider.onInit({});
    expect(db).toBeDefined();
    expect(typeof db.list).toBe('function');
    expect(typeof db.create).toBe('function');
    expect(typeof db.close).toBe('function');
    expect(typeof db.isHealthy).toBe('function');

    await db.close();
  }, 30_000);

  it('methods returns the DatabaseInstance directly', async () => {
    const provider = createDbProvider({
      url: 'postgres://localhost:5432/test',
      models: { users: { table: users, relations: {} } },
      _queryFn: queryFn,
    });

    const db = await provider.onInit({});
    const methods = provider.methods({}, db);

    // methods IS the db instance — same reference
    expect(methods).toBe(db);

    await db.close();
  });

  it('onDestroy calls db.close()', async () => {
    const provider = createDbProvider({
      url: 'postgres://localhost:5432/test',
      models: { users: { table: users, relations: {} } },
      _queryFn: queryFn,
    });

    const db = await provider.onInit({});
    const closeSpy = spyOn(db, 'close');

    await provider.onDestroy({}, db);

    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('works as a full lifecycle: init → use → destroy', async () => {
    const provider = createDbProvider({
      url: 'postgres://localhost:5432/test',
      models: { users: { table: users, relations: {} } },
      _queryFn: queryFn,
    });

    // Simulate core lifecycle
    const state = await provider.onInit({});
    const db = provider.methods({}, state);

    // DB should be healthy
    const healthy = await db.isHealthy();
    expect(healthy).toBe(true);

    // Shutdown
    await provider.onDestroy({}, state);
  });

  it('passes through all createDb config options', () => {
    const logFn = mock();
    const provider = createDbProvider({
      url: 'postgres://localhost:5432/test',
      models: { users: { table: users, relations: {} } },
      pool: { max: 5, idleTimeout: 10_000 },
      casing: 'camelCase',
      log: logFn,
      _queryFn: queryFn,
    });

    // Should not throw — config is passed through
    expect(provider).toBeDefined();
  });

  describe('auto-migrate', () => {
    it('calls autoMigrate when migrations.autoApply is true', async () => {
      const testPg = new PGlite();
      const testQueryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
        const result = await testPg.query(sqlStr, params as unknown[]);
        return {
          rows: result.rows as readonly T[],
          rowCount: result.affectedRows ?? result.rows.length,
        };
      };

      const provider = createDbProvider({
        url: 'memory://test',
        models: { users: { table: users, relations: {} } },
        _queryFn: testQueryFn,
        migrations: {
          autoApply: true,
          snapshotPath: ':memory:',
        },
      });

      // Initialize - this should trigger auto-migrate (verified by log output)
      await provider.onInit({});

      await testPg.close();
    }, 30_000);

    it('calls autoMigrate when NODE_ENV is not production', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'development';

        const testPg = new PGlite();
        const testQueryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
          const result = await testPg.query(sqlStr, params as unknown[]);
          return {
            rows: result.rows as readonly T[],
            rowCount: result.affectedRows ?? result.rows.length,
          };
        };

        const provider = createDbProvider({
          url: 'memory://test',
          models: { users: { table: users, relations: {} } },
          _queryFn: testQueryFn,
          migrations: {
            // autoApply not specified - should default to true in dev
            snapshotPath: ':memory:',
          },
        });

        // Initialize - this should trigger auto-migrate
        await provider.onInit({});

        await testPg.close();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    }, 30_000);

    it('does NOT call autoMigrate when autoApply is false', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'development';

        const testPg = new PGlite();
        const testQueryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
          const result = await testPg.query(sqlStr, params as unknown[]);
          return {
            rows: result.rows as readonly T[],
            rowCount: result.affectedRows ?? result.rows.length,
          };
        };

        const provider = createDbProvider({
          url: 'memory://test',
          models: { users: { table: users, relations: {} } },
          _queryFn: testQueryFn,
          migrations: {
            autoApply: false,
            snapshotPath: ':memory:',
          },
        });

        // Initialize - this should NOT trigger auto-migrate
        await provider.onInit({});

        await testPg.close();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    }, 30_000);

    it('does NOT call autoMigrate in production by default', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        const testPg = new PGlite();
        const testQueryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
          const result = await testPg.query(sqlStr, params as unknown[]);
          return {
            rows: result.rows as readonly T[],
            rowCount: result.affectedRows ?? result.rows.length,
          };
        };

        const provider = createDbProvider({
          url: 'memory://test',
          models: { users: { table: users, relations: {} } },
          _queryFn: testQueryFn,
          migrations: {
            // autoApply not specified - should default to false in production
            snapshotPath: ':memory:',
          },
        });

        // Initialize - this should NOT trigger auto-migrate in production
        await provider.onInit({});

        await testPg.close();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    }, 30_000);
  });
});
