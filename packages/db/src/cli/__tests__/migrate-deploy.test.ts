import { describe, expect, it, vi } from 'vitest';
import type { MigrationFile, MigrationQueryFn } from '../../migration';
import { migrateDeploy } from '../migrate-deploy';

describe('migrateDeploy', () => {
  it('applies all pending migrations', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
      { name: '0002_add_users.sql', sql: 'CREATE TABLE b (id int);', timestamp: 2 },
    ];

    const executedSql: string[] = [];
    const queryFn: MigrationQueryFn = vi.fn().mockImplementation(async (sql: string) => {
      executedSql.push(sql);
      // getApplied returns empty (no migrations applied yet)
      if (sql.includes('SELECT')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await migrateDeploy({ queryFn, migrationFiles: files });

    expect(result.applied).toEqual(['0001_init.sql', '0002_add_users.sql']);
    expect(result.alreadyApplied).toEqual([]);
  });

  it('skips already applied migrations and reports them', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
      { name: '0002_add_users.sql', sql: 'CREATE TABLE b (id int);', timestamp: 2 },
    ];

    const queryFn: MigrationQueryFn = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [{ name: '0001_init.sql', checksum: 'abc', applied_at: '2024-01-01T00:00:00Z' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await migrateDeploy({ queryFn, migrationFiles: files });

    expect(result.applied).toEqual(['0002_add_users.sql']);
    expect(result.alreadyApplied).toEqual(['0001_init.sql']);
  });

  it('returns empty applied when all are already applied', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
    ];

    const queryFn: MigrationQueryFn = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [{ name: '0001_init.sql', checksum: 'abc', applied_at: '2024-01-01T00:00:00Z' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await migrateDeploy({ queryFn, migrationFiles: files });

    expect(result.applied).toEqual([]);
    expect(result.alreadyApplied).toEqual(['0001_init.sql']);
  });

  describe('dry-run mode', () => {
    it('returns SQL without executing migrations when dryRun is true', async () => {
      const files: MigrationFile[] = [
        { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
        { name: '0002_add_users.sql', sql: 'CREATE TABLE b (id int);', timestamp: 2 },
      ];

      const executedSql: string[] = [];
      const queryFn: MigrationQueryFn = vi.fn().mockImplementation(async (sql: string) => {
        executedSql.push(sql);
        if (sql.includes('SELECT')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await migrateDeploy({ queryFn, migrationFiles: files, dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.applied).toEqual(['0001_init.sql', '0002_add_users.sql']);
      expect(result.migrations).toBeDefined();
      expect(result.migrations).toHaveLength(2);

      // Verify migration details are returned
      const first = result.migrations?.[0];
      expect(first?.name).toBe('0001_init.sql');
      expect(first?.sql).toBe('CREATE TABLE a (id int);');
      expect(first?.dryRun).toBe(true);
      expect(first?.statements).toHaveLength(2);

      const second = result.migrations?.[1];
      expect(second?.name).toBe('0002_add_users.sql');
      expect(second?.sql).toBe('CREATE TABLE b (id int);');
      expect(second?.dryRun).toBe(true);

      // Verify that no migration SQL was executed (only history table creation + SELECT)
      const migrationExecutions = executedSql.filter(
        (s) => s === 'CREATE TABLE a (id int);' || s === 'CREATE TABLE b (id int);',
      );
      expect(migrationExecutions).toHaveLength(0);

      // Verify no INSERT into history table happened
      const insertExecutions = executedSql.filter((s) => s.includes('INSERT INTO'));
      expect(insertExecutions).toHaveLength(0);
    });

    it('sets dryRun false when not specified', async () => {
      const files: MigrationFile[] = [
        { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
      ];

      const queryFn: MigrationQueryFn = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await migrateDeploy({ queryFn, migrationFiles: files });

      expect(result.dryRun).toBe(false);
      expect(result.migrations).toBeDefined();
      expect(result.migrations?.[0]?.dryRun).toBe(false);
    });

    it('returns undefined migrations when no pending migrations in dry-run', async () => {
      const files: MigrationFile[] = [
        { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
      ];

      const queryFn: MigrationQueryFn = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT')) {
          return {
            rows: [{ name: '0001_init.sql', checksum: 'abc', applied_at: '2024-01-01T00:00:00Z' }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await migrateDeploy({ queryFn, migrationFiles: files, dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.applied).toEqual([]);
      expect(result.migrations).toBeUndefined();
    });
  });
});
