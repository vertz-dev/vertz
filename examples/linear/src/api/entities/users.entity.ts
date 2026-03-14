import { entity, rules } from '@vertz/server';
import { usersModel } from '../schema';

export const users = entity('users', {
  model: usersModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.public,
    update: rules.all(rules.authenticated(), rules.where({ id: rules.user.id })),
    delete: rules.all(rules.authenticated(), rules.where({ id: rules.user.id })),
  },
});
