/**
 * Development server for task-manager SSR demo.
 * 
 * Uses the @vertz/ui-server dev server abstraction.
 * 
 * Start with: bun src/server.ts
 */

import { createDevServer } from '@vertz/ui-server';

createDevServer({
  entry: '/src/entry-server.ts',
  port: 5173,
}).listen();
