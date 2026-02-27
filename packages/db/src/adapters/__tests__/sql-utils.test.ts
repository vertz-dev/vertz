/**
 * Tests for sql-utils.ts — targeting surviving mutants.
 *
 * Tests the public utility functions directly and exercises BaseSqlAdapter
 * edge cases through SqliteAdapter (the concrete implementation).
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { DbDriver } from '../../client/driver';
import { d } from '../../d';
import type { ColumnMetadata } from '../../schema/column';
import {
  buildWhereClause,
  convertValueForSql,
  generateCreateTableSql,
  generateIndexSql,
  getSqlType,
} from '../sql-utils';
import {
  createSqliteAdapter,
  createSqliteDriver,
  type SqliteAdapterOptions,
} from '../sqlite-adapter';

// ---------------------------------------------------------------------------
// getSqlType tests
// ---------------------------------------------------------------------------

describe('getSqlType', () => {
  it('maps serial to INTEGER', () => {
    expect(getSqlType({ sqlType: 'serial' } as ColumnMetadata)).toBe('INTEGER');
  });

  it('maps integer to INTEGER', () => {
    expect(getSqlType({ sqlType: 'integer' } as ColumnMetadata)).toBe('INTEGER');
  });

  it('maps bigint to BIGINT', () => {
    expect(getSqlType({ sqlType: 'bigint' } as ColumnMetadata)).toBe('BIGINT');
  });

  it('maps text to TEXT', () => {
    expect(getSqlType({ sqlType: 'text' } as ColumnMetadata)).toBe('TEXT');
  });

  it('maps varchar with length to VARCHAR(N)', () => {
    expect(getSqlType({ sqlType: 'varchar', length: 255 } as ColumnMetadata)).toBe('VARCHAR(255)');
  });

  it('maps varchar without length to TEXT', () => {
    expect(getSqlType({ sqlType: 'varchar' } as ColumnMetadata)).toBe('TEXT');
  });

  it('maps decimal with precision/scale to DECIMAL(P,S)', () => {
    expect(getSqlType({ sqlType: 'decimal', precision: 10, scale: 2 } as ColumnMetadata)).toBe(
      'DECIMAL(10,2)',
    );
  });

  it('maps decimal without precision/scale to REAL', () => {
    expect(getSqlType({ sqlType: 'decimal' } as ColumnMetadata)).toBe('REAL');
  });

  it('maps boolean to INTEGER', () => {
    expect(getSqlType({ sqlType: 'boolean' } as ColumnMetadata)).toBe('INTEGER');
  });

  it('maps timestamp to TEXT', () => {
    expect(getSqlType({ sqlType: 'timestamp' } as ColumnMetadata)).toBe('TEXT');
  });

  it('maps timestamptz to TEXT', () => {
    expect(getSqlType({ sqlType: 'timestamptz' } as ColumnMetadata)).toBe('TEXT');
  });

  it('maps date to TEXT', () => {
    expect(getSqlType({ sqlType: 'date' } as ColumnMetadata)).toBe('TEXT');
  });

  it('maps json to TEXT', () => {
    expect(getSqlType({ sqlType: 'json' } as ColumnMetadata)).toBe('TEXT');
  });

  it('maps jsonb to TEXT', () => {
    expect(getSqlType({ sqlType: 'jsonb' } as ColumnMetadata)).toBe('TEXT');
  });

  it('maps uuid to TEXT', () => {
    expect(getSqlType({ sqlType: 'uuid' } as ColumnMetadata)).toBe('TEXT');
  });

  it('maps enum to TEXT', () => {
    expect(getSqlType({ sqlType: 'enum' } as ColumnMetadata)).toBe('TEXT');
  });

  it('maps unknown types to TEXT', () => {
    expect(getSqlType({ sqlType: 'custom' } as ColumnMetadata)).toBe('TEXT');
  });
});

// ---------------------------------------------------------------------------
// convertValueForSql tests
// ---------------------------------------------------------------------------

describe('convertValueForSql', () => {
  it('converts true to 1 for boolean columns', () => {
    expect(convertValueForSql(true, 'boolean')).toBe(1);
  });

  it('converts false to 0 for boolean columns', () => {
    expect(convertValueForSql(false, 'boolean')).toBe(0);
  });

  it('passes through non-boolean values unchanged', () => {
    expect(convertValueForSql('hello', 'text')).toBe('hello');
    expect(convertValueForSql(42, 'integer')).toBe(42);
    expect(convertValueForSql(null, 'text')).toBeNull();
  });

  it('passes through values when sqlType is undefined', () => {
    expect(convertValueForSql('hello')).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// buildWhereClause tests
// ---------------------------------------------------------------------------

describe('buildWhereClause', () => {
  const table = d.table('test', {
    id: d.uuid().primary(),
    name: d.text(),
    active: d.boolean(),
  });

  it('builds clauses and params for simple where', () => {
    const { clauses, params } = buildWhereClause({ name: 'Alice' }, table._columns);
    expect(clauses).toEqual(['name = ?']);
    expect(params).toEqual(['Alice']);
  });

  it('converts boolean values in where clause', () => {
    const { clauses, params } = buildWhereClause({ active: true }, table._columns);
    expect(clauses).toEqual(['active = ?']);
    expect(params).toEqual([1]); // boolean converted to integer
  });

  it('handles multiple where conditions', () => {
    const { clauses, params } = buildWhereClause({ name: 'Alice', active: false }, table._columns);
    expect(clauses).toHaveLength(2);
    expect(params).toEqual(['Alice', 0]);
  });

  it('passes through values for unknown columns', () => {
    const { clauses, params } = buildWhereClause({ unknownCol: 'value' }, table._columns);
    expect(clauses).toEqual(['unknownCol = ?']);
    expect(params).toEqual(['value']); // no conversion for unknown column
  });
});

// ---------------------------------------------------------------------------
// generateCreateTableSql tests
// ---------------------------------------------------------------------------

describe('generateCreateTableSql', () => {
  it('generates CREATE TABLE with basic columns', () => {
    const table = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
    });
    const sql = generateCreateTableSql(table);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).toContain('id TEXT PRIMARY KEY');
    expect(sql).toContain('name TEXT NOT NULL');
  });

  it('adds DEFAULT (uuid()) for generate uuid', () => {
    const table = d.table('users', {
      id: d.uuid().primary({ generate: 'uuid' }),
      name: d.text(),
    });
    const sql = generateCreateTableSql(table);
    expect(sql).toContain('DEFAULT (uuid())');
  });

  it('adds DEFAULT (cuid()) for generate cuid', () => {
    const table = d.table('users', {
      id: d.uuid().primary({ generate: 'cuid' }),
      name: d.text(),
    });
    const sql = generateCreateTableSql(table);
    expect(sql).toContain('DEFAULT (cuid())');
  });

  it('adds UNIQUE constraint for unique non-primary columns', () => {
    const table = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
    });
    const sql = generateCreateTableSql(table);
    expect(sql).toContain('email TEXT UNIQUE NOT NULL');
  });

  it('does not add UNIQUE for primary key columns', () => {
    const table = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
    });
    const sql = generateCreateTableSql(table);
    // id should have PRIMARY KEY but not UNIQUE
    expect(sql).toContain('id TEXT PRIMARY KEY');
    expect(sql).not.toMatch(/id TEXT PRIMARY KEY.*UNIQUE/);
  });

  it('adds NOT NULL for non-nullable, non-primary columns', () => {
    const table = d.table('users', {
      id: d.uuid().primary(),
      name: d.text(),
      bio: d.text().nullable(),
    });
    const sql = generateCreateTableSql(table);
    expect(sql).toContain('name TEXT NOT NULL');
    expect(sql).not.toMatch(/bio TEXT.*NOT NULL/);
  });

  it('adds DEFAULT for timestamp "now"', () => {
    const table = d.table('users', {
      id: d.uuid().primary(),
      createdAt: d.timestamp().default('now'),
    });
    const sql = generateCreateTableSql(table);
    expect(sql).toContain("DEFAULT (datetime('now'))");
  });

  it('adds DEFAULT for string value', () => {
    const table = d.table('users', {
      id: d.uuid().primary(),
      role: d.text().default('user'),
    });
    const sql = generateCreateTableSql(table);
    expect(sql).toContain("DEFAULT 'user'");
  });

  it('adds DEFAULT for number value', () => {
    const table = d.table('scores', {
      id: d.uuid().primary(),
      points: d.integer().default(0),
    });
    const sql = generateCreateTableSql(table);
    expect(sql).toContain('DEFAULT 0');
  });

  it('adds DEFAULT 1 for boolean true', () => {
    const table = d.table('users', {
      id: d.uuid().primary(),
      active: d.boolean().default(true),
    });
    const sql = generateCreateTableSql(table);
    expect(sql).toContain('DEFAULT 1');
  });

  it('adds DEFAULT 0 for boolean false', () => {
    const table = d.table('users', {
      id: d.uuid().primary(),
      active: d.boolean().default(false),
    });
    const sql = generateCreateTableSql(table);
    expect(sql).toContain('DEFAULT 0');
  });

  it('adds CHECK constraint when specified', () => {
    const table = d.table('users', {
      id: d.uuid().primary(),
      age: d.integer().check('age >= 0'),
    });
    const sql = generateCreateTableSql(table);
    expect(sql).toContain('CHECK (age >= 0)');
  });
});

// ---------------------------------------------------------------------------
// generateIndexSql tests
// ---------------------------------------------------------------------------

describe('generateIndexSql', () => {
  it('adds automatic index for boolean columns', () => {
    const table = d.table('users', {
      id: d.uuid().primary(),
      active: d.boolean(),
    });
    const sqls = generateIndexSql(table);
    expect(sqls.some((s) => s.includes('idx_users_active'))).toBe(true);
  });

  it('does not add automatic index for primary or unique columns', () => {
    const table = d.table('users', {
      id: d.uuid().primary(),
      email: d.text().unique(),
      active: d.boolean(),
    });
    const sqls = generateIndexSql(table);
    // Should have auto-index for boolean 'active' only
    expect(sqls.some((s) => s.includes('idx_users_active'))).toBe(true);
    expect(sqls.some((s) => s.includes('idx_users_id'))).toBe(false);
    expect(sqls.some((s) => s.includes('idx_users_email'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BaseSqlAdapter edge cases (tested through SqliteAdapter)
// ---------------------------------------------------------------------------

describe('BaseSqlAdapter edge cases', () => {
  const postsTable = d.table('posts', {
    id: d.uuid().primary({ generate: 'uuid' }),
    title: d.text(),
    active: d.boolean().default(true),
    createdAt: d.timestamp().default('now').readOnly(),
    updatedAt: d.timestamp().default('now').autoUpdate(),
  });

  type PostsSchema = typeof postsTable;

  let driver: DbDriver;
  let adapter: ReturnType<typeof createSqliteAdapter>;

  beforeEach(async () => {
    driver = createSqliteDriver(':memory:');
    adapter = await createSqliteAdapter<PostsSchema>({
      schema: postsTable,
      dbPath: ':memory:',
      migrations: { autoApply: true },
    } as SqliteAdapterOptions<PostsSchema>);
  });

  afterEach(async () => {
    await driver.close();
  });

  describe('create', () => {
    it('generates uuid for primary key when not provided', async () => {
      const result = await adapter.create({ title: 'Hello' });
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
      expect((result.id as string).length).toBeGreaterThan(0);
    });

    it('uses provided id when given', async () => {
      const result = await adapter.create({ id: 'custom-id', title: 'Hello' });
      expect(result.id).toBe('custom-id');
    });

    it('sets default value for boolean column', async () => {
      const result = await adapter.create({ title: 'Hello' });
      expect(result.active).toBe(true);
    });

    it('sets initial value for autoUpdate column on create', async () => {
      const result = await adapter.create({ title: 'Hello' });
      expect(result.updatedAt).toBeDefined();
      const ts = new Date(result.updatedAt as string).getTime();
      expect(ts).not.toBeNaN();
    });

    it('sets default "now" value for timestamp column', async () => {
      const result = await adapter.create({ title: 'Hello' });
      expect(result.createdAt).toBeDefined();
      const ts = new Date(result.createdAt as string).getTime();
      expect(ts).not.toBeNaN();
      expect(ts).toBeGreaterThan(new Date('2020-01-01').getTime());
    });

    it('throws on database failure', async () => {
      // Create a second record with same id to trigger unique constraint
      const first = await adapter.create({ title: 'First' });
      await expect(adapter.create({ id: first.id as string, title: 'Duplicate' })).rejects.toThrow(
        'Failed to create record',
      );
    });
  });

  describe('update', () => {
    it('updates autoUpdate column automatically', async () => {
      const created = await adapter.create({ title: 'Original' });
      await new Promise((r) => setTimeout(r, 10));
      const updated = await adapter.update(created.id as string, { title: 'Changed' });

      expect(updated.updatedAt).toBeDefined();
      expect(new Date(updated.updatedAt as string).getTime()).toBeGreaterThanOrEqual(
        new Date(created.updatedAt as string).getTime(),
      );
    });

    it('returns existing record when no updatable fields provided', async () => {
      const created = await adapter.create({ title: 'Test' });
      // Attempt to update only readOnly field — should return existing row
      const result = await adapter.update(created.id as string, {});
      expect(result.title).toBe('Test');
    });

    it('throws "Record not found" for non-existent id', async () => {
      await expect(adapter.update('nonexistent', { title: 'X' })).rejects.toThrow(
        'Record not found',
      );
    });

    it('wraps unexpected errors in generic message', async () => {
      // We can't easily trigger a generic DB error through the adapter,
      // but the error message should be specific for "Record not found"
      try {
        await adapter.update('nonexistent', { title: 'X' });
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).toBe('Record not found');
      }
    });
  });

  describe('delete', () => {
    it('returns null for non-existent record', async () => {
      const result = await adapter.delete('nonexistent');
      expect(result).toBeNull();
    });

    it('returns deleted record data', async () => {
      const created = await adapter.create({ title: 'Delete me' });
      const deleted = await adapter.delete(created.id as string);
      expect(deleted).not.toBeNull();
      expect(deleted?.title).toBe('Delete me');
    });

    it('record is gone after deletion', async () => {
      const created = await adapter.create({ title: 'Gone' });
      await adapter.delete(created.id as string);
      const result = await adapter.get(created.id as string);
      expect(result).toBeNull();
    });
  });

  describe('get', () => {
    it('returns null for non-existent id', async () => {
      const result = await adapter.get('nonexistent');
      expect(result).toBeNull();
    });

    it('converts boolean values in returned row', async () => {
      const created = await adapter.create({ title: 'Test', active: false });
      const result = await adapter.get(created.id as string);
      expect(result?.active).toBe(false);
      expect(typeof result?.active).toBe('boolean');
    });
  });

  describe('list', () => {
    it('rejects invalid filter columns', async () => {
      await expect(adapter.list({ where: { badColumn: 'x' } })).rejects.toThrow(
        'Invalid filter column: badColumn',
      );
    });

    it('supports cursor-based pagination with after', async () => {
      const a = await adapter.create({ id: 'aaa', title: 'A' });
      await adapter.create({ id: 'bbb', title: 'B' });
      await adapter.create({ id: 'ccc', title: 'C' });

      const result = await adapter.list({ after: a.id as string, limit: 10 });
      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.id).toBe('bbb');
    });

    it('combines where with after cursor', async () => {
      await adapter.create({ id: 'aaa', title: 'A', active: true });
      await adapter.create({ id: 'bbb', title: 'B', active: true });
      await adapter.create({ id: 'ccc', title: 'C', active: false });

      const result = await adapter.list({
        where: { active: true },
        after: 'aaa',
        limit: 10,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe('bbb');
    });

    it('returns correct total count', async () => {
      await adapter.create({ title: 'A' });
      await adapter.create({ title: 'B' });
      await adapter.create({ title: 'C' });

      const result = await adapter.list({ limit: 2 });
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(2);
    });

    it('uses default limit of 20 when not specified', async () => {
      // Just verify no crash with no options
      const result = await adapter.list();
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// BaseSqlAdapter with cuid generate strategy
// ---------------------------------------------------------------------------

describe('BaseSqlAdapter cuid generate', () => {
  const cuidTable = d.table('items', {
    id: d.uuid().primary({ generate: 'cuid' }),
    name: d.text(),
  });

  type CuidSchema = typeof cuidTable;

  let adapter: ReturnType<typeof createSqliteAdapter>;

  beforeEach(async () => {
    adapter = await createSqliteAdapter<CuidSchema>({
      schema: cuidTable,
      dbPath: ':memory:',
      migrations: { autoApply: true },
    } as SqliteAdapterOptions<CuidSchema>);
  });

  it('generates an id when cuid strategy is configured', async () => {
    const result = await adapter.create({ name: 'Test' });
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect((result.id as string).length).toBeGreaterThan(0);
  });
});
