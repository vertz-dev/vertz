import { noteItemStyles } from '../styles/components';

export interface NoteItemProps {
  id: string;
  title: string;
  content: string;
}

export function NoteItem({ id, title, content }: NoteItemProps) {
  return (
    <div class={noteItemStyles.item} data-testid={`note-item-${id}`}>
      <strong class={noteItemStyles.title}>{title}</strong>
      <p class={noteItemStyles.content}>{content}</p>
    </div>
  );
}
