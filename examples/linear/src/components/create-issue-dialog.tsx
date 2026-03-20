import type { DialogHandle } from '@vertz/ui';
import { form } from '@vertz/ui';
import { Button } from '@vertz/ui/components';
import { api } from '../api/client';
import { PRIORITIES } from '../lib/issue-config';
import { dialogStyles, formStyles, inputStyles, labelStyles } from '../styles/components';

interface CreateIssueDialogProps {
  projectId: string;
  dialog: DialogHandle<boolean>;
}

export function CreateIssueDialog({ projectId, dialog }: CreateIssueDialogProps) {
  const createForm = form(api.issues.create, {
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
      className={dialogStyles.overlay}
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
        className={dialogStyles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="New Issue"
        data-state="open"
      >
        <h3 className={dialogStyles.title}>New Issue</h3>
        <form action={createForm.action} method={createForm.method} onSubmit={createForm.onSubmit}>
          <input type="hidden" name="projectId" value={projectId} />

          <div className={formStyles.field}>
            <label className={labelStyles.base} htmlFor="issue-title">
              Title
            </label>
            <input
              className={inputStyles.base}
              id="issue-title"
              name="title"
              placeholder="Issue title"
            />
            {createForm.title.error && (
              <span className={formStyles.error}>{createForm.title.error}</span>
            )}
          </div>

          <div className={formStyles.field}>
            <label className={labelStyles.base} htmlFor="issue-description">
              Description
            </label>
            <textarea
              className={inputStyles.base}
              id="issue-description"
              name="description"
              placeholder="Optional description"
              style={{ minHeight: '5rem', resize: 'vertical' }}
            />
          </div>

          <div className={formStyles.field}>
            <label className={labelStyles.base} htmlFor="issue-priority">
              Priority
            </label>
            <select className={formStyles.select} id="issue-priority" name="priority">
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <footer className={dialogStyles.footer}>
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
