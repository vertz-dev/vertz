import type { DialogHandle } from '@vertz/ui';
import { css, query } from '@vertz/ui';
import { Button } from '@vertz/ui/components';
import { api } from '../api/client';
import { LABEL_COLORS } from '../lib/issue-config';
import type { Label } from '../lib/types';
import { dialogStyles, inputStyles } from '../styles/components';

const styles = css({
  list: ['flex', 'flex-col', 'gap:2', 'mb:4', 'max-h:80', 'overflow-y:auto'],
  item: ['flex', 'items:center', 'gap:2', 'px:3', 'py:2', 'rounded:md', 'bg:muted/50'],
  dot: ['w:3', 'h:3', 'rounded:full', 'shrink-0'],
  name: ['flex-1', 'text:sm', 'text:foreground'],
  actions: ['flex', 'gap:1'],
  form: ['flex', 'flex-col', 'gap:3', 'mb:4'],
  colorGrid: ['flex', 'flex-wrap', 'gap:2'],
  colorButton: [
    'w:6',
    'h:6',
    'rounded:full',
    'border:2',
    'border:transparent',
    'cursor:pointer',
    'transition:all',
    'hover:scale-110',
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
  error: ['text:xs', 'text:destructive', 'mt:1'],
});

interface ManageLabelsDialogProps {
  projectId: string;
  dialog: DialogHandle<boolean>;
}

export function ManageLabelsDialog({ projectId, dialog }: ManageLabelsDialogProps) {
  const labelsQuery = query(api.labels.list({ projectId }));

  let editingLabel: Label | null = null;
  let newName = '';
  let newColor = LABEL_COLORS[0].value;
  let error = '';
  let isCreating = false;

  const resetForm = () => {
    editingLabel = null;
    newName = '';
    newColor = LABEL_COLORS[0].value;
    error = '';
    isCreating = false;
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      error = 'Name is required';
      return;
    }
    const res = await api.labels.create({ projectId, name: newName.trim(), color: newColor });
    if (res.ok) {
      resetForm();
      labelsQuery.refetch();
    } else {
      error = 'Failed to create label';
    }
  };

  const handleUpdate = async () => {
    if (!editingLabel || !newName.trim()) {
      error = 'Name is required';
      return;
    }
    const res = await api.labels.update(editingLabel.id, { name: newName.trim(), color: newColor });
    if (res.ok) {
      resetForm();
      labelsQuery.refetch();
    } else {
      error = 'Failed to update label';
    }
  };

  const handleDelete = async (labelId: string) => {
    const res = await api.labels.delete(labelId);
    if (res.ok) labelsQuery.refetch();
  };

  const startEdit = (label: Label) => {
    editingLabel = label;
    newName = label.name;
    newColor = label.color;
    isCreating = true;
    error = '';
  };

  const startCreate = () => {
    resetForm();
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
          <div className={styles.form}>
            <input
              className={inputStyles.base}
              value={newName}
              onInput={(e: InputEvent) => {
                newName = (e.target as HTMLInputElement).value;
              }}
              placeholder="Label name"
            />
            <div className={styles.colorGrid}>
              {LABEL_COLORS.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  className={c.value === newColor ? styles.colorSelected : styles.colorButton}
                  style={`background-color: ${c.value}`}
                  aria-label={c.name}
                  onClick={() => {
                    newColor = c.value;
                  }}
                />
              ))}
            </div>
            {error && <span className={styles.error}>{error}</span>}
            <div className={dialogStyles.footer}>
              <Button intent="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button
                intent="primary"
                size="sm"
                onClick={editingLabel ? handleUpdate : handleCreate}
              >
                {editingLabel ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
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
