import { describe, expect, it } from '@vertz/test';
import { dialectDDL } from '../dialect-ddl';

describe('dialectDDL', () => {
  describe('sqlite', () => {
    const ddl = dialectDDL('sqlite');

    it('returns INTEGER NOT NULL DEFAULT 0 for boolean(false)', () => {
      expect(ddl.boolean(false)).toBe('INTEGER NOT NULL DEFAULT 0');
    });

    it('returns INTEGER NOT NULL DEFAULT 1 for boolean(true)', () => {
      expect(ddl.boolean(true)).toBe('INTEGER NOT NULL DEFAULT 1');
    });

    it('returns TEXT NOT NULL for timestamp', () => {
      expect(ddl.timestamp()).toBe('TEXT NOT NULL');
    });

    it('returns TEXT for timestampNullable', () => {
      expect(ddl.timestampNullable()).toBe('TEXT');
    });

    it('returns TEXT for text', () => {
      expect(ddl.text()).toBe('TEXT');
    });

    it('returns TEXT PRIMARY KEY for textPrimary', () => {
      expect(ddl.textPrimary()).toBe('TEXT PRIMARY KEY');
    });

    it('returns INTEGER for integer', () => {
      expect(ddl.integer()).toBe('INTEGER');
    });
  });

  describe('postgres', () => {
    const ddl = dialectDDL('postgres');

    it('returns BOOLEAN NOT NULL DEFAULT false for boolean(false)', () => {
      expect(ddl.boolean(false)).toBe('BOOLEAN NOT NULL DEFAULT false');
    });

    it('returns BOOLEAN NOT NULL DEFAULT true for boolean(true)', () => {
      expect(ddl.boolean(true)).toBe('BOOLEAN NOT NULL DEFAULT true');
    });

    it('returns TIMESTAMPTZ NOT NULL for timestamp', () => {
      expect(ddl.timestamp()).toBe('TIMESTAMPTZ NOT NULL');
    });

    it('returns TIMESTAMPTZ for timestampNullable', () => {
      expect(ddl.timestampNullable()).toBe('TIMESTAMPTZ');
    });

    it('returns TEXT for text', () => {
      expect(ddl.text()).toBe('TEXT');
    });

    it('returns TEXT PRIMARY KEY for textPrimary', () => {
      expect(ddl.textPrimary()).toBe('TEXT PRIMARY KEY');
    });

    it('returns INTEGER for integer', () => {
      expect(ddl.integer()).toBe('INTEGER');
    });
  });
});
