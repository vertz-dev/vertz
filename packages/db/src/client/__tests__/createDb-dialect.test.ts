import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d } from '../../d';
import type { DatabaseInstance } from '../database';
import { createDb } from '../database';

// ---------------------------------------------------------------------------
// Test schema
// ---------------------------------------------------------------------------

const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

const users = d.table('users', {
  id: d.uuid().primary(),
  organizationId: d.tenant(organizations),
  name: d.text(),
});

// ---------------------------------------------------------------------------
// D1 mock types
// ---------------------------------------------------------------------------

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all(): Promise<{ results: unknown[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createDb dialect option', () => {
  describe('dialect: undefined (default postgres)', () => {
    it('createDb with no dialect defaults to postgres (backward compatible)', () => {
      // This test verifies existing behavior is unchanged
      const db = createDb({
        url: 'postgres://localhost:5432/test',
        models: {
          organizations: { table: organizations, relations: {} },
        },
      });

      expect(db._models).toBeDefined();
      expect(db._models.organizations).toBeDefined();
    });
  });

  describe('dialect: sqlite', () => {
    let mockD1: D1Database;
    let mockPrepared: D1PreparedStatement;

    beforeEach(() => {
      mockPrepared = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
      };
      mockD1 = {
        prepare: vi.fn().mockReturnValue(mockPrepared),
      };
    });

    it('createDb with dialect: sqlite and d1 binding creates SQLite driver', async () => {
      const db = createDb({
        models: {
          organizations: { table: organizations, relations: {} },
        },
        dialect: 'sqlite',
        d1: mockD1,
      });

      expect(db._models).toBeDefined();
      expect(db._models.organizations).toBeDefined();

      // Verify it's using SQLite driver by checking query works
      const result = await db.query({ sql: 'SELECT 1', params: [] });
      expect(result.ok).toBe(true);
      expect(mockD1.prepare).toHaveBeenCalledWith('SELECT 1');
    });

    it('createDb with dialect: sqlite without d1 throws error', () => {
      expect(() => {
        createDb({
          models: {
            organizations: { table: organizations, relations: {} },
          },
          dialect: 'sqlite',
          // d1 is missing
        });
      }).toThrow('SQLite dialect requires a D1 binding');
    });

    it('createDb with dialect: sqlite and url throws error', () => {
      expect(() => {
        createDb({
          models: {
            organizations: { table: organizations, relations: {} },
          },
          dialect: 'sqlite',
          d1: mockD1,
          url: 'postgres://localhost:5432/test', // url should not be used with sqlite
        });
      }).toThrow('SQLite dialect uses D1, not a connection URL');
    });
  });

  describe('dialect: postgres', () => {
    it('createDb with dialect: postgres works like default', () => {
      const db = createDb({
        url: 'postgres://localhost:5432/test',
        models: {
          organizations: { table: organizations, relations: {} },
        },
        dialect: 'postgres',
      });

      expect(db._models).toBeDefined();
      expect(db._models.organizations).toBeDefined();
    });
  });
});
