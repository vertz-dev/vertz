import { describe, expect, it, mock } from 'bun:test';
import { unwrap } from '@vertz/errors';
import type { MigrationFile, MigrationQueryFn } from '../../migration';
import { baseline } from '../baseline';

describe('baseline', () => {
  it('records all migration files when none are applied yet', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
      { name: '0002_add_users.sql', sql: 'CREATE TABLE b (id int);', timestamp: 2 },
    ];

    const executedSql: string[] = [];
    const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
      executedSql.push(sql);
      if (sql.includes('SELECT')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = unwrap(await baseline({ queryFn, migrationFiles: files }));

    expect(result.recorded).toEqual(['0001_init.sql', '0002_add_users.sql']);

    // Should NOT execute the migration SQL — only record in history
    const migrationSqlExecuted = executedSql.some(
      (sql) => sql.includes('CREATE TABLE a') || sql.includes('CREATE TABLE b'),
    );
    expect(migrationSqlExecuted).toBe(false);

    // Should have inserted into history table
    const insertSql = executedSql.filter((sql) => sql.includes('INSERT INTO'));
    expect(insertSql).toHaveLength(2);
  });

  it('skips already-applied migrations', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
      { name: '0002_add_users.sql', sql: 'CREATE TABLE b (id int);', timestamp: 2 },
    ];

    const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [{ name: '0001_init.sql', checksum: 'abc', applied_at: '2024-01-01T00:00:00Z' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = unwrap(await baseline({ queryFn, migrationFiles: files }));

    expect(result.recorded).toEqual(['0002_add_users.sql']);
  });

  it('returns empty recorded array when all are already applied', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
    ];

    const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [{ name: '0001_init.sql', checksum: 'abc', applied_at: '2024-01-01T00:00:00Z' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = unwrap(await baseline({ queryFn, migrationFiles: files }));

    expect(result.recorded).toEqual([]);
  });

  it('computes correct checksums for each migration', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
    ];

    const insertedParams: unknown[][] = [];
    const queryFn: MigrationQueryFn = mock().mockImplementation(
      async (sql: string, params: readonly unknown[]) => {
        if (sql.includes('SELECT')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('INSERT INTO')) {
          insertedParams.push([...params]);
        }
        return { rows: [], rowCount: 0 };
      },
    );

    unwrap(await baseline({ queryFn, migrationFiles: files }));

    // Verify the checksum was computed and passed as param
    expect(insertedParams).toHaveLength(1);
    expect(insertedParams[0]?.[0]).toBe('0001_init.sql');
    // Checksum should be a 64-char hex string (SHA-256)
    const checksum = insertedParams[0]?.[1] as string;
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns error when createHistoryTable fails', async () => {
    const queryFn: MigrationQueryFn = mock().mockImplementation(async () => {
      throw new Error('connection refused');
    });

    const result = await baseline({
      queryFn,
      migrationFiles: [{ name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 }],
    });

    expect(result.ok).toBe(false);
  });

  it('returns error when getApplied fails', async () => {
    let callCount = 0;
    const queryFn: MigrationQueryFn = mock().mockImplementation(async () => {
      callCount++;
      // First call (CREATE TABLE IF NOT EXISTS) succeeds
      if (callCount === 1) return { rows: [], rowCount: 0 };
      // Second call (SELECT from history) fails
      throw new Error('permission denied');
    });

    const result = await baseline({
      queryFn,
      migrationFiles: [{ name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 }],
    });

    expect(result.ok).toBe(false);
  });
});
