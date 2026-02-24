import { d } from '@vertz/db';
import { describe, expect, it } from 'bun:test';
import { stripHiddenFields, stripReadOnlyFields } from '../field-filter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().hidden(),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: field filtering', () => {
  describe('Given a table with hidden column "passwordHash"', () => {
    describe('When stripHiddenFields is called on data with passwordHash', () => {
      it('Then the result does not contain passwordHash', () => {
        const data = { id: '1', email: 'a@b.com', name: 'Alice', passwordHash: 'hash123' };

        const result = stripHiddenFields(usersTable, data);

        expect(result).not.toHaveProperty('passwordHash');
      });

      it('Then all other fields are preserved', () => {
        const data = {
          id: '1',
          email: 'a@b.com',
          name: 'Alice',
          passwordHash: 'hash123',
          role: 'admin',
        };

        const result = stripHiddenFields(usersTable, data);

        expect(result).toEqual({ id: '1', email: 'a@b.com', name: 'Alice', role: 'admin' });
      });
    });

    describe('When stripHiddenFields is called on data without hidden fields', () => {
      it('Then all fields are preserved', () => {
        const data = { id: '1', email: 'a@b.com', name: 'Alice' };

        const result = stripHiddenFields(usersTable, data);

        expect(result).toEqual(data);
      });
    });
  });

  describe('Given a table with readOnly columns "createdAt", "updatedAt" and PK "id"', () => {
    describe('When stripReadOnlyFields is called on data with createdAt and id', () => {
      it('Then createdAt, updatedAt, and id are removed', () => {
        const data = {
          id: '1',
          email: 'a@b.com',
          name: 'Alice',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
        };

        const result = stripReadOnlyFields(usersTable, data);

        expect(result).not.toHaveProperty('id');
        expect(result).not.toHaveProperty('createdAt');
        expect(result).not.toHaveProperty('updatedAt');
      });

      it('Then non-readOnly, non-PK fields are preserved', () => {
        const data = {
          id: '1',
          email: 'a@b.com',
          name: 'Alice',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
          role: 'admin',
        };

        const result = stripReadOnlyFields(usersTable, data);

        expect(result).toEqual({ email: 'a@b.com', name: 'Alice', role: 'admin' });
      });
    });
  });
});
