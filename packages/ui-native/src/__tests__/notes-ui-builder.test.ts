import { describe, expect, it } from 'bun:test';
import type { Note } from '../app/notes-store';
import { buildNotesUI } from '../app/notes-ui-builder';
import { NativeElement, NativeTextNode } from '../native-element';

/** Recursively collect all text content in an element tree. */
function collectText(el: NativeElement): string[] {
  const texts: string[] = [];
  for (const child of el.children) {
    if (child instanceof NativeTextNode) {
      texts.push(child.data);
    } else if (child instanceof NativeElement) {
      texts.push(...collectText(child));
    }
  }
  return texts;
}

/** Find elements with a specific attribute value. */
function findByAttribute(el: NativeElement, attr: string, value: string): NativeElement[] {
  const results: NativeElement[] = [];
  if (el.getAttribute(attr) === value) results.push(el);
  for (const child of el.children) {
    if (child instanceof NativeElement) {
      results.push(...findByAttribute(child, attr, value));
    }
  }
  return results;
}

describe('buildNotesUI', () => {
  const noopCallbacks = { onCreate: () => {}, onDelete: () => {} };

  describe('Given an empty notes list', () => {
    it('Then renders the header with app title', () => {
      const root = buildNotesUI([], noopCallbacks);
      const texts = collectText(root);
      expect(texts.some((t) => t.includes('Vertz Notes'))).toBe(true);
    });

    it('Then renders empty state message', () => {
      const root = buildNotesUI([], noopCallbacks);
      const texts = collectText(root);
      expect(texts.some((t) => t.includes('No notes'))).toBe(true);
    });

    it('Then renders a create button', () => {
      const root = buildNotesUI([], noopCallbacks);
      const texts = collectText(root);
      expect(texts.some((t) => t.includes('Add Note'))).toBe(true);
    });
  });

  describe('Given a list of notes', () => {
    const notes: Note[] = [
      { id: '1', title: 'First Note', content: 'Hello World' },
      { id: '2', title: 'Second Note', content: 'Goodbye World' },
    ];

    it('Then renders note titles', () => {
      const root = buildNotesUI(notes, noopCallbacks);
      const texts = collectText(root);
      expect(texts).toContain('First Note');
      expect(texts).toContain('Second Note');
    });

    it('Then renders note content', () => {
      const root = buildNotesUI(notes, noopCallbacks);
      const texts = collectText(root);
      expect(texts).toContain('Hello World');
      expect(texts).toContain('Goodbye World');
    });

    it('Then renders a delete button for each note', () => {
      const root = buildNotesUI(notes, noopCallbacks);
      const deleteButtons = findByAttribute(root, 'data-action', 'delete');
      expect(deleteButtons).toHaveLength(2);
    });

    it('Then attaches click handler to create button', () => {
      const root = buildNotesUI(notes, {
        onCreate: () => {},
        onDelete: () => {},
      });
      const createButtons = findByAttribute(root, 'data-action', 'create');
      expect(createButtons).toHaveLength(1);
      expect(createButtons[0].listenerCount('click')).toBe(1);
    });

    it('Then attaches click handler to delete buttons with note id', () => {
      const deletedIds: string[] = [];
      const root = buildNotesUI(notes, {
        onCreate: () => {},
        onDelete: (id) => {
          deletedIds.push(id);
        },
      });
      const deleteButtons = findByAttribute(root, 'data-action', 'delete');
      // Simulate click on first delete button
      deleteButtons[0].dispatchEvent('click', {});
      expect(deletedIds).toEqual(['1']);
    });
  });

  describe('Given the footer', () => {
    it('Then shows note count', () => {
      const notes: Note[] = [
        { id: '1', title: 'A', content: '' },
        { id: '2', title: 'B', content: '' },
        { id: '3', title: 'C', content: '' },
      ];
      const root = buildNotesUI(notes, noopCallbacks);
      const texts = collectText(root);
      expect(texts.some((t) => t.includes('3'))).toBe(true);
    });
  });
});
