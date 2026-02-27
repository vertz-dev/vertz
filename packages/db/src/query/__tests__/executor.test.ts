import { describe, expect, it } from 'bun:test';
import { ConnectionError, UniqueConstraintError } from '../../errors/db-error';
import { executeQuery } from '../executor';

describe('executor', () => {
  describe('executeQuery', () => {
    it('returns result from query function', async () => {
      const mockQueryFn = async <T>(_sql: string, _params: readonly unknown[]) => ({
        rows: [{ id: 1, name: 'Alice' }] as readonly T[],
        rowCount: 1,
      });

      const result = await executeQuery(mockQueryFn, 'SELECT 1', []);
      expect(result.rows).toEqual([{ id: 1, name: 'Alice' }]);
      expect(result.rowCount).toBe(1);
    });

    it('maps PG error codes to typed errors', async () => {
      const mockQueryFn = async <T>(
        _sql: string,
        _params: readonly unknown[],
      ): Promise<{ rows: readonly T[]; rowCount: number }> => {
        const err = {
          code: '23505',
          message: 'duplicate key',
          detail: 'Key (email)=(test@test.com) already exists.',
          table: 'users',
        };
        throw err;
      };

      await expect(executeQuery(mockQueryFn, 'INSERT ...', [])).rejects.toThrow(
        UniqueConstraintError,
      );
    });

    it('maps connection errors', async () => {
      const mockQueryFn = async <T>(
        _sql: string,
        _params: readonly unknown[],
      ): Promise<{ rows: readonly T[]; rowCount: number }> => {
        const err = {
          code: '08001',
          message: 'connection refused',
        };
        throw err;
      };

      await expect(executeQuery(mockQueryFn, 'SELECT 1', [])).rejects.toThrow(ConnectionError);
    });

    it('rethrows non-PG errors as-is', async () => {
      const mockQueryFn = async <T>(
        _sql: string,
        _params: readonly unknown[],
      ): Promise<{ rows: readonly T[]; rowCount: number }> => {
        throw new TypeError('something else');
      };

      await expect(executeQuery(mockQueryFn, 'SELECT 1', [])).rejects.toThrow(TypeError);
    });

    it('rethrows null error as-is (not a PG error)', async () => {
      const mockQueryFn = async <T>(
        _sql: string,
        _params: readonly unknown[],
      ): Promise<{ rows: readonly T[]; rowCount: number }> => {
        throw null;
      };

      await expect(executeQuery(mockQueryFn, 'SELECT 1', [])).rejects.toBeNull();
    });

    it('rethrows string error as-is (not a PG error)', async () => {
      const mockQueryFn = async <T>(
        _sql: string,
        _params: readonly unknown[],
      ): Promise<{ rows: readonly T[]; rowCount: number }> => {
        throw 'raw string error';
      };

      try {
        await executeQuery(mockQueryFn, 'SELECT 1', []);
        expect.unreachable();
      } catch (e) {
        expect(e).toBe('raw string error');
      }
    });

    it('rethrows object without code property as-is', async () => {
      const mockQueryFn = async <T>(
        _sql: string,
        _params: readonly unknown[],
      ): Promise<{ rows: readonly T[]; rowCount: number }> => {
        throw { message: 'no code field' };
      };

      try {
        await executeQuery(mockQueryFn, 'SELECT 1', []);
        expect.unreachable();
      } catch (e) {
        expect(e).toEqual({ message: 'no code field' });
        expect(e).not.toBeInstanceOf(Error);
      }
    });

    it('rethrows object with non-string code as-is', async () => {
      const mockQueryFn = async <T>(
        _sql: string,
        _params: readonly unknown[],
      ): Promise<{ rows: readonly T[]; rowCount: number }> => {
        throw { code: 42, message: 'numeric code' };
      };

      try {
        await executeQuery(mockQueryFn, 'SELECT 1', []);
        expect.unreachable();
      } catch (e) {
        expect(e).toEqual({ code: 42, message: 'numeric code' });
        expect(e).not.toBeInstanceOf(Error);
      }
    });

    it('rethrows object with non-string message as-is', async () => {
      const mockQueryFn = async <T>(
        _sql: string,
        _params: readonly unknown[],
      ): Promise<{ rows: readonly T[]; rowCount: number }> => {
        throw { code: '23505', message: 123 };
      };

      try {
        await executeQuery(mockQueryFn, 'SELECT 1', []);
        expect.unreachable();
      } catch (e) {
        expect(e).toEqual({ code: '23505', message: 123 });
        expect(e).not.toBeInstanceOf(Error);
      }
    });
  });
});
