import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import type { MigrationQueryFn, SchemaSnapshot } from '../../migration';
import type { DiffChange } from '../../migration/differ';
import { generateMigrationName, migrateDev } from '../migrate-dev';

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

  describe('auto-naming', () => {
    it('generates name add-users-table when diff has single table_added', async () => {
      const result = await migrateDev({
        queryFn,
        currentSnapshot: snapshotWithUsers,
        previousSnapshot: emptySnapshot,
        existingFiles: [],
        migrationsDir: '/tmp/migrations',
        writeFile: async () => {},
        dryRun: true,
      });

      expect(result.migrationFile).toBe('0001_add-users-table.sql');
    });

    it('generates name add-role-to-users when diff has single column_added', async () => {
      const snapshotWithRole: SchemaSnapshot = {
        version: 1,
        tables: {
          users: {
            columns: {
              id: { type: 'serial', nullable: false, primary: true, unique: false },
              name: { type: 'text', nullable: false, primary: false, unique: false },
              role: { type: 'text', nullable: false, primary: false, unique: false },
            },
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
        },
        enums: {},
      };

      const result = await migrateDev({
        queryFn,
        currentSnapshot: snapshotWithRole,
        previousSnapshot: snapshotWithUsers,
        existingFiles: [],
        migrationsDir: '/tmp/migrations',
        writeFile: async () => {},
        dryRun: true,
      });

      expect(result.migrationFile).toBe('0001_add-role-to-users.sql');
    });

    it('generates name drop-sessions-table when diff has single table_removed', async () => {
      const snapshotWithSessions: SchemaSnapshot = {
        version: 1,
        tables: {
          sessions: {
            columns: {
              id: { type: 'serial', nullable: false, primary: true, unique: false },
              token: { type: 'text', nullable: false, primary: false, unique: true },
            },
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
        },
        enums: {},
      };

      const result = await migrateDev({
        queryFn,
        currentSnapshot: emptySnapshot,
        previousSnapshot: snapshotWithSessions,
        existingFiles: [],
        migrationsDir: '/tmp/migrations',
        writeFile: async () => {},
        dryRun: true,
      });

      expect(result.migrationFile).toBe('0001_drop-sessions-table.sql');
    });

    it('generates name update-schema for multiple unrelated changes', async () => {
      const before: SchemaSnapshot = {
        version: 1,
        tables: {
          users: {
            columns: {
              id: { type: 'serial', nullable: false, primary: true, unique: false },
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
              id: { type: 'serial', nullable: false, primary: true, unique: false },
              email: { type: 'text', nullable: false, primary: false, unique: false },
            },
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
          posts: {
            columns: {
              id: { type: 'serial', nullable: false, primary: true, unique: false },
            },
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
        },
        enums: {},
      };

      const result = await migrateDev({
        queryFn,
        currentSnapshot: after,
        previousSnapshot: before,
        existingFiles: [],
        migrationsDir: '/tmp/migrations',
        writeFile: async () => {},
        dryRun: true,
      });

      expect(result.migrationFile).toBe('0001_update-schema.sql');
    });

    it('uses provided name when migrationName is specified', async () => {
      const result = await migrateDev({
        queryFn,
        currentSnapshot: snapshotWithUsers,
        previousSnapshot: emptySnapshot,
        migrationName: 'custom_name',
        existingFiles: [],
        migrationsDir: '/tmp/migrations',
        writeFile: async () => {},
        dryRun: true,
      });

      expect(result.migrationFile).toBe('0001_custom_name.sql');
    });
  });

  describe('journal integration', () => {
    it('writes journal entry after generating migration', async () => {
      const writtenFiles: Array<{ path: string; content: string }> = [];

      await migrateDev({
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

      const journalWrite = writtenFiles.find((f) => f.path.endsWith('_journal.json'));
      expect(journalWrite).toBeDefined();

      const journal = JSON.parse(journalWrite!.content);
      expect(journal.version).toBe(1);
      expect(journal.migrations).toHaveLength(1);
      expect(journal.migrations[0].name).toBe('0001_add_users.sql');
    });

    it('journal entry has correct name, checksum, and createdAt', async () => {
      const writtenFiles: Array<{ path: string; content: string }> = [];

      await migrateDev({
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

      const journalWrite = writtenFiles.find((f) => f.path.endsWith('_journal.json'));
      expect(journalWrite).toBeDefined();

      const journal = JSON.parse(journalWrite!.content);
      const entry = journal.migrations[0];

      expect(entry.name).toBe('0001_add_users.sql');
      expect(entry.description).toBe('add_users');
      expect(typeof entry.checksum).toBe('string');
      expect(entry.checksum.length).toBeGreaterThan(0);
      expect(typeof entry.createdAt).toBe('string');
      // Validate ISO date format
      expect(new Date(entry.createdAt).toISOString()).toBe(entry.createdAt);
    });
  });

  describe('snapshot updating', () => {
    it('writes snapshot after generating migration', async () => {
      const writtenFiles: Array<{ path: string; content: string }> = [];

      await migrateDev({
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

      const snapshotWrite = writtenFiles.find((f) => f.path.endsWith('_snapshot.json'));
      expect(snapshotWrite).toBeDefined();
      expect(snapshotWrite!.path).toBe('/tmp/migrations/_snapshot.json');

      const snapshot = JSON.parse(snapshotWrite!.content);
      expect(snapshot).toEqual(snapshotWithUsers);
    });

    it('dry-run does NOT write journal or snapshot', async () => {
      const writtenFiles: Array<{ path: string; content: string }> = [];

      await migrateDev({
        queryFn,
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

      const journalWrite = writtenFiles.find((f) => f.path.endsWith('_journal.json'));
      const snapshotWrite = writtenFiles.find((f) => f.path.endsWith('_snapshot.json'));
      expect(journalWrite).toBeUndefined();
      expect(snapshotWrite).toBeUndefined();
    });
  });

  describe('collision detection', () => {
    it('detects collisions between journal entries and existing files', async () => {
      const writtenFiles: Array<{ path: string; content: string }> = [];

      // Scenario: Our journal has 0002_add_users.sql but after git pull,
      // another dev also has a 0002_add_posts.sql. detectCollisions should
      // find this conflict and the result should include collision info.
      const journalWithConflict = JSON.stringify({
        version: 1,
        migrations: [
          {
            name: '0001_init.sql',
            description: 'init',
            createdAt: '2025-01-01T00:00:00.000Z',
            checksum: 'abc123',
          },
          {
            name: '0002_add_users.sql',
            description: 'add_users',
            createdAt: '2025-01-02T00:00:00.000Z',
            checksum: 'def456',
          },
        ],
      });

      const result = await migrateDev({
        queryFn,
        currentSnapshot: snapshotWithUsers,
        previousSnapshot: emptySnapshot,
        migrationName: 'add_sessions',
        // Another dev has 0002_add_posts.sql which conflicts with our journal's 0002_add_users.sql
        existingFiles: ['0001_init.sql', '0002_add_posts.sql'],
        migrationsDir: '/tmp/migrations',
        writeFile: async (path, content) => {
          writtenFiles.push({ path, content });
        },
        readFile: async () => journalWithConflict,
        dryRun: false,
      });

      // The new migration should be 0003 (next after 0002)
      expect(result.migrationFile).toBe('0003_add_sessions.sql');
      // Collisions should be reported
      expect(result.collisions).toBeDefined();
      expect(result.collisions).toHaveLength(1);
      expect(result.collisions![0]!.sequenceNumber).toBe(2);
    });
  });

  describe('rename suggestions', () => {
    it('returns rename suggestions when a column rename is detected', async () => {
      const previousSnapshot: SchemaSnapshot = {
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

      const currentSnapshot: SchemaSnapshot = {
        version: 1,
        tables: {
          users: {
            columns: {
              id: { type: 'serial', nullable: false, primary: true, unique: false },
              fullName: { type: 'text', nullable: false, primary: false, unique: false },
            },
            indexes: [],
            foreignKeys: [],
            _metadata: {},
          },
        },
        enums: {},
      };

      const result = await migrateDev({
        queryFn,
        currentSnapshot,
        previousSnapshot,
        existingFiles: [],
        migrationsDir: '/tmp/migrations',
        writeFile: async () => {},
        dryRun: true,
      });

      expect(result.renames).toBeDefined();
      expect(result.renames!.length).toBeGreaterThan(0);
      expect(result.renames![0]!.oldColumn).toBe('name');
      expect(result.renames![0]!.newColumn).toBe('fullName');
      expect(result.renames![0]!.table).toBe('users');
      expect(typeof result.renames![0]!.confidence).toBe('number');
    });
  });

  describe('readFile fallback', () => {
    it('uses createJournal fallback when readFile throws', async () => {
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
        readFile: async () => {
          throw new Error('ENOENT: file not found');
        },
        dryRun: false,
      });

      expect(result.migrationFile).toBe('0001_add_users.sql');
      const journalWrite = writtenFiles.find((f) => f.path.endsWith('_journal.json'));
      expect(journalWrite).toBeDefined();
      const journal = JSON.parse(journalWrite!.content);
      expect(journal.version).toBe(1);
      expect(journal.migrations).toHaveLength(1);
    });
  });
});

describe('generateMigrationName', () => {
  it('returns empty-migration for no changes', () => {
    expect(generateMigrationName([])).toBe('empty-migration');
  });

  it('generates name for column_altered', () => {
    const changes: DiffChange[] = [{ type: 'column_altered', table: 'users', column: 'age' }];
    expect(generateMigrationName(changes)).toBe('alter-age-in-users');
  });

  it('generates name for column_renamed', () => {
    const changes: DiffChange[] = [
      { type: 'column_renamed', table: 'users', oldColumn: 'name', newColumn: 'fullName' },
    ];
    expect(generateMigrationName(changes)).toBe('rename-name-to-full-name-in-users');
  });

  it('generates name for index_added', () => {
    const changes: DiffChange[] = [{ type: 'index_added', table: 'users', columns: ['email'] }];
    expect(generateMigrationName(changes)).toBe('add-index-to-users');
  });

  it('generates name for index_removed', () => {
    const changes: DiffChange[] = [{ type: 'index_removed', table: 'users', columns: ['email'] }];
    expect(generateMigrationName(changes)).toBe('drop-index-from-users');
  });

  it('generates name for enum_added', () => {
    const changes: DiffChange[] = [{ type: 'enum_added', enumName: 'userRole' }];
    expect(generateMigrationName(changes)).toBe('add-user-role-enum');
  });

  it('generates name for enum_removed', () => {
    const changes: DiffChange[] = [{ type: 'enum_removed', enumName: 'userRole' }];
    expect(generateMigrationName(changes)).toBe('drop-user-role-enum');
  });

  it('generates name for enum_altered', () => {
    const changes: DiffChange[] = [
      { type: 'enum_altered', enumName: 'userRole', addedValues: ['viewer'] },
    ];
    expect(generateMigrationName(changes)).toBe('alter-user-role-enum');
  });

  it('generates name for column_removed', () => {
    const changes: DiffChange[] = [{ type: 'column_removed', table: 'users', column: 'email' }];
    expect(generateMigrationName(changes)).toBe('drop-email-from-users');
  });

  it('generates name for multiple column_added on same table', () => {
    const changes: DiffChange[] = [
      { type: 'column_added', table: 'users', column: 'email' },
      { type: 'column_added', table: 'users', column: 'name' },
    ];
    expect(generateMigrationName(changes)).toBe('add-columns-to-users');
  });

  it('generates name for multiple column_removed on same table', () => {
    const changes: DiffChange[] = [
      { type: 'column_removed', table: 'users', column: 'email' },
      { type: 'column_removed', table: 'users', column: 'name' },
    ];
    expect(generateMigrationName(changes)).toBe('drop-columns-from-users');
  });

  it('generates update-table name for multiple same-type changes on same table', () => {
    const changes: DiffChange[] = [
      { type: 'column_altered', table: 'users', column: 'email' },
      { type: 'column_altered', table: 'users', column: 'name' },
    ];
    expect(generateMigrationName(changes)).toBe('update-users');
  });
});
