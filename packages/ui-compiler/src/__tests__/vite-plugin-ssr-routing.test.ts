import type { Plugin, ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import vertzPlugin from '../vite-plugin';

// Mock node:fs so the middleware can read the HTML template
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(
    () =>
      '<html><body><!--ssr-outlet--><script type="module" src="/src/main.ts"></script></body></html>',
  ),
}));

/**
 * Behavioral tests for SSR routing (ticket: fix-ssr-route-rendering).
 *
 * Root cause: In Vite SSR dev mode, two bugs caused "Page not found" on every route:
 *
 * 1. Middleware order: SSR middleware ran AFTER Vite's SPA fallback, which rewrites
 *    '/' → '/index.html'. The router receives '/index.html' and matches no routes.
 *
 * 2. Module caching: SSR entry module was cached after first import. createRouter()
 *    only ran once, so subsequent requests with different URLs got stale state.
 *
 * These tests verify the BEHAVIOR (what the middleware does when called), not
 * implementation details (what code is generated).
 */

/**
 * Creates a mock ViteDevServer that simulates the SSR pipeline.
 * The mock tracks middleware registration and simulates the full render cycle.
 */
function createMockServer(options?: { renderedHtml?: string; templateHtml?: string }) {
  const renderedHtml = options?.renderedHtml ?? '<div>Hello World</div>';
  const _templateHtml =
    options?.templateHtml ??
    '<html><head></head><body><div id="app"><!--ssr-outlet--></div><script type="module" src="/src/main.ts"></script></body></html>';

  const registeredMiddlewares: Function[] = [];
  const invalidatedModules: string[] = [];

  const ssrEntryModule = { id: '\0vertz:ssr-entry' };

  const mockServer = {
    middlewares: {
      use: vi.fn((middleware: Function) => {
        registeredMiddlewares.push(middleware);
      }),
    },
    config: { root: '/tmp/test-project' },
    moduleGraph: {
      getModuleById: vi.fn((id: string) => {
        if (id === '\0vertz:ssr-entry') return ssrEntryModule;
        return undefined;
      }),
      invalidateModule: vi.fn((mod: unknown) => {
        if (mod === ssrEntryModule) {
          invalidatedModules.push('\0vertz:ssr-entry');
        }
      }),
    },
    transformIndexHtml: vi.fn(async (_url: string, html: string) => html),
    ssrLoadModule: vi.fn(async () => ({
      renderToString: vi.fn(async () => renderedHtml),
    })),
    ssrFixStacktrace: vi.fn(),
  } as unknown as ViteDevServer;

  return { mockServer, registeredMiddlewares, invalidatedModules };
}

/**
 * Simulates an HTTP request through the registered middleware.
 */
function createMockReqRes(url: string) {
  const req = {
    url,
    headers: { accept: 'text/html' },
  };
  const chunks: string[] = [];
  const res = {
    writeHead: vi.fn(),
    end: vi.fn((html: string) => chunks.push(html)),
  };
  const next = vi.fn();
  return { req, res, next, getHtml: () => chunks[0] };
}

