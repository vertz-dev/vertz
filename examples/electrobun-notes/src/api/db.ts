import path from 'node:path';
import { createSqliteAdapter } from '@vertz/db/sqlite';
import { notesTable } from './schema';

export async function createNotesDb() {
  return await createSqliteAdapter({
    schema: notesTable,
    dbPath: path.join(import.meta.dir, '..', '..', 'data', 'notes.db'),
    migrations: { autoApply: true },
  });
}

export async function createInMemoryDb() {
  return await createSqliteAdapter({
    schema: notesTable,
    dbPath: ':memory:',
    migrations: { autoApply: true },
  });
}
