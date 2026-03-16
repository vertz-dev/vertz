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

    it('trims whitespace from title and description', () => {
      const result = editIssueSchema.parse({
        title: '  Trimmed title  ',
        description: '  Trimmed desc  ',
        status: 'todo',
        priority: 'none',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.title).toBe('Trimmed title');
        expect(result.data.description).toBe('Trimmed desc');
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
      if (result.ok) {
        expect(result.data.description).toBeUndefined();
      }
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
        const err = result.error as Error & { fieldErrors: Record<string, string> };
        expect(err.fieldErrors.title).toBe('Title is required');
      }
    });

    it('returns error when title is missing', () => {
      const result = editIssueSchema.parse({
        status: 'todo',
        priority: 'none',
      });
      expect(result.ok).toBe(false);
    });

    it('returns error for invalid status', () => {
      const result = editIssueSchema.parse({
        title: 'Title',
        status: 'invalid_status',
        priority: 'none',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const err = result.error as Error & { fieldErrors: Record<string, string> };
        expect(err.fieldErrors.status).toBe('Invalid status');
      }
    });

    it('returns error for invalid priority', () => {
      const result = editIssueSchema.parse({
        title: 'Title',
        status: 'todo',
        priority: 'invalid_priority',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const err = result.error as Error & { fieldErrors: Record<string, string> };
        expect(err.fieldErrors.priority).toBe('Invalid priority');
      }
    });

    it('returns error for non-object data', () => {
      const result = editIssueSchema.parse(null);
      expect(result.ok).toBe(false);
    });
  });
});
