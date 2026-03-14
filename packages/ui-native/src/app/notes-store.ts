/**
 * Simple in-memory notes store for the native notes app.
 */

export interface Note {
  id: string;
  title: string;
  content: string;
}

export interface NotesStore {
  list(): Note[];
  create(title: string, content: string): Note;
  delete(id: string): void;
}

let nextId = 1;

export function createNotesStore(): NotesStore {
  const notes: Note[] = [];

  return {
    list() {
      return [...notes];
    },

    create(title: string, content: string): Note {
      const note: Note = { id: String(nextId++), title, content };
      notes.push(note);
      return note;
    },

    delete(id: string) {
      const idx = notes.findIndex((n) => n.id === id);
      if (idx !== -1) notes.splice(idx, 1);
    },
  };
}
