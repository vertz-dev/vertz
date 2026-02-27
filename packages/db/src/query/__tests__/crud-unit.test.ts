/**
 * Unit tests for CRUD query methods — targets surviving mutants.
 *
 * These tests use a mock query function to test edge cases that the
 * PGlite integration tests don't cover, specifically:
 * - fillGeneratedIds error paths (integer/serial/bigint with generate)
 * - assertNonEmptyWhere error message content
 * - getOrThrow error path
 * - createMany/createManyAndReturn with empty data
 * - update/deleteOne NotFoundError paths
 * - readOnly column filtering in update
 * - autoUpdate column injection
 */

import { describe, expect, it } from 'bun:test';
import { d } from '../../d';
import { NotFoundError } from '../../errors/db-error';
import {
  create,
  createMany,
  createManyAndReturn,
  deleteMany,
  deleteOne,
  get,
  getOrThrow,
  update,
  updateMany,
} from '../crud';
import type { QueryFn } from '../executor';

// ---------------------------------------------------------------------------
// Schema fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary().default('gen_random_uuid()'),
  name: d.text(),
  email: d.text().unique(),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().default('now').autoUpdate(),
});

// ---------------------------------------------------------------------------
// Mock query function
// ---------------------------------------------------------------------------

function createMockQueryFn(rows: Record<string, unknown>[] = [], rowCount = 0): QueryFn {
  return async <T>(_sql: string, _params: readonly unknown[]) => ({
    rows: rows as readonly T[],
    rowCount,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('crud unit tests', () => {
  describe('getOrThrow', () => {
    it('throws NotFoundError when no rows match', async () => {
      const queryFn = createMockQueryFn([]);
      await expect(getOrThrow(queryFn, usersTable, { where: { name: 'Nobody' } })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws NotFoundError with table name in message', async () => {
      const queryFn = createMockQueryFn([]);
      try {
        await getOrThrow(queryFn, usersTable);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(NotFoundError);
        expect((e as NotFoundError).message).toContain('users');
      }
    });

    it('returns the row when found', async () => {
      const queryFn = createMockQueryFn([{ id: 'u1', name: 'Alice' }]);
      const result = await getOrThrow(queryFn, usersTable);
      expect(result).toEqual({ id: 'u1', name: 'Alice' });
    });
  });

  describe('get', () => {
    it('returns null when no rows match', async () => {
      const queryFn = createMockQueryFn([]);
      const result = await get(queryFn, usersTable);
      expect(result).toBeNull();
    });
  });

  describe('createMany', () => {
    it('returns { count: 0 } for empty data array', async () => {
      let called = false;
      const queryFn: QueryFn = async () => {
        called = true;
        return { rows: [], rowCount: 0 };
      };

      const result = await createMany(queryFn, usersTable, { data: [] });
      expect(result).toEqual({ count: 0 });
      // Should NOT call the query function for empty data
      expect(called).toBe(false);
    });
  });

  describe('createManyAndReturn', () => {
    it('returns empty array for empty data array', async () => {
      let called = false;
      const queryFn: QueryFn = async () => {
        called = true;
        return { rows: [], rowCount: 0 };
      };

      const result = await createManyAndReturn(queryFn, usersTable, { data: [] });
      expect(result).toEqual([]);
      expect(called).toBe(false);
    });
  });

  describe('update', () => {
    it('throws NotFoundError when no rows match', async () => {
      const queryFn = createMockQueryFn([], 0);
      await expect(
        update(queryFn, usersTable, { where: { id: 'nonexistent' }, data: { name: 'X' } }),
      ).rejects.toThrow(NotFoundError);
    });

    it('strips readOnly columns from update data', async () => {
      let capturedSql = '';
      const queryFn: QueryFn = async <T>(sql: string, _params: readonly unknown[]) => {
        capturedSql = sql;
        return { rows: [{ id: 'u1', name: 'Updated' }] as readonly T[], rowCount: 1 };
      };

      await update(queryFn, usersTable, {
        where: { id: 'u1' },
        data: { name: 'Updated', createdAt: '2000-01-01' },
      });

      // createdAt is readOnly — should NOT appear in the SET clause
      const setClause = capturedSql.split('SET')[1]?.split('WHERE')[0] ?? '';
      expect(setClause).not.toContain('created_at');
      // name should be in SET clause
      expect(setClause).toContain('name');
    });

    it('injects autoUpdate columns with "now" sentinel', async () => {
      let capturedSql = '';
      const queryFn: QueryFn = async <T>(sql: string, _params: readonly unknown[]) => {
        capturedSql = sql;
        return { rows: [{ id: 'u1', name: 'X' }] as readonly T[], rowCount: 1 };
      };

      await update(queryFn, usersTable, {
        where: { id: 'u1' },
        data: { name: 'Updated' },
      });

      // updatedAt is autoUpdate — should appear in SET clause via NOW()
      expect(capturedSql).toContain('"updatedAt"');
    });
  });

  describe('updateMany', () => {
    it('throws on empty where clause', async () => {
      const queryFn = createMockQueryFn([], 0);
      await expect(
        updateMany(queryFn, usersTable, { where: {}, data: { name: 'X' } }),
      ).rejects.toThrow('updateMany requires a non-empty where clause');
    });

    it('error message contains operation name', async () => {
      const queryFn = createMockQueryFn([], 0);
      try {
        await updateMany(queryFn, usersTable, { where: {}, data: { name: 'X' } });
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).toContain('updateMany');
        expect((e as Error).message).toContain('empty where');
      }
    });
  });

  describe('deleteOne', () => {
    it('throws NotFoundError when no rows match', async () => {
      const queryFn = createMockQueryFn([], 0);
      await expect(
        deleteOne(queryFn, usersTable, { where: { id: 'nonexistent' } }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteMany', () => {
    it('throws on empty where clause', async () => {
      const queryFn = createMockQueryFn([], 0);
      await expect(deleteMany(queryFn, usersTable, { where: {} })).rejects.toThrow(
        'deleteMany requires a non-empty where clause',
      );
    });

    it('error message contains operation name', async () => {
      const queryFn = createMockQueryFn([], 0);
      try {
        await deleteMany(queryFn, usersTable, { where: {} });
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).toContain('deleteMany');
        expect((e as Error).message).toContain('empty where');
      }
    });
  });

  describe('fillGeneratedIds', () => {
    it('rejects generate on integer column type', async () => {
      const badTable = d.table('bad', {
        id: d.integer().primary({ generate: 'uuid' }),
        name: d.text(),
      });

      const queryFn = createMockQueryFn([]);
      await expect(create(queryFn, badTable, { data: { name: 'Test' } })).rejects.toThrow(
        /integer/,
      );
    });

    it('rejects generate on serial column type', async () => {
      const badTable = d.table('bad', {
        id: d.serial().primary({ generate: 'uuid' }),
        name: d.text(),
      });

      const queryFn = createMockQueryFn([]);
      await expect(create(queryFn, badTable, { data: { name: 'Test' } })).rejects.toThrow(/serial/);
    });

    it('rejects generate on bigint column type', async () => {
      const badTable = d.table('bad', {
        id: d.bigint().primary({ generate: 'uuid' }),
        name: d.text(),
      });

      const queryFn = createMockQueryFn([]);
      await expect(create(queryFn, badTable, { data: { name: 'Test' } })).rejects.toThrow(/bigint/);
    });

    it('error includes column name and generate strategy', async () => {
      const badTable = d.table('bad', {
        myId: d.integer().primary({ generate: 'cuid' }),
        name: d.text(),
      });

      const queryFn = createMockQueryFn([]);
      try {
        await create(queryFn, badTable, { data: { name: 'Test' } });
        expect.unreachable();
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).toContain('myId');
        expect(msg).toContain('cuid');
        expect(msg).toContain('integer');
      }
    });

    it('does not reject generate on uuid column type', async () => {
      const goodTable = d.table('good', {
        id: d.uuid().primary({ generate: 'uuid' }),
        name: d.text(),
      });

      const queryFn: QueryFn = async <T>(_sql: string, _params: readonly unknown[]) => ({
        rows: [{ id: 'generated-uuid', name: 'Test' }] as readonly T[],
        rowCount: 1,
      });

      const result = await create(queryFn, goodTable, { data: { name: 'Test' } });
      expect(result).toHaveProperty('name', 'Test');
    });
  });
});
