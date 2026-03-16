import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TableSchemaRegistry } from '../sqlite-driver';
import { createLocalSqliteDriver, resolveLocalSqliteDatabase } from '../sqlite-driver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TMP_DIR = join(tmpdir(), `vertz-test-${Date.now()}`);

function tmpDbPath(name: string): string {
  return join(TMP_DIR, name, 'test.db');
}

afterEach(() => {
  // Clean up temp directories
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLocalSqliteDriver', () => {
  describe('Given a file-based path with non-existent parent directory', () => {
    describe('When creating the driver', () => {
      it('Then auto-creates parent directories', () => {
        const dbPath = tmpDbPath('nested/deep');
        expect(existsSync(join(TMP_DIR, 'nested', 'deep'))).toBe(false);

        const driver = createLocalSqliteDriver(dbPath);

        // Parent directory was created
        expect(existsSync(join(TMP_DIR, 'nested', 'deep'))).toBe(true);

        // Cleanup
        driver.close();
      });
    });
  });

  describe('Given a file-based path', () => {
    describe('When creating the driver', () => {
      it('Then enables WAL mode', async () => {
        const dbPath = tmpDbPath('wal-test');
        const driver = createLocalSqliteDriver(dbPath);

        // WAL mode should be enabled — query PRAGMA to verify
        const result = await driver.query<{ journal_mode: string }>('PRAGMA journal_mode');
        expect(result[0]?.journal_mode).toBe('wal');

        await driver.close();
      });
    });
  });

  describe('Given an in-memory database', () => {
    describe('When calling isHealthy', () => {
      it('Then returns true for a healthy connection', async () => {
        const driver = createLocalSqliteDriver(':memory:');

        const healthy = await driver.isHealthy();
        expect(healthy).toBe(true);

        await driver.close();
      });
    });

    describe('When calling close and then isHealthy', () => {
      it('Then returns false after close', async () => {
        const driver = createLocalSqliteDriver(':memory:');

        await driver.close();

        const healthy = await driver.isHealthy();
        expect(healthy).toBe(false);
      });
    });
  });

  describe('Given a driver with table schema', () => {
    describe('When querying with DELETE FROM ... RETURNING', () => {
      it('Then converts values using the table schema', async () => {
        const tableSchema: TableSchemaRegistry = new Map([
          ['items', { id: 'integer', active: 'boolean' }],
        ]);
        const driver = createLocalSqliteDriver(':memory:', tableSchema);

        // Create table and insert test data
        await driver.execute(
          'CREATE TABLE items (id INTEGER PRIMARY KEY, active INTEGER NOT NULL)',
        );
        await driver.execute('INSERT INTO items (id, active) VALUES (?, ?)', [1, 1]);

        // DELETE with RETURNING should convert boolean values
        const result = await driver.query<{ id: number; active: boolean }>(
          'DELETE FROM items WHERE id = ? RETURNING *',
          [1],
        );

        expect(result).toEqual([{ id: 1, active: true }]);

        await driver.close();
      });
    });
  });

  describe('Given a driver with table schema for UPDATE queries', () => {
    describe('When running an UPDATE ... RETURNING query', () => {
      it('Then converts values using the table schema', async () => {
        const tableSchema: TableSchemaRegistry = new Map([
          ['items', { id: 'integer', active: 'boolean' }],
        ]);
        const driver = createLocalSqliteDriver(':memory:', tableSchema);

        await driver.execute(
          'CREATE TABLE items (id INTEGER PRIMARY KEY, active INTEGER NOT NULL)',
        );
        await driver.execute('INSERT INTO items (id, active) VALUES (?, ?)', [1, 0]);

        const result = await driver.query<{ id: number; active: boolean }>(
          'UPDATE items SET active = ? WHERE id = ? RETURNING *',
          [1, 1],
        );

        expect(result).toEqual([{ id: 1, active: true }]);

        await driver.close();
      });
    });
  });

  describe('Given a driver without table schema', () => {
    describe('When querying', () => {
      it('Then returns raw values without conversion', async () => {
        const driver = createLocalSqliteDriver(':memory:');

        await driver.execute(
          'CREATE TABLE items (id INTEGER PRIMARY KEY, active INTEGER NOT NULL)',
        );
        await driver.execute('INSERT INTO items (id, active) VALUES (?, ?)', [1, 1]);

        const result = await driver.query<{ id: number; active: number }>('SELECT * FROM items');

        // Without schema, booleans stay as 0/1 integers
        expect(result).toEqual([{ id: 1, active: 1 }]);

        await driver.close();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// resolveLocalSqliteDatabase — error handling
// ---------------------------------------------------------------------------

describe('resolveLocalSqliteDatabase', () => {
  describe('Given both bun:sqlite and better-sqlite3 are unavailable', () => {
    describe('When resolving the database', () => {
      it('Then throws an error mentioning both backends and the db path', () => {
        const bunError = new Error('bun:sqlite not available');
        const betterError = new Error('Could not locate the bindings file');

        const failingRequire = (_mod: string) => {
          throw _mod === 'bun:sqlite' ? bunError : betterError;
        };

        expect(() => resolveLocalSqliteDatabase(':memory:', failingRequire)).toThrow(
          /Failed to initialize SQLite/,
        );
        expect(() => resolveLocalSqliteDatabase(':memory:', failingRequire)).toThrow(/bun:sqlite/);
        expect(() => resolveLocalSqliteDatabase(':memory:', failingRequire)).toThrow(
          /better-sqlite3/,
        );
      });

      it('Then includes the database path in the error', () => {
        const failingRequire = (_mod: string) => {
          throw new Error('not available');
        };

        expect(() => resolveLocalSqliteDatabase('/app/data/notes.db', failingRequire)).toThrow(
          '/app/data/notes.db',
        );
      });
    });
  });

  describe('Given bun:sqlite succeeds', () => {
    describe('When resolving the database', () => {
      it('Then returns the database from bun:sqlite', () => {
        const mockDb = { prepare: () => {}, exec: () => {}, close: () => {} };
        function MockDatabase() {
          return mockDb;
        }
        const mockRequire = (mod: string) => {
          if (mod === 'bun:sqlite') return { Database: MockDatabase };
          throw new Error('should not reach better-sqlite3');
        };

        const db = resolveLocalSqliteDatabase(':memory:', mockRequire);
        expect(db).toBe(mockDb);
      });
    });
  });

  describe('Given bun:sqlite fails but better-sqlite3 succeeds', () => {
    describe('When resolving the database', () => {
      it('Then returns the database from better-sqlite3', () => {
        const mockDb = { prepare: () => {}, exec: () => {}, close: () => {} };
        function MockDatabase() {
          return mockDb;
        }
        const mockRequire = (mod: string) => {
          if (mod === 'bun:sqlite') throw new Error('not available');
          return MockDatabase;
        };

        const db = resolveLocalSqliteDatabase(':memory:', mockRequire);
        expect(db).toBe(mockDb);
      });
    });
  });
});
