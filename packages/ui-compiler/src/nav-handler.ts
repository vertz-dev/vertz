/**
 * Server-side navigation request handler.
 *
 * Handles X-Vertz-Nav requests from client-side navigations.
 * Runs the SSR entry's discoverQueries() (Pass 1 only) and streams
 * resolved query data as Server-Sent Events.
 *
 * This is a dev-server-only feature — production SSR uses separate infrastructure.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ViteDevServer } from 'vite';

/**
 * Escape a string for safe embedding in SSE data.
 * Replaces '<' with '\u003c' to prevent script injection when
 * the client parses the JSON.
 */
function safeSerialize(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * Invalidate the SSR entry and its entire module dependency tree.
 * Shared between the SSR HTML middleware and the nav handler.
 */
export function invalidateSSRModuleTree(server: ViteDevServer): void {
  const ssrEntryMod = server.moduleGraph.getModuleById('\0vertz:ssr-entry');
  if (ssrEntryMod) {
    const visited = new Set<string>();
    const invalidateTree = (mod: { id?: string | null; ssrImportedModules?: Set<unknown> }) => {
      const modId = mod.id;
      if (!modId || visited.has(modId)) return;
      visited.add(modId);
      server.moduleGraph.invalidateModule(
        mod as Parameters<typeof server.moduleGraph.invalidateModule>[0],
      );
      if (mod.ssrImportedModules?.size) {
        for (const child of mod.ssrImportedModules) {
          invalidateTree(child as { id?: string | null; ssrImportedModules?: Set<unknown> });
        }
      }
    };
    invalidateTree(ssrEntryMod);
  }
}

/**
 * Handle a navigation pre-fetch request.
 *
 * If the request has the X-Vertz-Nav: 1 header, runs discoverQueries()
 * and streams results as SSE. Otherwise calls next() to pass to the
 * regular SSR middleware.
 */
export async function handleNavRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
  server: ViteDevServer,
): Promise<void> {
  // Only handle nav pre-fetch requests
  const headers = req.headers as Record<string, string | undefined>;
  if (headers['x-vertz-nav'] !== '1') {
    next();
    return;
  }

  const url = req.url || '/';

  // Set SSE response headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  try {
    // Invalidate module tree for fresh state
    invalidateSSRModuleTree(server);

    // Load virtual SSR entry and discover queries
    const ssrEntry = await server.ssrLoadModule('\0vertz:ssr-entry');
    const result = await ssrEntry.discoverQueries(url);

    // Stream resolved queries as SSE data events
    for (const entry of result.resolved) {
      res.write(`event: data\ndata: ${safeSerialize(entry)}\n\n`);
    }
  } catch {
    // Graceful degradation — errors are swallowed, client falls back to SPA
  }

  // Always send done event and close
  res.write('event: done\ndata: {}\n\n');
  res.end();
}
