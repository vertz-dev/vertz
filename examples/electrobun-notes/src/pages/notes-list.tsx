import { css, query, queryMatch } from '@vertz/ui';
import type { NotesResponse } from '../api/client';
import { api } from '../api/client';
import { NoteForm } from '../components/note-form';
import { NoteItem } from '../components/note-item';
import { emptyStateStyles } from '../styles/components';

const pageStyles = css({
  container: ['py:2', 'w:full'],
  listContainer: ['flex', 'flex-col', 'gap:2', 'mt:6', 'w:full'],
  notesList: ['flex', 'flex-col', 'gap:2'],
  loading: ['text:muted-foreground'],
  error: ['text:destructive'],
});

export function NotesListPage() {
  const notesQuery = query(api.notes.list());

  return (
    <div class={pageStyles.container} data-testid="notes-list-page">
      <NoteForm />

      <div class={pageStyles.listContainer}>
        {queryMatch(notesQuery, {
          loading: () => (
            <div data-testid="loading" class={pageStyles.loading}>
              Loading notes...
            </div>
          ),
          error: (err) => (
            <div class={pageStyles.error} data-testid="error">
              {err instanceof Error ? err.message : String(err)}
            </div>
          ),
          data: (response) => (
            <>
              {response.items.length === 0 && (
                <div class={emptyStateStyles.container}>
                  <h3 class={emptyStateStyles.heading}>No notes yet</h3>
                  <p class={emptyStateStyles.description}>
                    Add your first note above to get started.
                  </p>
                </div>
              )}
              <div data-testid="notes-list" class={pageStyles.notesList}>
                {response.items.map((note: NotesResponse) => (
                  <NoteItem
                    key={note.id}
                    id={note.id}
                    title={note.title}
                    content={note.content}
                  />
                ))}
              </div>
            </>
          ),
        })}
      </div>
    </div>
  );
}
