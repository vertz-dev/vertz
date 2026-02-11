import { describe, expect, it } from 'vitest';
import { buildSelect } from '../select';

describe('buildSelect', () => {
  describe('basic SELECT', () => {
    it('generates SELECT * FROM table', () => {
      const result = buildSelect({ table: 'users' });
      expect(result.sql).toBe('SELECT * FROM "users"');
      expect(result.params).toEqual([]);
    });

    it('quotes table name', () => {
      const result = buildSelect({ table: 'user_roles' });
      expect(result.sql).toBe('SELECT * FROM "user_roles"');
    });
  });

  describe('column selection', () => {
    it('selects specific columns', () => {
      const result = buildSelect({
        table: 'users',
        columns: ['id', 'name', 'email'],
      });
      expect(result.sql).toBe('SELECT "id", "name", "email" FROM "users"');
      expect(result.params).toEqual([]);
    });

    it('converts camelCase column names to snake_case with aliases', () => {
      const result = buildSelect({
        table: 'users',
        columns: ['id', 'firstName', 'lastName'],
      });
      expect(result.sql).toBe(
        'SELECT "id", "first_name" AS "firstName", "last_name" AS "lastName" FROM "users"',
      );
    });

    it('does not alias columns that are already snake_case matching', () => {
      const result = buildSelect({
        table: 'users',
        columns: ['id', 'name'],
      });
      expect(result.sql).toBe('SELECT "id", "name" FROM "users"');
    });
  });

  describe('WHERE clause', () => {
    it('adds WHERE clause from filter', () => {
      const result = buildSelect({
        table: 'users',
        where: { name: 'alice' },
      });
      expect(result.sql).toBe('SELECT * FROM "users" WHERE "name" = $1');
      expect(result.params).toEqual(['alice']);
    });

    it('handles multiple filter conditions', () => {
      const result = buildSelect({
        table: 'users',
        where: { name: 'alice', active: true },
      });
      expect(result.sql).toBe('SELECT * FROM "users" WHERE "name" = $1 AND "active" = $2');
      expect(result.params).toEqual(['alice', true]);
    });

    it('handles operator filters', () => {
      const result = buildSelect({
        table: 'users',
        where: { age: { gte: 18 } },
      });
      expect(result.sql).toBe('SELECT * FROM "users" WHERE "age" >= $1');
      expect(result.params).toEqual([18]);
    });
  });

  describe('ORDER BY', () => {
    it('adds ORDER BY clause', () => {
      const result = buildSelect({
        table: 'users',
        orderBy: { name: 'asc' },
      });
      expect(result.sql).toBe('SELECT * FROM "users" ORDER BY "name" ASC');
      expect(result.params).toEqual([]);
    });

    it('handles desc direction', () => {
      const result = buildSelect({
        table: 'users',
        orderBy: { createdAt: 'desc' },
      });
      expect(result.sql).toBe('SELECT * FROM "users" ORDER BY "created_at" DESC');
    });

    it('handles multiple order columns', () => {
      const result = buildSelect({
        table: 'users',
        orderBy: { lastName: 'asc', firstName: 'asc' },
      });
      expect(result.sql).toBe('SELECT * FROM "users" ORDER BY "last_name" ASC, "first_name" ASC');
    });
  });

  describe('LIMIT and OFFSET', () => {
    it('adds LIMIT', () => {
      const result = buildSelect({
        table: 'users',
        limit: 10,
      });
      expect(result.sql).toBe('SELECT * FROM "users" LIMIT 10');
      expect(result.params).toEqual([]);
    });

    it('adds OFFSET', () => {
      const result = buildSelect({
        table: 'users',
        offset: 20,
      });
      expect(result.sql).toBe('SELECT * FROM "users" OFFSET 20');
    });

    it('adds both LIMIT and OFFSET', () => {
      const result = buildSelect({
        table: 'users',
        limit: 10,
        offset: 20,
      });
      expect(result.sql).toBe('SELECT * FROM "users" LIMIT 10 OFFSET 20');
    });
  });

  describe('combined clauses', () => {
    it('generates full query with all clauses', () => {
      const result = buildSelect({
        table: 'users',
        columns: ['id', 'firstName', 'email'],
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        limit: 10,
        offset: 0,
      });
      expect(result.sql).toBe(
        'SELECT "id", "first_name" AS "firstName", "email" FROM "users" WHERE "active" = $1 ORDER BY "created_at" DESC LIMIT 10 OFFSET 0',
      );
      expect(result.params).toEqual([true]);
    });
  });

  describe('COUNT(*) OVER() for findManyAndCount', () => {
    it('adds COUNT(*) OVER() to column list', () => {
      const result = buildSelect({
        table: 'users',
        columns: ['id', 'name'],
        withCount: true,
      });
      expect(result.sql).toBe('SELECT "id", "name", COUNT(*) OVER() AS "totalCount" FROM "users"');
    });

    it('works with SELECT * and count', () => {
      const result = buildSelect({
        table: 'users',
        withCount: true,
      });
      expect(result.sql).toBe('SELECT *, COUNT(*) OVER() AS "totalCount" FROM "users"');
    });
  });
});
