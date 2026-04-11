/**
 * D1 database setup for entity-todo.
 *
 * Uses createDb from @vertz/db with Cloudflare D1 binding.
 * This is used in the Cloudflare Worker (worker.ts).
 * For local development with @vertz/sqlite, see db.ts instead.
 */

import type { D1Database } from '@vertz/db';
import { createDb } from '@vertz/db';
import { todosModel } from './schema';

/**
 * Create a D1-backed database client for the todos entity.
 *
 * NOTE: For production D1 deployments, migrations should be run via
 * `wrangler d1 migrations apply` during deployment, NOT at runtime.
 */
export function createD1Db(d1: D1Database) {
  return createDb({
    models: { todos: todosModel },
    dialect: 'sqlite',
    d1,
  });
}
