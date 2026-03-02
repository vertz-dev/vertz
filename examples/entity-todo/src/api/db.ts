/**
 * SQLite database setup for entity-todo.
 *
 * Uses createSqliteAdapter from @vertz/db/sqlite - no manual SQL/CRUD boilerplate.
 */

import { createSqliteAdapter } from '@vertz/db/sqlite';
import { todosTable } from './schema';

export const db = await createSqliteAdapter({
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
