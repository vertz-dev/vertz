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
});
