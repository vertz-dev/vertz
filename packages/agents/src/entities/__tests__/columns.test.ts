import { describe, expect, it } from '@vertz/test';
import { agentSessionColumns, agentMessageColumns } from '../columns';

// Columns are factories so callers can opt into typed `d.jsonb<T>()` for
// `state` / `toolCalls` while keeping the default `d.text()` shape for
// byte-compat with the legacy `sqliteStore` / `d1Store` DDL. See #2958.

function readSqlType(col: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column meta shape is internal to @vertz/db
  return (col as any)._meta.sqlType as string;
}

describe('Feature: agent column packs — d.jsonb opt-in (#2958)', () => {
  describe('Given agentSessionColumns() is called with default options', () => {
    it('Then `state` is d.text() (byte-compat with legacy DDL)', () => {
      const cols = agentSessionColumns();
      expect(readSqlType(cols.state)).toBe('text');
    });
  });

  describe('Given agentSessionColumns({ useJsonb: true }) is called', () => {
    it('Then `state` is d.jsonb<T>()', () => {
      const cols = agentSessionColumns({ useJsonb: true });
      expect(readSqlType(cols.state)).toBe('jsonb');
    });
  });

  describe('Given agentMessageColumns() is called with default options', () => {
    it('Then `toolCalls` is d.text().nullable() (byte-compat)', () => {
      const cols = agentMessageColumns();
      expect(readSqlType(cols.toolCalls)).toBe('text');
    });
  });

  describe('Given agentMessageColumns({ useJsonb: true }) is called', () => {
    it('Then `toolCalls` is d.jsonb<T>().nullable()', () => {
      const cols = agentMessageColumns({ useJsonb: true });
      expect(readSqlType(cols.toolCalls)).toBe('jsonb');
    });
  });

  describe('Given the same pack is constructed twice with identical options', () => {
    it('Then each call returns a fresh object (no shared column instances)', () => {
      const a = agentSessionColumns();
      const b = agentSessionColumns();
      expect(a).not.toBe(b);
      expect(a.state).not.toBe(b.state);
    });
  });
});
