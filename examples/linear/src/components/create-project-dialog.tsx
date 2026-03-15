import type { DialogHandle, FormSchema } from '@vertz/ui';
import { form } from '@vertz/ui';
import type { CreateProjectsInput } from '../api/client';
import { api } from '../api/client';
import { dialogStyles, formStyles, inputStyles, labelStyles } from '../styles/components';
import { Button } from './button';

const createProjectSchema: FormSchema<CreateProjectsInput> = {
  parse(data: unknown) {
    if (typeof data !== 'object' || data === null) {
      return { ok: false as const, error: new Error('Invalid form data') };
    }
    const obj = data as Record<string, unknown>;
    const errors: Record<string, string> = {};

    if (!obj.name || typeof obj.name !== 'string' || obj.name.trim().length === 0) {
      errors.name = 'Name is required';
    }

    if (!obj.key || typeof obj.key !== 'string' || obj.key.trim().length === 0) {
      errors.key = 'Key is required';
    } else if (obj.key.length > 5) {
      errors.key = 'Key must be 5 characters or fewer';
    } else if (!/^[A-Z0-9]+$/i.test(obj.key)) {
      errors.key = 'Key must contain only letters and numbers';
    }

    if (Object.keys(errors).length > 0) {
      const err = new Error('Validation failed');
      (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = errors;
      return { ok: false as const, error: err };
    }

    return {
      ok: true as const,
      data: {
        name: (obj.name as string).trim(),
        key: (obj.key as string).trim().toUpperCase(),
        description: obj.description ? String(obj.description).trim() : undefined,
      },
    };
  },
};

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
        aria-label="New Project"
        data-state="open"
      >
        <h3 class={dialogStyles.title}>New Project</h3>
        <form action={createForm.action} method={createForm.method} onSubmit={createForm.onSubmit}>
          <div class={formStyles.field}>
            <label class={labelStyles.base} htmlFor="project-name">
              Name
            </label>
            <input
              class={inputStyles.base}
              id="project-name"
              name="name"
              placeholder="My Project"
            />
            {createForm.name.error && <span class={formStyles.error}>{createForm.name.error}</span>}
          </div>

          <div class={formStyles.field}>
            <label class={labelStyles.base} htmlFor="project-key">
              Key
            </label>
            <input
              class={inputStyles.base}
              id="project-key"
              name="key"
              placeholder="PROJ"
              maxLength={5}
              style="text-transform: uppercase"
            />
            {createForm.key.error && <span class={formStyles.error}>{createForm.key.error}</span>}
          </div>

          <div class={formStyles.field}>
            <label class={labelStyles.base} htmlFor="project-description">
              Description
            </label>
            <textarea
              class={inputStyles.base}
              id="project-description"
              name="description"
              placeholder="Optional description"
              style="min-height: 5rem; resize: vertical"
            />
          </div>

          <footer class={dialogStyles.footer}>
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
