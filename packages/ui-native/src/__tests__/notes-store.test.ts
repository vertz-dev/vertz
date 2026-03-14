import { describe, expect, it } from 'bun:test';
import { createNotesStore } from '../app/notes-store';

describe('NotesStore', () => {
  describe('Given a new store', () => {
    it('Then starts with an empty list', () => {
      const store = createNotesStore();
      expect(store.list()).toEqual([]);
    });
  });

  describe('Given a store with notes', () => {
    it('Then creates a note with title and content', () => {
      const store = createNotesStore();
      const note = store.create('Test Title', 'Test Content');
      expect(note.title).toBe('Test Title');
      expect(note.content).toBe('Test Content');
      expect(note.id).toBeDefined();
    });

    it('Then lists all notes', () => {
      const store = createNotesStore();
      store.create('Note 1', 'Content 1');
      store.create('Note 2', 'Content 2');
      const notes = store.list();
      expect(notes).toHaveLength(2);
      expect(notes[0].title).toBe('Note 1');
      expect(notes[1].title).toBe('Note 2');
    });

    it('Then deletes a note by id', () => {
      const store = createNotesStore();
      const note = store.create('To Delete', '');
      store.create('To Keep', '');
      store.delete(note.id);
      const notes = store.list();
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('To Keep');
    });

    it('Then assigns unique ids', () => {
      const store = createNotesStore();
      const a = store.create('A', '');
      const b = store.create('B', '');
      expect(a.id).not.toBe(b.id);
    });
  });
});
