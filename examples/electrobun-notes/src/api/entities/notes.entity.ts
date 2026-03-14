import { entity, rules } from '@vertz/server';
import { notesModel } from '../schema';

export const notes = entity('notes', {
  model: notesModel,
  access: {
    list: rules.public,
    get: rules.public,
    create: rules.public,
    update: rules.public,
    delete: rules.public,
  },
});
