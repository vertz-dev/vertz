/**
 * Test helper — creates an in-memory SQLite database with auth tables.
 *
 * Uses @vertz/sqlite directly with a _queryFn bridge so the DatabaseClient
 * can execute raw SQL (including DDL) against a real SQLite instance.
 */

import { Database } from '@vertz/sqlite';
import type { DatabaseClient, ModelEntry } from '@vertz/db';
import { createDb } from '@vertz/db';
import { authModels } from '../auth-models';
import { initializeAuthTables } from '../auth-tables';

export interface TestDb {
  db: DatabaseClient<Record<string, ModelEntry>>;
  rawDb: InstanceType<typeof Database>;
  cleanup: () => Promise<void>;
}

/** Minimal D1 stub — never actually called because _queryFn takes priority. */
function dummyD1() {
  return {
    prepare: () => {
      throw new Error('D1 stub: should not be called when _queryFn is provided');
    },
  } as unknown as import('@vertz/db').D1Database;
}

/**
 * Create an in-memory SQLite database with auth tables initialized.
 */
export async function createTestDb(): Promise<TestDb> {
  const rawDb = new Database(':memory:');

  // Bridge: convert $N parameter placeholders to ? for @vertz/sqlite
  const queryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
    const sqliteSql = sqlStr.replace(/\$\d+/g, '?');

    const trimmed = sqliteSql.trim().toUpperCase();

    // Handle transaction control statements
    if (/^(BEGIN|COMMIT|ROLLBACK)\b/.test(trimmed)) {
      rawDb.run(sqliteSql);
      return { rows: [] as T[], rowCount: 0 };
    }

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

  const db = createDb({
    models: { ...authModels },
    dialect: 'sqlite',
    d1: dummyD1(),
    _queryFn: queryFn,
  });

  await initializeAuthTables(db);

  return {
    db,
    rawDb,
    cleanup: async () => {
      rawDb.close();
    },
  };
}
