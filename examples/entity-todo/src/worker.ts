/**
 * Cloudflare Worker entry point for entity-todo.
 *
 * Uses D1 database binding for persistent storage.
 * Wires up the entity CRUD operations via createServer.
 */

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
// Worker Fetch Handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Create the D1 database adapter from the environment binding
    const dbAdapter = createD1DbAdapter(env.DB as D1DatabaseBinding);

    // Create the server with the D1-backed entity adapter
    const app = createServer({
      basePath: '/api',
      entities: [todos],
      _entityDbFactory: () => dbAdapter,
    });

    // Use the createHandler to convert the AppBuilder to a Worker fetch handler
    const handler = createHandler(app, { basePath: '/api' });

    return handler.fetch(request, env, ctx);
  },
};
