/**
 * D1 database adapter for entity-todo.
 *
 * Uses createD1Adapter from @vertz/db/d1 - no manual SQL/CRUD boilerplate.
 * This adapter is used in the Cloudflare Worker (worker.ts).
 * For local development with bun:sqlite, see db.ts instead.
 */

import type { D1DatabaseBinding } from '@vertz/db/d1';
import { createD1Adapter } from '@vertz/db/d1';
import { todosTable } from './schema';

export type { D1DatabaseBinding };

/**
 * Create a D1-based EntityDbAdapter for the todos entity.
 *
 * NOTE: For production D1 deployments, migrations should be run via
 * `wrangler d1 migrations apply` during deployment, NOT at runtime.
 * Set `migrations.autoApply: false` for production.
 */
export function createD1DbAdapter(d1: D1DatabaseBinding) {
  return createD1Adapter({
    schema: todosTable,
    d1,
    migrations: { autoApply: false }, // migrations should run via wrangler
  });
}
