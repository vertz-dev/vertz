/**
 * Cloudflare Worker entry point for Entity Todo.
 *
 * Route splitting:
 * - /api/* → JSON API handler
 * - /*       → SSR HTML render
 */

import { renderApp } from './entry-server';

// ---------------------------------------------------------------------------
// SSR Handler
// ---------------------------------------------------------------------------

/**
 * Handle SSR requests - render the app to HTML.
 */
async function handleSsr(_request: Request): Promise<Response> {
  return renderApp();
}

// ---------------------------------------------------------------------------
// Main worker fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, _env: unknown, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url);

    // Route splitting: /api/* goes to JSON API, everything else goes to SSR
    if (url.pathname.startsWith('/api/')) {
      // For now, return a simple response indicating API routes
      // In production, this would connect to the entity API handler
      return new Response(JSON.stringify({
        message: 'API routes - connect to entity handler in production',
        endpoints: [
          'GET    /api/todos',
          'GET    /api/todos/:id',
          'POST   /api/todos',
          'PATCH  /api/todos/:id',
          'DELETE /api/todos/:id',
        ],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // All other routes go to SSR
    return handleSsr(request);
  },
};
