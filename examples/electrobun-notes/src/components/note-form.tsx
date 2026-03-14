import { css, form } from '@vertz/ui';
import type { NotesResponse } from '../api/client';
import { api } from '../api/client';
import { button, formStyles, inputStyles } from '../styles/components';

const styles = css({
  row: ['flex', 'gap:2', 'items:start', 'w:full'],
  inputWrap: ['flex-1'],
});

export interface NoteFormProps {
  onSuccess?: (note: NotesResponse) => void;
}

export function NoteForm({ onSuccess }: NoteFormProps = {}) {
  const noteForm = form(api.notes.create, {
    onSuccess,
    resetOnSuccess: true,
  });

  return (
    <form
      action={noteForm.action}
      method={noteForm.method}
      onSubmit={noteForm.onSubmit}
      data-testid="create-note-form"
    >
      <div class={styles.row}>
        <div class={styles.inputWrap}>
          <input
            class={inputStyles.base}
            name={noteForm.fields.title}
            type="text"
            placeholder="Note title"
            data-testid="note-title-input"
          />
          <span class={formStyles.error} data-testid="title-error">
            {noteForm.title.error}
          </span>
        </div>
        <button
          type="submit"
          class={button({ intent: 'primary', size: 'md' })}
          data-testid="submit-note"
          disabled={noteForm.submitting}
        >
          {noteForm.submitting.value ? 'Saving...' : 'Add Note'}
        </button>
      </div>
    </form>
  );
}
