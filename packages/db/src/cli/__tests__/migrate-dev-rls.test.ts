import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import type { MigrationQueryFn, SchemaSnapshot } from '../../migration';
import type { RlsPolicyInput } from '../../migration/rls-snapshot';
import { migrateDev } from '../migrate-dev';

describe('Feature: RLS integration in migrateDev', () => {
  let db: PGlite;
  let queryFn: MigrationQueryFn;

  const emptySnapshot: SchemaSnapshot = {
    version: 1,
    tables: {},
    enums: {},
  };

  const snapshotWithTasks: SchemaSnapshot = {
    version: 1,
    tables: {
      tasks: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false },
          title: { type: 'text', nullable: false, primary: false, unique: false },
          tenant_id: { type: 'uuid', nullable: false, primary: false, unique: false },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    },
    enums: {},
  };

  const rlsPolicies: RlsPolicyInput = {
    tables: {
      tasks: {
        enableRls: true,
        policies: [
          {
            name: 'tasks_tenant_isolation',
            for: 'ALL',
            using: "tenant_id = current_setting('app.tenant_id')::UUID",
          },
        ],
      },
    },
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

  describe('Given schema changes + RLS policies', () => {
    describe('When migrateDev() is called', () => {
      it('Then generated SQL includes both DDL and RLS statements', async () => {
        const writtenFiles: Array<{ path: string; content: string }> = [];

        const result = await migrateDev({
          queryFn,
          currentSnapshot: snapshotWithTasks,
          previousSnapshot: emptySnapshot,
          migrationName: 'add-tasks',
          existingFiles: [],
          migrationsDir: '/tmp/migrations',
          writeFile: async (path, content) => {
            writtenFiles.push({ path, content });
          },
          dryRun: true,
          rlsPolicies,
        });

        // Should include both schema DDL and RLS
        expect(result.sql).toContain('CREATE TABLE');
        expect(result.sql).toContain('ENABLE ROW LEVEL SECURITY');
        expect(result.sql).toContain('CREATE POLICY');
      });

      it('Then snapshot includes RLS policy state', async () => {
        const writtenFiles: Array<{ path: string; content: string }> = [];

        const result = await migrateDev({
          queryFn,
          currentSnapshot: snapshotWithTasks,
          previousSnapshot: emptySnapshot,
          migrationName: 'add-tasks',
          existingFiles: [],
          migrationsDir: '/tmp/migrations',
          writeFile: async (path, content) => {
            writtenFiles.push({ path, content });
          },
          dryRun: true,
          rlsPolicies,
        });

        expect(result.snapshot.rls).toBeDefined();
        expect(result.snapshot.rls?.tables.tasks).toBeDefined();
        expect(result.snapshot.rls?.tables.tasks.rlsEnabled).toBe(true);
        expect(result.snapshot.rls?.tables.tasks.policies).toHaveLength(1);
      });
    });
  });

  describe('Given only RLS policy changes (no schema changes)', () => {
    describe('When migrateDev() is called', () => {
      it('Then generates migration with only RLS statements', async () => {
        const result = await migrateDev({
          queryFn,
          currentSnapshot: snapshotWithTasks,
          previousSnapshot: snapshotWithTasks, // same schema
          migrationName: 'add-rls',
          existingFiles: [],
          migrationsDir: '/tmp/migrations',
          writeFile: async () => {},
          dryRun: true,
          rlsPolicies,
        });

        // No schema DDL (same tables)
        expect(result.sql).not.toContain('CREATE TABLE');
        // But RLS is there
        expect(result.sql).toContain('ENABLE ROW LEVEL SECURITY');
        expect(result.sql).toContain('CREATE POLICY');
      });
    });
  });

  describe('Given schema changes but no RLS policies', () => {
    describe('When migrateDev() is called', () => {
      it('Then behaves exactly as before (no RLS SQL)', async () => {
        const result = await migrateDev({
          queryFn,
          currentSnapshot: snapshotWithTasks,
          previousSnapshot: emptySnapshot,
          migrationName: 'add-tasks',
          existingFiles: [],
          migrationsDir: '/tmp/migrations',
          writeFile: async () => {},
          dryRun: true,
        });

        expect(result.sql).toContain('CREATE TABLE');
        expect(result.sql).not.toContain('ROW LEVEL SECURITY');
        expect(result.snapshot.rls).toBeUndefined();
      });
    });
  });

  describe('Given previous snapshot without rls field (old format)', () => {
    describe('When migrateDev() is called with rlsPolicies', () => {
      it('Then treats previous RLS state as empty and generates all policies as new', async () => {
        // previousSnapshot has no .rls field (like old snapshots)
        const result = await migrateDev({
          queryFn,
          currentSnapshot: snapshotWithTasks,
          previousSnapshot: snapshotWithTasks, // same schema, no .rls
          migrationName: 'add-rls',
          existingFiles: [],
          migrationsDir: '/tmp/migrations',
          writeFile: async () => {},
          dryRun: true,
          rlsPolicies,
        });

        expect(result.sql).toContain('ENABLE ROW LEVEL SECURITY');
        expect(result.sql).toContain('CREATE POLICY "tasks_tenant_isolation"');
      });
    });
  });
});
