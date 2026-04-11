import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
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

/** Simple MIME type lookup for static file serving. */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.webp': 'image/webp',
};

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
          pageDescriptions[route.filePath] = data.description.replace(/^['"]|['"]$/g, '');
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
  const port = options.port ?? 3001;
  const pagesDir = resolve(projectDir, 'pages');

  const config = await loadDocsConfig(projectDir);
  const routes = resolveRoutes(config.sidebar);

  const routeMap = new Map<string, PageRoute>();
  for (const route of routes) {
    routeMap.set(route.path, route);
  }

  // Read frontmatter from all pages at startup
  const { pageTitles, pageDescriptions } = readPageFrontmatter(pagesDir, routes);

  const sseClients = new Set<import('node:http').ServerResponse>();

  const server: Server = createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', `http://${host}:${port}`).pathname;

    // SSE endpoint for live reload
    if (pathname === '/__docs_reload') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      sseClients.add(res);
      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
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
        const content = readFileSync(publicPath);
        const mime = MIME_TYPES[extname(publicPath)] ?? 'application/octet-stream';
        res.writeHead(200, { 'content-type': mime });
        res.end(content);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    try {
      const normalizedFilePath = route.filePath.endsWith('.mdx')
        ? route.filePath
        : `${route.filePath}.mdx`;
      const mdxPath = resolve(pagesDir, normalizedFilePath);

      // Guard against path traversal
      if (!mdxPath.startsWith(pagesDir)) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('Forbidden');
        return;
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
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end(`<h1>Error</h1><pre>${escapeHtml(message)}</pre>`);
    }
  });

  return new Promise((resolvePromise) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;

      resolvePromise({
        port: actualPort,
        hostname: host,
        stop() {
          for (const client of sseClients) {
            try {
              client.end();
            } catch {
              // Client already closed
            }
          }
          sseClients.clear();
          server.close();
        },
      });
    });
  });
}
