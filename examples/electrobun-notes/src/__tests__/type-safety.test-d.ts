/**
 * Type-level tests — validated by `tsc --noEmit`.
 * Each @ts-expect-error must be "used" (the error must exist) for the test to pass.
 * If a @ts-expect-error is "unused", tsc reports an error — meaning the type is too loose.
 */

import { createClient } from '#generated';

const api = createClient();

// --- Input shape: positive tests ---

// Valid create: title required, content optional
api.notes.create({ title: 'Hello' });
api.notes.create({ title: 'Hello', content: 'World' });

// Valid update: all fields optional
api.notes.update('id', { title: 'New Title' });
api.notes.update('id', { content: 'New Content' });

// Valid list
api.notes.list();

// Valid get
api.notes.get('some-id');

// Valid delete
api.notes.delete('some-id');

// --- Input shape: negative tests ---

// @ts-expect-error — 'titlee' typo: does not exist on CreateNotesInput
api.notes.create({ titlee: 'test' });

// @ts-expect-error — title must be string, not number
api.notes.create({ title: 123 });

// @ts-expect-error — 'completed' field doesn't exist on notes schema
api.notes.update('id', { completed: true });

// @ts-expect-error — 'foo' is not a valid field on CreateNotesInput
api.notes.create({ title: 'x', foo: 'bar' });

// --- Response shape: negative tests ---

async function _checkResponseTypes() {
  const result = await api.notes.get('id');
  if (result.ok) {
    // Positive: these fields exist on NotesResponse
    const _title: string = result.data.title;
    const _content: string = result.data.content;
    const _id: string = result.data.id;

    // @ts-expect-error — 'completed' does not exist on NotesResponse
    const _bad = result.data.completed;

    // @ts-expect-error — 'nonexistent' does not exist on NotesResponse
    const _bad2 = result.data.nonexistent;
  }
}

async function _checkListResponseTypes() {
  const result = await api.notes.list();
  if (result.ok) {
    const note = result.data.items[0];

    // Positive: these fields exist
    const _title: string = note.title;
    const _content: string = note.content;

    // @ts-expect-error — 'missing' does not exist on NotesResponse
    const _bad = note.missing;
  }
}
