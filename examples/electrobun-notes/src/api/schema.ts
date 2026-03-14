import { d } from '@vertz/db';

export const notesTable = d.table('notes', {
  id: d.uuid().primary({ generate: 'uuid' }),
  title: d.text(),
  content: d.text().default(''),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

export const notesModel = d.model(notesTable);
