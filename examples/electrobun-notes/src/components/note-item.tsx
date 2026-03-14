import type { NotesResponse } from '../api/client';
import { noteItemStyles } from '../styles/components';

export interface NoteItemProps {
  note: Pick<NotesResponse, 'id' | 'title' | 'content'>;
}

export function NoteItem({ note: { id, title, content } }: NoteItemProps) {
  return (
    <div class={noteItemStyles.item} data-testid={`note-item-${id}`}>
      <strong class={noteItemStyles.title}>{title}</strong>
      <p class={noteItemStyles.content}>{content}</p>
    </div>
  );
}
