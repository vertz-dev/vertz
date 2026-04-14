import { Database } from '@vertz/sqlite';
import { describe, expect, it } from '@vertz/test';
import { d } from '../../d';
import { sql } from '../../sql/tagged';
import { createDb } from '../database';

// ---------------------------------------------------------------------------
// Test schema + helpers
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email(),
});

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  assigneeId: d.uuid(),
});

const models = {
  users: { table: usersTable, relations: {} },
  tasks: { table: tasksTable, relations: {} },
};

/** Create an in-memory SQLite db with tables for testing transactions. */
function createTestDb() {
  const rawDb = new Database(':memory:');
  rawDb.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    )
  `);
  rawDb.run(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      assignee_id TEXT
    )
  `);

  const queryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
    const sqliteSql = sqlStr.replace(/\$\d+/g, '?');
    const trimmed = sqliteSql.trim().toUpperCase();

    // Handle transaction control statements
    if (/^(BEGIN|COMMIT|ROLLBACK)\b/.test(trimmed)) {
      rawDb.run(sqliteSql);
      return { rows: [] as T[], rowCount: 0 };
    }

    const isSelect = /^SELECT/i.test(trimmed);
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
    models,
    dialect: 'sqlite',
    d1: {
      prepare: () => {
        throw new Error('D1 stub');
      },
    } as unknown as import('../sqlite-driver').D1Database,
    _queryFn: queryFn,
  });

  return { db, rawDb };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DatabaseClient.transaction()', () => {
  it('commits all operations on success via tx.query()', async () => {
    const { db, rawDb } = createTestDb();

    await db.transaction(async (tx) => {
      await tx.query(
        sql`INSERT INTO users (id, name, email) VALUES (${'u1'}, ${'Alice'}, ${'alice@test.com'})`,
      );
      await tx.query(
        sql`INSERT INTO tasks (id, title, assignee_id) VALUES (${'t1'}, ${'Task 1'}, ${'u1'})`,
      );
    });

    const users = rawDb.prepare('SELECT * FROM users').all();
    const tasks = rawDb.prepare('SELECT * FROM tasks').all();
    expect(users).toHaveLength(1);
    expect(tasks).toHaveLength(1);

    rawDb.close();
  });

  it('provides model delegates on the transaction client', async () => {
    const { db, rawDb } = createTestDb();

    await db.transaction(async (tx) => {
      // tx.users and tx.tasks should be available as typed model delegates
      expect(tx.users).toBeDefined();
      expect(tx.users.create).toBeFunction();
      expect(tx.tasks).toBeDefined();
      expect(tx.tasks.list).toBeFunction();
    });

    rawDb.close();
  });

  it('rolls back all operations when callback throws', async () => {
    const { db, rawDb } = createTestDb();

    // Insert a user first so we can verify it survives the rollback
    rawDb.run("INSERT INTO users (id, name, email) VALUES ('u0', 'Existing', 'existing@test.com')");

    try {
      await db.transaction(async (tx) => {
        await tx.query(
          sql`INSERT INTO users (id, name, email) VALUES (${'u1'}, ${'Alice'}, ${'alice@test.com'})`,
        );
        throw new Error('Simulated failure');
      });
    } catch (e) {
      expect((e as Error).message).toBe('Simulated failure');
    }

    // Only the pre-existing user should be there
    const users = rawDb.prepare('SELECT * FROM users').all();
    expect(users).toHaveLength(1);
    expect((users[0] as { id: string }).id).toBe('u0');

    rawDb.close();
  });

  it('returns the callback return value on success', async () => {
    const { db, rawDb } = createTestDb();

    const result = await db.transaction(async (tx) => {
      await tx.query(
        sql`INSERT INTO users (id, name, email) VALUES (${'u1'}, ${'Alice'}, ${'alice@test.com'})`,
      );
      return { created: true, id: 'u1' };
    });

    expect(result).toEqual({ created: true, id: 'u1' });

    rawDb.close();
  });

  it('throws on nested transaction calls (SQLite native error)', async () => {
    const { db, rawDb } = createTestDb();

    try {
      await db.transaction(async (_tx) => {
        await db.transaction(async (_tx2) => {
          // Should not reach here
        });
      });
      expect(true).toBe(false); // Should have thrown
    } catch (e) {
      // SQLite natively rejects BEGIN inside BEGIN
      // Error message may include extra context depending on the runtime
      expect((e as Error).message).toContain('cannot start a transaction within a transaction');
    }

    rawDb.close();
  });

  it('propagates the error from the callback after rollback', async () => {
    const { db, rawDb } = createTestDb();

    const error = await db
      .transaction(async () => {
        throw new Error('Custom error');
      })
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Custom error');

    rawDb.close();
  });
});
