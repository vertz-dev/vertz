/**
 * Unified Development Server for Entity Todo
 *
 * Uses @vertz/ui-server's createBunDevServer for:
 * - SSR + HMR in a single Bun.serve() — dev matches production
 * - API routes via @vertz/server handler
 * - SQLite for local persistence
 *
 * Usage:
 *   bun run dev
 */

import { createServer } from '@vertz/server';
import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';
import { createTodosDb } from './db';
import { todos } from './entities';

const PORT = Number(process.env.PORT) || 3000;

// ============================================================================
// Database Setup (SQLite for local dev)
// ============================================================================

const todosDbAdapter = createTodosDb();

// ============================================================================
// API Server Setup
// ============================================================================

const app = createServer({
  basePath: '/api',
  entities: [todos],
  db: todosDbAdapter,
});

// ============================================================================
// Dev Server
// ============================================================================

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port: PORT,
  ssrModule: true,
  title: 'Entity Todo — vertz full-stack demo',
  apiHandler: app.handler,
  openapi: {
    specPath: './.vertz/generated/openapi.json',
  },
});

console.log(`
╔═════════════════════════════════════════════════════════════╗
║                                                             ║
║   Vertz Dev Server (SSR+HMR)                                ║
║                                                             ║
║   Local:    http://localhost:${PORT}                        ║
║   API:      http://localhost:${PORT}/api                    ║
║   OpenAPI:  http://localhost:${PORT}/api/openapi.json       ║
║                                                             ║
║   Stack:                                                   ║
║   • Bun.serve() (SSR+HMR) ✅                               ║
║   • @vertz/server (API routes) ✅                          ║
║   • SQLite (local persistence) ✅                          ║
║   • OpenAPI spec ✅                                       ║
║                                                             ║
║   Available API endpoints:                                 ║
║   • GET    /api/todos         List all todos              ║
║   • GET    /api/todos/:id     Get a todo                 ║
║   • POST   /api/todos         Create a todo              ║
║   • PATCH  /api/todos/:id     Update a todo              ║
║   • DELETE /api/todos/:id     Delete a todo              ║
║                                                             ║
╚═════════════════════════════════════════════════════════════╝
`);

await devServer.start();
