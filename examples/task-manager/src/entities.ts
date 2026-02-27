import { entity } from '@vertz/server';
import { tasksModel } from './schema';

export const tasks = entity('tasks', {
  model: tasksModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
});
