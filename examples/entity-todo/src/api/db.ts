/**
 * SQLite database setup for entity-todo.
 *
 * Uses createDb from @vertz/db with local SQLite path — no manual SQL/CRUD boilerplate.
 */

import { createDb } from '@vertz/db';
import { todosModel } from './schema';

export const db = createDb({
  models: { todos: todosModel },
  dialect: 'sqlite',
  path: '.vertz/data/app.db',
  migrations: { autoApply: true },
});
