import { entity } from '@vertz/server';
import { todosModel } from '../../schema';
import { sendEmail } from '../../services/notifications';

export const todos = entity('todos', {
  model: todosModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  after: {
    create: (result) => {
      sendEmail({
        to: 'team@example.com',
        subject: `New todo created: ${result.title}`,
        body: `A new todo "${result.title}" was created (id: ${result.id}).`,
      });
    },
  },
});
