import { d } from '@vertz/db';

export const contactsTable = d.table('contacts', {
  id: d.uuid().primary({ generate: 'uuid' }),
  name: d.text(),
  email: d.text().nullable(),
  phone: d.text().nullable(),
  notes: d.text().nullable(),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

export const contactsModel = d.model(contactsTable);
