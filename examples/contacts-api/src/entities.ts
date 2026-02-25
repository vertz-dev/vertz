import { entity } from '@vertz/server';
import { contactsModel } from './schema';

export const contacts = entity('contacts', {
  model: contactsModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
});
