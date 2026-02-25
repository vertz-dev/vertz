import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import { parseVertzQL, validateVertzQL } from '../vertzql-parser';

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
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: VertzQL query param parsing', () => {
  // --- Where (equality) ---

  describe('Given a query string with where[status]=todo', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns where: { status: "todo" }', () => {
        const query = { 'where[status]': 'todo' };

        const result = parseVertzQL(query);

        expect(result.where).toEqual({ status: 'todo' });
      });
    });
  });

  describe('Given multiple where equality filters', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns where with all fields', () => {
        const query = { 'where[status]': 'todo', 'where[role]': 'admin' };

        const result = parseVertzQL(query);

        expect(result.where).toEqual({ status: 'todo', role: 'admin' });
      });
    });
  });

  // --- Where (operators) ---

  describe('Given a query string with where[createdAt][gte]=2024-01-01', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns where: { createdAt: { gte: "2024-01-01" } }', () => {
        const query = { 'where[createdAt][gte]': '2024-01-01' };

        const result = parseVertzQL(query);

        expect(result.where).toEqual({ createdAt: { gte: '2024-01-01' } });
      });
    });
  });

  describe('Given a query string with where[title][contains]=design', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns where: { title: { contains: "design" } }', () => {
        const query = { 'where[title][contains]': 'design' };

        const result = parseVertzQL(query);

        expect(result.where).toEqual({ title: { contains: 'design' } });
      });
    });
  });

  // --- OrderBy ---

  describe('Given a query string with orderBy=createdAt:desc', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns orderBy: { createdAt: "desc" }', () => {
        const query = { orderBy: 'createdAt:desc' };

        const result = parseVertzQL(query);

        expect(result.orderBy).toEqual({ createdAt: 'desc' });
      });
    });
  });

  describe('Given a query string with orderBy=title:asc', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns orderBy: { title: "asc" }', () => {
        const query = { orderBy: 'title:asc' };

        const result = parseVertzQL(query);

        expect(result.orderBy).toEqual({ title: 'asc' });
      });
    });
  });

  describe('Given a query string with orderBy=name (no direction)', () => {
    describe('When parseVertzQL is called', () => {
      it('Then defaults to asc', () => {
        const query = { orderBy: 'name' };

        const result = parseVertzQL(query);

        expect(result.orderBy).toEqual({ name: 'asc' });
      });
    });
  });

  // --- Limit ---

  describe('Given a query string with limit=20', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns limit: 20', () => {
        const query = { limit: '20' };

        const result = parseVertzQL(query);

        expect(result.limit).toBe(20);
      });
    });
  });

  describe('Given a query string with limit=abc (invalid)', () => {
    describe('When parseVertzQL is called', () => {
      it('Then limit is undefined', () => {
        const query = { limit: 'abc' };

        const result = parseVertzQL(query);

        expect(result.limit).toBeUndefined();
      });
    });
  });

  // --- After (cursor) ---

  describe('Given a query string with after=abc123', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns after: "abc123"', () => {
        const query = { after: 'abc123' };

        const result = parseVertzQL(query);

        expect(result.after).toBe('abc123');
      });
    });
  });

  describe('Given an empty after value', () => {
    describe('When parseVertzQL is called', () => {
      it('Then after is undefined', () => {
        const query = { after: '' };

        const result = parseVertzQL(query);

        expect(result.after).toBeUndefined();
      });
    });
  });

  // --- Combined ---

  describe('Given a combined query with where, orderBy, limit, and after', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns all parsed options', () => {
        const query = {
          'where[status]': 'todo',
          'where[createdAt][gte]': '2024-01-01',
          orderBy: 'createdAt:desc',
          limit: '20',
          after: 'cursor-abc',
        };

        const result = parseVertzQL(query);

        expect(result.where).toEqual({
          status: 'todo',
          createdAt: { gte: '2024-01-01' },
        });
        expect(result.orderBy).toEqual({ createdAt: 'desc' });
        expect(result.limit).toBe(20);
        expect(result.after).toBe('cursor-abc');
      });
    });
  });

  // --- Empty query ---

  describe('Given an empty query object', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns an empty options object', () => {
        const result = parseVertzQL({});

        expect(result.where).toBeUndefined();
        expect(result.orderBy).toBeUndefined();
        expect(result.limit).toBeUndefined();
        expect(result.after).toBeUndefined();
      });
    });
  });

  // --- Unknown keys are ignored ---

  describe('Given a query with unknown keys', () => {
    describe('When parseVertzQL is called', () => {
      it('Then unknown keys are ignored', () => {
        const query = { foo: 'bar', 'where[status]': 'todo' };

        const result = parseVertzQL(query);

        expect(result.where).toEqual({ status: 'todo' });
        expect(result).not.toHaveProperty('foo');
      });
    });
  });
});

describe('Feature: VertzQL validation', () => {
  describe('Given a where filter on a hidden field (passwordHash)', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns an error indicating the field is not filterable', () => {
        const options = { where: { passwordHash: 'hash123' } };

        const result = validateVertzQL(options, usersTable);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('passwordHash');
        }
      });
    });
  });

  describe('Given a where filter on a public field', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns ok', () => {
        const options = { where: { status: 'todo' } };

        const result = validateVertzQL(options, usersTable);

        expect(result.ok).toBe(true);
      });
    });
  });

  describe('Given an orderBy on a hidden field', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns an error indicating the field is not sortable', () => {
        const options = { orderBy: { passwordHash: 'asc' as const } };

        const result = validateVertzQL(options, usersTable);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('passwordHash');
        }
      });
    });
  });

  describe('Given an orderBy on a public field', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns ok', () => {
        const options = { orderBy: { createdAt: 'desc' as const } };

        const result = validateVertzQL(options, usersTable);

        expect(result.ok).toBe(true);
      });
    });
  });

  describe('Given a where filter with mixed public and hidden fields', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns an error for the hidden field', () => {
        const options = { where: { role: 'admin', passwordHash: 'x' } };

        const result = validateVertzQL(options, usersTable);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('passwordHash');
        }
      });
    });
  });

  describe('Given valid options with no where or orderBy', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns ok', () => {
        const options = { limit: 20, after: 'cursor-abc' };

        const result = validateVertzQL(options, usersTable);

        expect(result.ok).toBe(true);
      });
    });
  });
});
