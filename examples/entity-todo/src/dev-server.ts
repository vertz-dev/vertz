/**
 * Unified Development Server for Entity Todo
 *
 * Brings together:
 * - Vite HMR for UI hot-reload
 * - API routes via @vertz/server
 * - SPA fallback for non-API routes (client-side rendering)
 * - SQLite for local persistence (not D1)
 *
 * Usage: pnpm dev
 * 
 * Note: For true SSR in local dev, you need to build the app first:
 *   pnpm build && pnpm preview
 */

import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import type { ViteDevServer } from 'vite';
import { createServer as createViteServer } from 'vite';

import { createServer } from '@vertz/server';
import { todos } from './entities';
import { createTodosDb } from './db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;

// ============================================================================
// Database Setup (SQLite for local dev)
// ============================================================================

// Initialize SQLite adapter using the factory function
const todosDbAdapter = createTodosDb();

// ============================================================================
// API Server Setup
// ============================================================================

const app = createServer({
  basePath: '/api',
  entities: [todos],
  _entityDbFactory: () => todosDbAdapter,
});

// Get the handler function
const apiHandler = app.handler;

// ============================================================================
// Vite + SPA Server Setup
// ============================================================================

let vite: ViteDevServer;
let httpServer: ReturnType<typeof createHttpServer>;

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

  return new Request(`http://localhost:${PORT}${req.url || '/'}`, {
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
 * Read index.html for SPA fallback
 */
function getIndexHtml(): string {
  const indexPath = path.resolve(__dirname, '..', 'index.html');
  if (fs.existsSync(indexPath)) {
    return fs.readFileSync(indexPath, 'utf-8');
  }
  return `<!DOCTYPE html>
<html>
<head><title>Entity Todo</title></head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/index.ts"></script>
</body>
</html>`;
}

async function startDevServer() {
  console.log('\n🚀 Starting Vertz Dev Server...\n');

  // Create Vite in middleware mode
  vite = await createViteServer({
    configFile: path.resolve(__dirname, '..', 'vite.config.ts'),
    server: {
      middlewareMode: true,
      hmr: {
        clientPort: PORT,
      },
    },
    appType: 'custom',
  });

  console.log('✅ Vite dev server initialized\n');

  // Create HTTP server
  httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const pathname = url.pathname;

    try {
      // ===========================================
      // API Routes: /api/* → JSON responses
      // ===========================================
      if (pathname.startsWith('/api/')) {
        // Handle body for POST/PATCH/PUT requests
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const bodyStr = Buffer.concat(chunks).toString('utf-8');
          
          // Create a modified request with body
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') {
              headers[key] = value;
            } else if (Array.isArray(value)) {
              headers[key] = value.join(', ');
            }
          }
          
          const apiReq = new Request(`http://localhost:${PORT}${req.url || '/'}`, {
            method: req.method || 'GET',
            headers,
            body: bodyStr,
          });

          const apiRes = await apiHandler(apiReq);
          await toNodeResponse(res, apiRes);
          return;
        } else {
          const apiReq = toWebRequest(req);
          const apiRes = await apiHandler(apiReq);
          await toNodeResponse(res, apiRes);
          return;
        }
      }

      // ===========================================
      // All other routes → SPA (client-side rendering with HMR)
      // ===========================================
      
      // For SPA fallback, serve index.html for root path
      if (pathname === '/' || pathname === '') {
        const indexHtml = getIndexHtml();
        const transformedHtml = await vite.transformIndexHtml('/', indexHtml);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(transformedHtml);
        return;
      }
      
      // Let Vite handle it (HMR injection, transform, etc.)
      return vite.middlewares(req, res);
      
    } catch (err) {
      console.error('[Server] Error:', err);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });

  // Listen on port
  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, () => {
      resolve();
    });
  });

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🏗️  Vertz Dev Server                                    ║
║                                                           ║
║   Local:    http://localhost:${PORT}                      ║
║   API:      http://localhost:${PORT}/api                   ║
║                                                           ║
║   Stack:                                                 ║
║   • Vite HMR (UI hot-reload) ✅                         ║
║   • @vertz/server (API routes) ✅                        ║
║   • SPA mode (client-side rendering)                    ║
║   • SQLite (local persistence) ✅                       ║
║                                                           ║
║   Notes:                                                 ║
║   • API routes served locally with SQLite               ║
║   • UI uses Vite HMR for hot-reload                     ║
║   • For SSR, run: pnpm build && pnpm preview           ║
║                                                           ║
║   Available endpoints:                                   ║
║   • GET    /api/todos         List all todos            ║
║   • GET    /api/todos/:id     Get a todo                ║
║   • POST   /api/todos         Create a todo            ║
║   • PATCH  /api/todos/:id     Update a todo            ║
║   • DELETE /api/todos/:id     Delete a todo            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n👋 Shutting down...');
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
    if (vite) {
      await vite.close();
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Start the server
startDevServer().catch((err) => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
