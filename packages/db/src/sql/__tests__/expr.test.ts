import { describe, expect, it } from 'bun:test';
import { d } from '../../d';
import { isDbExpr } from '../expr';
import { sql } from '../tagged';

describe('DbExpr', () => {
  describe('isDbExpr', () => {
    it('returns true for a DbExpr object', () => {
      const expr = d.expr((col) => sql`${col} + ${1}`);
      expect(isDbExpr(expr)).toBe(true);
    });

    it('returns false for a plain object', () => {
      expect(isDbExpr({ increment: 1 })).toBe(false);
    });

    it('returns false for null', () => {
      expect(isDbExpr(null)).toBe(false);
    });

    it('returns false for a string', () => {
      expect(isDbExpr('now')).toBe(false);
    });

    it('returns false for a number', () => {
      expect(isDbExpr(42)).toBe(false);
    });
  });

  describe('d.expr()', () => {
    it('creates a DbExpr with the given build function', () => {
      const expr = d.expr((col) => sql`${col} + ${1}`);
      expect(expr._tag).toBe('DbExpr');
      expect(typeof expr.build).toBe('function');
    });

    it('build function composes column reference with expression', () => {
      const expr = d.expr((col) => sql`${col} + ${1}`);
      const colRef = sql.raw('"click_count"');
      const result = expr.build(colRef);
      expect(result.sql).toBe('"click_count" + $1');
      expect(result.params).toEqual([1]);
    });

    it('build function handles SQL functions', () => {
      const expr = d.expr((col) => sql`UPPER(${col})`);
      const colRef = sql.raw('"slug"');
      const result = expr.build(colRef);
      expect(result.sql).toBe('UPPER("slug")');
      expect(result.params).toEqual([]);
    });

    it('build function handles complex expressions with multiple params', () => {
      const penalty = 5;
      const expr = d.expr((col) => sql`GREATEST(${col} - ${penalty}, ${0})`);
      const colRef = sql.raw('"score"');
      const result = expr.build(colRef);
      expect(result.sql).toBe('GREATEST("score" - $1, $2)');
      expect(result.params).toEqual([5, 0]);
    });
  });

  describe('d.increment()', () => {
    it('creates a DbExpr that adds to the column', () => {
      const expr = d.increment(1);
      expect(isDbExpr(expr)).toBe(true);
      const colRef = sql.raw('"click_count"');
      const result = expr.build(colRef);
      expect(result.sql).toBe('"click_count" + $1');
      expect(result.params).toEqual([1]);
    });

    it('supports non-1 values', () => {
      const expr = d.increment(5);
      const colRef = sql.raw('"count"');
      const result = expr.build(colRef);
      expect(result.sql).toBe('"count" + $1');
      expect(result.params).toEqual([5]);
    });
  });

  describe('d.decrement()', () => {
    it('creates a DbExpr that subtracts from the column', () => {
      const expr = d.decrement(1);
      expect(isDbExpr(expr)).toBe(true);
      const colRef = sql.raw('"stock"');
      const result = expr.build(colRef);
      expect(result.sql).toBe('"stock" - $1');
      expect(result.params).toEqual([1]);
    });

    it('supports non-1 values', () => {
      const expr = d.decrement(3);
      const colRef = sql.raw('"balance"');
      const result = expr.build(colRef);
      expect(result.sql).toBe('"balance" - $1');
      expect(result.params).toEqual([3]);
    });
  });
});
