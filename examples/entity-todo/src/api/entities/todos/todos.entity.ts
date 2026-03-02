import { entity } from '@vertz/server';
import { todosModel } from '../../schema';

export const todos = entity('todos', {
  model: todosModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
});
