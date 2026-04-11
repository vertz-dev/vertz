import { Database } from '@vertz/sqlite';
import { afterEach, describe, expect, it } from '@vertz/test';
import { createDb } from '@vertz/db';
import { createServer } from '../../create-server';
import { authModels } from '../auth-models';

describe('createServer with db + auth', () => {
  function createSqliteDb() {
    const rawDb = new Database(':memory:');
    const queryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
      const sqliteSql = sqlStr.replace(/\$\d+/g, '?');
      const trimmed = sqliteSql.trim();
      const isSelect = /^\s*SELECT/i.test(trimmed);
      const hasReturning = /RETURNING/i.test(trimmed);
      if (isSelect || hasReturning) {
        const stmt = rawDb.prepare(sqliteSql);
        const rows = stmt.all(...(params as unknown[])) as T[];
        return { rows, rowCount: rows.length };
      }
      const stmt = rawDb.prepare(sqliteSql);
      const info = stmt.run(...(params as unknown[]));
      return { rows: [] as T[], rowCount: info.changes };
    };

    const d1 = {
      prepare: () => {
        throw new Error('stub');
      },
    } as unknown as import('@vertz/db').D1Database;
    return {
      db: createDb({
        models: { ...authModels },
        dialect: 'sqlite',
        d1,
        _queryFn: queryFn,
      }),
      rawDb,
    };
  }

  it('throws prescriptive error when auth models are missing', () => {
    const rawDb = new Database(':memory:');
    const queryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
      return { rows: [] as T[], rowCount: 0 };
    };
    const d1 = {
      prepare: () => {
        throw new Error('stub');
      },
    } as unknown as import('@vertz/db').D1Database;
    const badDb = createDb({ models: {}, dialect: 'sqlite', d1, _queryFn: queryFn });

    expect(() =>
      createServer({
        db: badDb,
        auth: { session: { strategy: 'jwt', ttl: '60s' } },
      }),
    ).toThrow(/Auth requires models/);

    rawDb.close();
  });

  it('returns ServerInstance with .auth and .initialize() when db + auth provided', () => {
    const { db, rawDb } = createSqliteDb();
    const app = createServer({
      db,
      auth: { session: { strategy: 'jwt', ttl: '60s' } },
    });

    expect(app.auth).toBeDefined();
    expect(typeof app.auth.api.signUp).toBe('function');
    expect(typeof app.initialize).toBe('function');

    rawDb.close();
  });

  it('initialize() creates auth tables', async () => {
    const { db, rawDb } = createSqliteDb();
    const app = createServer({
      db,
      auth: { session: { strategy: 'jwt', ttl: '60s' } },
    });

    await app.initialize();

    // Verify tables exist
    const tables = rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'auth_%'")
      .all() as { name: string }[];
    expect(tables.length).toBe(9);

    rawDb.close();
  });

  it('works without db — in-memory auth (no ServerInstance extensions)', () => {
    const app = createServer({});
    // Without db and auth, app is a plain AppBuilder — no .auth
    expect((app as any).auth).toBeUndefined();
    expect((app as any).initialize).toBeUndefined();
  });
});
