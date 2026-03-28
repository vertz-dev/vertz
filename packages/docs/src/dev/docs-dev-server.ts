import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDocsConfig } from '../config/load';
import { extractHeadings } from '../mdx/extract-headings';
import { parseFrontmatter } from '../mdx/frontmatter';
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
 * Read frontmatter from all page MDX files and return a map of
 * filePath → { title, description }.
 */
function readPageFrontmatter(
  pagesDir: string,
  routes: PageRoute[],
): { pageTitles: Record<string, string>; pageDescriptions: Record<string, string> } {
  const pageTitles: Record<string, string> = {};
  const pageDescriptions: Record<string, string> = {};

  for (const route of routes) {
    const normalizedFilePath = route.filePath.endsWith('.mdx')
      ? route.filePath
      : `${route.filePath}.mdx`;
    const mdxPath = resolve(pagesDir, normalizedFilePath);

    if (existsSync(mdxPath)) {
      try {
        const source = readFileSync(mdxPath, 'utf-8');
        const { data } = parseFrontmatter(source);
        if (data.title) {
          pageTitles[route.filePath] = data.title.replace(/^['"]|['"]$/g, '');
        }
        if (data.description) {
          pageDescriptions[route.filePath] = data.description.replace(
            /^['"]|['"]$/g,
            '',
          );
        }
      } catch {
        // Silently skip files that can't be read
      }
    }
  }

  return { pageTitles, pageDescriptions };
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

  // Read frontmatter from all pages at startup
  const { pageTitles, pageDescriptions } = readPageFrontmatter(pagesDir, routes);

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
        // Try serving from public/ directory
        const publicPath = resolve(projectDir, 'public', pathname.slice(1));
        if (
          publicPath.startsWith(resolve(projectDir, 'public')) &&
          existsSync(publicPath) &&
          statSync(publicPath).isFile()
        ) {
          const file = Bun.file(publicPath);
          return new Response(file);
        }
        return new Response('Not Found', { status: 404 });
      }

      try {
        const normalizedFilePath = route.filePath.endsWith('.mdx')
          ? route.filePath
          : `${route.filePath}.mdx`;
        const mdxPath = resolve(pagesDir, normalizedFilePath);

        // Guard against path traversal
        if (!mdxPath.startsWith(pagesDir)) {
          return new Response('Forbidden', { status: 403 });
        }

        const source = readFileSync(mdxPath, 'utf-8');
        const contentHtml = await compileMdxToHtml(source);
        const headings = extractHeadings(source);

        // Get frontmatter title and description for this page
        const pageTitle = pageTitles[route.filePath];
        const description = pageDescriptions[route.filePath];

        const html = renderPageHtml({
          config,
          route,
          contentHtml,
          headings,
          pageTitle,
          description,
          pageTitles,
        });
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
