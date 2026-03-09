import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import type { D1Database } from '@vertz/db';
import { createDb } from '@vertz/db';
import { authModels } from '../auth-models';
import { generateAuthDDL, initializeAuthTables } from '../auth-tables';

describe('initializeAuthTables', () => {
  let rawDb: InstanceType<typeof Database>;

  afterEach(() => {
    rawDb?.close();
  });

  function createTestDb() {
    rawDb = new Database(':memory:');
    const d1: D1Database = {
      prepare: (sql: string) => {
        const stmt = rawDb.prepare(sql);
        return {
          bind(...values: unknown[]) {
            return this;
          },
          async all() {
            try {
              const results = stmt.all() as Record<string, unknown>[];
              return { results, success: true };
            } catch {
              return { results: [], success: true };
            }
          },
          async run() {
            try {
              const info = stmt.run();
              return { results: [], success: true, meta: { changes: info.changes } };
            } catch {
              return { results: [], success: true, meta: { changes: 0 } };
            }
          },
          async first() {
            try {
              return stmt.get() ?? null;
            } catch {
              return null;
            }
          },
        };
      },
    } as unknown as D1Database;

    const db = createDb({
      models: { ...authModels },
      dialect: 'sqlite',
      d1,
    });

    return { db, rawDb };
  }

  it('creates all 9 auth tables in SQLite', async () => {
    const { db, rawDb: raw } = createTestDb();

    await initializeAuthTables(db);

    // Check that all tables were created
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'auth_%'")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([
      'auth_closure',
      'auth_flags',
      'auth_oauth_accounts',
      'auth_overrides',
      'auth_plan_addons',
      'auth_plans',
      'auth_role_assignments',
      'auth_sessions',
      'auth_users',
    ]);
  });

  it('is idempotent — calling twice succeeds', async () => {
    const { db } = createTestDb();

    await initializeAuthTables(db);
    // Second call should not throw
    await initializeAuthTables(db);
  });
});
