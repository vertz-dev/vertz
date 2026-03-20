import { s } from '@vertz/schema';
import type { DialogHandle } from '@vertz/ui';
import { form } from '@vertz/ui';
import { Button } from '@vertz/ui/components';
import { createProjectsInputSchema } from '#generated/schemas';
import { api } from '../api/client';
import { dialogStyles, formStyles, inputStyles, labelStyles } from '../styles/components';

const createProjectSchema = createProjectsInputSchema.extend({
  key: s
    .string()
    .min(1)
    .max(5)
    .regex(/^[A-Z0-9]+$/i),
});

interface CreateProjectDialogProps {
  dialog: DialogHandle<boolean>;
}

export function CreateProjectDialog({ dialog }: CreateProjectDialogProps) {
  const createForm = form(api.projects.create, {
    schema: createProjectSchema,
    initial: { name: '', key: '', description: '' },
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
        aria-label="New Project"
        data-state="open"
      >
        <h3 className={dialogStyles.title}>New Project</h3>
        <form action={createForm.action} method={createForm.method} onSubmit={createForm.onSubmit}>
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

          <footer className={dialogStyles.footer}>
            <Button intent="outline" size="sm" onClick={() => dialog.close(false)}>
              Cancel
            </Button>
            <Button type="submit" intent="primary" size="sm" disabled={createForm.submitting.value}>
              {createForm.submitting ? 'Creating...' : 'Create Project'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
