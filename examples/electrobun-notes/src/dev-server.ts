/**
 * Browser Development Server for Electrobun Notes
 *
 * Uses @vertz/ui-server's createBunDevServer for:
 * - SSR + HMR in a single Bun.serve()
 * - API routes via @vertz/server handler
 * - SQLite for local persistence
 *
 * Usage:
 *   bun run dev
 */

import { createServer } from '@vertz/server';
import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';
import { createNotesDb } from './api/db';
import { notes } from './api/entities/notes.entity';

const PORT = Number(process.env.PORT) || (3100 + Math.floor(Math.random() * 900));

const db = await createNotesDb();

const app = createServer({
  basePath: '/api',
  entities: [notes],
  db,
});

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port: PORT,
  ssrModule: true,
  title: 'Vertz Notes — E2E Type Safety Demo',
  apiHandler: app.handler,
});

console.log(`
  Vertz Notes Dev Server (SSR+HMR)

  Local:  http://localhost:${PORT}
  API:    http://localhost:${PORT}/api

  Endpoints:
  • GET    /api/notes         List all notes
  • GET    /api/notes/:id     Get a note
  • POST   /api/notes         Create a note
  • PATCH  /api/notes/:id     Update a note
  • DELETE /api/notes/:id     Delete a note
`);

await devServer.start();
