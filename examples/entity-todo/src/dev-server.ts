/**
 * Unified Development Server for Entity Todo
 *
 * Uses @vertz/ui-server's createDevServer for:
 * - Vite HMR for UI hot-reload
 * - SSR via vite.ssrLoadModule() + renderToString
 * - API routes via custom middleware
 * - SQLite for local persistence
 *
 * Usage: bun run dev
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createDevServer } from '@vertz/ui-server';
import { createServer } from '@vertz/server';
import { todos } from './entities';
import { createTodosDb } from './db';

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
  _entityDbFactory: () => todosDbAdapter,
});

const apiHandler = app.handler;

// ============================================================================
// API Middleware
// ============================================================================

/**
 * Convert Node http IncomingMessage to Web Request
 */
function toWebRequest(req: IncomingMessage): Request {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value.join(', ');
    }
  }

  const host = req.headers.host || `localhost:${PORT}`;
  const protocol = req.socket.encrypted ? 'https' : 'http';
  return new Request(`${protocol}://${host}${req.url || '/'}`, {
    method: req.method || 'GET',
    headers,
  });
}

/**
 * Convert Web Response to Node http response
 */
async function toNodeResponse(res: ServerResponse, webResponse: Response): Promise<void> {
  const headers: Record<string, string> = {};
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });
  
  res.writeHead(webResponse.status, headers);

  const body = await webResponse.text();
  res.end(body);
}

/**
 * API middleware to handle /api/* routes
 */
async function apiMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = req.url || '/';
  
  // Only handle API routes
  if (!url.startsWith('/api/')) {
    return next();
  }

  // Handle request body for POST/PATCH/PUT
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', async () => {
      const bodyStr = Buffer.concat(chunks).toString('utf-8');
      
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
          headers[key] = value;
        } else if (Array.isArray(value)) {
          headers[key] = value.join(', ');
        }
      }
      
      const host = req.headers.host || `localhost:${PORT}`;
      const protocol = req.socket.encrypted ? 'https' : 'http';
      const apiReq = new Request(`${protocol}://${host}${req.url || '/'}`, {
        method: req.method || 'GET',
        headers,
        body: bodyStr,
      });

      const apiRes = await apiHandler(apiReq);
      await toNodeResponse(res, apiRes);
    });
  } else {
    const apiReq = toWebRequest(req);
    const apiRes = await apiHandler(apiReq);
    await toNodeResponse(res, apiRes);
  }
}

// ============================================================================
// Dev Server
// ============================================================================

const devServer = createDevServer({
  entry: './src/entry-server.ts',
  port: PORT,
  middleware: apiMiddleware,
  viteConfig: {
    resolve: {
      alias: {
        '@vertz/ui/jsx-runtime': '@vertz/ui-server/jsx-runtime',
        '@vertz/ui/jsx-dev-runtime': '@vertz/ui-server/jsx-runtime',
      },
    },
    optimizeDeps: {
      exclude: ['fsevents', 'lightningcss'],
    },
  },
});

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🏗️  Vertz Dev Server (SSR)                              ║
║                                                           ║
║   Local:    http://localhost:${PORT}                      ║
║   API:      http://localhost:${PORT}/api                   ║
║                                                           ║
║   Stack:                                                 ║
║   • Vite SSR (vite.ssrLoadModule) ✅                    ║
║   • @vertz/server (API routes) ✅                        ║
║   • SQLite (local persistence) ✅                       ║
║   • HMR (UI hot-reload) ✅                              ║
║                                                           ║
║   Available API endpoints:                               ║
║   • GET    /api/todos         List all todos            ║
║   • GET    /api/todos/:id     Get a todo                ║
║   • POST   /api/todos         Create a todo            ║
║   • PATCH  /api/todos/:id     Update a todo            ║
║   • DELETE /api/todos/:id     Delete a todo            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

devServer.listen();
