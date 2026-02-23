/**
 * SQLite database setup for entity-todo.
 *
 * Uses the generic createDbProvider from @vertz/db - no manual SQL/CRUD boilerplate.
 */

import { createDbProvider } from '@vertz/db';
import { todosTable } from './schema';

export const db = await createDbProvider({
  dialect: 'sqlite',
  schema: todosTable,
  migrations: { autoApply: true },
});

/**
 * Create the todos database adapter.
 * For backward compatibility - returns the same adapter instance.
 */
export function createTodosDb() {
  return db;
}
