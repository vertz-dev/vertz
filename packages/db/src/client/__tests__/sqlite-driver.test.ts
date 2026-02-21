import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSqliteDriver, buildTableSchema, type TableSchemaRegistry } from '../sqlite-driver';
import type { TableEntry } from '../../schema/inference';
import { createTable } from '../../schema/table';
import { createColumn } from '../../schema/column';

// D1 type definitions (mock)
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all(): Promise<{ results: unknown[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

describe('sqlite-driver', () => {
  let mockD1: D1Database;
  let mockPrepared: D1PreparedStatement;

  beforeEach(() => {
    mockPrepared = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn(),
      run: vi.fn(),
    };
    mockD1 = {
      prepare: vi.fn().mockReturnValue(mockPrepared),
    };
  });

  describe('query', () => {
    it('calls D1 binding .all() and returns results', async () => {
      // Arrange
      const mockResults = [{ id: 1, name: 'test' }];
      vi.mocked(mockPrepared.all).mockResolvedValue({ results: mockResults });

      const driver = createSqliteDriver(mockD1);

      // Act
      const result = await driver.query('SELECT * FROM users');

      // Assert
      expect(mockD1.prepare).toHaveBeenCalledWith('SELECT * FROM users');
      expect(mockPrepared.all).toHaveBeenCalled();
      expect(result).toEqual(mockResults);
    });

    it('passes params to prepared statement', async () => {
      // Arrange
      vi.mocked(mockPrepared.all).mockResolvedValue({ results: [] });

      const driver = createSqliteDriver(mockD1);

      // Act
      await driver.query('SELECT * FROM users WHERE id = ?', [1]);

      // Assert
      expect(mockPrepared.bind).toHaveBeenCalledWith(1);
    });
  });

  describe('execute', () => {
    it('calls D1 binding .run() and returns rowsAffected', async () => {
      // Arrange
      vi.mocked(mockPrepared.run).mockResolvedValue({ meta: { changes: 5 } });

      const driver = createSqliteDriver(mockD1);

      // Act
      const result = await driver.execute('DELETE FROM users WHERE id = ?', [1]);

      // Assert
      expect(mockD1.prepare).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?');
      expect(mockPrepared.run).toHaveBeenCalled();
      expect(result).toEqual({ rowsAffected: 5 });
    });
  });

  describe('value conversion', () => {
    it('converts boolean 1 to true using table schema', async () => {
      // Arrange
      const mockResults = [{ id: 1, active: 1 }];
      vi.mocked(mockPrepared.all).mockResolvedValue({ results: mockResults });

      // Build table schema with boolean column
      const tableSchema: TableSchemaRegistry = new Map([
        ['users', { id: 'integer', active: 'boolean' }],
      ]);

      const driver = createSqliteDriver(mockD1, tableSchema);

      // Act
      const result = await driver.query<{ id: number; active: boolean }>('SELECT * FROM users');

      // Assert
      expect(result).toEqual([{ id: 1, active: true }]);
    });

    it('converts boolean 0 to false using table schema', async () => {
      // Arrange
      const mockResults = [{ id: 1, active: 0 }];
      vi.mocked(mockPrepared.all).mockResolvedValue({ results: mockResults });

      const tableSchema: TableSchemaRegistry = new Map([
        ['users', { id: 'integer', active: 'boolean' }],
      ]);

      const driver = createSqliteDriver(mockD1, tableSchema);

      // Act
      const result = await driver.query<{ id: number; active: boolean }>('SELECT * FROM users');

      // Assert
      expect(result).toEqual([{ id: 1, active: false }]);
    });

    it('converts ISO string to Date for timestamp columns', async () => {
      // Arrange
      const mockResults = [{ id: 1, created: '2024-01-15T10:30:00.000Z' }];
      vi.mocked(mockPrepared.all).mockResolvedValue({ results: mockResults });

      const tableSchema: TableSchemaRegistry = new Map([
        ['users', { id: 'integer', created: 'timestamp' }],
      ]);

      const driver = createSqliteDriver(mockD1, tableSchema);

      // Act
      const result = await driver.query<{ id: number; created: Date }>('SELECT * FROM users');

      // Assert
      expect(result).toEqual([{ id: 1, created: new Date('2024-01-15T10:30:00.000Z') }]);
    });

    it('passes through values for unknown columns', async () => {
      // Arrange
      const mockResults = [{ id: 1, name: 'test', unknown_field: 'value' }];
      vi.mocked(mockPrepared.all).mockResolvedValue({ results: mockResults });

      const tableSchema: TableSchemaRegistry = new Map([
        ['users', { id: 'integer', name: 'text' }],
      ]);

      const driver = createSqliteDriver(mockD1, tableSchema);

      // Act
      const result = await driver.query('SELECT * FROM users');

      // Assert - unknown columns should pass through as-is
      expect(result).toEqual([{ id: 1, name: 'test', unknown_field: 'value' }]);
    });

    it('works without table schema (backward compatible)', async () => {
      // Arrange
      const mockResults = [{ id: 1, active: 1, created: '2024-01-15T10:30:00.000Z' }];
      vi.mocked(mockPrepared.all).mockResolvedValue({ results: mockResults });

      // Driver without schema
      const driver = createSqliteDriver(mockD1);

      // Act
      const result = await driver.query('SELECT * FROM users');

      // Assert - values pass through as-is when no schema provided
      expect(result).toEqual(mockResults);
    });
  });

  describe('health check', () => {
    it('runs SELECT 1', async () => {
      // Arrange
      vi.mocked(mockPrepared.all).mockResolvedValue({ results: [{ 1: 1 }] });

      const driver = createSqliteDriver(mockD1);

      // Act
      const result = await driver.query('SELECT 1');

      // Assert
      expect(mockD1.prepare).toHaveBeenCalledWith('SELECT 1');
      expect(result).toEqual([{ 1: 1 }]);
    });
  });
});

describe('buildTableSchema', () => {
  it('builds schema from table entries', () => {
    // Arrange - create a mock table entry
    const usersTable = createTable('users', {
      id: createColumn<number, { sqlType: 'integer' }>('integer'),
      name: createColumn<string, { sqlType: 'text' }>('text'),
      active: createColumn<boolean, { sqlType: 'boolean' }>('boolean'),
      createdAt: createColumn<string, { sqlType: 'timestamp' }>('timestamp'),
    });

    const tables = {
      users: {
        table: usersTable as typeof usersTable & { _name: string; _columns: Record<string, unknown> },
        relations: {},
      },
    } as unknown as Record<string, TableEntry>;

    // Act
    const schema = buildTableSchema(tables);

    // Assert
    expect(schema.get('users')).toEqual({
      id: 'integer',
      name: 'text',
      active: 'boolean',
      createdAt: 'timestamp',
    });
  });
});
