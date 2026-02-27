import { describe, expect, it } from 'bun:test';
import { d } from '../../d';
import {
  getAutoUpdateColumns,
  getColumnNames,
  getDefaultColumns,
  getNotHiddenColumns,
  getNotSensitiveColumns,
  getPrimaryKeyColumns,
  getReadOnlyColumns,
  getTimestampColumns,
  resolveSelectColumns,
} from '../helpers';

describe('query helpers', () => {
  const table = d.table('users', {
    id: d.uuid().primary(),
    name: d.text(),
    email: d.text(),
    password: d.text().sensitive(),
    internalNote: d.text().hidden(),
    createdAt: d.timestamp().default('now'),
    age: d.integer().nullable(),
  });

  describe('getColumnNames', () => {
    it('returns all column names', () => {
      const cols = getColumnNames(table);
      expect(cols).toEqual(['id', 'name', 'email', 'password', 'internalNote', 'createdAt', 'age']);
    });
  });

  describe('getDefaultColumns', () => {
    it('excludes hidden columns', () => {
      const cols = getDefaultColumns(table);
      expect(cols).toContain('id');
      expect(cols).toContain('name');
      expect(cols).toContain('password');
      expect(cols).not.toContain('internalNote');
    });
  });

  describe('getNotSensitiveColumns', () => {
    it('excludes sensitive and hidden columns', () => {
      const cols = getNotSensitiveColumns(table);
      expect(cols).toContain('id');
      expect(cols).toContain('name');
      expect(cols).not.toContain('password');
      expect(cols).not.toContain('internalNote');
    });
  });

  describe('getNotHiddenColumns', () => {
    it('excludes hidden columns', () => {
      const cols = getNotHiddenColumns(table);
      expect(cols).toContain('password');
      expect(cols).not.toContain('internalNote');
    });
  });

  describe('getTimestampColumns', () => {
    it('returns timestamp columns', () => {
      const cols = getTimestampColumns(table);
      expect(cols).toEqual(['createdAt']);
    });
  });

  describe('getPrimaryKeyColumns', () => {
    it('returns primary key columns', () => {
      const cols = getPrimaryKeyColumns(table);
      expect(cols).toEqual(['id']);
    });
  });

  describe('resolveSelectColumns', () => {
    it('returns default columns when select is undefined', () => {
      const cols = resolveSelectColumns(table);
      expect(cols).not.toContain('internalNote');
      expect(cols).toContain('name');
    });

    it('returns not-sensitive columns when select is { not: "sensitive" }', () => {
      const cols = resolveSelectColumns(table, { not: 'sensitive' });
      expect(cols).not.toContain('password');
      expect(cols).not.toContain('internalNote');
      expect(cols).toContain('name');
    });

    it('returns not-hidden columns when select is { not: "hidden" }', () => {
      const cols = resolveSelectColumns(table, { not: 'hidden' });
      expect(cols).toContain('password');
      expect(cols).not.toContain('internalNote');
    });

    it('returns explicit picks when select has boolean values', () => {
      const cols = resolveSelectColumns(table, { id: true, name: true });
      expect(cols).toEqual(['id', 'name']);
    });

    it('excludes keys set to false in explicit pick', () => {
      const cols = resolveSelectColumns(table, { id: true, name: false, email: true });
      expect(cols).toEqual(['id', 'email']);
      expect(cols).not.toContain('name');
    });

    it('falls back to not-hidden when not key is present but not "sensitive"', () => {
      const cols = resolveSelectColumns(table, { not: 'hidden' });
      expect(cols).toContain('password');
      expect(cols).toContain('name');
      expect(cols).not.toContain('internalNote');
    });
  });

  describe('getReadOnlyColumns', () => {
    it('returns readOnly columns', () => {
      const roTable = d.table('ro_test', {
        id: d.uuid().primary(),
        name: d.text(),
        createdAt: d.timestamp().default('now').readOnly(),
      });
      const cols = getReadOnlyColumns(roTable);
      expect(cols).toEqual(['createdAt']);
      expect(cols).not.toContain('id');
      expect(cols).not.toContain('name');
    });
  });

  describe('getAutoUpdateColumns', () => {
    it('returns autoUpdate columns', () => {
      const auTable = d.table('au_test', {
        id: d.uuid().primary(),
        name: d.text(),
        updatedAt: d.timestamp().autoUpdate(),
      });
      const cols = getAutoUpdateColumns(auTable);
      expect(cols).toEqual(['updatedAt']);
      expect(cols).not.toContain('id');
      expect(cols).not.toContain('name');
    });
  });
});
