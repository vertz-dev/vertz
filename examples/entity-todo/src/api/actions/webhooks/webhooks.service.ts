import { s } from '@vertz/schema';
import { service } from '@vertz/server';
import { todos } from '../../entities/todos/todos.entity';

const webhookEvents = ['task.created', 'task.completed'] as const;

const syncBody = s.object({
  event: s.enum(webhookEvents),
  task: s.object({
    externalId: s.string(),
    title: s.string(),
    completed: s.boolean(),
  }),
});

const syncResponse = s.object({
  ok: s.boolean(),
  todoId: s.string().optional(),
});

export const webhooks = service('webhooks', {
  inject: { todos },
  // Open access for demo — production would validate a webhook secret header
  access: { sync: () => true },
  actions: {
    sync: {
      body: syncBody,
      response: syncResponse,
      handler: async (input, ctx) => {
        if (input.event === 'task.created') {
          const created = await ctx.entities.todos.create({
            title: input.task.title,
            completed: input.task.completed,
          });
          return { ok: true, todoId: created.id as string };
        }

        // task.completed — find by title and mark complete
        const existing = await ctx.entities.todos.list({
          where: { title: input.task.title },
        });
        const match = (existing.items as Record<string, unknown>[])[0];
        if (!match) {
          return { ok: false };
        }
        await ctx.entities.todos.update(match.id as string, { completed: true });
        return { ok: true, todoId: match.id as string };
      },
    },
  },
});
