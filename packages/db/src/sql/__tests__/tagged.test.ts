import { describe, expect, it } from 'bun:test';
import { sql } from '../tagged';

describe('sql tagged template', () => {
  describe('basic parameterization', () => {
    it('parameterizes a single value as $1', () => {
      const userId = 'abc-123';
      const result = sql`SELECT * FROM users WHERE id = ${userId}`;
      expect(result.sql).toBe('SELECT * FROM users WHERE id = $1');
      expect(result.params).toEqual(['abc-123']);
    });

    it('parameterizes multiple values sequentially', () => {
      const name = 'alice';
      const age = 25;
      const result = sql`SELECT * FROM users WHERE name = ${name} AND age > ${age}`;
      expect(result.sql).toBe('SELECT * FROM users WHERE name = $1 AND age > $2');
      expect(result.params).toEqual(['alice', 25]);
    });

    it('handles three values', () => {
      const result = sql`INSERT INTO users (name, email, age) VALUES (${'alice'}, ${'alice@test.com'}, ${25})`;
      expect(result.sql).toBe('INSERT INTO users (name, email, age) VALUES ($1, $2, $3)');
      expect(result.params).toEqual(['alice', 'alice@test.com', 25]);
    });

    it('handles no interpolations', () => {
      const result = sql`SELECT 1`;
      expect(result.sql).toBe('SELECT 1');
      expect(result.params).toEqual([]);
    });

    it('handles null value', () => {
      const result = sql`UPDATE users SET bio = ${null} WHERE id = ${'u1'}`;
      expect(result.sql).toBe('UPDATE users SET bio = $1 WHERE id = $2');
      expect(result.params).toEqual([null, 'u1']);
    });

    it('handles boolean value', () => {
      const result = sql`UPDATE users SET active = ${true}`;
      expect(result.sql).toBe('UPDATE users SET active = $1');
      expect(result.params).toEqual([true]);
    });
  });

  describe('sql.raw()', () => {
    it('inserts raw SQL without parameterization', () => {
      const col = sql.raw('created_at');
      const result = sql`SELECT ${col} FROM users`;
      expect(result.sql).toBe('SELECT created_at FROM users');
      expect(result.params).toEqual([]);
    });

    it('raw column name in ORDER BY', () => {
      const orderCol = sql.raw('created_at DESC');
      const result = sql`SELECT * FROM users ORDER BY ${orderCol}`;
      expect(result.sql).toBe('SELECT * FROM users ORDER BY created_at DESC');
      expect(result.params).toEqual([]);
    });

    it('raw table name', () => {
      const tableName = sql.raw('"users"');
      const result = sql`SELECT * FROM ${tableName} WHERE id = ${'u1'}`;
      expect(result.sql).toBe('SELECT * FROM "users" WHERE id = $1');
      expect(result.params).toEqual(['u1']);
    });

    it('mixes raw and parameterized values', () => {
      const col = sql.raw('email');
      const result = sql`SELECT ${col} FROM users WHERE name = ${'alice'} AND age > ${18}`;
      expect(result.sql).toBe('SELECT email FROM users WHERE name = $1 AND age > $2');
      expect(result.params).toEqual(['alice', 18]);
    });
  });

  describe('composable fragments', () => {
    it('composes a WHERE fragment into a query', () => {
      const where = sql`WHERE active = ${true}`;
      const query = sql`SELECT * FROM users ${where}`;
      expect(query.sql).toBe('SELECT * FROM users WHERE active = $1');
      expect(query.params).toEqual([true]);
    });

    it('composes multiple fragments', () => {
      const where = sql`WHERE active = ${true}`;
      const orderBy = sql`ORDER BY name ASC`;
      const query = sql`SELECT * FROM users ${where} ${orderBy}`;
      expect(query.sql).toBe('SELECT * FROM users WHERE active = $1 ORDER BY name ASC');
      expect(query.params).toEqual([true]);
    });

    it('renumbers parameters when composing', () => {
      const cond1 = sql`name = ${'alice'}`;
      const cond2 = sql`age > ${18}`;
      const query = sql`SELECT * FROM users WHERE ${cond1} AND ${cond2}`;
      expect(query.sql).toBe('SELECT * FROM users WHERE name = $1 AND age > $2');
      expect(query.params).toEqual(['alice', 18]);
    });

    it('handles deeply nested composition', () => {
      const inner = sql`role = ${'admin'}`;
      const middle = sql`${inner} AND active = ${true}`;
      const outer = sql`SELECT * FROM users WHERE ${middle}`;
      expect(outer.sql).toBe('SELECT * FROM users WHERE role = $1 AND active = $2');
      expect(outer.params).toEqual(['admin', true]);
    });

    it('composes fragment with values before and after', () => {
      const fragment = sql`AND role = ${'admin'}`;
      const query = sql`SELECT * FROM users WHERE name = ${'alice'} ${fragment} LIMIT ${10}`;
      expect(query.sql).toBe('SELECT * FROM users WHERE name = $1 AND role = $2 LIMIT $3');
      expect(query.params).toEqual(['alice', 'admin', 10]);
    });
  });

  describe('CTE syntax', () => {
    it('supports WITH ... AS pattern', () => {
      const minAge = 18;
      const result = sql`
        WITH active_users AS (
          SELECT * FROM users WHERE active = ${true} AND age >= ${minAge}
        )
        SELECT * FROM active_users WHERE name LIKE ${'%alice%'}`;
      expect(result.sql).toBe(
        '\n        WITH active_users AS (\n          SELECT * FROM users WHERE active = $1 AND age >= $2\n        )\n        SELECT * FROM active_users WHERE name LIKE $3',
      );
      expect(result.params).toEqual([true, 18, '%alice%']);
    });

    it('supports composed CTE', () => {
      const cteBody = sql`SELECT * FROM users WHERE active = ${true}`;
      const query = sql`WITH active AS (${cteBody}) SELECT * FROM active WHERE id = ${'u1'}`;
      expect(query.sql).toBe(
        'WITH active AS (SELECT * FROM users WHERE active = $1) SELECT * FROM active WHERE id = $2',
      );
      expect(query.params).toEqual([true, 'u1']);
    });
  });

  describe('SqlFragment type', () => {
    it('has sql and params properties', () => {
      const result = sql`SELECT 1`;
      expect(typeof result.sql).toBe('string');
      expect(Array.isArray(result.params)).toBe(true);
    });

    it('is identifiable as SqlFragment via _tag', () => {
      const result = sql`SELECT 1`;
      expect(result._tag).toBe('SqlFragment');
    });

    it('raw fragments are identifiable via _tag', () => {
      const raw = sql.raw('test');
      expect(raw._tag).toBe('SqlFragment');
    });
  });
});
