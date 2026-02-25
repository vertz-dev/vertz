import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import {
  applySelect,
  narrowRelationFields,
  stripHiddenFields,
  stripReadOnlyFields,
} from '../field-filter';

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

describe('Feature: relation field narrowing', () => {
  describe('Given a relations config with per-field narrowing: { creator: { id: true, name: true } }', () => {
    const relationsConfig = { creator: { id: true, name: true } as Record<string, true> };

    describe('When narrowRelationFields is called on data with a creator object', () => {
      it('Then only id and name are kept on the creator relation', () => {
        const data = {
          id: 'task-1',
          title: 'Review PR',
          creator: { id: 'u1', name: 'Alice', email: 'alice@example.com', role: 'admin' },
        };

        const result = narrowRelationFields(relationsConfig, data);

        expect(result.creator).toEqual({ id: 'u1', name: 'Alice' });
        // Non-relation fields are untouched
        expect(result.id).toBe('task-1');
        expect(result.title).toBe('Review PR');
      });
    });
  });

  describe('Given a relations config with false: { project: false }', () => {
    const relationsConfig = { project: false as const };

    describe('When narrowRelationFields is called on data with a project object', () => {
      it('Then the project relation is removed entirely', () => {
        const data = {
          id: 'task-1',
          title: 'Review PR',
          project: { id: 'p1', name: 'Acme' },
        };

        const result = narrowRelationFields(relationsConfig, data);

        expect(result).not.toHaveProperty('project');
        expect(result.id).toBe('task-1');
        expect(result.title).toBe('Review PR');
      });
    });
  });

  describe('Given a relations config with true: { assignee: true }', () => {
    const relationsConfig = { assignee: true as const };

    describe('When narrowRelationFields is called on data with an assignee object', () => {
      it('Then all assignee fields are preserved', () => {
        const data = {
          id: 'task-1',
          assignee: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
        };

        const result = narrowRelationFields(relationsConfig, data);

        expect(result.assignee).toEqual({ id: 'u1', name: 'Alice', email: 'alice@example.com' });
      });
    });
  });

  describe('Given a relations config with per-field narrowing on a many relation (array)', () => {
    const relationsConfig = { tags: { id: true, label: true } as Record<string, true> };

    describe('When narrowRelationFields is called on data with an array of tags', () => {
      it('Then each tag is narrowed to only id and label', () => {
        const data = {
          id: 'task-1',
          tags: [
            { id: 't1', label: 'bug', color: 'red', createdAt: '2024-01-01' },
            { id: 't2', label: 'feature', color: 'green', createdAt: '2024-01-02' },
          ],
        };

        const result = narrowRelationFields(relationsConfig, data);

        expect(result.tags).toEqual([
          { id: 't1', label: 'bug' },
          { id: 't2', label: 'feature' },
        ]);
      });
    });
  });

  describe('Given an empty relations config', () => {
    const relationsConfig = {};

    describe('When narrowRelationFields is called on data with relation-like nested data', () => {
      it('Then all fields pass through unchanged', () => {
        const data = {
          id: 'task-1',
          creator: { id: 'u1', name: 'Alice' },
        };

        const result = narrowRelationFields(relationsConfig, data);

        expect(result).toEqual(data);
      });
    });
  });
});

describe('Feature: field selection (applySelect)', () => {
  describe('Given a select of { name: true, email: true }', () => {
    describe('When applySelect is called on data with extra fields', () => {
      it('Then only selected fields are kept', () => {
        const select = { name: true as const, email: true as const };
        const data = { id: '1', name: 'Alice', email: 'a@b.com', role: 'admin', createdAt: '2024' };

        const result = applySelect(select, data);

        expect(result).toEqual({ name: 'Alice', email: 'a@b.com' });
      });
    });
  });

  describe('Given undefined select', () => {
    describe('When applySelect is called', () => {
      it('Then all fields pass through unchanged', () => {
        const data = { id: '1', name: 'Alice', email: 'a@b.com' };

        const result = applySelect(undefined, data);

        expect(result).toEqual(data);
      });
    });
  });
});

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
