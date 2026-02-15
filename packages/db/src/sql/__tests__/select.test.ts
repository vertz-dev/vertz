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
    it('parameterizes LIMIT', () => {
      const result = buildSelect({
        table: 'users',
        limit: 10,
      });
      expect(result.sql).toBe('SELECT * FROM "users" LIMIT $1');
      expect(result.params).toEqual([10]);
    });

    it('parameterizes OFFSET', () => {
      const result = buildSelect({
        table: 'users',
        offset: 20,
      });
      expect(result.sql).toBe('SELECT * FROM "users" OFFSET $1');
      expect(result.params).toEqual([20]);
    });

    it('parameterizes both LIMIT and OFFSET', () => {
      const result = buildSelect({
        table: 'users',
        limit: 10,
        offset: 20,
      });
      expect(result.sql).toBe('SELECT * FROM "users" LIMIT $1 OFFSET $2');
      expect(result.params).toEqual([10, 20]);
    });

    it('parameterizes LIMIT/OFFSET after WHERE params', () => {
      const result = buildSelect({
        table: 'users',
        where: { active: true },
        limit: 10,
        offset: 0,
      });
      expect(result.sql).toBe('SELECT * FROM "users" WHERE "active" = $1 LIMIT $2 OFFSET $3');
      expect(result.params).toEqual([true, 10, 0]);
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
        'SELECT "id", "first_name" AS "firstName", "email" FROM "users" WHERE "active" = $1 ORDER BY "created_at" DESC LIMIT $2 OFFSET $3',
      );
      expect(result.params).toEqual([true, 10, 0]);
    });
  });

  describe('COUNT(*) OVER() for listAndCount', () => {
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

  describe('cursor-based pagination', () => {
    it('generates WHERE col > $N ORDER BY col ASC LIMIT $M for single-column cursor', () => {
      const result = buildSelect({
        table: 'posts',
        cursor: { id: 5 },
        take: 20,
      });
      expect(result.sql).toBe('SELECT * FROM "posts" WHERE "id" > $1 ORDER BY "id" ASC LIMIT $2');
      expect(result.params).toEqual([5, 20]);
    });

    it('uses < operator when orderBy is desc', () => {
      const result = buildSelect({
        table: 'posts',
        cursor: { createdAt: '2024-01-01' },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.sql).toBe(
        'SELECT * FROM "posts" WHERE "created_at" < $1 ORDER BY "created_at" DESC LIMIT $2',
      );
      expect(result.params).toEqual(['2024-01-01', 10]);
    });

    it('combines cursor with existing where filters using AND', () => {
      const result = buildSelect({
        table: 'posts',
        where: { status: 'published' },
        cursor: { id: 42 },
        take: 20,
      });
      expect(result.sql).toBe(
        'SELECT * FROM "posts" WHERE "status" = $1 AND "id" > $2 ORDER BY "id" ASC LIMIT $3',
      );
      expect(result.params).toEqual(['published', 42, 20]);
    });

    it('supports composite cursor with row-value comparison', () => {
      const result = buildSelect({
        table: 'posts',
        cursor: { createdAt: '2024-01-01', id: 10 },
        take: 20,
      });
      expect(result.sql).toBe(
        'SELECT * FROM "posts" WHERE ("created_at", "id") > ($1, $2) ORDER BY "created_at" ASC, "id" ASC LIMIT $3',
      );
      expect(result.params).toEqual(['2024-01-01', 10, 20]);
    });

    it('supports composite cursor with desc orderBy', () => {
      const result = buildSelect({
        table: 'posts',
        cursor: { createdAt: '2024-01-01', id: 10 },
        take: 15,
        orderBy: { createdAt: 'desc', id: 'desc' },
      });
      expect(result.sql).toBe(
        'SELECT * FROM "posts" WHERE ("created_at", "id") < ($1, $2) ORDER BY "created_at" DESC, "id" DESC LIMIT $3',
      );
      expect(result.params).toEqual(['2024-01-01', 10, 15]);
    });

    it('uses take without cursor as a limit alias', () => {
      const result = buildSelect({
        table: 'posts',
        take: 50,
      });
      expect(result.sql).toBe('SELECT * FROM "posts" LIMIT $1');
      expect(result.params).toEqual([50]);
    });

    it('cursor with where and orderBy generates correct param order', () => {
      const result = buildSelect({
        table: 'posts',
        columns: ['id', 'title'],
        where: { status: 'published', authorId: 7 },
        cursor: { id: 100 },
        take: 25,
        orderBy: { id: 'asc' },
      });
      expect(result.sql).toBe(
        'SELECT "id", "title" FROM "posts" WHERE "status" = $1 AND "author_id" = $2 AND "id" > $3 ORDER BY "id" ASC LIMIT $4',
      );
      expect(result.params).toEqual(['published', 7, 100, 25]);
    });
  });
});
