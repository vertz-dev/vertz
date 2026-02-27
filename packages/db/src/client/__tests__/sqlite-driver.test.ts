import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createColumn } from '../../schema/column';
import type { ModelEntry } from '../../schema/inference';
import { createTable } from '../../schema/table';
import { buildTableSchema, createSqliteDriver, type TableSchemaRegistry } from '../sqlite-driver';

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
      bind: mock().mockReturnThis(),
      all: mock(),
      run: mock(),
    };
    mockD1 = {
      prepare: mock().mockReturnValue(mockPrepared),
    };
  });

  describe('query', () => {
    it('calls D1 binding .all() and returns results', async () => {
      // Arrange
      const mockResults = [{ id: 1, name: 'test' }];
      mockPrepared.all.mockResolvedValue({ results: mockResults });

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
      mockPrepared.all.mockResolvedValue({ results: [] });

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
      mockPrepared.run.mockResolvedValue({ meta: { changes: 5 } });

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
      mockPrepared.all.mockResolvedValue({ results: mockResults });

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
      mockPrepared.all.mockResolvedValue({ results: mockResults });

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
      mockPrepared.all.mockResolvedValue({ results: mockResults });

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
      mockPrepared.all.mockResolvedValue({ results: mockResults });

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
      mockPrepared.all.mockResolvedValue({ results: mockResults });

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
      mockPrepared.all.mockResolvedValue({ results: [{ 1: 1 }] });

      const driver = createSqliteDriver(mockD1);

      // Act
      const result = await driver.query('SELECT 1');

      // Assert
      expect(mockD1.prepare).toHaveBeenCalledWith('SELECT 1');
      expect(result).toEqual([{ 1: 1 }]);
    });

    it('isHealthy returns true when query succeeds', async () => {
      // Arrange
      mockPrepared.all.mockResolvedValue({ results: [] });

      const driver = createSqliteDriver(mockD1);

      // Act
      const result = await driver.isHealthy();

      // Assert
      expect(result).toBe(true);
    });

    it('isHealthy returns false when query fails', async () => {
      // Arrange
      mockPrepared.all.mockRejectedValue(new Error('Database unavailable'));

      const driver = createSqliteDriver(mockD1);

      // Act
      const result = await driver.isHealthy();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('table name extraction for value conversion', () => {
    it('converts values in INSERT INTO query results', async () => {
      const mockResults = [{ id: 1, active: 1 }];
      mockPrepared.all.mockResolvedValue({ results: mockResults });

      const tableSchema: TableSchemaRegistry = new Map([
        ['users', { id: 'integer', active: 'boolean' }],
      ]);

      const driver = createSqliteDriver(mockD1, tableSchema);
      const result = await driver.query('INSERT INTO users (id, active) VALUES (?, ?) RETURNING *');

      expect(result).toEqual([{ id: 1, active: true }]);
    });

    it('converts values in UPDATE query results', async () => {
      const mockResults = [{ id: 1, active: 0 }];
      mockPrepared.all.mockResolvedValue({ results: mockResults });

      const tableSchema: TableSchemaRegistry = new Map([
        ['users', { id: 'integer', active: 'boolean' }],
      ]);

      const driver = createSqliteDriver(mockD1, tableSchema);
      const result = await driver.query('UPDATE users SET active = ? WHERE id = ? RETURNING *');

      expect(result).toEqual([{ id: 1, active: false }]);
    });

    it('converts values in DELETE FROM query results', async () => {
      const mockResults = [{ id: 1, active: 1 }];
      mockPrepared.all.mockResolvedValue({ results: mockResults });

      const tableSchema: TableSchemaRegistry = new Map([
        ['users', { id: 'integer', active: 'boolean' }],
      ]);

      const driver = createSqliteDriver(mockD1, tableSchema);
      const result = await driver.query('DELETE FROM users WHERE id = ? RETURNING *');

      expect(result).toEqual([{ id: 1, active: true }]);
    });

    it('returns null when SQL does not match any known pattern', async () => {
      const mockResults = [{ count: 5 }];
      mockPrepared.all.mockResolvedValue({ results: mockResults });

      const tableSchema: TableSchemaRegistry = new Map([['users', { id: 'integer' }]]);

      const driver = createSqliteDriver(mockD1, tableSchema);
      const result = await driver.query('PRAGMA table_info(users)');

      // No table extraction → raw results returned
      expect(result).toEqual([{ count: 5 }]);
    });

    it('skips conversion when table name is not in schema registry', async () => {
      const mockResults = [{ id: 1, active: 1 }];
      mockPrepared.all.mockResolvedValue({ results: mockResults });

      const tableSchema: TableSchemaRegistry = new Map([
        ['orders', { id: 'integer', total: 'decimal' }],
      ]);

      const driver = createSqliteDriver(mockD1, tableSchema);
      const result = await driver.query('SELECT * FROM users');

      // 'users' not in registry → raw results
      expect(result).toEqual([{ id: 1, active: 1 }]);
    });

    it('skips conversion when results are empty', async () => {
      mockPrepared.all.mockResolvedValue({ results: [] });

      const tableSchema: TableSchemaRegistry = new Map([
        ['users', { id: 'integer', active: 'boolean' }],
      ]);

      const driver = createSqliteDriver(mockD1, tableSchema);
      const result = await driver.query('SELECT * FROM users');

      expect(result).toEqual([]);
    });

    it('lowercases extracted table names for registry lookup', async () => {
      const mockResults = [{ id: 1, active: 1 }];
      mockPrepared.all.mockResolvedValue({ results: mockResults });

      const tableSchema: TableSchemaRegistry = new Map([
        ['users', { id: 'integer', active: 'boolean' }],
      ]);

      const driver = createSqliteDriver(mockD1, tableSchema);
      const result = await driver.query('SELECT * FROM Users WHERE id = ?', [1]);

      // Table name 'Users' should be lowercased to 'users' for registry lookup
      expect(result).toEqual([{ id: 1, active: true }]);
    });

    it('handles quoted table names in FROM clause', async () => {
      const mockResults = [{ id: 1, active: 1 }];
      mockPrepared.all.mockResolvedValue({ results: mockResults });

      const tableSchema: TableSchemaRegistry = new Map([
        ['users', { id: 'integer', active: 'boolean' }],
      ]);

      const driver = createSqliteDriver(mockD1, tableSchema);
      const result = await driver.query('SELECT * FROM "users" WHERE id = ?', [1]);

      expect(result).toEqual([{ id: 1, active: true }]);
    });
  });

  describe('isHealthy', () => {
    it('calls query with SELECT 1', async () => {
      mockPrepared.all.mockResolvedValue({ results: [] });

      const driver = createSqliteDriver(mockD1);
      await driver.isHealthy();

      expect(mockD1.prepare).toHaveBeenCalledWith('SELECT 1');
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

    const models = {
      users: {
        table: usersTable as typeof usersTable & {
          _name: string;
          _columns: Record<string, unknown>;
        },
        relations: {},
      },
    } as unknown as Record<string, ModelEntry>;

    // Act
    const schema = buildTableSchema(models);

    // Assert
    expect(schema.get('users')).toEqual({
      id: 'integer',
      name: 'text',
      active: 'boolean',
      createdAt: 'timestamp',
    });
  });
});