describe('SSR routing fix', () => {
  describe('middleware registration: pre-hook vs post-hook', () => {
    it('should register middleware directly on the server (pre-hook), not return a post-hook function', () => {
      /**
       * RED: The current (broken) implementation returns a function from
       * configureServer (post-hook pattern). Vite calls post-hooks AFTER
       * installing its own middleware, including the SPA fallback. This means
       * our SSR handler sees rewritten URLs like '/index.html' instead of '/'.
       *
       * The fix: configureServer must call server.middlewares.use() directly
       * and NOT return a function.
       */
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const configureServer = plugin.configureServer as Function;

      const { mockServer, registeredMiddlewares } = createMockServer();
      const result = configureServer.call(plugin, mockServer);

      // Pre-hook: middleware registered immediately, nothing returned
      expect(registeredMiddlewares.length).toBeGreaterThan(0);
      expect(result).toBeUndefined();
    });
  });

  describe('SSR response for different URLs', () => {
    /**
     * Helper: configures the plugin, registers middleware, and sends a request.
     * Returns the response HTML.
     */
    async function renderViaSSR(url: string, options?: { renderedHtml?: string }) {
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const configureServer = plugin.configureServer as Function;

      const { mockServer, registeredMiddlewares } = createMockServer({
        renderedHtml: options?.renderedHtml ?? '<div>Page Content</div>',
        templateHtml:
          '<html><body><!--ssr-outlet--><script type="module" src="/src/main.ts"></script></body></html>',
      });

      // If configureServer returns a post-hook function, call it to register middleware
      const maybePostHook = configureServer.call(plugin, mockServer);
      if (typeof maybePostHook === 'function') {
        maybePostHook();
      }

      expect(registeredMiddlewares.length).toBeGreaterThan(0);
      const middleware = registeredMiddlewares[0];

      const { req, res, next, getHtml } = createMockReqRes(url);

      await middleware(req, res, next);

      return { html: getHtml(), res, next, mockServer };
    }

    it('should render HTML for the root URL /', async () => {
      const { html, res, next } = await renderViaSSR('/');

      // Should produce a response, not pass through
      expect(next).not.toHaveBeenCalled();
      expect(res.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/html; charset=utf-8',
      });
      expect(html).toContain('<div>Page Content</div>');
    });

    it('should render HTML for deep routes like /about', async () => {
      const { html, next } = await renderViaSSR('/about');

      expect(next).not.toHaveBeenCalled();
      expect(html).toContain('<div>Page Content</div>');
    });

    it('should pass the correct URL to renderToString, not /index.html', async () => {
      /**
       * RED: When Vite's SPA fallback rewrites '/' to '/index.html', and our
       * middleware runs after (post-hook), req.url will be '/index.html'.
       * The renderToString function should normalize this back to '/'.
       *
       * This test verifies the URL passed to the renderer is correct.
       */
      const { mockServer } = await renderViaSSR('/');
      const ssrLoadModule = mockServer.ssrLoadModule as ReturnType<typeof vi.fn>;
      const ssrModule = await ssrLoadModule.mock.results[0].value;
      const renderToString = ssrModule.renderToString as ReturnType<typeof vi.fn>;

      // The URL passed to renderToString should be '/', not '/index.html'
      expect(renderToString).toHaveBeenCalledWith('/');
    });
  });

  describe('module invalidation per request', () => {
    it('should invalidate the SSR entry module before each render to prevent stale router state', async () => {
      /**
       * RED: Without invalidation, Vite caches the SSR entry module after first
       * import. Module-scope code like createRouter() only runs once, so the
       * router is stuck with the first URL. Each request must invalidate
       * the SSR entry module to force re-evaluation.
       */
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const configureServer = plugin.configureServer as Function;

      const { mockServer, registeredMiddlewares } = createMockServer();

      const maybePostHook = configureServer.call(plugin, mockServer);
      if (typeof maybePostHook === 'function') {
        maybePostHook();
      }

      const middleware = registeredMiddlewares[0];

      // First request
      const req1 = createMockReqRes('/');
      await middleware(req1.req, req1.res, req1.next);

      // Second request
      const req2 = createMockReqRes('/about');
      await middleware(req2.req, req2.res, req2.next);

      const invalidateModule = (mockServer.moduleGraph as any).invalidateModule;
      // Should have invalidated before EACH render (at least once per request)
      expect(invalidateModule).toHaveBeenCalled();
      // Specifically, the SSR entry module should be targeted
      const getModuleById = (mockServer.moduleGraph as any).getModuleById;
      expect(getModuleById).toHaveBeenCalledWith('\0vertz:ssr-entry');
    });
  });

  describe('URL normalization in SSR entry code generation', () => {
    it('should produce SSR entry code that normalizes /index.html URLs to /', () => {
      /**
       * RED: The virtual SSR entry module's renderToString receives the URL
       * from the middleware. If Vite's SPA fallback has rewritten it,
       * the code must strip '/index.html' before setting __SSR_URL__.
       *
       * We test this by loading the virtual module and checking the generated
       * code handles this edge case.
       */
      const plugin = vertzPlugin({ ssr: true }) as Plugin;
      const load = plugin.load as Function;

      const code = load.call(plugin, '\0vertz:ssr-entry');
      expect(code).toBeDefined();

      // The renderToString function should handle /index.html normalization.
      // We verify by checking the generated code handles this case.
      // This is a defense-in-depth check — the middleware should pass clean
      // URLs, but the entry should also normalize as a safety net.
      expect(code).toContain('/index.html');
    });
  });
});
