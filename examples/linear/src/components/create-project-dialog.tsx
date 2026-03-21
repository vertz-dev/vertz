import { s } from '@vertz/schema';
import type { DialogHandle } from '@vertz/ui';
import { form } from '@vertz/ui';
import { Button, Dialog } from '@vertz/ui/components';
import { createProjectsInputSchema } from '#generated/schemas';
import { api } from '../api/client';
import { formStyles, inputStyles, labelStyles } from '../styles/components';

const createProjectSchema = createProjectsInputSchema.extend({
  key: s
    .string()
    .min(1)
    .max(5)
    .regex(/^[A-Z0-9]+$/i),
});

interface CreateProjectDialogProps {
  dialog: DialogHandle<void>;
}

export function CreateProjectDialog({ dialog }: CreateProjectDialogProps) {
  const createForm = form(api.projects.create, {
    schema: createProjectSchema,
    initial: { name: '', key: '', description: '' },
    onSuccess: () => dialog.close(),
  });

  return (
    <>
      <Dialog.Header>
        <Dialog.Title>New Project</Dialog.Title>
      </Dialog.Header>
      <Dialog.Body>
        <form
          id="create-project-form"
          action={createForm.action}
          method={createForm.method}
          onSubmit={createForm.onSubmit}
        >
          <div className={formStyles.field}>
            <label className={labelStyles.base} htmlFor="project-name">
              Name
            </label>
            <input
              className={inputStyles.base}
              id="project-name"
              name="name"
              placeholder="My Project"
            />
            {createForm.name.error && (
              <span className={formStyles.error}>{createForm.name.error}</span>
            )}
          </div>

          <div className={formStyles.field}>
            <label className={labelStyles.base} htmlFor="project-key">
              Key
            </label>
            <input
              className={inputStyles.base}
              id="project-key"
              name="key"
              placeholder="PROJ"
              maxLength={5}
              style={{ textTransform: 'uppercase' }}
            />
            {createForm.key.error && (
              <span className={formStyles.error}>{createForm.key.error}</span>
            )}
          </div>

          <div className={formStyles.field}>
            <label className={labelStyles.base} htmlFor="project-description">
              Description
            </label>
            <textarea
              className={inputStyles.base}
              id="project-description"
              name="description"
              placeholder="Optional description"
              style={{ minHeight: '5rem', resize: 'vertical' }}
            />
          </div>
        </form>
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Cancel>Cancel</Dialog.Cancel>
        <Button
          type="submit"
          form="create-project-form"
          intent="primary"
          size="sm"
          disabled={createForm.submitting.value}
        >
          {createForm.submitting ? 'Creating...' : 'Create Project'}
        </Button>
      </Dialog.Footer>
    </>
  );
}
