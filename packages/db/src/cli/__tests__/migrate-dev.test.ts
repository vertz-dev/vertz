import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MigrationQueryFn, SchemaSnapshot } from '../../migration';
import { migrateDev } from '../migrate-dev';

describe('migrateDev', () => {
  let db: PGlite;
  let queryFn: MigrationQueryFn;

  const emptySnapshot: SchemaSnapshot = {
    version: 1,
    tables: {},
    enums: {},
  };

  const snapshotWithUsers: SchemaSnapshot = {
    version: 1,
    tables: {
      users: {
        columns: {
          id: { type: 'serial', nullable: false, primary: true, unique: false },
          name: { type: 'text', nullable: false, primary: false, unique: false },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    },
    enums: {},
  };

  beforeEach(async () => {
    db = new PGlite();
    queryFn = async (sql: string, params: readonly unknown[]) => {
      const result = await db.query(sql, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rows.length };
    };
  });

  afterEach(async () => {
    await db.close();
  });

  it('returns the current snapshot in the result after apply', async () => {
    const writtenFiles: Array<{ path: string; content: string }> = [];

    const result = await migrateDev({
      queryFn,
      currentSnapshot: snapshotWithUsers,
      previousSnapshot: emptySnapshot,
      migrationName: 'add_users',
      existingFiles: [],
      migrationsDir: '/tmp/migrations',
      writeFile: async (path, content) => {
        writtenFiles.push({ path, content });
      },
      dryRun: false,
    });

    expect(result.snapshot).toBeDefined();
    expect(result.snapshot).toEqual(snapshotWithUsers);
    expect(result.dryRun).toBe(false);
  });

  it('returns the current snapshot in dry-run mode', async () => {
    const result = await migrateDev({
      queryFn,
      currentSnapshot: snapshotWithUsers,
      previousSnapshot: emptySnapshot,
      migrationName: 'add_users',
      existingFiles: [],
      migrationsDir: '/tmp/migrations',
      writeFile: async () => {},
      dryRun: true,
    });

    expect(result.snapshot).toBeDefined();
    expect(result.snapshot).toEqual(snapshotWithUsers);
    expect(result.dryRun).toBe(true);
  });

  it('dry-run does not write files or execute SQL', async () => {
    const writtenFiles: Array<{ path: string; content: string }> = [];
    const executedSql: string[] = [];

    const trackingQueryFn: MigrationQueryFn = async (sql: string, params: readonly unknown[]) => {
      executedSql.push(sql);
      const result = await db.query(sql, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rows.length };
    };

    const result = await migrateDev({
      queryFn: trackingQueryFn,
      currentSnapshot: snapshotWithUsers,
      previousSnapshot: emptySnapshot,
      migrationName: 'add_users',
      existingFiles: [],
      migrationsDir: '/tmp/migrations',
      writeFile: async (path, content) => {
        writtenFiles.push({ path, content });
      },
      dryRun: true,
    });

    // Should return SQL content
    expect(result.sql).toBeDefined();
    expect(result.sql.length).toBeGreaterThan(0);
    expect(result.dryRun).toBe(true);

    // No files should have been written
    expect(writtenFiles).toHaveLength(0);

    // No SQL should have been executed (dry-run bypasses runner.apply entirely)
    expect(executedSql).toHaveLength(0);
  });

  it('dry-run returns the migration filename that would be generated', async () => {
    const result = await migrateDev({
      queryFn,
      currentSnapshot: snapshotWithUsers,
      previousSnapshot: emptySnapshot,
      migrationName: 'add_users',
      existingFiles: ['0001_init.sql'],
      migrationsDir: '/tmp/migrations',
      writeFile: async () => {},
      dryRun: true,
    });

    expect(result.migrationFile).toMatch(/^0002_add_users\.sql$/);
    expect(result.appliedAt).toBeUndefined();
  });
});
