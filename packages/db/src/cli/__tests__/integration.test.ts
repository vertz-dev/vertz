import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { d } from '../../d';
import type { MigrationQueryFn } from '../../migration';
import { createSnapshot } from '../../migration';
import { migrateDev } from '../migrate-dev';
import { push } from '../push';

/**
 * Integration tests for CLI commands (IT-6-3, IT-6-4).
 *
 * IT-6-3: Plugin beforeQuery hook is invoked (see plugin integration tests)
 * IT-6-4: CLI migrate dev generates migration file
 */
describe('CLI Integration Tests', () => {
  let db: PGlite;
  let queryFn: MigrationQueryFn;

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

  // IT-6-4: CLI migrate dev generates migration file
  it('IT-6-4: migrateDev creates a SQL file with correct content', async () => {
    const users = d.table('cliUsers', {
      id: d.uuid().primary(),
      email: d.text().unique(),
      name: d.text(),
    });

    const currentSnapshot = createSnapshot([users]);
    const emptySnapshot = createSnapshot([]);
    const writtenFiles: Array<{ path: string; content: string }> = [];

    const result = await migrateDev({
      queryFn,
      currentSnapshot,
      previousSnapshot: emptySnapshot,
      migrationName: 'create_cli_users',
      existingFiles: [],
      migrationsDir: '/tmp/test-migrations',
      writeFile: mock().mockImplementation(async (path: string, content: string) => {
        writtenFiles.push({ path, content });
      }),
      dryRun: false,
    });

    // Migration file, journal, and snapshot were written
    const sqlFile = writtenFiles.find((f) => f.path.endsWith('.sql'));
    expect(sqlFile).toBeDefined();
    expect(sqlFile?.path).toBe('/tmp/test-migrations/0001_create_cli_users.sql');
    expect(sqlFile?.content).toContain('CREATE TABLE "cli_users"');

    // SQL contains correct content
    expect(result.sql).toContain('CREATE TABLE "cli_users"');
    expect(result.migrationFile).toBe('0001_create_cli_users.sql');
    expect(result.appliedAt).toBeInstanceOf(Date);

    // Table was actually created in the database
    const tables = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'cli_users'",
    );
    expect(tables.rows).toHaveLength(1);
  });

  // Integration test: push modifies database schema directly
  it('push modifies database schema directly without creating a migration file', async () => {
    const posts = d.table('cliPosts', {
      id: d.uuid().primary(),
      title: d.text(),
      body: d.text().nullable(),
    });

    const currentSnapshot = createSnapshot([posts]);
    const emptySnapshot = createSnapshot([]);

    const result = await push({
      queryFn,
      currentSnapshot,
      previousSnapshot: emptySnapshot,
    });

    // SQL was generated and applied
    expect(result.sql).toContain('CREATE TABLE "cli_posts"');
    expect(result.tablesAffected).toContain('cliPosts');

    // Table was actually created in the database
    const tables = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'cli_posts'",
    );
    expect(tables.rows).toHaveLength(1);

    // Verify columns
    const cols = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'cli_posts' ORDER BY ordinal_position",
    );
    const colNames = cols.rows.map((r: Record<string, unknown>) => r.column_name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('title');
    expect(colNames).toContain('body');
  });
});
