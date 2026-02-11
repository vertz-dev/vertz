import { describe, expect, it } from 'vitest';
import { buildUpdate } from '../update';

describe('buildUpdate', () => {
  describe('basic UPDATE', () => {
    it('generates UPDATE SET with parameterized values', () => {
      const result = buildUpdate({
        table: 'users',
        data: { name: 'bob' },
        where: { id: 'u1' },
      });
      expect(result.sql).toBe('UPDATE "users" SET "name" = $1 WHERE "id" = $2');
      expect(result.params).toEqual(['bob', 'u1']);
    });

    it('handles multiple SET columns', () => {
      const result = buildUpdate({
        table: 'users',
        data: { name: 'bob', email: 'bob@test.com' },
        where: { id: 'u1' },
      });
      expect(result.sql).toBe('UPDATE "users" SET "name" = $1, "email" = $2 WHERE "id" = $3');
      expect(result.params).toEqual(['bob', 'bob@test.com', 'u1']);
    });

    it('converts camelCase keys to snake_case', () => {
      const result = buildUpdate({
        table: 'users',
        data: { firstName: 'bob', lastName: 'smith' },
        where: { userId: 'u1' },
      });
      expect(result.sql).toBe(
        'UPDATE "users" SET "first_name" = $1, "last_name" = $2 WHERE "user_id" = $3',
      );
      expect(result.params).toEqual(['bob', 'smith', 'u1']);
    });

    it('handles null values in data', () => {
      const result = buildUpdate({
        table: 'users',
        data: { bio: null },
        where: { id: 'u1' },
      });
      expect(result.sql).toBe('UPDATE "users" SET "bio" = $1 WHERE "id" = $2');
      expect(result.params).toEqual([null, 'u1']);
    });
  });

  describe('WHERE clause', () => {
    it('uses operator-based where', () => {
      const result = buildUpdate({
        table: 'users',
        data: { active: false },
        where: { lastLogin: { lt: '2024-01-01' } },
      });
      expect(result.sql).toBe('UPDATE "users" SET "active" = $1 WHERE "last_login" < $2');
      expect(result.params).toEqual([false, '2024-01-01']);
    });

    it('handles multiple where conditions', () => {
      const result = buildUpdate({
        table: 'users',
        data: { active: false },
        where: { orgId: 'o1', active: true },
      });
      expect(result.sql).toBe(
        'UPDATE "users" SET "active" = $1 WHERE "org_id" = $2 AND "active" = $3',
      );
      expect(result.params).toEqual([false, 'o1', true]);
    });
  });

  describe('RETURNING clause', () => {
    it('generates RETURNING *', () => {
      const result = buildUpdate({
        table: 'users',
        data: { name: 'bob' },
        where: { id: 'u1' },
        returning: '*',
      });
      expect(result.sql).toBe('UPDATE "users" SET "name" = $1 WHERE "id" = $2 RETURNING *');
    });

    it('generates RETURNING with specific columns', () => {
      const result = buildUpdate({
        table: 'users',
        data: { name: 'bob' },
        where: { id: 'u1' },
        returning: ['id', 'updatedAt'],
      });
      expect(result.sql).toBe(
        'UPDATE "users" SET "name" = $1 WHERE "id" = $2 RETURNING "id", "updated_at" AS "updatedAt"',
      );
    });
  });

  describe('now sentinel handling', () => {
    it('converts "now" sentinel to NOW() for timestamp columns', () => {
      const result = buildUpdate({
        table: 'users',
        data: { name: 'bob', updatedAt: 'now' },
        where: { id: 'u1' },
        nowColumns: ['updatedAt'],
      });
      expect(result.sql).toBe(
        'UPDATE "users" SET "name" = $1, "updated_at" = NOW() WHERE "id" = $2',
      );
      expect(result.params).toEqual(['bob', 'u1']);
    });
  });

  describe('UPDATE without WHERE', () => {
    it('generates UPDATE without WHERE when no filter given', () => {
      const result = buildUpdate({
        table: 'users',
        data: { active: false },
      });
      expect(result.sql).toBe('UPDATE "users" SET "active" = $1');
      expect(result.params).toEqual([false]);
    });
  });
});
