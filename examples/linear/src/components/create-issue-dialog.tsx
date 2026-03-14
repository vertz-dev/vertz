import type { FormSchema } from '@vertz/ui';
import { css, form } from '@vertz/ui';
import { issueApi } from '../api/client';
import type { CreateIssueBody } from '../lib/types';

const styles = css({
  overlay: ['fixed', 'inset:0', 'bg:black/50', 'flex', 'items:center', 'justify:center', 'z:50'],
  dialog: ['bg:card', 'rounded:lg', 'border:1', 'border:border', 'p:6', 'w:96', 'max-w:full'],
  title: ['font:lg', 'font:semibold', 'text:foreground', 'mb:4'],
  field: ['flex', 'flex-col', 'gap:1', 'mb:4'],
  label: ['text:sm', 'font:medium', 'text:foreground'],
  input: [
    'bg:background',
    'border:1',
    'border:border',
    'rounded:md',
    'px:3',
    'py:2',
    'text:sm',
    'text:foreground',
  ],
  textarea: [
    'bg:background',
    'border:1',
    'border:border',
    'rounded:md',
    'px:3',
    'py:2',
    'text:sm',
    'text:foreground',
    'min-h:20',
  ],
  select: [
    'bg:background',
    'border:1',
    'border:border',
    'rounded:md',
    'px:3',
    'py:2',
    'text:sm',
    'text:foreground',
  ],
  error: ['text:xs', 'text:destructive'],
  footer: ['flex', 'justify:end', 'gap:2', 'mt:6'],
  cancelBtn: [
    'px:4',
    'py:2',
    'text:sm',
    'rounded:md',
    'bg:transparent',
    'text:muted-foreground',
    'border:1',
    'border:border',
    'cursor:pointer',
  ],
  submitBtn: [
    'px:4',
    'py:2',
    'text:sm',
    'rounded:md',
    'bg:primary.600',
    'text:white',
    'border:0',
    'cursor:pointer',
  ],
});

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
        status: (obj.status as string) || undefined,
        priority: (obj.priority as string) || undefined,
      } as CreateIssueBody,
    };
  },
};

interface CreateIssueDialogProps {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateIssueDialog({ projectId, onClose, onSuccess }: CreateIssueDialogProps) {
  const createForm = form(issueApi.create, {
    schema: createIssueSchema,
    initial: {
      projectId,
      title: '',
      description: '',
      status: 'backlog',
      priority: 'none',
    },
    onSuccess,
  });

  return (
    <div class={styles.overlay}>
      <div
        class={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="New Issue"
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <h3 class={styles.title}>New Issue</h3>
        <form action={createForm.action} method={createForm.method} onSubmit={createForm.onSubmit}>
          <input type="hidden" name="projectId" value={projectId} />

          <div class={styles.field}>
            <label class={styles.label} htmlFor="issue-title">
              Title
            </label>
            <input class={styles.input} id="issue-title" name="title" placeholder="Issue title" />
            {createForm.title.error && <span class={styles.error}>{createForm.title.error}</span>}
          </div>

          <div class={styles.field}>
            <label class={styles.label} htmlFor="issue-description">
              Description
            </label>
            <textarea
              class={styles.textarea}
              id="issue-description"
              name="description"
              placeholder="Optional description"
            />
          </div>

          <div class={styles.field}>
            <label class={styles.label} htmlFor="issue-priority">
              Priority
            </label>
            <select class={styles.select} id="issue-priority" name="priority">
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <footer class={styles.footer}>
            <button type="button" class={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" class={styles.submitBtn} disabled={createForm.submitting}>
              {createForm.submitting ? 'Creating...' : 'Create Issue'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
