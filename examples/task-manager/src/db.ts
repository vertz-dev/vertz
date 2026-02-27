/**
 * SQLite database setup for task-manager.
 *
 * Uses createSqliteAdapter from @vertz/db/sqlite - no manual SQL/CRUD boilerplate.
 */

import { createSqliteAdapter } from '@vertz/db/sqlite';
import { tasksTable } from './schema';

export const db = await createSqliteAdapter({
  schema: tasksTable,
  migrations: { autoApply: true },
});

/**
 * Create the tasks database adapter.
 * For backward compatibility - returns the same adapter instance.
 */
export function createTasksDb() {
  return db;
}
