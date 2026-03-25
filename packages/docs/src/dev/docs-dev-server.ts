import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDocsConfig } from '../config/load';
import { extractHeadings } from '../mdx/extract-headings';
import { type PageRoute, resolveRoutes } from '../routing/resolve';
import { compileMdxToHtml } from './compile-mdx-html';
import { escapeHtml } from './escape-html';
import { renderPageHtml } from './render-page-html';

export interface DocsDevServerOptions {
  projectDir: string;
  port?: number;
  host?: string;
}

export interface DocsDevServer {
  port: number;
  hostname: string;
  stop(): void;
}

/**
 * Create and start a docs development server.
 */
export async function createDocsDevServer(options: DocsDevServerOptions): Promise<DocsDevServer> {
  const { projectDir, host = 'localhost' } = options;
  const pagesDir = resolve(projectDir, 'pages');

  const config = await loadDocsConfig(projectDir);
  const routes = resolveRoutes(config.sidebar);

  const routeMap = new Map<string, PageRoute>();
  for (const route of routes) {
    routeMap.set(route.path, route);
  }

  const sseClients = new Set<ReadableStreamController<Uint8Array>>();

  const server = Bun.serve({
    port: options.port ?? 3001,
    hostname: host,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // SSE endpoint for live reload
      if (pathname === '/__docs_reload') {
        let streamController: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            sseClients.add(controller);
          },
          cancel() {
            sseClients.delete(streamController);
          },
        });
        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          },
        });
      }

      // Find matching route
      const route = routeMap.get(pathname);
      if (!route) {
        return new Response('Not Found', { status: 404 });
      }

      try {
        const mdxPath = resolve(pagesDir, route.filePath);

        // Guard against path traversal
        if (!mdxPath.startsWith(pagesDir)) {
          return new Response('Forbidden', { status: 403 });
        }

        const source = readFileSync(mdxPath, 'utf-8');
        const contentHtml = await compileMdxToHtml(source);
        const headings = extractHeadings(source);

        const html = renderPageHtml({ config, route, contentHtml, headings });
        return new Response(html, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(`<h1>Error</h1><pre>${escapeHtml(message)}</pre>`, {
          status: 500,
          headers: { 'content-type': 'text/html' },
        });
      }
    },
  });

  return {
    port: server.port ?? options.port ?? 3001,
    hostname: server.hostname ?? host,
    stop() {
      for (const client of sseClients) {
        try {
          client.close();
        } catch {
          // Client already closed
        }
      }
      sseClients.clear();
      server.stop();
    },
  };
}
