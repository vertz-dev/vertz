import { d } from '@vertz/db';

// Tables
export const tasksTable = d.table('tasks', {
  id: d.uuid().primary({ generate: 'uuid' }),
  title: d.text(),
  description: d.text(),
  status: d.text().default('todo'),
  priority: d.text().default('medium'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

// Models
export const tasksModel = d.model(tasksTable);
