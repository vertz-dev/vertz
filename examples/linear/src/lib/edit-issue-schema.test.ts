import { describe, expect, it } from 'bun:test';
import { editIssueSchema } from './edit-issue-schema';

describe('editIssueSchema', () => {
  describe('Given valid issue data', () => {
    it('returns ok with parsed data for a complete update', () => {
      const result = editIssueSchema.parse({
        title: 'Updated title',
        description: 'Updated description',
        status: 'in_progress',
        priority: 'high',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.title).toBe('Updated title');
        expect(result.data.description).toBe('Updated description');
        expect(result.data.status).toBe('in_progress');
        expect(result.data.priority).toBe('high');
      }
    });

    it('allows empty description', () => {
      const result = editIssueSchema.parse({
        title: 'Title',
        description: '',
        status: 'backlog',
        priority: 'none',
      });
      expect(result.ok).toBe(true);
    });

    it('allows missing optional fields', () => {
      const result = editIssueSchema.parse({
        title: 'Title',
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('Given invalid issue data', () => {
    it('returns error when title is empty', () => {
      const result = editIssueSchema.parse({
        title: '',
        status: 'todo',
        priority: 'none',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const err = result.error as Error & {
          issues?: { path: (string | number)[]; message: string }[];
        };
        expect(err.issues?.some((i) => i.path[0] === 'title')).toBe(true);
      }
    });

    it('returns error for non-object data', () => {
      const result = editIssueSchema.parse(null);
      expect(result.ok).toBe(false);
    });

    it('returns error for non-string title', () => {
      const result = editIssueSchema.parse({
        title: 123,
      });
      expect(result.ok).toBe(false);
    });
  });
});
