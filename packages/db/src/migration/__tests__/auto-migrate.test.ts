import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { autoMigrate } from '../auto-migrate';
import type { SchemaSnapshot } from '../snapshot';
import type { MigrationQueryFn } from '../runner';
import { createSnapshot } from '../snapshot';
import { d } from '../../d';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('auto-migrate', () => {
  let tmpDir: string;
  let queryFn: MigrationQueryFn;
  let db: { queries: Array<{ sql: string; params: readonly unknown[] }> };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'automigrate-test-'));

    // Create an in-memory query function that tracks queries
    db = { queries: [] };
    queryFn = async (sql: string, params: readonly unknown[]) => {
      db.queries.push({ sql, params });
      return { rows: [], rowCount: 0 };
    };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('first run (no snapshot)', () => {
    it('creates schema and saves snapshot when no previous snapshot exists', async () => {
      const users = d.table('users', {
        id: d.uuid().primary(),
        email: d.text().unique(),
        name: d.text(),
      });

      const currentSchema = createSnapshot([users]);
      const snapshotPath = join(tmpDir, 'snapshot.json');

      await autoMigrate({
        currentSchema,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      // Should have created history table and the users table
      const createHistoryQuery = db.queries.find(q => q.sql.includes('_vertz_migrations'));
      const createTableQuery = db.queries.find(q => q.sql.includes('CREATE TABLE') && q.sql.includes('users'));

      expect(createHistoryQuery).toBeDefined();
      expect(createTableQuery).toBeDefined();
    });

    it('applies no SQL when schema is empty', async () => {
      const currentSchema = createSnapshot([]);
      const snapshotPath = join(tmpDir, 'snapshot.json');

      db.queries = [];

      await autoMigrate({
        currentSchema,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      // Should only create history table, no table creations
      const createTableQueries = db.queries.filter(q => q.sql.includes('CREATE TABLE') && !q.sql.includes('_vertz_migrations'));
      expect(createTableQueries).toHaveLength(0);
    });
  });

  describe('no changes', () => {
    it('detects no diff and skips migration when schema unchanged', async () => {
      const users = d.table('users', {
        id: d.uuid().primary(),
        email: d.text().unique(),
      });

      const snapshot = createSnapshot([users]);
      const snapshotPath = join(tmpDir, 'snapshot.json');

      // First run to create the schema
      await autoMigrate({
        currentSchema: snapshot,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      // Reset queries
      db.queries = [];

      // Second run with same schema - should not apply any changes
      await autoMigrate({
        currentSchema: snapshot,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      // Should only query the migrations history table (no new migrations applied)
      const migrationInserts = db.queries.filter(q => q.sql.includes('INSERT INTO "_vertz_migrations"'));
      expect(migrationInserts).toHaveLength(0);
    });
  });

  describe('schema change', () => {
    it('detects diff, generates SQL, and applies new column', async () => {
      const initialUsers = d.table('users', {
        id: d.uuid().primary(),
        email: d.text().unique(),
      });

      const initialSchema = createSnapshot([initialUsers]);

      // First: apply initial schema
      const snapshotPath = join(tmpDir, 'snapshot.json');
      await autoMigrate({
        currentSchema: initialSchema,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      // Reset queries for second run
      db.queries = [];

      // Second: add a new column
      const updatedUsers = d.table('users', {
        id: d.uuid().primary(),
        email: d.text().unique(),
        name: d.text(), // new column
      });

      const updatedSchema = createSnapshot([updatedUsers]);

      await autoMigrate({
        currentSchema: updatedSchema,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      // Should have generated ALTER TABLE for the new column
      const alterTableQueries = db.queries.filter(q => q.sql.includes('ALTER TABLE'));
      expect(alterTableQueries.length).toBeGreaterThan(0);
    });

    it('detects new table and applies CREATE TABLE', async () => {
      const users = d.table('users', {
        id: d.uuid().primary(),
        name: d.text(),
      });

      const initialSchema = createSnapshot([users]);

      // First run
      const snapshotPath = join(tmpDir, 'snapshot.json');
      await autoMigrate({
        currentSchema: initialSchema,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      db.queries = [];

      // Add a new table
      const posts = d.table('posts', {
        id: d.uuid().primary(),
        title: d.text(),
      });

      const updatedSchema = createSnapshot([users, posts]);

      await autoMigrate({
        currentSchema: updatedSchema,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      // Should have created the posts table
      const createPostsQuery = db.queries.find(q => q.sql.includes('CREATE TABLE') && q.sql.includes('posts'));
      expect(createPostsQuery).toBeDefined();
    });
  });

  describe('destructive change', () => {
    it('logs warning for column removal', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const usersWithName = d.table('users', {
        id: d.uuid().primary(),
        email: d.text().unique(),
        name: d.text(),
      });

      const initialSchema = createSnapshot([usersWithName]);

      // First run
      const snapshotPath = join(tmpDir, 'snapshot.json');
      await autoMigrate({
        currentSchema: initialSchema,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      db.queries = [];

      // Remove the name column
      const usersWithoutName = d.table('users', {
        id: d.uuid().primary(),
        email: d.text().unique(),
      });

      const updatedSchema = createSnapshot([usersWithoutName]);

      await autoMigrate({
        currentSchema: updatedSchema,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      // Should have logged a warning about destructive change
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Destructive change detected'),
      );
      expect(consoleWarnSpy.mock.calls.some(call => 
        call[0]?.includes('column_removed')
      )).toBe(true);

      consoleWarnSpy.mockRestore();
    });

    it('logs warning for table removal', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const users = d.table('users', {
        id: d.uuid().primary(),
        name: d.text(),
      });

      const initialSchema = createSnapshot([users]);

      // First run
      const snapshotPath = join(tmpDir, 'snapshot.json');
      await autoMigrate({
        currentSchema: initialSchema,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      db.queries = [];

      // Remove the table entirely
      const emptySchema = createSnapshot([]);

      await autoMigrate({
        currentSchema: emptySchema,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      // Should have logged a warning about table removal
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Destructive change detected'),
      );
      expect(consoleWarnSpy.mock.calls.some(call => 
        call[0]?.includes('table_removed')
      )).toBe(true);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('handles corrupted snapshot file gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const snapshotPath = join(tmpDir, 'snapshot.json');

      // Write corrupted snapshot
      const { writeFile } = await import('node:fs/promises');
      await writeFile(snapshotPath, '{ corrupted json }');

      const users = d.table('users', {
        id: d.uuid().primary(),
        name: d.text(),
      });

      const currentSchema = createSnapshot([users]);

      // Should throw because of corrupted JSON
      await expect(
        autoMigrate({
          currentSchema,
          snapshotPath,
          dialect: 'sqlite',
          db: queryFn,
        }),
      ).rejects.toThrow();

      consoleWarnSpy.mockRestore();
    });

    it('handles failed migration gracefully', async () => {
      const snapshotPath = join(tmpDir, 'snapshot.json');

      // Create a query function that fails
      const failingQueryFn: MigrationQueryFn = async (sql: string, params: readonly unknown[]) => {
        if (sql.includes('CREATE TABLE')) {
          throw new Error('Database error: table creation failed');
        }
        return { rows: [], rowCount: 0 };
      };

      const users = d.table('users', {
        id: d.uuid().primary(),
        name: d.text(),
      });

      const currentSchema = createSnapshot([users]);

      // Should throw with the migration error
      await expect(
        autoMigrate({
          currentSchema,
          snapshotPath,
          dialect: 'sqlite',
          db: failingQueryFn,
        }),
      ).rejects.toThrow('Failed to apply initial schema');
    });

    it('handles migration failure on subsequent runs', async () => {
      const users = d.table('users', {
        id: d.uuid().primary(),
      });

      const initialSchema = createSnapshot([users]);

      const snapshotPath = join(tmpDir, 'snapshot.json');

      // First run succeeds
      await autoMigrate({
        currentSchema: initialSchema,
        snapshotPath,
        dialect: 'sqlite',
        db: queryFn,
      });

      // Create a query function that fails on subsequent migrations
      let callCount = 0;
      const failingQueryFn: MigrationQueryFn = async (sql: string, params: readonly unknown[]) => {
        callCount++;
        if (callCount > 1) {
          // Fail after the first successful call (history table creation)
          throw new Error('Migration failed due to constraint');
        }
        return { rows: [], rowCount: 0 };
      };

      const usersUpdated = d.table('users', {
        id: d.uuid().primary(),
        name: d.text(),
      });

      const updatedSchema = createSnapshot([usersUpdated]);

      // Should throw with migration error
      await expect(
        autoMigrate({
          currentSchema: updatedSchema,
          snapshotPath,
          dialect: 'sqlite',
          db: failingQueryFn,
        }),
      ).rejects.toThrow('Failed to apply migration');
    });
  });
});
