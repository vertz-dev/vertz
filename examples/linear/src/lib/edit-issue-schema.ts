import type { FormSchema } from '@vertz/ui';
import type { IssuePriority, IssueStatus } from './types';

const VALID_STATUSES: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];
const VALID_PRIORITIES: IssuePriority[] = ['urgent', 'high', 'medium', 'low', 'none'];

export interface EditIssueInput {
  title: string;
  description?: string;
  status: string;
  priority: string;
}

export const editIssueSchema: FormSchema<EditIssueInput> = {
  parse(data: unknown) {
    if (typeof data !== 'object' || data === null) {
      return { ok: false as const, error: new Error('Invalid form data') };
    }
    const obj = data as Record<string, unknown>;
    const errors: Record<string, string> = {};

    if (!obj.title || typeof obj.title !== 'string' || obj.title.trim().length === 0) {
      errors.title = 'Title is required';
    }

    const status = (obj.status as string) || 'backlog';
    if (!VALID_STATUSES.includes(status as IssueStatus)) {
      errors.status = 'Invalid status';
    }

    const priority = (obj.priority as string) || 'none';
    if (!VALID_PRIORITIES.includes(priority as IssuePriority)) {
      errors.priority = 'Invalid priority';
    }

    if (Object.keys(errors).length > 0) {
      const err = new Error('Validation failed');
      (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = errors;
      return { ok: false as const, error: err };
    }

    const description = obj.description ? String(obj.description).trim() : undefined;

    return {
      ok: true as const,
      data: {
        title: (obj.title as string).trim(),
        description: description || undefined,
        status,
        priority,
      },
    };
  },
};
