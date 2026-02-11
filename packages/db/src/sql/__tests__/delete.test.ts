import { describe, expect, it } from 'vitest';
import { buildDelete } from '../delete';

describe('buildDelete', () => {
  describe('basic DELETE', () => {
    it('generates DELETE with WHERE clause', () => {
      const result = buildDelete({
        table: 'users',
        where: { id: 'u1' },
      });
      expect(result.sql).toBe('DELETE FROM "users" WHERE "id" = $1');
      expect(result.params).toEqual(['u1']);
    });

    it('handles operator-based where', () => {
      const result = buildDelete({
        table: 'sessions',
        where: { expiresAt: { lt: '2024-01-01' } },
      });
      expect(result.sql).toBe('DELETE FROM "sessions" WHERE "expires_at" < $1');
      expect(result.params).toEqual(['2024-01-01']);
    });

    it('handles multiple where conditions', () => {
      const result = buildDelete({
        table: 'users',
        where: { orgId: 'o1', active: false },
      });
      expect(result.sql).toBe('DELETE FROM "users" WHERE "org_id" = $1 AND "active" = $2');
      expect(result.params).toEqual(['o1', false]);
    });
  });

  describe('RETURNING clause', () => {
    it('generates RETURNING *', () => {
      const result = buildDelete({
        table: 'users',
        where: { id: 'u1' },
        returning: '*',
      });
      expect(result.sql).toBe('DELETE FROM "users" WHERE "id" = $1 RETURNING *');
    });

    it('generates RETURNING with specific columns', () => {
      const result = buildDelete({
        table: 'users',
        where: { id: 'u1' },
        returning: ['id', 'deletedAt'],
      });
      expect(result.sql).toBe(
        'DELETE FROM "users" WHERE "id" = $1 RETURNING "id", "deleted_at" AS "deletedAt"',
      );
    });
  });

  describe('DELETE without WHERE', () => {
    it('generates DELETE without WHERE for bulk delete', () => {
      const result = buildDelete({
        table: 'temp_sessions',
      });
      expect(result.sql).toBe('DELETE FROM "temp_sessions"');
      expect(result.params).toEqual([]);
    });
  });

  describe('casing conversion in WHERE', () => {
    it('converts camelCase column names to snake_case', () => {
      const result = buildDelete({
        table: 'users',
        where: { createdAt: { lt: '2024-01-01' }, isVerified: false },
      });
      expect(result.sql).toBe('DELETE FROM "users" WHERE "created_at" < $1 AND "is_verified" = $2');
      expect(result.params).toEqual(['2024-01-01', false]);
    });
  });
});
