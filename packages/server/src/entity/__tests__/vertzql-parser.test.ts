import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import type { EntityRelationsConfig } from '../types';
import { MAX_Q_BASE64_LENGTH, parseVertzQL, validateVertzQL } from '../vertzql-parser';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().is('hidden'),
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

  // --- q= param (structural queries) ---

  describe('Given a query with q= param encoding { select: { title: true } }', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns select: { title: true }', () => {
        const structural = { select: { title: true } };
        const q = btoa(JSON.stringify(structural));
        const query = { q };

        const result = parseVertzQL(query);

        expect(result.select).toEqual({ title: true });
      });
    });
  });

  describe('Given a query with q= param encoding { include: { assignee: true } }', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns include: { assignee: true }', () => {
        const structural = { include: { assignee: true } };
        const q = btoa(JSON.stringify(structural));
        const query = { q };

        const result = parseVertzQL(query);

        expect(result.include).toEqual({ assignee: true });
      });
    });
  });

  describe('Given a query with q= param encoding both select and include', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns both select and include', () => {
        const structural = {
          select: { title: true, status: true },
          include: { creator: { select: { id: true, name: true } } },
        };
        const q = btoa(JSON.stringify(structural));
        const query = { q };

        const result = parseVertzQL(query);

        expect(result.select).toEqual({ title: true, status: true });
        expect(result.include).toEqual({ creator: { select: { id: true, name: true } } });
      });
    });
  });

  describe('Given a combined query with where and q= param', () => {
    describe('When parseVertzQL is called', () => {
      it('Then merges readable and structural params', () => {
        const structural = { include: { assignee: true } };
        const q = btoa(JSON.stringify(structural));
        const query = { 'where[status]': 'todo', q };

        const result = parseVertzQL(query);

        expect(result.where).toEqual({ status: 'todo' });
        expect(result.include).toEqual({ assignee: true });
      });
    });
  });

  describe('Given a query with q= param using base64url encoding (no padding, - and _)', () => {
    describe('When parseVertzQL is called', () => {
      it('Then correctly decodes base64url', () => {
        const structural = { select: { title: true } };
        const json = JSON.stringify(structural);
        // Base64URL: replace + with -, / with _, strip padding
        const q = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const query = { q };

        const result = parseVertzQL(query);

        expect(result.select).toEqual({ title: true });
      });
    });
  });

  describe('Given a query with URL-encoded q= param', () => {
    describe('When parseVertzQL is called', () => {
      it('Then URL-decodes before base64 decoding', () => {
        const structural = { select: { title: true } };
        const b64 = btoa(JSON.stringify(structural));
        // Simulate URL-encoding of the base64 string (e.g., = becomes %3D)
        const q = encodeURIComponent(b64);
        const query = { q };

        const result = parseVertzQL(query);

        expect(result.select).toEqual({ title: true });
      });
    });
  });

  describe('Given a query with invalid q= param (not valid base64/JSON)', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns a parse error', () => {
        const query = { q: 'not-valid-base64!!!' };

        const result = parseVertzQL(query);

        expect(result._qError).toBe('Invalid q= parameter: not valid base64 or JSON');
      });
    });
  });

  // --- Multiple operators on same field ---

  describe('Given equality and operator on the same field: where[status]=active&where[status][ne]=archived', () => {
    describe('When parseVertzQL is called', () => {
      it('Then merges both conditions into the where clause', () => {
        const query = { 'where[status]': 'active', 'where[status][ne]': 'archived' };

        const result = parseVertzQL(query);

        expect(result.where).toEqual({ status: { eq: 'active', ne: 'archived' } });
      });
    });
  });

  describe('Given multiple operators on the same field: where[age][gte]=18&where[age][lte]=65', () => {
    describe('When parseVertzQL is called', () => {
      it('Then merges both operators', () => {
        const query = { 'where[age][gte]': '18', 'where[age][lte]': '65' };

        const result = parseVertzQL(query);

        expect(result.where).toEqual({ age: { gte: '18', lte: '65' } });
      });
    });
  });

  // --- Limit upper bound ---

  describe('Given a query with limit exceeding MAX_LIMIT (1000)', () => {
    describe('When parseVertzQL is called', () => {
      it('Then clamps limit to MAX_LIMIT', () => {
        const query = { limit: '999999' };

        const result = parseVertzQL(query);

        expect(result.limit).toBe(1000);
      });
    });
  });

  describe('Given a query with negative limit', () => {
    describe('When parseVertzQL is called', () => {
      it('Then clamps limit to 0', () => {
        const query = { limit: '-5' };

        const result = parseVertzQL(query);

        expect(result.limit).toBe(0);
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

  // --- Select validation ---

  describe('Given a select with a hidden field', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns an error', () => {
        const options = { select: { passwordHash: true as const } };

        const result = validateVertzQL(options, usersTable);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('passwordHash');
        }
      });
    });
  });

  describe('Given a select with only public fields', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns ok', () => {
        const options = { select: { name: true as const, email: true as const } };

        const result = validateVertzQL(options, usersTable);

        expect(result.ok).toBe(true);
      });
    });
  });

  // --- Include validation ---

  describe('Given an include for a relation not in entity relations config', () => {
    describe('When validateVertzQL is called with relationsConfig', () => {
      it('Then returns an error', () => {
        const options = { include: { project: true } };
        const relationsConfig: EntityRelationsConfig = { assignee: true };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('project');
        }
      });
    });
  });

  describe('Given an include for a relation set to false in entity config', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns an error', () => {
        const options = { include: { project: true } };
        const relationsConfig: EntityRelationsConfig = { project: false };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('project');
        }
      });
    });
  });

  describe('Given an include with over-wide field selection beyond entity config', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns an error for the unauthorized field', () => {
        const options = {
          include: { creator: { select: { id: true, name: true, email: true } } },
        };
        const relationsConfig: EntityRelationsConfig = {
          creator: { select: { id: true, name: true } },
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('email');
        }
      });
    });
  });

  describe('Given a valid include within entity config restrictions', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns ok', () => {
        const options = { include: { assignee: true } };
        const relationsConfig: EntityRelationsConfig = { assignee: true };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(true);
      });
    });
  });

  describe('Given a query with invalid q= param', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns an error for the invalid q= param', () => {
        const parsed = parseVertzQL({ q: 'not-valid!!!' });

        const result = validateVertzQL(parsed, usersTable);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('q=');
        }
      });
    });
  });

  describe('Given a valid include with field narrowing within entity config', () => {
    describe('When validateVertzQL is called', () => {
      it('Then returns ok', () => {
        const options = { include: { creator: { select: { id: true, name: true } } } };
        const relationsConfig: EntityRelationsConfig = {
          creator: { select: { id: true, name: true } },
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(true);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 2: Relation include with where/orderBy/limit validation (#1130)
// ---------------------------------------------------------------------------

describe('Feature: VertzQL include with where/orderBy/limit (#1130)', () => {
  // --- parseVertzQL: nested include options in q= param ---

  describe('Given a q= param with include containing where/orderBy/limit', () => {
    describe('When parseVertzQL is called', () => {
      it('Then preserves where, orderBy, limit in the include entry', () => {
        const structural = {
          include: {
            comments: {
              where: { status: 'published' },
              orderBy: { createdAt: 'desc' },
              limit: 10,
            },
          },
        };
        const q = btoa(JSON.stringify(structural));

        const result = parseVertzQL({ q });

        expect(result.include).toEqual({
          comments: {
            where: { status: 'published' },
            orderBy: { createdAt: 'desc' },
            limit: 10,
          },
        });
      });
    });
  });

  describe('Given a q= param with nested include (depth 2)', () => {
    describe('When parseVertzQL is called', () => {
      it('Then preserves nested include structure', () => {
        const structural = {
          include: {
            author: {
              select: { name: true },
              include: {
                organization: { select: { name: true } },
              },
            },
          },
        };
        const q = btoa(JSON.stringify(structural));

        const result = parseVertzQL({ q });

        expect(result.include).toEqual({
          author: {
            select: { name: true },
            include: {
              organization: { select: { name: true } },
            },
          },
        });
      });
    });
  });
});

describe('Feature: Entity relations config with allowWhere/allowOrderBy (#1130)', () => {
  // --- allowWhere validation ---

  describe('Given a relation with allowWhere: ["status", "createdAt"]', () => {
    describe('When where includes a non-allowed field', () => {
      it('Then returns error: Field "X" is not filterable on relation "Y"', () => {
        const options = {
          include: {
            comments: {
              where: { internalScore: 5 },
            },
          },
        };
        const relationsConfig: EntityRelationsConfig = {
          comments: {
            select: { text: true, status: true, createdAt: true },
            allowWhere: ['status', 'createdAt'],
          },
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('internalScore');
          expect(result.error).toContain('not filterable');
          expect(result.error).toContain('comments');
        }
      });
    });

    describe('When where includes only allowed fields', () => {
      it('Then validation passes', () => {
        const options = {
          include: {
            comments: {
              where: { status: 'published' },
            },
          },
        };
        const relationsConfig: EntityRelationsConfig = {
          comments: {
            select: { text: true, status: true },
            allowWhere: ['status', 'createdAt'],
          },
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(true);
      });
    });
  });

  describe('Given a relation with no allowWhere config (omitted)', () => {
    describe('When a where clause is provided', () => {
      it('Then returns error: Filtering is not enabled on relation', () => {
        const options = {
          include: {
            comments: {
              where: { status: 'published' },
            },
          },
        };
        const relationsConfig: EntityRelationsConfig = {
          comments: {
            select: { text: true },
          },
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('not enabled');
          expect(result.error).toContain('comments');
        }
      });
    });
  });

  describe('Given a relation set to true (no config object)', () => {
    describe('When a where clause is provided', () => {
      it('Then returns error: Filtering is not enabled on relation', () => {
        const options = {
          include: {
            comments: {
              where: { status: 'published' },
            },
          },
        };
        const relationsConfig: EntityRelationsConfig = {
          comments: true,
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('not enabled');
          expect(result.error).toContain('comments');
        }
      });
    });
  });

  // --- allowOrderBy validation ---

  describe('Given a relation with allowOrderBy: ["createdAt"]', () => {
    describe('When orderBy includes a non-allowed field', () => {
      it('Then returns error: Field "X" is not sortable on relation "Y"', () => {
        const options = {
          include: {
            comments: {
              orderBy: { internalScore: 'desc' as const },
            },
          },
        };
        const relationsConfig: EntityRelationsConfig = {
          comments: {
            select: { text: true },
            allowOrderBy: ['createdAt'],
          },
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('internalScore');
          expect(result.error).toContain('not sortable');
          expect(result.error).toContain('comments');
        }
      });
    });

    describe('When orderBy includes only allowed fields', () => {
      it('Then validation passes', () => {
        const options = {
          include: {
            comments: {
              orderBy: { createdAt: 'desc' as const },
            },
          },
        };
        const relationsConfig: EntityRelationsConfig = {
          comments: {
            select: { text: true },
            allowOrderBy: ['createdAt'],
          },
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(true);
      });
    });
  });

  describe('Given a relation with no allowOrderBy config', () => {
    describe('When an orderBy clause is provided', () => {
      it('Then returns error: Sorting is not enabled on relation', () => {
        const options = {
          include: {
            comments: {
              orderBy: { createdAt: 'desc' as const },
            },
          },
        };
        const relationsConfig: EntityRelationsConfig = {
          comments: {
            select: { text: true },
          },
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('not enabled');
          expect(result.error).toContain('comments');
        }
      });
    });
  });

  // --- maxLimit clamping ---

  describe('Given a relation with maxLimit: 50', () => {
    describe('When limit exceeds maxLimit', () => {
      it('Then clamps limit to maxLimit (validation passes)', () => {
        const options = {
          include: {
            comments: {
              limit: 200,
            },
          },
        };
        const relationsConfig: EntityRelationsConfig = {
          comments: {
            select: { text: true },
            maxLimit: 50,
          },
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        // Validation passes — limit is clamped silently
        expect(result.ok).toBe(true);
        // The include entry should have its limit clamped
        expect((options.include!.comments as Record<string, unknown>).limit).toBe(50);
      });
    });
  });

  // --- Nested validation (depth 2+) ---

  describe('Given nested include validation at depth 2+', () => {
    describe('When a deeply nested where references a non-allowed field', () => {
      it('Then error includes the relation path: "author.organization"', () => {
        const options = {
          include: {
            author: {
              include: {
                organization: {
                  where: { internalRating: 5 },
                },
              },
            },
          },
        };
        // author is allowed (true), organization nested under author needs its own config
        const relationsConfig: EntityRelationsConfig = {
          author: true,
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        // Nested validation should catch the issue
        expect(result.ok).toBe(false);
      });
    });
  });

  // --- select field validation with new config shape ---

  describe('Given a relation with select config', () => {
    describe('When include requests a field not in select config', () => {
      it('Then returns an error for the unauthorized field', () => {
        const options = {
          include: {
            comments: {
              select: { text: true, secretField: true },
            },
          },
        };
        const relationsConfig: EntityRelationsConfig = {
          comments: {
            select: { text: true, status: true },
          },
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('secretField');
        }
      });
    });
  });

  // --- Boolean include with object config still works ---

  describe('Given a relation config with select/allowWhere', () => {
    describe('When include is just true', () => {
      it('Then validation passes', () => {
        const options = {
          include: { comments: true },
        };
        const relationsConfig: EntityRelationsConfig = {
          comments: {
            select: { text: true },
            allowWhere: ['status'],
          },
        };

        const result = validateVertzQL(options, usersTable, relationsConfig);

        expect(result.ok).toBe(true);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Security: q= parameter hardening
// ---------------------------------------------------------------------------

describe('Feature: VertzQL q= parameter security hardening', () => {
  describe('Given a q= param that exceeds MAX_Q_BASE64_LENGTH', () => {
    describe('When parseVertzQL is called', () => {
      it('Then returns a size error and does not attempt decode', () => {
        // Create a base64 string that exceeds the limit
        const oversizedJson = JSON.stringify({ select: { x: 'a'.repeat(MAX_Q_BASE64_LENGTH) } });
        const q = btoa(oversizedJson);

        const result = parseVertzQL({ q });

        expect(result._qError).toBe('q= parameter exceeds maximum allowed size');
        expect(result.select).toBeUndefined();
        expect(result.include).toBeUndefined();
      });
    });
  });

  describe('Given a q= param with unknown keys in the decoded JSON', () => {
    describe('When parseVertzQL is called', () => {
      it('Then strips unknown keys and keeps expected ones', () => {
        const structural = {
          select: { title: true },
          include: { assignee: true },
          __proto__: { admin: true },
          malicious: 'payload',
          dangerousConfig: { drop: 'table' },
        };
        const q = btoa(JSON.stringify(structural));

        const result = parseVertzQL({ q });

        expect(result.select).toEqual({ title: true });
        expect(result.include).toEqual({ assignee: true });
        expect(result).not.toHaveProperty('malicious');
        expect(result).not.toHaveProperty('dangerousConfig');
      });
    });
  });

  describe('Given a q= param with only expected keys (select, include)', () => {
    describe('When parseVertzQL is called', () => {
      it('Then parses successfully without stripping', () => {
        const structural = {
          select: { title: true, status: true },
          include: { creator: { select: { id: true, name: true } } },
        };
        const q = btoa(JSON.stringify(structural));

        const result = parseVertzQL({ q });

        expect(result.select).toEqual({ title: true, status: true });
        expect(result.include).toEqual({ creator: { select: { id: true, name: true } } });
        expect(result._qError).toBeUndefined();
      });
    });
  });

  describe('Given a q= param exactly at MAX_Q_BASE64_LENGTH', () => {
    describe('When parseVertzQL is called', () => {
      it('Then accepts the payload (boundary is inclusive)', () => {
        // Build a payload that produces base64 at or just under the limit
        const filler = 'x'.repeat(7000);
        const structural = { select: { [filler]: true } };
        const q = btoa(JSON.stringify(structural));

        // Only test if the generated base64 fits within the limit
        if (q.length <= MAX_Q_BASE64_LENGTH) {
          const result = parseVertzQL({ q });

          expect(result._qError).toBeUndefined();
          expect(result.select).toBeDefined();
        }
      });
    });
  });
});
