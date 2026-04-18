import type { DialogHandle } from '@vertz/ui';
import { css, form, query, token, useDialogStack } from '@vertz/ui';
import { Button, Dialog } from '@vertz/ui/components';
import { api } from '../api/client';
import { LABEL_COLORS } from '../lib/issue-config';
import type { Label } from '../lib/types';
import { formStyles, inputStyles, labelStyles } from '../styles/components';

const styles = css({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[2],
    marginBottom: token.spacing[4],
    maxHeight: token.spacing[80],
    overflowY: 'auto',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[2],
    borderRadius: token.radius.md,
    backgroundColor: token.color.muted,
  },
  dot: {
    width: token.spacing[3],
    height: token.spacing[3],
    borderRadius: token.radius.full,
    flexShrink: '0',
  },
  name: { flex: '1 1 0%', fontSize: token.font.size.sm, color: token.color.foreground },
  actions: { display: 'flex', gap: token.spacing[1] },
  formContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[3],
    marginBottom: token.spacing[4],
  },
  colorGrid: { display: 'flex', flexWrap: 'wrap', gap: token.spacing[2] },
  colorButton: {
    width: token.spacing[6],
    height: token.spacing[6],
    borderRadius: token.radius.full,
    borderWidth: '2px',
    borderColor: 'transparent',
    cursor: 'pointer',
    transition: 'all',
    '&:hover': { borderColor: token.color.foreground },
  },
  colorSelected: {
    width: token.spacing[6],
    height: token.spacing[6],
    borderRadius: token.radius.full,
    borderWidth: '2px',
    borderColor: token.color.foreground,
    cursor: 'pointer',
    transition: 'all',
  },
  empty: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    paddingBlock: token.spacing[4],
    textAlign: 'center',
  },
});

interface ManageLabelsDialogProps {
  projectId: string;
  dialog: DialogHandle<void>;
}

export function ManageLabelsDialog({ projectId, dialog }: ManageLabelsDialogProps) {
  const labelsQuery = query(api.labels.list({ where: { projectId } }));
  const dialogs = useDialogStack();

  let editingLabel: Label | null = null;
  let isCreating = false;
  let selectedColor = LABEL_COLORS[0].value;

  const createForm = form(api.labels.create, {
    initial: { projectId, name: '', color: LABEL_COLORS[0].value },
    onSuccess: () => {
      isCreating = false;
      editingLabel = null;
      selectedColor = LABEL_COLORS[0].value;
    },
  });

  const resetForm = () => {
    editingLabel = null;
    isCreating = false;
    selectedColor = LABEL_COLORS[0].value;
  };

  const handleDelete = async (label: Label) => {
    const confirmed = await dialogs.confirm({
      title: `Delete "${label.name}"?`,
      description: 'This label will be removed from all issues. This action cannot be undone.',
      confirm: 'Delete',
      cancel: 'Cancel',
      intent: 'danger',
    });
    if (confirmed) {
      await api.labels.delete(label.id);
    }
  };

  const startEdit = (label: Label) => {
    editingLabel = label;
    selectedColor = label.color;
    isCreating = true;
  };

  const startCreate = () => {
    resetForm();
    isCreating = true;
  };

  const handleUpdate = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!editingLabel) return;
    const formData = new FormData(e.target as HTMLFormElement);
    const name = (formData.get('name') as string)?.trim();
    if (!name) return;
    await api.labels.update(editingLabel.id, { name, color: selectedColor });
    resetForm();
  };

  return (
    <>
      <Dialog.Header>
        <Dialog.Title>Manage Labels</Dialog.Title>
      </Dialog.Header>
      <Dialog.Body>
        <div className={styles.list}>
          {labelsQuery.data?.items.length === 0 && !labelsQuery.loading && (
            <div className={styles.empty}>No labels yet. Create one below.</div>
          )}
          {(labelsQuery.data?.items ?? []).map((label) => (
            <div className={styles.item} key={label.id}>
              <span className={styles.dot} style={{ backgroundColor: label.color }} />
              <span className={styles.name}>{label.name}</span>
              <div className={styles.actions}>
                <Button intent="ghost" size="sm" onClick={() => startEdit(label as Label)}>
                  Edit
                </Button>
                <Button intent="ghost" size="sm" onClick={() => handleDelete(label as Label)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>

        {isCreating && !editingLabel ? (
          <form
            action={createForm.action}
            method={createForm.method}
            onSubmit={createForm.onSubmit}
            className={styles.formContainer}
          >
            <input type="hidden" name="projectId" value={projectId} />
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
              {createForm.name.error && (
                <span className={formStyles.error}>{createForm.name.error}</span>
              )}
            </div>
            <div className={styles.colorGrid}>
              {LABEL_COLORS.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  className={c.value === selectedColor ? styles.colorSelected : styles.colorButton}
                  style={{ backgroundColor: c.value }}
                  aria-label={c.name}
                  onClick={() => {
                    selectedColor = c.value;
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button intent="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button
                type="submit"
                intent="primary"
                size="sm"
                disabled={createForm.submitting.value}
              >
                {createForm.submitting ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </form>
        ) : null}

        {isCreating && editingLabel ? (
          <form onSubmit={handleUpdate} className={styles.formContainer}>
            <div className={formStyles.field}>
              <label className={labelStyles.base} htmlFor="label-name">
                Name
              </label>
              <input
                className={inputStyles.base}
                id="label-name"
                name="name"
                placeholder="Label name"
                value={editingLabel.name}
              />
            </div>
            <div className={styles.colorGrid}>
              {LABEL_COLORS.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  className={c.value === selectedColor ? styles.colorSelected : styles.colorButton}
                  style={{ backgroundColor: c.value }}
                  aria-label={c.name}
                  onClick={() => {
                    selectedColor = c.value;
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button intent="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" intent="primary" size="sm">
                Update
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog.Body>
      <Dialog.Footer>
        {!isCreating ? (
          <Button intent="outline" size="sm" onClick={startCreate}>
            New Label
          </Button>
        ) : null}
        <Button intent="primary" size="sm" onClick={() => dialog.close()}>
          Done
        </Button>
      </Dialog.Footer>
    </>
  );
}
