import type { DialogHandle, FormSchema } from '@vertz/ui';
import { form } from '@vertz/ui';
import { issueApi } from '../api/client';
import type { CreateIssueBody, IssuePriority, IssueStatus } from '../lib/types';
import { dialogStyles, formStyles, inputStyles, labelStyles } from '../styles/components';
import { Button } from './button';

const VALID_STATUSES: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];
const VALID_PRIORITIES: IssuePriority[] = ['urgent', 'high', 'medium', 'low', 'none'];

const createIssueSchema: FormSchema<CreateIssueBody> = {
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

    return {
      ok: true as const,
      data: {
        projectId: obj.projectId as string,
        title: (obj.title as string).trim(),
        description: obj.description ? String(obj.description).trim() : undefined,
        status: status as IssueStatus,
        priority: priority as IssuePriority,
      },
    };
  },
};

interface CreateIssueDialogProps {
  projectId: string;
  dialog: DialogHandle<boolean>;
}

export function CreateIssueDialog({ projectId, dialog }: CreateIssueDialogProps) {
  const createForm = form(issueApi.create, {
    schema: createIssueSchema,
    initial: {
      projectId,
      title: '',
      description: '',
      status: 'backlog',
      priority: 'none',
    },
    onSuccess: () => dialog.close(true),
  });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dialog overlay backdrop
    <div
      class={dialogStyles.overlay}
      data-state="open"
      role="presentation"
      onClick={(e: MouseEvent) => {
        if (e.target === e.currentTarget) dialog.close(false);
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Escape') dialog.close(false);
      }}
    >
      <div
        class={dialogStyles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="New Issue"
        data-state="open"
      >
        <h3 class={dialogStyles.title}>New Issue</h3>
        <form action={createForm.action} method={createForm.method} onSubmit={createForm.onSubmit}>
          <input type="hidden" name="projectId" value={projectId} />

          <div class={formStyles.field}>
            <label class={labelStyles.base} htmlFor="issue-title">
              Title
            </label>
            <input
              class={inputStyles.base}
              id="issue-title"
              name="title"
              placeholder="Issue title"
            />
            {createForm.title.error && (
              <span class={formStyles.error}>{createForm.title.error}</span>
            )}
          </div>

          <div class={formStyles.field}>
            <label class={labelStyles.base} htmlFor="issue-description">
              Description
            </label>
            <textarea
              class={inputStyles.base}
              id="issue-description"
              name="description"
              placeholder="Optional description"
              style="min-height: 5rem; resize: vertical"
            />
          </div>

          <div class={formStyles.field}>
            <label class={labelStyles.base} htmlFor="issue-priority">
              Priority
            </label>
            <select class={formStyles.select} id="issue-priority" name="priority">
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <footer class={dialogStyles.footer}>
            <Button intent="outline" size="sm" onClick={() => dialog.close(false)}>
              Cancel
            </Button>
            <Button type="submit" intent="primary" size="sm" disabled={createForm.submitting.value}>
              {createForm.submitting ? 'Creating...' : 'Create Issue'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
