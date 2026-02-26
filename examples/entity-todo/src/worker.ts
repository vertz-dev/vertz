/**
 * Cloudflare Worker entry point for Entity Todo.
 *
 * Uses the framework's createServer() + createDb() for auto-generated
 * CRUD routes (via entity definitions) and SSR for all non-API routes.
 *
 * Route splitting:
 * - /api/* → JSON API handler (auto-generated entity routes, D1 database)
 * - /*     → SSR HTML render
 */

import { createDb } from '@vertz/db';
import { type AppBuilder, createServer, type ServerConfig } from '@vertz/server';
import { todos } from './entities';
import { renderToString } from './entry-server';
import { todosModel } from './schema';

// ---------------------------------------------------------------------------
// Env bindings (Cloudflare Workers)
// ---------------------------------------------------------------------------

interface Env {
  DB: D1Database;
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Lazy-initialized app (created on first request when env.DB is available)
// ---------------------------------------------------------------------------

let app: AppBuilder | null = null;

function getApp(env: Env): AppBuilder {
  if (!app) {
    // env.DB is Cloudflare's D1Database — structurally compatible with @vertz/db's D1Database.
    // biome-ignore lint/suspicious/noExplicitAny: Cloudflare D1 binding → @vertz/db D1Database
    const db = createDb({ models: { todos: todosModel }, dialect: 'sqlite', d1: env.DB as any });

    app = createServer({
      basePath: '/api',
      entities: [todos],
      // biome-ignore lint/suspicious/noExplicitAny: DatabaseClient variance — specific model → generic
      db: db as any as ServerConfig['db'],
    });
  }
  return app;
}

// ---------------------------------------------------------------------------
// SSR Handler
// ---------------------------------------------------------------------------

async function handleSsr(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const html = await renderToString(url.pathname, {
    clientScript: '/assets/client.js',
  });
  return withSecurityHeaders(
    new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  );
}

// ---------------------------------------------------------------------------
// Main worker fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, _ctx: unknown): Promise<Response> {
    // Validate D1 binding
    if (!env.DB) {
      return withSecurityHeaders(
        new Response('D1 database not bound — check wrangler.toml', { status: 500 }),
      );
    }

    const url = new URL(request.url);

    // Route splitting: /api/* goes to the framework's auto-generated entity routes
    if (url.pathname.startsWith('/api/')) {
      const server = getApp(env);
      const response = await server.handler(request);
      return withSecurityHeaders(response);
    }

    // All other routes go to SSR
    return handleSsr(request);
  },
};
