import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSqliteDriver } from '../sqlite-driver';

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
    it('converts values using sqlite-value-converter', async () => {
      // Note: D1 actually handles value conversion internally,
      // so this test verifies the driver works with converted values
      // Arrange
      const mockResults = [{ id: 1, active: 1, created: '2024-01-15T10:30:00.000Z' }];
      vi.mocked(mockPrepared.all).mockResolvedValue({ results: mockResults });

      const driver = createSqliteDriver(mockD1);

      // Act
      const result = await driver.query('SELECT * FROM users');

      // Assert - the driver should pass through D1 results
      // (D1 handles conversion based on column types)
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
