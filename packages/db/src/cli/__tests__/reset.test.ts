import { describe, expect, it, mock } from 'bun:test';
import { unwrap } from '@vertz/errors';
import { defaultSqliteDialect } from '../../dialect';
import type { MigrationFile, MigrationQueryFn } from '../../migration';
import { reset } from '../reset';

describe('reset', () => {
  it('drops all user tables and re-applies migrations', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
      { name: '0002_add_users.sql', sql: 'CREATE TABLE b (id int);', timestamp: 2 },
    ];

    const executedSql: string[] = [];
    const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
      executedSql.push(sql);
      // Return tables for the introspection query
      if (sql.includes('sqlite_master')) {
        return {
          rows: [{ name: 'users' }, { name: 'posts' }],
          rowCount: 2,
        };
      }
      // getApplied returns empty after drop
      if (sql.includes('SELECT') && sql.includes('_vertz_migrations')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = unwrap(
      await reset({ queryFn, migrationFiles: files, dialect: defaultSqliteDialect }),
    );

    expect(result.tablesDropped).toEqual(['users', 'posts']);
    expect(result.migrationsApplied).toEqual(['0001_init.sql', '0002_add_users.sql']);

    // Verify DROP TABLE was called
    const dropSql = executedSql.filter((sql) => sql.includes('DROP TABLE'));
    expect(dropSql.length).toBeGreaterThanOrEqual(2);
  });

  it('works on empty database (no tables to drop)', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
    ];

    const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
      // No tables exist
      if (sql.includes('sqlite_master')) {
        return { rows: [], rowCount: 0 };
      }
      // getApplied returns empty
      if (sql.includes('SELECT') && sql.includes('_vertz_migrations')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = unwrap(
      await reset({ queryFn, migrationFiles: files, dialect: defaultSqliteDialect }),
    );

    expect(result.tablesDropped).toEqual([]);
    expect(result.migrationsApplied).toEqual(['0001_init.sql']);
  });

  it('excludes internal tables from tablesDropped list', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
    ];

    const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
      // Return internal tables alongside user tables
      if (sql.includes('sqlite_master')) {
        return {
          rows: [{ name: 'users' }, { name: '_vertz_migrations' }],
          rowCount: 2,
        };
      }
      if (sql.includes('SELECT') && sql.includes('_vertz_migrations')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = unwrap(
      await reset({ queryFn, migrationFiles: files, dialect: defaultSqliteDialect }),
    );

    // _vertz_migrations should not appear in tablesDropped
    expect(result.tablesDropped).toEqual(['users']);
    expect(result.tablesDropped).not.toContain('_vertz_migrations');
  });

  it('uses CASCADE on Postgres when dropping tables', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 },
    ];

    const executedSql: string[] = [];
    const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
      executedSql.push(sql);
      if (sql.includes('pg_tables')) {
        return {
          rows: [{ name: 'users' }],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT') && sql.includes('_vertz_migrations')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    unwrap(await reset({ queryFn, migrationFiles: files }));

    const dropSql = executedSql.filter((sql) => sql.includes('DROP TABLE'));
    for (const sql of dropSql) {
      expect(sql).toContain('CASCADE');
    }
  });

  describe('error handling', () => {
    it('returns error when listing tables fails', async () => {
      const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
        if (sql.includes('sqlite_master') || sql.includes('pg_tables')) {
          throw new Error('connection refused');
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await reset({
        queryFn,
        migrationFiles: [],
        dialect: defaultSqliteDialect,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to list user tables');
      }
    });

    it('returns error when dropping a table fails', async () => {
      const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
        if (sql.includes('sqlite_master')) {
          return { rows: [{ name: 'locked_table' }], rowCount: 1 };
        }
        if (sql.includes('DROP TABLE') && sql.includes('locked_table')) {
          throw new Error('table is locked');
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await reset({
        queryFn,
        migrationFiles: [],
        dialect: defaultSqliteDialect,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to drop table');
      }
    });

    it('returns error when dropping history table fails', async () => {
      const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
        if (sql.includes('sqlite_master')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('DROP TABLE') && sql.includes('_vertz_migrations')) {
          throw new Error('cannot drop history');
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await reset({
        queryFn,
        migrationFiles: [],
        dialect: defaultSqliteDialect,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to drop history table');
      }
    });

    it('returns error when re-applying a migration fails', async () => {
      const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
        if (sql.includes('sqlite_master')) return { rows: [], rowCount: 0 };
        if (sql.includes('DROP TABLE')) return { rows: [], rowCount: 0 };
        if (sql.includes('CREATE TABLE') && sql.includes('_vertz_migrations'))
          return { rows: [], rowCount: 0 };
        if (sql.includes('SELECT')) return { rows: [], rowCount: 0 };
        // Migration SQL fails
        throw new Error('syntax error');
      });

      const result = await reset({
        queryFn,
        migrationFiles: [{ name: '0001_init.sql', sql: 'CREATE TABLE a (id int);', timestamp: 1 }],
        dialect: defaultSqliteDialect,
      });

      expect(result.ok).toBe(false);
    });

    it('returns error when creating history table fails after reset', async () => {
      const queryFn: MigrationQueryFn = mock().mockImplementation(async (sql: string) => {
        if (sql.includes('sqlite_master')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('DROP TABLE')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('CREATE TABLE') && sql.includes('_vertz_migrations')) {
          throw new Error('disk full');
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await reset({
        queryFn,
        migrationFiles: [],
        dialect: defaultSqliteDialect,
      });

      expect(result.ok).toBe(false);
    });
  });
});
