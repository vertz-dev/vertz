import type { FormSchema } from '@vertz/ui';
import { css, form } from '@vertz/ui';
import { projectApi } from '../api/client';
import type { CreateProjectBody } from '../lib/types';

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

const createProjectSchema: FormSchema<CreateProjectBody> = {
  parse(data: unknown) {
    const obj = data as Record<string, unknown>;
    const errors: Record<string, string> = {};

    if (!obj.name || typeof obj.name !== 'string' || obj.name.trim().length === 0) {
      errors.name = 'Name is required';
    }

    if (!obj.key || typeof obj.key !== 'string' || obj.key.trim().length === 0) {
      errors.key = 'Key is required';
    } else if (obj.key.length > 5) {
      errors.key = 'Key must be 5 characters or fewer';
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
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateProjectDialog({ onClose, onSuccess }: CreateProjectDialogProps) {
  const createForm = form(projectApi.create, {
    schema: createProjectSchema,
    initial: { name: '', key: '', description: '' },
    onSuccess,
  });

  return (
    <div class={styles.overlay}>
      <div class={styles.dialog} role="dialog">
        <h3 class={styles.title}>New Project</h3>
        <form action={createForm.action} method={createForm.method} onSubmit={createForm.onSubmit}>
          <div class={styles.field}>
            <label class={styles.label} htmlFor="project-name">
              Name
            </label>
            <input class={styles.input} id="project-name" name="name" placeholder="My Project" />
            {createForm.name.error && <span class={styles.error}>{createForm.name.error}</span>}
          </div>

          <div class={styles.field}>
            <label class={styles.label} htmlFor="project-key">
              Key
            </label>
            <input
              class={styles.input}
              id="project-key"
              name="key"
              placeholder="PROJ"
              maxLength={5}
              style="text-transform: uppercase"
            />
            {createForm.key.error && <span class={styles.error}>{createForm.key.error}</span>}
          </div>

          <div class={styles.field}>
            <label class={styles.label} htmlFor="project-description">
              Description
            </label>
            <textarea
              class={styles.textarea}
              id="project-description"
              name="description"
              placeholder="Optional description"
            />
          </div>

          <footer class={styles.footer}>
            <button type="button" class={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" class={styles.submitBtn} disabled={createForm.submitting}>
              {createForm.submitting ? 'Creating...' : 'Create Project'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
