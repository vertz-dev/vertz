import { entity, rules } from '@vertz/server';
import { labelsModel } from '../schema';

export const labels = entity('labels', {
  model: labelsModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    update: rules.authenticated(),
    delete: rules.authenticated(),
  },
});
