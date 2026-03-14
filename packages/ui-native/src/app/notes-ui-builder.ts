/**
 * Builds a NativeElement tree for the notes app UI.
 *
 * Pure function: takes notes data + callbacks, returns a scene graph.
 * No FFI dependencies — testable without GLFW/GL.
 */

import { rgbaToHex } from '../css/color-utils';
import {
  createNativeTokenResolver,
  defaultDarkTheme,
  type RGBA,
} from '../css/native-token-resolver';
import { NativeElement, NativeTextNode } from '../native-element';
import type { Note } from './notes-store';

export type { Note } from './notes-store';

export interface NotesUICallbacks {
  onCreate: () => void;
  onDelete: (id: string) => void;
}

const resolver = createNativeTokenResolver(defaultDarkTheme);

function color(token: string): string {
  const result = resolver.resolve('bg', token);
  if (result.backgroundColor) return rgbaToHex(result.backgroundColor as RGBA);
  return token;
}

export function buildNotesUI(notes: Note[], callbacks: NotesUICallbacks): NativeElement {
  const root = new NativeElement('div');
  root.setAttribute('style:bg', color('background'));
  root.setAttribute('style:padding', '16');
  root.setAttribute('style:gap', '8');

  // --- Header ---
  const header = new NativeElement('header');
  header.setAttribute('style:bg', color('card'));
  header.setAttribute('style:height', '48');
  header.setAttribute('style:padding', '12');
  header.setAttribute('style:flexDirection', 'row');
  header.appendChild(new NativeTextNode('Vertz Notes — Native'));
  root.appendChild(header);

  // --- Input area label + reserved space for native text fields ---
  const inputLabel = new NativeElement('div');
  inputLabel.setAttribute('style:height', '24');
  inputLabel.appendChild(new NativeTextNode('Create a new note:'));
  root.appendChild(inputLabel);

  // Reserve space for the native NSTextField overlays
  const inputArea = new NativeElement('div');
  inputArea.setAttribute('style:height', '60');
  root.appendChild(inputArea);

  // --- Action bar (create button) ---
  const actionBar = new NativeElement('div');
  actionBar.setAttribute('style:flexDirection', 'row');
  actionBar.setAttribute('style:gap', '8');
  actionBar.setAttribute('style:height', '36');

  const createBtn = new NativeElement('div');
  createBtn.setAttribute('style:bg', color('primary.600'));
  createBtn.setAttribute('style:padding', '8');
  createBtn.setAttribute('style:flexGrow', '1');
  createBtn.setAttribute('data-action', 'create');
  createBtn.appendChild(new NativeTextNode('Add Note'));
  createBtn.addEventListener('click', () => callbacks.onCreate());

  const createBtnHover = color('primary.500');
  const createBtnDefault = color('primary.600');
  createBtn.addEventListener('mouseenter', () => {
    createBtn.setAttribute('style:bg', createBtnHover);
  });
  createBtn.addEventListener('mouseleave', () => {
    createBtn.setAttribute('style:bg', createBtnDefault);
  });

  actionBar.appendChild(createBtn);
  root.appendChild(actionBar);

  // --- Notes list or empty state ---
  const content = new NativeElement('div');
  content.setAttribute('style:bg', color('card'));
  content.setAttribute('style:flexGrow', '1');
  content.setAttribute('style:padding', '12');
  content.setAttribute('style:gap', '8');

  if (notes.length === 0) {
    const emptyState = new NativeElement('div');
    emptyState.setAttribute('style:padding', '24');
    emptyState.setAttribute('style:height', '40');
    emptyState.appendChild(
      new NativeTextNode('No notes yet. Type a title above and click "Add Note".'),
    );
    content.appendChild(emptyState);
  } else {
    for (const note of notes) {
      const card = new NativeElement('div');
      card.setAttribute('style:bg', color('muted'));
      card.setAttribute('style:padding', '10');
      card.setAttribute('style:gap', '6');

      const titleEl = new NativeElement('div');
      titleEl.setAttribute('style:height', '20');
      titleEl.appendChild(new NativeTextNode(note.title));
      card.appendChild(titleEl);

      if (note.content) {
        const contentEl = new NativeElement('div');
        contentEl.setAttribute('style:height', '18');
        contentEl.appendChild(new NativeTextNode(note.content));
        card.appendChild(contentEl);
      }

      const deleteBtn = new NativeElement('div');
      deleteBtn.setAttribute('style:bg', color('destructive'));
      deleteBtn.setAttribute('style:padding', '4');
      deleteBtn.setAttribute('style:height', '24');
      deleteBtn.setAttribute('data-action', 'delete');
      deleteBtn.setAttribute('data-note-id', note.id);
      deleteBtn.appendChild(new NativeTextNode('Delete'));
      deleteBtn.addEventListener('click', () => callbacks.onDelete(note.id));
      card.appendChild(deleteBtn);

      content.appendChild(card);
    }
  }

  root.appendChild(content);

  // --- Footer ---
  const footer = new NativeElement('footer');
  footer.setAttribute('style:bg', color('muted'));
  footer.setAttribute('style:height', '32');
  footer.setAttribute('style:padding', '6');
  footer.appendChild(
    new NativeTextNode(
      `${notes.length} note${notes.length !== 1 ? 's' : ''} · Native renderer · No WebView`,
    ),
  );
  root.appendChild(footer);

  return root;
}
