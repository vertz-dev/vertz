import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { d } from '../../d';
import { computeDiff } from '../differ';
import type { MigrationQueryFn } from '../runner';
import { computeChecksum, createMigrationRunner } from '../runner';
import { createSnapshot } from '../snapshot';
import { generateMigrationSql } from '../sql-generator';

/**
 * Integration tests for the migration system (IT-5-1 through IT-5-6).
 *
 * These verify end-to-end behavior from schema definition through
 * snapshot, diff, SQL generation, and application via PGlite.
 */
describe('Migration Integration Tests', () => {
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

  // IT-5-1: Differ detects new table
  it('IT-5-1: differ detects a new table from schema definitions', () => {
    const before = createSnapshot([]);

    const users = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
      name: d.text(),
    });
    const after = createSnapshot([users]);

    const diff = computeDiff(before, after);

    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]?.type).toBe('table_added');
    expect(diff.changes[0]?.table).toBe('users');
  });

  // IT-5-2: Differ detects added column
  it('IT-5-2: differ detects an added column from schema definitions', () => {
    const usersV1 = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
    });

    const usersV2 = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
      bio: d.text().nullable(),
    });

    const before = createSnapshot([usersV1]);
    const after = createSnapshot([usersV2]);

    const diff = computeDiff(before, after);

    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]?.type).toBe('column_added');
    expect(diff.changes[0]?.table).toBe('users');
    expect(diff.changes[0]?.column).toBe('bio');
  });

  // IT-5-3: SQL generator produces valid CREATE TABLE
  it('IT-5-3: SQL generator produces valid CREATE TABLE that executes against PGlite', async () => {
    const users = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
      name: d.text(),
      active: d.boolean().default(true),
    });

    const snapshot = createSnapshot([users]);
    const diff = computeDiff({ version: 1, tables: {}, enums: {} }, snapshot);

    const sql = generateMigrationSql(diff.changes, {
      tables: snapshot.tables,
      enums: snapshot.enums,
    });

    // Should produce valid SQL
    expect(sql).toContain('CREATE TABLE "users"');

    // Execute against PGlite
    await db.exec(sql);

    // Verify table exists
    const result = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'users'",
    );
    expect(result.rows).toHaveLength(1);

    // Verify columns exist
    const cols = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position",
    );
    const colNames = cols.rows.map((r: Record<string, unknown>) => r.column_name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('email');
    expect(colNames).toContain('name');
    expect(colNames).toContain('active');
  });

  // IT-5-4: Migration runner creates history table and applies migrations
  it('IT-5-4: migration runner creates history table and applies migrations via PGlite', async () => {
    const runner = createMigrationRunner();

    // Create history table
    await runner.createHistoryTable(queryFn);

    // Verify history table exists
    const histResult = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = '_vertz_migrations'",
    );
    expect(histResult.rows).toHaveLength(1);

    // Apply a migration
    const migSql =
      'CREATE TABLE "posts" ("id" uuid NOT NULL, "title" text NOT NULL, PRIMARY KEY ("id"));';
    await runner.apply(queryFn, migSql, '0001_create_posts.sql');

    // Verify migration was recorded
    const applied = await runner.getApplied(queryFn);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.name).toBe('0001_create_posts.sql');
    expect(applied[0]?.checksum).toBe(computeChecksum(migSql));

    // Verify the table was actually created
    const postsResult = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'posts'",
    );
    expect(postsResult.rows).toHaveLength(1);
  });

  // IT-5-5: Rename detector identifies column rename
  it('IT-5-5: rename detector identifies column rename with confidence', () => {
    const usersV1 = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const usersV2 = d.table('users', {
      id: d.uuid().primary(),
      displayName: d.text(),
    });

    const before = createSnapshot([usersV1]);
    const after = createSnapshot([usersV2]);

    const diff = computeDiff(before, after);

    // Should detect rename, not add+remove
    const rename = diff.changes.find((c) => c.type === 'column_renamed');
    expect(rename).toBeDefined();
    expect(rename?.oldColumn).toBe('name');
    expect(rename?.newColumn).toBe('displayName');
    expect(rename?.confidence).toBeGreaterThanOrEqual(0.7);

    // Should NOT have separate add/remove
    const added = diff.changes.find((c) => c.type === 'column_added');
    const removed = diff.changes.find((c) => c.type === 'column_removed');
    expect(added).toBeUndefined();
    expect(removed).toBeUndefined();
  });

  // IT-5-6: Full migration round-trip: schema -> snapshot -> diff -> SQL -> apply
  it('IT-5-6: full migration round-trip from schema change to applied migration', async () => {
    // Start with empty schema
    const emptySnapshot = createSnapshot([]);

    // Define new schema
    const comments = d.table('comments', {
      id: d.uuid().primary(),
      postId: d.uuid().references('posts', 'id'),
      body: d.text(),
      createdAt: d.timestamp().default('now'),
    });

    const newSnapshot = createSnapshot([comments]);

    // Compute diff
    const diff = computeDiff(emptySnapshot, newSnapshot);
    expect(diff.changes.length).toBeGreaterThan(0);

    // Generate SQL
    const sql = generateMigrationSql(diff.changes, {
      tables: newSnapshot.tables,
      enums: newSnapshot.enums,
    });
    expect(sql).toContain('CREATE TABLE "comments"');

    // Apply via runner
    const runner = createMigrationRunner();
    // History table already exists from IT-5-4
    await runner.apply(queryFn, sql, '0002_create_comments.sql');

    // Verify table was created
    const result = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'comments'",
    );
    expect(result.rows).toHaveLength(1);

    // Verify all applied migrations
    const applied = await runner.getApplied(queryFn);
    expect(applied).toHaveLength(2);
    expect(applied[0]?.name).toBe('0001_create_posts.sql');
    expect(applied[1]?.name).toBe('0002_create_comments.sql');

    // Verify columns exist on comments table
    const cols = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'comments' ORDER BY ordinal_position",
    );
    const colNames = cols.rows.map((r: Record<string, unknown>) => r.column_name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('post_id');
    expect(colNames).toContain('body');
    expect(colNames).toContain('created_at');
  });
});
