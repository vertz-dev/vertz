import { describe, it, expect } from 'vitest';
import { SqliteDialect, defaultSqliteDialect } from '../sqlite';

describe('SqliteDialect', () => {
  const dialect = new SqliteDialect();

  describe('param()', () => {
    it('returns ? for index 1', () => {
      expect(dialect.param(1)).toBe('?');
    });

    it('returns ? for index 5', () => {
      expect(dialect.param(5)).toBe('?');
    });

    it('returns ? for index 100', () => {
      expect(dialect.param(100)).toBe('?');
    });
  });

  describe('now()', () => {
    it("returns datetime('now')", () => {
      expect(dialect.now()).toBe("datetime('now')");
    });
  });

  describe('mapColumnType()', () => {
    it('maps uuid to TEXT', () => {
      expect(dialect.mapColumnType('uuid')).toBe('TEXT');
    });

    it('maps boolean to INTEGER', () => {
      expect(dialect.mapColumnType('boolean')).toBe('INTEGER');
    });

    it('maps timestamp to TEXT', () => {
      expect(dialect.mapColumnType('timestamp')).toBe('TEXT');
    });

    it('maps json to TEXT', () => {
      expect(dialect.mapColumnType('json')).toBe('TEXT');
    });

    it('maps jsonb to TEXT', () => {
      expect(dialect.mapColumnType('jsonb')).toBe('TEXT');
    });

    it('maps decimal to REAL', () => {
      expect(dialect.mapColumnType('decimal')).toBe('REAL');
    });

    it('maps text to TEXT', () => {
      expect(dialect.mapColumnType('text')).toBe('TEXT');
    });

    it('maps integer to INTEGER', () => {
      expect(dialect.mapColumnType('integer')).toBe('INTEGER');
    });

    it('maps bigint to INTEGER', () => {
      expect(dialect.mapColumnType('bigint')).toBe('INTEGER');
    });

    it('maps serial to INTEGER', () => {
      expect(dialect.mapColumnType('serial')).toBe('INTEGER');
    });

    it('maps unknown types to TEXT', () => {
      expect(dialect.mapColumnType('unknown')).toBe('TEXT');
    });
  });

  describe('feature flags', () => {
    it('supportsReturning is true', () => {
      expect(dialect.supportsReturning).toBe(true);
    });

    it('supportsArrayOps is false', () => {
      expect(dialect.supportsArrayOps).toBe(false);
    });

    it('supportsJsonbPath is false', () => {
      expect(dialect.supportsJsonbPath).toBe(false);
    });

    it('name is sqlite', () => {
      expect(dialect.name).toBe('sqlite');
    });
  });

  describe('defaultSqliteDialect', () => {
    it('is an instance of SqliteDialect', () => {
      expect(defaultSqliteDialect).toBeInstanceOf(SqliteDialect);
    });
  });
});
