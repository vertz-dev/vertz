import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MigrationFile } from '../runner';
import { computeChecksum, createMigrationRunner, parseMigrationName } from '../runner';

describe('MigrationRunner', () => {
  let db: PGlite;
  let queryFn: (
    sql: string,
    params: readonly unknown[],
  ) => Promise<{ rows: readonly Record<string, unknown>[]; rowCount: number }>;

  beforeAll(async () => {
    db = new PGlite();
    queryFn = async (sql: string, params: readonly unknown[]) => {
      const result = await db.query(sql, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rows.length };
    };
  });

  afterAll(async () => {
    await db.close();
  });

  it('creates the _vertz_migrations history table', async () => {
    const runner = createMigrationRunner();
    await runner.createHistoryTable(queryFn);

    const result = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = '_vertz_migrations'",
    );
    expect(result.rows).toHaveLength(1);
  });

  it('applies a migration and records it in history', async () => {
    const runner = createMigrationRunner();
    // History table already created in previous test

    const migrationSql = `
      CREATE TABLE "test_users" (
        "id" serial PRIMARY KEY,
        "name" text NOT NULL
      );
    `;

    await runner.apply(queryFn, migrationSql, '0001_initial.sql');

    // Verify table was created
    const tableResult = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'test_users'",
    );
    expect(tableResult.rows).toHaveLength(1);

    // Verify migration was recorded
    const applied = await runner.getApplied(queryFn);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.name).toBe('0001_initial.sql');
    expect(applied[0]?.checksum).toBe(computeChecksum(migrationSql));
  });

  it('getApplied returns migrations in order', async () => {
    const runner = createMigrationRunner();

    const migrationSql = `
      ALTER TABLE "test_users" ADD COLUMN "email" text;
    `;
    await runner.apply(queryFn, migrationSql, '0002_add_email.sql');

    const applied = await runner.getApplied(queryFn);
    expect(applied).toHaveLength(2);
    expect(applied[0]?.name).toBe('0001_initial.sql');
    expect(applied[1]?.name).toBe('0002_add_email.sql');
  });

  it('getPending returns unapplied files sorted by timestamp', () => {
    const runner = createMigrationRunner();

    const files: MigrationFile[] = [
      {
        name: '0003_add_bio.sql',
        sql: 'ALTER TABLE test_users ADD COLUMN bio text;',
        timestamp: 3,
      },
      { name: '0001_initial.sql', sql: 'CREATE TABLE ...', timestamp: 1 },
      { name: '0002_add_email.sql', sql: 'ALTER TABLE ...', timestamp: 2 },
    ];

    const applied = [
      { name: '0001_initial.sql', checksum: 'abc', appliedAt: new Date() },
      { name: '0002_add_email.sql', checksum: 'def', appliedAt: new Date() },
    ];

    const pending = runner.getPending(files, applied);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.name).toBe('0003_add_bio.sql');
  });

  it('detectDrift identifies modified migrations', () => {
    const runner = createMigrationRunner();
    const originalSql = 'CREATE TABLE users (id serial PRIMARY KEY);';
    const modifiedSql = 'CREATE TABLE users (id uuid PRIMARY KEY);';

    const files: MigrationFile[] = [{ name: '0001_initial.sql', sql: modifiedSql, timestamp: 1 }];

    const applied = [
      { name: '0001_initial.sql', checksum: computeChecksum(originalSql), appliedAt: new Date() },
    ];

    const drifted = runner.detectDrift(files, applied);
    expect(drifted).toEqual(['0001_initial.sql']);
  });

  it('detectDrift returns empty when checksums match', () => {
    const runner = createMigrationRunner();
    const sql = 'CREATE TABLE users (id serial PRIMARY KEY);';

    const files: MigrationFile[] = [{ name: '0001_initial.sql', sql, timestamp: 1 }];
    const applied = [
      { name: '0001_initial.sql', checksum: computeChecksum(sql), appliedAt: new Date() },
    ];

    const drifted = runner.detectDrift(files, applied);
    expect(drifted).toEqual([]);
  });

  it('detectOutOfOrder identifies out-of-order migrations', () => {
    const runner = createMigrationRunner();

    const files: MigrationFile[] = [
      { name: '0001_initial.sql', sql: 'CREATE TABLE ...', timestamp: 1 },
      { name: '0002_add_email.sql', sql: 'ALTER TABLE ...', timestamp: 2 },
      { name: '0003_add_bio.sql', sql: 'ALTER TABLE ...', timestamp: 3 },
    ];

    // 0001 and 0003 applied, but 0002 is pending -> out-of-order
    const applied = [
      { name: '0001_initial.sql', checksum: 'abc', appliedAt: new Date() },
      { name: '0003_add_bio.sql', checksum: 'ghi', appliedAt: new Date() },
    ];

    const outOfOrder = runner.detectOutOfOrder(files, applied);
    expect(outOfOrder).toEqual(['0002_add_email.sql']);
  });
});

describe('parseMigrationName', () => {
  it('parses valid migration filename', () => {
    const result = parseMigrationName('0001_initial.sql');
    expect(result).toEqual({ timestamp: 1, name: '0001_initial.sql' });
  });

  it('parses multi-word migration filename', () => {
    const result = parseMigrationName('0042_add_user_bio.sql');
    expect(result).toEqual({ timestamp: 42, name: '0042_add_user_bio.sql' });
  });

  it('returns null for invalid filename', () => {
    expect(parseMigrationName('invalid.sql')).toBeNull();
    expect(parseMigrationName('_snapshot.json')).toBeNull();
    expect(parseMigrationName('_lock.json')).toBeNull();
  });
});

describe('computeChecksum', () => {
  it('returns consistent hash for same input', () => {
    const sql = 'CREATE TABLE users (id serial PRIMARY KEY);';
    expect(computeChecksum(sql)).toBe(computeChecksum(sql));
  });

  it('returns different hash for different input', () => {
    expect(computeChecksum('SELECT 1')).not.toBe(computeChecksum('SELECT 2'));
  });
});
