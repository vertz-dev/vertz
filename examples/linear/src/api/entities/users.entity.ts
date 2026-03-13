import { entity } from '@vertz/server';
import { usersModel } from '../schema';

export const users = entity('users', {
  model: usersModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
});
