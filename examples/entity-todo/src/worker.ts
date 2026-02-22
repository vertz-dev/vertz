/**
 * Cloudflare Worker entry point for entity-todo.
 *
 * Uses D1 database binding for persistent storage.
 * Wires up the entity CRUD operations via createServer.
 */

/// <reference types="@cloudflare/workers-types" />

import { createHandler } from '@vertz/cloudflare';
import { createServer } from '@vertz/server';
import { todos } from './entities';
import { createD1DbAdapter, D1DatabaseBinding } from './db-d1';

// ---------------------------------------------------------------------------
// Cloudflare Worker Types (inline for simplicity)
// ---------------------------------------------------------------------------

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all(): Promise<{ results: unknown[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

// ---------------------------------------------------------------------------
// Worker Environment Type
// ---------------------------------------------------------------------------

interface Env {
  DB: D1Database;
}

// ---------------------------------------------------------------------------
// Global adapter (created once, reused across requests)
// ---------------------------------------------------------------------------

let dbAdapter: ReturnType<typeof createD1DbAdapter> | null = null;

/**
 * Get or create the D1 database adapter.
 * Created once at module load time, then reused.
 */
function getDbAdapter(env: Env): ReturnType<typeof createD1DbAdapter> {
  if (!dbAdapter) {
    dbAdapter = createD1DbAdapter(env.DB as D1DatabaseBinding);
  }
  return dbAdapter;
}

// ---------------------------------------------------------------------------
// Worker Fetch Handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Get the shared D1 adapter (created once, reused)
    const adapter = getDbAdapter(env);

    // Create the server with the D1-backed entity adapter
    const app = createServer({
      apiPrefix: '/api',
      entities: [todos],
      _entityDbFactory: () => adapter,
    });

    // Use the createHandler to convert the AppBuilder to a Worker fetch handler
    // Note: Routes are already registered with apiPrefix, so we don't strip basePath
    const handler = createHandler(app);

    return handler.fetch(request, env, ctx);
  },
};
