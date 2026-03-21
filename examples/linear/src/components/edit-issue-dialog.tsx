import type { DialogHandle } from '@vertz/ui';
import { css } from '@vertz/ui';
import { Button, Dialog } from '@vertz/ui/components';
import { api } from '../api/client';
import { editIssueSchema } from '../lib/edit-issue-schema';
import { PRIORITIES, STATUSES } from '../lib/issue-config';
import type { Issue } from '../lib/types';
import { formStyles, inputStyles, labelStyles } from '../styles/components';

const styles = css({
  formError: ['text:sm', 'text:destructive', 'mb:4'],
});

interface EditIssueDialogProps {
  issue: Issue;
  dialog: DialogHandle<void>;
}

export function EditIssueDialog({ issue, dialog }: EditIssueDialogProps) {
  let submitting = false;
  let formError = '';
  let titleError = '';

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    formError = '';
    titleError = '';

    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());

    const result = editIssueSchema.parse(data);
    if (!result.ok) {
      const err = result.error as Error & {
        issues?: { path: (string | number)[]; message: string }[];
      };
      if (err.issues) {
        for (const issue of err.issues) {
          if (issue.path[0] === 'title') titleError = issue.message;
        }
      }
      formError = titleError || err.message;
      return;
    }

    submitting = true;
    const res = await api.issues.update(issue.id, result.data);
    submitting = false;

    if (!res.ok) {
      formError = 'Failed to save changes';
      return;
    }

    dialog.close();
  };

  return (
    <>
      <Dialog.Header>
        <Dialog.Title>Edit Issue</Dialog.Title>
      </Dialog.Header>
      <Dialog.Body>
        <form id="edit-issue-form" onSubmit={handleSubmit}>
          {formError && <div className={styles.formError}>{formError}</div>}

          <div className={formStyles.field}>
            <label className={labelStyles.base} htmlFor="edit-issue-title">
              Title
            </label>
            <input
              className={inputStyles.base}
              id="edit-issue-title"
              name="title"
              value={issue.title}
              placeholder="Issue title"
            />
            {titleError && <span className={formStyles.error}>{titleError}</span>}
          </div>

          <div className={formStyles.field}>
            <label className={labelStyles.base} htmlFor="edit-issue-description">
              Description
            </label>
            <textarea
              className={inputStyles.base}
              id="edit-issue-description"
              name="description"
              placeholder="Optional description"
              style={{ minHeight: '5rem', resize: 'vertical' }}
            >
              {issue.description ?? ''}
            </textarea>
          </div>

          <div className={formStyles.field}>
            <label className={labelStyles.base} htmlFor="edit-issue-status">
              Status
            </label>
            <select
              className={formStyles.select}
              id="edit-issue-status"
              name="status"
              value={issue.status}
            >
              {STATUSES.map((s) => (
                <option value={s.value} key={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className={formStyles.field}>
            <label className={labelStyles.base} htmlFor="edit-issue-priority">
              Priority
            </label>
            <select
              className={formStyles.select}
              id="edit-issue-priority"
              name="priority"
              value={issue.priority}
            >
              {PRIORITIES.map((p) => (
                <option value={p.value} key={p.value}>
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
          form="edit-issue-form"
          intent="primary"
          size="sm"
          disabled={submitting}
        >
          {submitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </Dialog.Footer>
    </>
  );
}
