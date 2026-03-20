import { s } from '@vertz/schema';
import type { DialogHandle } from '@vertz/ui';
import { css, form, query } from '@vertz/ui';
import { Button } from '@vertz/ui/components';
import { api } from '../api/client';
import { LABEL_COLORS } from '../lib/issue-config';
import type { Label } from '../lib/types';
import { dialogStyles, formStyles, inputStyles, labelStyles } from '../styles/components';

const styles = css({
  list: ['flex', 'flex-col', 'gap:2', 'mb:4', 'max-h:80', 'overflow:hidden'],
  item: ['flex', 'items:center', 'gap:2', 'px:3', 'py:2', 'rounded:md', 'bg:muted'],
  dot: ['w:3', 'h:3', 'rounded:full', 'shrink-0'],
  name: ['flex-1', 'text:sm', 'text:foreground'],
  actions: ['flex', 'gap:1'],
  formContainer: ['flex', 'flex-col', 'gap:3', 'mb:4'],
  colorGrid: ['flex', 'flex-wrap', 'gap:2'],
  colorButton: [
    'w:6',
    'h:6',
    'rounded:full',
    'border:2',
    'border:transparent',
    'cursor:pointer',
    'transition:all',
    'hover:border:foreground',
  ],
  colorSelected: [
    'w:6',
    'h:6',
    'rounded:full',
    'border:2',
    'border:foreground',
    'cursor:pointer',
    'transition:all',
  ],
  empty: ['text:sm', 'text:muted-foreground', 'py:4', 'text:center'],
});

interface ManageLabelsDialogProps {
  projectId: string;
  dialog: DialogHandle<boolean>;
}

export function ManageLabelsDialog({ projectId, dialog }: ManageLabelsDialogProps) {
  const labelsQuery = query(api.labels.list({ projectId }));

  let editingLabel: Label | null = null;
  let isCreating = false;
  let selectedColor = LABEL_COLORS[0].value;

  // --- Two form() instances: one for create, one for update ---

  const resetState = () => {
    editingLabel = null;
    isCreating = false;
    selectedColor = LABEL_COLORS[0].value;
  };

  const createForm = form(api.labels.create, {
    initial: { projectId, name: '', color: LABEL_COLORS[0].value },
    onSuccess: resetState,
  });

  // Bind the update SDK method: form() expects (body) => ..., but api.labels.update
  // takes (id, body). We wrap it so the id is read from editingLabel at submission time.
  const boundUpdate = Object.assign(
    (body: { name: string; color: string }) => api.labels.update(editingLabel?.id ?? '', body),
    { url: api.labels.update.url, method: api.labels.update.method },
  );

  const updateForm = form(boundUpdate, {
    schema: s.object({ name: s.string().min(1), color: s.string().min(1) }),
    initial: () => ({
      name: editingLabel?.name ?? '',
      color: editingLabel?.color ?? LABEL_COLORS[0].value,
    }),
    onSuccess: resetState,
  });

  // Reactive: compiler wraps this as computed() since it reads editingLabel (a signal).
  // The <form> tag binds to whichever form is active — action, method, onSubmit all swap.
  const activeForm = editingLabel ? updateForm : createForm;

  const handleDelete = async (labelId: string) => {
    await api.labels.delete(labelId);
  };

  const startEdit = (label: Label) => {
    editingLabel = label;
    selectedColor = label.color;
    isCreating = true;
  };

  const startCreate = () => {
    resetState();
    isCreating = true;
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dialog overlay backdrop
    <div
      className={dialogStyles.overlay}
      data-state="open"
      role="presentation"
      onClick={(e: MouseEvent) => {
        if (e.target === e.currentTarget) dialog.close(true);
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Escape') dialog.close(true);
      }}
    >
      <div
        className={dialogStyles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Manage Labels"
        data-state="open"
      >
        <h3 className={dialogStyles.title}>Manage Labels</h3>

        <div className={styles.list}>
          {labelsQuery.data?.items.length === 0 && !labelsQuery.loading && (
            <div className={styles.empty}>No labels yet. Create one below.</div>
          )}
          {(labelsQuery.data?.items ?? []).map((label) => (
            <div className={styles.item} key={label.id}>
              <span className={styles.dot} style={`background-color: ${label.color}`} />
              <span className={styles.name}>{label.name}</span>
              <div className={styles.actions}>
                <Button intent="ghost" size="sm" onClick={() => startEdit(label as Label)}>
                  Edit
                </Button>
                <Button intent="ghost" size="sm" onClick={() => handleDelete(label.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>

        {isCreating && (
          <form
            action={activeForm.action}
            method={activeForm.method}
            onSubmit={activeForm.onSubmit}
            className={styles.formContainer}
          >
            {!editingLabel && <input type="hidden" name="projectId" value={projectId} />}
            <input type="hidden" name="color" value={selectedColor} />
            <div className={formStyles.field}>
              <label className={labelStyles.base} htmlFor="label-name">
                Name
              </label>
              <input
                className={inputStyles.base}
                id="label-name"
                name="name"
                placeholder="Label name"
              />
              {activeForm.name.error && (
                <span className={formStyles.error}>{activeForm.name.error}</span>
              )}
            </div>
            <div className={styles.colorGrid}>
              {LABEL_COLORS.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  className={c.value === selectedColor ? styles.colorSelected : styles.colorButton}
                  style={`background-color: ${c.value}`}
                  aria-label={c.name}
                  onClick={() => {
                    selectedColor = c.value;
                  }}
                />
              ))}
            </div>
            <div className={dialogStyles.footer}>
              <Button intent="outline" size="sm" onClick={resetState}>
                Cancel
              </Button>
              <Button
                type="submit"
                intent="primary"
                size="sm"
                disabled={activeForm.submitting.value}
              >
                {editingLabel
                  ? activeForm.submitting
                    ? 'Updating...'
                    : 'Update'
                  : activeForm.submitting
                    ? 'Creating...'
                    : 'Create'}
              </Button>
            </div>
          </form>
        )}

        <footer className={dialogStyles.footer}>
          {!isCreating && (
            <Button intent="outline" size="sm" onClick={startCreate}>
              New Label
            </Button>
          )}
          <Button intent="primary" size="sm" onClick={() => dialog.close(true)}>
            Done
          </Button>
        </footer>
      </div>
    </div>
  );
}
