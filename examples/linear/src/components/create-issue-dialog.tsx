import type { DialogHandle } from '@vertz/ui';
import { form } from '@vertz/ui';
import { Button, Dialog } from '@vertz/ui/components';
import { api } from '../api/client';
import { PRIORITIES } from '../lib/issue-config';
import { formStyles, inputStyles, labelStyles } from '../styles/components';

interface CreateIssueDialogProps {
  projectId: string;
  dialog: DialogHandle<void>;
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
    onSuccess: () => dialog.close(),
  });

  return (
    <>
      <Dialog.Header>
        <Dialog.Title>New Issue</Dialog.Title>
      </Dialog.Header>
      <Dialog.Body>
        <form
          id="create-issue-form"
          action={createForm.action}
          method={createForm.method}
          onSubmit={createForm.onSubmit}
        >
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
        </form>
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Cancel>Cancel</Dialog.Cancel>
        <Button
          type="submit"
          form="create-issue-form"
          intent="primary"
          size="sm"
          disabled={createForm.submitting.value}
        >
          {createForm.submitting ? 'Creating...' : 'Create Issue'}
        </Button>
      </Dialog.Footer>
    </>
  );
}
