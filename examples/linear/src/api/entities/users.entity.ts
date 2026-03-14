import { entity, rules } from '@vertz/server';
import { usersModel } from '../schema';

export const users = entity('users', {
  model: usersModel,
  access: {
    list: rules.public,
    get: rules.public,
    create: rules.public,
    update: rules.public,
    delete: rules.public,
  },
});
