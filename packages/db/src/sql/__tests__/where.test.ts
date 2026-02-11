import { describe, expect, it } from 'vitest';
import { buildWhere } from '../where';

describe('buildWhere', () => {
  describe('direct value (shorthand eq)', () => {
    it('generates = with parameterized value', () => {
      const result = buildWhere({ name: 'alice' });
      expect(result.sql).toBe('"name" = $1');
      expect(result.params).toEqual(['alice']);
    });

    it('handles numeric value', () => {
      const result = buildWhere({ age: 25 });
      expect(result.sql).toBe('"age" = $1');
      expect(result.params).toEqual([25]);
    });

    it('handles boolean value', () => {
      const result = buildWhere({ active: true });
      expect(result.sql).toBe('"active" = $1');
      expect(result.params).toEqual([true]);
    });
  });

  describe('comparison operators', () => {
    it('eq', () => {
      const result = buildWhere({ name: { eq: 'alice' } });
      expect(result.sql).toBe('"name" = $1');
      expect(result.params).toEqual(['alice']);
    });

    it('ne', () => {
      const result = buildWhere({ name: { ne: 'alice' } });
      expect(result.sql).toBe('"name" != $1');
      expect(result.params).toEqual(['alice']);
    });

    it('gt', () => {
      const result = buildWhere({ age: { gt: 18 } });
      expect(result.sql).toBe('"age" > $1');
      expect(result.params).toEqual([18]);
    });

    it('gte', () => {
      const result = buildWhere({ age: { gte: 18 } });
      expect(result.sql).toBe('"age" >= $1');
      expect(result.params).toEqual([18]);
    });

    it('lt', () => {
      const result = buildWhere({ age: { lt: 65 } });
      expect(result.sql).toBe('"age" < $1');
      expect(result.params).toEqual([65]);
    });

    it('lte', () => {
      const result = buildWhere({ age: { lte: 65 } });
      expect(result.sql).toBe('"age" <= $1');
      expect(result.params).toEqual([65]);
    });
  });

  describe('string operators', () => {
    it('contains generates LIKE %value%', () => {
      const result = buildWhere({ name: { contains: 'ali' } });
      expect(result.sql).toBe('"name" LIKE $1');
      expect(result.params).toEqual(['%ali%']);
    });

    it('startsWith generates LIKE value%', () => {
      const result = buildWhere({ name: { startsWith: 'ali' } });
      expect(result.sql).toBe('"name" LIKE $1');
      expect(result.params).toEqual(['ali%']);
    });

    it('endsWith generates LIKE %value', () => {
      const result = buildWhere({ name: { endsWith: 'ce' } });
      expect(result.sql).toBe('"name" LIKE $1');
      expect(result.params).toEqual(['%ce']);
    });
  });

  describe('set operators', () => {
    it('in generates IN ($1, $2, ...)', () => {
      const result = buildWhere({ status: { in: ['active', 'pending'] } });
      expect(result.sql).toBe('"status" IN ($1, $2)');
      expect(result.params).toEqual(['active', 'pending']);
    });

    it('notIn generates NOT IN ($1, $2, ...)', () => {
      const result = buildWhere({ status: { notIn: ['deleted', 'banned'] } });
      expect(result.sql).toBe('"status" NOT IN ($1, $2)');
      expect(result.params).toEqual(['deleted', 'banned']);
    });
  });

  describe('null operators', () => {
    it('isNull: true generates IS NULL', () => {
      const result = buildWhere({ deletedAt: { isNull: true } });
      expect(result.sql).toBe('"deleted_at" IS NULL');
      expect(result.params).toEqual([]);
    });

    it('isNull: false generates IS NOT NULL', () => {
      const result = buildWhere({ deletedAt: { isNull: false } });
      expect(result.sql).toBe('"deleted_at" IS NOT NULL');
      expect(result.params).toEqual([]);
    });
  });

  describe('casing conversion', () => {
    it('converts camelCase keys to snake_case column names', () => {
      const result = buildWhere({ firstName: 'alice' });
      expect(result.sql).toBe('"first_name" = $1');
      expect(result.params).toEqual(['alice']);
    });

    it('converts multiple camelCase keys', () => {
      const result = buildWhere({ firstName: 'alice', lastName: 'smith' });
      expect(result.sql).toBe('"first_name" = $1 AND "last_name" = $2');
      expect(result.params).toEqual(['alice', 'smith']);
    });
  });

  describe('multiple conditions (implicit AND)', () => {
    it('joins conditions with AND', () => {
      const result = buildWhere({ name: 'alice', age: { gt: 18 } });
      expect(result.sql).toBe('"name" = $1 AND "age" > $2');
      expect(result.params).toEqual(['alice', 18]);
    });

    it('handles three conditions', () => {
      const result = buildWhere({
        name: 'alice',
        age: { gte: 18 },
        active: true,
      });
      expect(result.sql).toBe('"name" = $1 AND "age" >= $2 AND "active" = $3');
      expect(result.params).toEqual(['alice', 18, true]);
    });
  });

  describe('logical operators', () => {
    it('OR combines conditions with OR', () => {
      const result = buildWhere({
        OR: [{ name: 'alice' }, { name: 'bob' }],
      });
      expect(result.sql).toBe('("name" = $1 OR "name" = $2)');
      expect(result.params).toEqual(['alice', 'bob']);
    });

    it('AND combines conditions with AND', () => {
      const result = buildWhere({
        AND: [{ age: { gt: 18 } }, { age: { lt: 65 } }],
      });
      expect(result.sql).toBe('("age" > $1 AND "age" < $2)');
      expect(result.params).toEqual([18, 65]);
    });

    it('NOT negates a condition', () => {
      const result = buildWhere({
        NOT: { name: 'alice' },
      });
      expect(result.sql).toBe('NOT ("name" = $1)');
      expect(result.params).toEqual(['alice']);
    });

    it('nested OR with regular conditions', () => {
      const result = buildWhere({
        active: true,
        OR: [{ name: 'alice' }, { name: 'bob' }],
      });
      expect(result.sql).toBe('"active" = $1 AND ("name" = $2 OR "name" = $3)');
      expect(result.params).toEqual([true, 'alice', 'bob']);
    });

    it('NOT with multiple conditions', () => {
      const result = buildWhere({
        NOT: { name: 'alice', age: { lt: 18 } },
      });
      expect(result.sql).toBe('NOT ("name" = $1 AND "age" < $2)');
      expect(result.params).toEqual(['alice', 18]);
    });
  });

  describe('parameter offset', () => {
    it('starts parameter numbering from given offset', () => {
      const result = buildWhere({ name: 'alice' }, 3);
      expect(result.sql).toBe('"name" = $4');
      expect(result.params).toEqual(['alice']);
    });

    it('offsets multiple params correctly', () => {
      const result = buildWhere({ name: 'alice', age: { gt: 18 } }, 5);
      expect(result.sql).toBe('"name" = $6 AND "age" > $7');
      expect(result.params).toEqual(['alice', 18]);
    });
  });

  describe('empty where', () => {
    it('returns empty sql and params for empty object', () => {
      const result = buildWhere({});
      expect(result.sql).toBe('');
      expect(result.params).toEqual([]);
    });

    it('returns empty sql and params for undefined', () => {
      const result = buildWhere(undefined);
      expect(result.sql).toBe('');
      expect(result.params).toEqual([]);
    });
  });

  describe('JSONB operators', () => {
    it('generates -> for JSONB field access', () => {
      const result = buildWhere({ 'metadata->role': 'admin' });
      expect(result.sql).toBe('"metadata"->>\'role\' = $1');
      expect(result.params).toEqual(['admin']);
    });

    it('generates nested JSONB path access', () => {
      const result = buildWhere({ 'metadata->settings->theme': 'dark' });
      expect(result.sql).toBe("\"metadata\"->'settings'->>'theme' = $1");
      expect(result.params).toEqual(['dark']);
    });
  });

  describe('array operators', () => {
    it('arrayContains generates @> operator', () => {
      const result = buildWhere({ tags: { arrayContains: ['typescript'] } });
      expect(result.sql).toBe('"tags" @> $1');
      expect(result.params).toEqual([['typescript']]);
    });

    it('arrayContainedBy generates <@ operator', () => {
      const result = buildWhere({ tags: { arrayContainedBy: ['a', 'b', 'c'] } });
      expect(result.sql).toBe('"tags" <@ $1');
      expect(result.params).toEqual([['a', 'b', 'c']]);
    });

    it('arrayOverlaps generates && operator', () => {
      const result = buildWhere({ tags: { arrayOverlaps: ['ts', 'js'] } });
      expect(result.sql).toBe('"tags" && $1');
      expect(result.params).toEqual([['ts', 'js']]);
    });
  });
});
