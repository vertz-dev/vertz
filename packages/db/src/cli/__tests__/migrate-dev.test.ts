import { describe, expect, it, vi } from 'vitest';
import type { MigrationQueryFn, SchemaSnapshot } from '../../migration';
import { migrateDev } from '../migrate-dev';

describe('migrateDev', () => {
  const emptySnapshot: SchemaSnapshot = { version: 1, tables: {}, enums: {} };

  const usersSnapshot: SchemaSnapshot = {
    version: 1,
    tables: {
      users: {
        columns: {
          id: { type: 'uuid', nullable: false, primary: true, unique: false },
          email: { type: 'text', nullable: false, primary: false, unique: true },
        },
        indexes: [],
        foreignKeys: [],
        _metadata: {},
      },
    },
    enums: {},
  };

  const baseOpts = {
    existingFiles: [] as string[],
    migrationsDir: '/tmp/migrations',
    writeFile: vi.fn().mockResolvedValue(undefined),
    dryRun: false,
  };

  function mockQueryFn(): MigrationQueryFn {
    return vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  }

  it('generates a migration file from schema diff', async () => {
    const writtenFiles: Array<{ path: string; content: string }> = [];
    const writeFile = vi.fn().mockImplementation(async (path: string, content: string) => {
      writtenFiles.push({ path, content });
    });

    const result = await migrateDev({
      ...baseOpts,
      queryFn: mockQueryFn(),
      currentSnapshot: usersSnapshot,
      previousSnapshot: emptySnapshot,
      migrationName: 'create_users',
      writeFile,
    });

    expect(result.sql).toContain('CREATE TABLE');
    expect(result.migrationFile).toContain('0001_create_users.sql');
    expect(result.dryRun).toBe(false);
    expect(writtenFiles).toHaveLength(1);
    expect(writtenFiles[0]?.path).toContain('0001_create_users.sql');
    expect(writtenFiles[0]?.content).toContain('CREATE TABLE');
  });

  it('applies the generated migration', async () => {
    const queryFn = mockQueryFn();

    const result = await migrateDev({
      ...baseOpts,
      queryFn,
      currentSnapshot: usersSnapshot,
      previousSnapshot: emptySnapshot,
      migrationName: 'create_users',
    });

    expect(result.appliedAt).toBeInstanceOf(Date);
    // queryFn should have been called for: createHistoryTable, apply (sql), apply (insert record)
    expect(queryFn).toHaveBeenCalled();
  });

  it('supports dry-run mode — returns SQL without applying', async () => {
    const queryFn = mockQueryFn();
    const writeFile = vi.fn();

    const result = await migrateDev({
      ...baseOpts,
      queryFn,
      currentSnapshot: usersSnapshot,
      previousSnapshot: emptySnapshot,
      migrationName: 'create_users',
      writeFile,
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.sql).toContain('CREATE TABLE');
    expect(result.migrationFile).toBe('0001_create_users.sql');
    expect(result.appliedAt).toBeUndefined();
    // Should NOT write file or execute SQL in dry-run
    expect(writeFile).not.toHaveBeenCalled();
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('uses next migration number from existing files', async () => {
    const result = await migrateDev({
      ...baseOpts,
      queryFn: mockQueryFn(),
      currentSnapshot: usersSnapshot,
      previousSnapshot: emptySnapshot,
      migrationName: 'add_posts',
      existingFiles: ['0001_create_users.sql', '0002_add_comments.sql'],
      dryRun: true,
    });

    expect(result.migrationFile).toBe('0003_add_posts.sql');
  });

  it('reports rename suggestions from diff', async () => {
    const before: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            name: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const after: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            displayName: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const result = await migrateDev({
      ...baseOpts,
      queryFn: mockQueryFn(),
      currentSnapshot: after,
      previousSnapshot: before,
      migrationName: 'rename_name',
      dryRun: true,
    });

    expect(result.renames).toBeDefined();
    expect(result.renames).toHaveLength(1);
    expect(result.renames?.[0]?.oldColumn).toBe('name');
    expect(result.renames?.[0]?.newColumn).toBe('displayName');
    expect(result.renames?.[0]?.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('writes migration file to correct path', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await migrateDev({
      ...baseOpts,
      queryFn: mockQueryFn(),
      currentSnapshot: usersSnapshot,
      previousSnapshot: emptySnapshot,
      migrationName: 'create_users',
      migrationsDir: '/app/migrations',
      writeFile,
    });

    expect(writeFile).toHaveBeenCalledWith(
      '/app/migrations/0001_create_users.sql',
      expect.stringContaining('CREATE TABLE'),
    );
  });
});
