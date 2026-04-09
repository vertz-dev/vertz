import { beforeEach, describe, expect, it, spyOn, vi } from '@vertz/test';
import type { AppBuilder } from '@vertz/core';
import { createHandler, generateHTMLTemplate, generateNonce } from '../src/handler.js';

// Mock functions hoisted above vi.mock factory
const mockSSRRequestHandler = vi.fn().mockImplementation(() =>
  Promise.resolve(
    new Response('<html>SSR Module</html>', {
      headers: { 'Content-Type': 'text/html' },
    }),
  ),
);
const mockCreateSSRHandler = vi.fn().mockReturnValue(mockSSRRequestHandler);

// Mock the SSR module at top level (compiler hoists this)
vi.mock('@vertz/ui-server/ssr', () => ({
  createSSRHandler: mockCreateSSRHandler,
}));

function mockApp(handler?: (...args: unknown[]) => Promise<Response>): AppBuilder {
  return {
    handler: handler ?? vi.fn().mockResolvedValue(new Response('OK')),
  } as unknown as AppBuilder;
}

describe('createHandler', () => {
  it('returns proper Worker export with fetch method', () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp);

    expect(worker).toHaveProperty('fetch');
    expect(typeof worker.fetch).toBe('function');
  });

  it('forwards requests to the vertz handler', async () => {
    const mockResponse = new Response('Hello from handler');
    const mockHandler = vi.fn().mockResolvedValue(mockResponse);
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp);
    const request = new Request('https://example.com/api/test');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    const response = await worker.fetch(request, mockEnv, mockCtx);

    expect(mockHandler).toHaveBeenCalledWith(request);
    expect(response).toBe(mockResponse);
  });

  it('strips apiPrefix prefix from pathname', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { apiPrefix: '/api' });
    const request = new Request('https://example.com/api/users');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    expect(mockHandler).toHaveBeenCalledTimes(1);
    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/users');
  });

  it('strips apiPrefix with trailing slash correctly', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { apiPrefix: '/api' });
    const request = new Request('https://example.com/api/');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/');
  });

  it('handles apiPrefix when pathname does not start with apiPrefix', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { apiPrefix: '/api' });
    const request = new Request('https://example.com/other/path');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/other/path');
  });

  it('preserves query parameters when stripping apiPrefix', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { apiPrefix: '/api' });
    const request = new Request('https://example.com/api/users?page=1&limit=10');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/users');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('preserves request headers and method', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { apiPrefix: '/api' });
    const request = new Request('https://example.com/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
      },
    });
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    expect(calledRequest.method).toBe('POST');
    expect(calledRequest.headers.get('Content-Type')).toBe('application/json');
    expect(calledRequest.headers.get('Authorization')).toBe('Bearer token123');
  });

  it('works without apiPrefix option', async () => {
    const mockResponse = new Response('No apiPrefix');
    const mockHandler = vi.fn().mockResolvedValue(mockResponse);
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp);
    const request = new Request('https://example.com/api/test');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    const response = await worker.fetch(request, mockEnv, mockCtx);

    expect(mockHandler).toHaveBeenCalledWith(request);
    expect(response).toBe(mockResponse);
    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    expect(new URL(calledRequest.url).pathname).toBe('/api/test');
  });

  it('returns 500 response when handler throws an error', async () => {
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    const testError = new Error('Test error');
    const mockHandler = vi.fn().mockRejectedValue(testError);
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp);
    const request = new Request('https://example.com/api/test');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    const response = await worker.fetch(request, mockEnv, mockCtx);

    expect(mockHandler).toHaveBeenCalledWith(request);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Internal Server Error');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled error in worker:', testError);

    consoleErrorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Full-stack config-based createHandler
// ---------------------------------------------------------------------------

describe('createHandler (config object)', () => {
  const mockEnv = { DB: {} };
  const mockCtx = {} as ExecutionContext;

  // ---------------------------------------------------------------------------
  // apiPrefix defaults to '/api'
  // ---------------------------------------------------------------------------

  describe('Feature: Optional apiPrefix', () => {
    describe('Given a config without apiPrefix', () => {
      describe('When a request arrives at /api/todos', () => {
        it('Then routes to the app handler', async () => {
          const apiHandler = vi.fn().mockResolvedValue(new Response('OK'));
          const ssrHandler = vi.fn().mockResolvedValue(new Response('<html></html>'));

          const worker = createHandler({
            app: () => mockApp(apiHandler),
            ssr: ssrHandler,
          });

          const response = await worker.fetch(
            new Request('https://example.com/api/todos'),
            mockEnv,
            mockCtx,
          );

          expect(apiHandler).toHaveBeenCalled();
          expect(ssrHandler).not.toHaveBeenCalled();
          expect(await response.text()).toBe('OK');
        });
      });

      describe('When a request arrives at /dashboard', () => {
        it('Then does not route to the app handler', async () => {
          const apiHandler = vi.fn().mockResolvedValue(new Response('API'));
          const ssrHandler = vi.fn().mockResolvedValue(new Response('<html>SSR</html>'));

          const worker = createHandler({
            app: () => mockApp(apiHandler),
            ssr: ssrHandler,
          });

          const response = await worker.fetch(
            new Request('https://example.com/dashboard'),
            mockEnv,
            mockCtx,
          );

          expect(apiHandler).not.toHaveBeenCalled();
          expect(ssrHandler).toHaveBeenCalled();
          expect(await response.text()).toBe('<html>SSR</html>');
        });
      });
    });

    describe('Given a config with explicit apiPrefix "/v1"', () => {
      describe('When a request arrives at /v1/todos', () => {
        it('Then routes to the app handler (backward compat)', async () => {
          const apiHandler = vi.fn().mockResolvedValue(new Response('OK'));
          const ssrHandler = vi.fn().mockResolvedValue(new Response('<html></html>'));

          const worker = createHandler({
            app: () => mockApp(apiHandler),
            apiPrefix: '/v1',
            ssr: ssrHandler,
          });

          const response = await worker.fetch(
            new Request('https://example.com/v1/todos'),
            mockEnv,
            mockCtx,
          );

          expect(apiHandler).toHaveBeenCalled();
          expect(await response.text()).toBe('OK');
        });
      });
    });

    describe('Given a config with empty apiPrefix and SSR (#2131)', () => {
      it('Then throws because empty prefix breaks API/SSR routing', async () => {
        const worker = createHandler({
          app: () => mockApp(),
          apiPrefix: '',
          ssr: vi.fn().mockResolvedValue(new Response('<html></html>')),
        });

        expect(
          worker.fetch(new Request('https://example.com/test'), mockEnv, mockCtx),
        ).rejects.toThrow('apiPrefix cannot be empty when SSR is configured');
      });
    });

    describe('Given a config without apiPrefix (#2131)', () => {
      it('Then reads apiPrefix from the app instance', async () => {
        const apiHandler = vi.fn().mockResolvedValue(new Response('OK'));
        const appInstance = {
          ...mockApp(apiHandler),
          apiPrefix: '/v2',
        };

        const worker = createHandler({
          app: () => appInstance as unknown as AppBuilder,
          ssr: vi.fn().mockResolvedValue(new Response('<html>SSR</html>')),
        });

        // /v2/todos should route to API handler
        const apiResponse = await worker.fetch(
          new Request('https://example.com/v2/todos'),
          mockEnv,
          mockCtx,
        );
        expect(apiHandler).toHaveBeenCalled();
        expect(await apiResponse.text()).toBe('OK');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // securityHeaders defaults to true
  // ---------------------------------------------------------------------------

  describe('Feature: securityHeaders defaults to true', () => {
    describe('Given a config without securityHeaders', () => {
      it('Then includes security headers on responses', async () => {
        const worker = createHandler({
          app: () => mockApp(vi.fn().mockResolvedValue(new Response('OK'))),
          ssr: () => Promise.resolve(new Response('<html></html>')),
        });

        const response = await worker.fetch(
          new Request('https://example.com/api/test'),
          mockEnv,
          mockCtx,
        );

        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(response.headers.get('X-Frame-Options')).toBe('DENY');
        expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
        expect(response.headers.get('Strict-Transport-Security')).toBe(
          'max-age=31536000; includeSubDomains',
        );
        expect(response.headers.get('Content-Security-Policy')).toMatch(
          /script-src 'self' 'nonce-/,
        );
      });
    });

    describe('Given securityHeaders: false', () => {
      it('Then does not include security headers', async () => {
        const worker = createHandler({
          app: () => mockApp(vi.fn().mockResolvedValue(new Response('OK'))),
          ssr: () => Promise.resolve(new Response('<html></html>')),
          securityHeaders: false,
        });

        const response = await worker.fetch(
          new Request('https://example.com/api/test'),
          mockEnv,
          mockCtx,
        );

        expect(response.headers.get('X-Content-Type-Options')).toBeNull();
        expect(response.headers.get('X-Frame-Options')).toBeNull();
        expect(response.headers.get('Content-Security-Policy')).toBeNull();
      });
    });
  });

  it('routes API requests to app handler and SSR to ssr handler', async () => {
    const apiHandler = vi.fn().mockResolvedValue(
      new Response('{"items":[]}', {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const ssrHandler = vi.fn().mockResolvedValue(
      new Response('<html>SSR</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const worker = createHandler({
      app: () => mockApp(apiHandler),
      apiPrefix: '/api',
      ssr: ssrHandler,
    });

    // API request → app handler
    const apiResponse = await worker.fetch(
      new Request('https://example.com/api/todos'),
      mockEnv,
      mockCtx,
    );
    expect(apiHandler).toHaveBeenCalled();
    expect(await apiResponse.text()).toBe('{"items":[]}');

    // SSR request → ssr handler
    const ssrResponse = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);
    expect(ssrHandler).toHaveBeenCalled();
    expect(await ssrResponse.text()).toBe('<html>SSR</html>');
  });

  it('passes env to the app factory and caches the result', async () => {
    const apiHandler = vi.fn().mockImplementation(() => Promise.resolve(new Response('OK')));
    const appFactory = vi.fn().mockReturnValue(mockApp(apiHandler));

    const worker = createHandler({
      app: appFactory,
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
    });

    // First request — factory called
    await worker.fetch(new Request('https://example.com/api/x'), mockEnv, mockCtx);
    expect(appFactory).toHaveBeenCalledTimes(1);
    expect(appFactory).toHaveBeenCalledWith(mockEnv);

    // Second request — factory NOT called again (cached)
    await worker.fetch(new Request('https://example.com/api/y'), mockEnv, mockCtx);
    expect(appFactory).toHaveBeenCalledTimes(1);
  });

  it('adds security headers when securityHeaders is true', async () => {
    const worker = createHandler({
      app: () => mockApp(vi.fn().mockImplementation(() => new Response('OK'))),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      securityHeaders: true,
    });

    const response = await worker.fetch(
      new Request('https://example.com/api/test'),
      mockEnv,
      mockCtx,
    );

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('adds security headers to SSR responses too', async () => {
    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      securityHeaders: true,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('passes full URL to app handler (no apiPrefix stripping)', async () => {
    const apiHandler = vi.fn().mockResolvedValue(new Response('OK'));

    const worker = createHandler({
      app: () => mockApp(apiHandler),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
    });

    await worker.fetch(new Request('https://example.com/api/todos/123'), mockEnv, mockCtx);

    const calledRequest = apiHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/api/todos/123');
  });

  it('returns 500 with error message when app handler throws', async () => {
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    const worker = createHandler({
      app: () => mockApp(vi.fn().mockRejectedValue(new Error('DB connection failed'))),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
    });

    const response = await worker.fetch(
      new Request('https://example.com/api/test'),
      mockEnv,
      mockCtx,
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Internal Server Error');
    consoleErrorSpy.mockRestore();
  });

  it('returns 500 with error message when SSR handler throws', async () => {
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: () => Promise.reject(new Error('SSR render failed')),
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Internal Server Error');
    consoleErrorSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // requestHandler auto-detection
  // ---------------------------------------------------------------------------

  describe('Feature: Auto-detect requestHandler', () => {
    describe('Given an app with requestHandler (ServerInstance with auth)', () => {
      it('Then routes API requests to requestHandler', async () => {
        const handler = vi.fn().mockResolvedValue(new Response('handler'));
        const requestHandler = vi.fn().mockResolvedValue(new Response('requestHandler'));
        const appWithAuth = {
          handler,
          requestHandler,
        } as unknown as AppBuilder;

        const worker = createHandler({
          app: () => appWithAuth,
          apiPrefix: '/api',
          ssr: () => Promise.resolve(new Response('<html></html>')),
        });

        const response = await worker.fetch(
          new Request('https://example.com/api/auth/signin'),
          mockEnv,
          mockCtx,
        );

        expect(requestHandler).toHaveBeenCalled();
        expect(handler).not.toHaveBeenCalled();
        expect(await response.text()).toBe('requestHandler');
      });

      it('Then routes entity requests to requestHandler too', async () => {
        const handler = vi.fn().mockResolvedValue(new Response('handler'));
        const requestHandler = vi.fn().mockResolvedValue(new Response('requestHandler'));
        const appWithAuth = {
          handler,
          requestHandler,
        } as unknown as AppBuilder;

        const worker = createHandler({
          app: () => appWithAuth,
          apiPrefix: '/api',
          ssr: () => Promise.resolve(new Response('<html></html>')),
        });

        const response = await worker.fetch(
          new Request('https://example.com/api/todos'),
          mockEnv,
          mockCtx,
        );

        expect(requestHandler).toHaveBeenCalled();
        expect(handler).not.toHaveBeenCalled();
        expect(await response.text()).toBe('requestHandler');
      });
    });

    describe('Given an app without requestHandler (plain AppBuilder)', () => {
      it('Then routes to handler (backward compat)', async () => {
        const handler = vi.fn().mockResolvedValue(new Response('handler'));
        const plainApp = { handler } as unknown as AppBuilder;

        const worker = createHandler({
          app: () => plainApp,
          apiPrefix: '/api',
          ssr: () => Promise.resolve(new Response('<html></html>')),
        });

        const response = await worker.fetch(
          new Request('https://example.com/api/todos'),
          mockEnv,
          mockCtx,
        );

        expect(handler).toHaveBeenCalled();
        expect(await response.text()).toBe('handler');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // SSR fetch interceptor
  // ---------------------------------------------------------------------------

  describe('Feature: SSR fetch interceptor routes local API calls through app handler', () => {
    describe('Given an SSR callback that calls fetch() with a relative API URL', () => {
      it('Then intercepts the fetch and routes it to the app handler', async () => {
        const apiHandler = vi.fn().mockResolvedValue(
          new Response('{"items":["a","b"]}', {
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        const ssrCallback = async (_request: Request) => {
          // During SSR, fetch data from the API using a relative URL
          const apiResponse = await fetch('/api/data');
          const data = await apiResponse.text();
          return new Response(`<html>${data}</html>`, {
            headers: { 'Content-Type': 'text/html' },
          });
        };

        const worker = createHandler({
          app: () => mockApp(apiHandler),
          apiPrefix: '/api',
          ssr: ssrCallback,
        });

        const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

        expect(apiHandler).toHaveBeenCalledTimes(1);
        const calledRequest = apiHandler.mock.calls[0][0] as Request;
        expect(new URL(calledRequest.url).pathname).toBe('/api/data');
        const text = await response.text();
        expect(text).toContain('{"items":["a","b"]}');
      });
    });

    describe('Given an SSR callback that calls fetch() with an absolute same-origin API URL', () => {
      it('Then intercepts the fetch and routes it to the app handler', async () => {
        const apiHandler = vi.fn().mockResolvedValue(new Response('abs-ok'));

        const ssrCallback = async (request: Request) => {
          const origin = new URL(request.url).origin;
          const apiResponse = await fetch(`${origin}/api/items`);
          const data = await apiResponse.text();
          return new Response(`<html>${data}</html>`, {
            headers: { 'Content-Type': 'text/html' },
          });
        };

        const worker = createHandler({
          app: () => mockApp(apiHandler),
          apiPrefix: '/api',
          ssr: ssrCallback,
        });

        const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

        expect(apiHandler).toHaveBeenCalledTimes(1);
        const text = await response.text();
        expect(text).toContain('abs-ok');
      });
    });
  });
});

// ---------------------------------------------------------------------------
// generateHTMLTemplate
// ---------------------------------------------------------------------------

describe('generateHTMLTemplate', () => {
  it('generates HTML with ssr-outlet, client script, and title', () => {
    const html = generateHTMLTemplate('/assets/client.js', 'My App');

    expect(html).toContain('<!--ssr-outlet-->');
    expect(html).toContain('<script type="module" src="/assets/client.js"></script>');
    expect(html).toContain('<title>My App</title>');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<div id="app">');
  });
});

// ---------------------------------------------------------------------------
// SSR module config
// ---------------------------------------------------------------------------

describe('createHandler (SSR module config)', () => {
  const mockEnv = { DB: {} };
  const mockCtx = {} as ExecutionContext;

  beforeEach(() => {
    mockSSRRequestHandler.mockClear();
    mockCreateSSRHandler.mockClear();
  });

  it('routes non-API requests through the SSR handler created from module config', async () => {
    const { createHandler: freshCreateHandler } = await import('../src/handler.js');

    const ssrModule = { App: () => ({}) };
    const worker = freshCreateHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: { module: ssrModule },
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(mockCreateSSRHandler).toHaveBeenCalledOnce();
    expect(mockSSRRequestHandler).toHaveBeenCalled();
    expect(await response.text()).toBe('<html>SSR Module</html>');
  });

  it('passes default clientScript and title to createSSRHandler', async () => {
    const { createHandler: freshCreateHandler } = await import('../src/handler.js');

    const ssrModule = { App: () => ({}) };
    const worker = freshCreateHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: { module: ssrModule },
    });

    await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(mockCreateSSRHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        module: ssrModule,
        template: expect.stringContaining('/assets/entry-client.js'),
      }),
    );
    expect(mockCreateSSRHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        module: ssrModule,
        template: expect.stringContaining('<title>Vertz App</title>'),
      }),
    );
  });

  it('passes custom clientScript and title to createSSRHandler', async () => {
    const { createHandler: freshCreateHandler } = await import('../src/handler.js');

    const ssrModule = { App: () => ({}) };
    const worker = freshCreateHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: {
        module: ssrModule,
        clientScript: '/custom/client.js',
        title: 'My Custom App',
      },
    });

    await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(mockCreateSSRHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        module: ssrModule,
        template: expect.stringContaining('/custom/client.js'),
      }),
    );
    expect(mockCreateSSRHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        module: ssrModule,
        template: expect.stringContaining('<title>My Custom App</title>'),
      }),
    );
  });

  it('still works with ssr callback (backward compat)', async () => {
    const { createHandler: freshCreateHandler } = await import('../src/handler.js');

    const ssrCallback = vi.fn().mockResolvedValue(
      new Response('<html>Callback SSR</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const worker = freshCreateHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: ssrCallback,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    // createSSRHandler should NOT be called — callback is used directly
    expect(mockCreateSSRHandler).not.toHaveBeenCalled();
    expect(ssrCallback).toHaveBeenCalled();
    expect(await response.text()).toBe('<html>Callback SSR</html>');
  });

  it('routes API requests to app handler even with SSR module config', async () => {
    const { createHandler: freshCreateHandler } = await import('../src/handler.js');

    const apiHandler = vi.fn().mockResolvedValue(
      new Response('{"items":[]}', {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const worker = freshCreateHandler({
      app: () => mockApp(apiHandler),
      apiPrefix: '/api',
      ssr: { module: { App: () => ({}) } },
    });

    const response = await worker.fetch(
      new Request('https://example.com/api/todos'),
      mockEnv,
      mockCtx,
    );

    expect(apiHandler).toHaveBeenCalled();
    expect(mockSSRRequestHandler).not.toHaveBeenCalled();
    expect(await response.text()).toBe('{"items":[]}');
  });
});

// ---------------------------------------------------------------------------
// Nonce-based CSP
// ---------------------------------------------------------------------------

describe('generateNonce', () => {
  it('returns a base64-encoded string', () => {
    const nonce = generateNonce();

    expect(typeof nonce).toBe('string');
    expect(nonce.length).toBeGreaterThan(0);
    // Base64 alphabet: A-Z, a-z, 0-9, +, /, =
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('generates different nonces on each call', () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 50; i++) {
      nonces.add(generateNonce());
    }
    // With 128-bit random values, collisions are astronomically unlikely
    expect(nonces.size).toBe(50);
  });
});

describe('nonce-based CSP headers', () => {
  const mockEnv = { DB: {} };
  const mockCtx = {} as ExecutionContext;

  it('CSP header contains nonce (not unsafe-inline) for script-src', async () => {
    const worker = createHandler({
      app: () => mockApp(vi.fn().mockImplementation(() => new Response('OK'))),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      securityHeaders: true,
    });

    const response = await worker.fetch(
      new Request('https://example.com/api/test'),
      mockEnv,
      mockCtx,
    );

    const csp = response.headers.get('Content-Security-Policy')!;
    expect(csp).toBeTruthy();
    // Extract the script-src directive and verify it uses nonce, not unsafe-inline
    const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/);
    expect(scriptSrcMatch).toBeTruthy();
    const scriptSrc = scriptSrcMatch![1];
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  });

  it('CSP header keeps unsafe-inline for style-src', async () => {
    const worker = createHandler({
      app: () => mockApp(vi.fn().mockImplementation(() => new Response('OK'))),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      securityHeaders: true,
    });

    const response = await worker.fetch(
      new Request('https://example.com/api/test'),
      mockEnv,
      mockCtx,
    );

    const csp = response.headers.get('Content-Security-Policy');
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'/);
  });

  it('each request gets a different nonce in the CSP header', async () => {
    const worker = createHandler({
      app: () => mockApp(vi.fn().mockImplementation(() => new Response('OK'))),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      securityHeaders: true,
    });

    const nonces: string[] = [];
    for (let i = 0; i < 10; i++) {
      const response = await worker.fetch(
        new Request('https://example.com/api/test'),
        mockEnv,
        mockCtx,
      );
      const csp = response.headers.get('Content-Security-Policy')!;
      const match = csp.match(/nonce-([A-Za-z0-9+/=]+)/);
      expect(match).toBeTruthy();
      nonces.push(match![1]);
    }

    // All nonces should be unique
    expect(new Set(nonces).size).toBe(10);
  });

  it('applies nonce-based CSP to SSR responses', async () => {
    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      securityHeaders: true,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    const csp = response.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  });

  it('applies nonce-based CSP to 500 error responses', async () => {
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    const worker = createHandler({
      app: () => mockApp(vi.fn().mockRejectedValue(new Error('fail'))),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      securityHeaders: true,
    });

    const response = await worker.fetch(
      new Request('https://example.com/api/test'),
      mockEnv,
      mockCtx,
    );

    expect(response.status).toBe(500);
    const csp = response.headers.get('Content-Security-Policy');
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);

    consoleErrorSpy.mockRestore();
  });
});

describe('generateHTMLTemplate with nonce', () => {
  it('adds nonce attribute to script tag when nonce is provided', () => {
    const html = generateHTMLTemplate('/assets/client.js', 'My App', 'abc123');

    expect(html).toContain(
      '<script type="module" src="/assets/client.js" nonce="abc123"></script>',
    );
  });

  it('omits nonce attribute when nonce is not provided', () => {
    const html = generateHTMLTemplate('/assets/client.js', 'My App');

    expect(html).toContain('<script type="module" src="/assets/client.js"></script>');
    expect(html).not.toContain('nonce');
  });
});

// ---------------------------------------------------------------------------
// Image optimizer integration
// ---------------------------------------------------------------------------

describe('createHandler (image optimizer integration)', () => {
  const mockEnv = { DB: {} };
  const mockCtx = {} as ExecutionContext;

  function fakeImageOptimizerHandler(): (request: Request) => Promise<Response> {
    return async () => {
      return new Response('optimized-image-bytes', {
        status: 200,
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Vertz-Image-Optimized': 'cf',
        },
      });
    };
  }

  it('routes /_vertz/image requests to the image optimizer handler', async () => {
    const apiHandler = vi.fn().mockResolvedValue(new Response('API'));
    const optimizerHandler = vi.fn(fakeImageOptimizerHandler());

    const worker = createHandler({
      app: () => mockApp(apiHandler),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      imageOptimizer: optimizerHandler,
    });

    const response = await worker.fetch(
      new Request(
        'https://example.com/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fphoto.jpg&w=800&h=600',
      ),
      mockEnv,
      mockCtx,
    );

    expect(optimizerHandler).toHaveBeenCalled();
    expect(apiHandler).not.toHaveBeenCalled();
    expect(response.headers.get('Content-Type')).toBe('image/webp');
  });

  it('applies security headers to optimizer responses', async () => {
    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      imageOptimizer: fakeImageOptimizerHandler(),
      securityHeaders: true,
    });

    const response = await worker.fetch(
      new Request(
        'https://example.com/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fphoto.jpg&w=800&h=600',
      ),
      mockEnv,
      mockCtx,
    );

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('routes API requests to app handler (not optimizer)', async () => {
    const apiHandler = vi.fn().mockResolvedValue(
      new Response('{"items":[]}', {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const optimizerHandler = vi.fn(fakeImageOptimizerHandler());

    const worker = createHandler({
      app: () => mockApp(apiHandler),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      imageOptimizer: optimizerHandler,
    });

    const response = await worker.fetch(
      new Request('https://example.com/api/todos'),
      mockEnv,
      mockCtx,
    );

    expect(apiHandler).toHaveBeenCalled();
    expect(optimizerHandler).not.toHaveBeenCalled();
    expect(await response.text()).toBe('{"items":[]}');
  });

  it('routes non-image non-API requests to SSR handler', async () => {
    const ssrHandler = vi.fn().mockResolvedValue(
      new Response('<html>SSR</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    const optimizerHandler = vi.fn(fakeImageOptimizerHandler());

    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: ssrHandler,
      imageOptimizer: optimizerHandler,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(ssrHandler).toHaveBeenCalled();
    expect(optimizerHandler).not.toHaveBeenCalled();
    expect(await response.text()).toBe('<html>SSR</html>');
  });

  it('falls through to SSR when no imageOptimizer configured', async () => {
    const ssrHandler = vi.fn().mockResolvedValue(new Response('<html>SSR</html>'));

    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: ssrHandler,
    });

    const response = await worker.fetch(
      new Request('https://example.com/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fx.jpg'),
      mockEnv,
      mockCtx,
    );

    // No optimizer → falls through to SSR
    expect(ssrHandler).toHaveBeenCalled();
    expect(await response.text()).toBe('<html>SSR</html>');
  });

  it('image optimizer route takes priority over apiPrefix when both could match', async () => {
    const apiHandler = vi.fn().mockResolvedValue(new Response('API'));
    const optimizerHandler = vi.fn(fakeImageOptimizerHandler());

    // Edge case: apiPrefix is /_vertz — optimizer route should still win
    const worker = createHandler({
      app: () => mockApp(apiHandler),
      apiPrefix: '/_vertz',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      imageOptimizer: optimizerHandler,
    });

    await worker.fetch(
      new Request(
        'https://example.com/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fphoto.jpg&w=800&h=600',
      ),
      mockEnv,
      mockCtx,
    );

    expect(optimizerHandler).toHaveBeenCalled();
    expect(apiHandler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// beforeRender middleware hook
// ---------------------------------------------------------------------------

describe('createHandler (beforeRender hook)', () => {
  const mockEnv = { DB: {} };
  const mockCtx = {} as ExecutionContext;

  it('short-circuits SSR when beforeRender returns a Response', async () => {
    const ssrHandler = vi.fn().mockResolvedValue(
      new Response('<html>SSR</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: '/login' },
    });

    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: ssrHandler,
      beforeRender: async () => redirectResponse,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
    expect(ssrHandler).not.toHaveBeenCalled();
  });

  it('proceeds with SSR when beforeRender returns undefined', async () => {
    const ssrHandler = vi.fn().mockResolvedValue(
      new Response('<html>SSR</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: ssrHandler,
      beforeRender: async () => undefined,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(ssrHandler).toHaveBeenCalled();
    expect(await response.text()).toBe('<html>SSR</html>');
  });

  it('proceeds normally when no beforeRender hook is provided (backward compat)', async () => {
    const ssrHandler = vi.fn().mockResolvedValue(
      new Response('<html>SSR</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: ssrHandler,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(ssrHandler).toHaveBeenCalled();
    expect(await response.text()).toBe('<html>SSR</html>');
  });

  it('passes request and env to the beforeRender hook', async () => {
    const beforeRender = vi.fn().mockResolvedValue(undefined);
    const env = { DB: {}, AUTH_SECRET: 'secret' };

    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      beforeRender,
    });

    const request = new Request('https://example.com/dashboard');
    await worker.fetch(request, env, mockCtx);

    expect(beforeRender).toHaveBeenCalledWith(request, env);
  });

  it('short-circuits before SSR when beforeRender returns a response', async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: '/login' },
    });
    const ssrHandler = vi.fn().mockResolvedValue(new Response('<html></html>'));

    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: ssrHandler,
      beforeRender: async () => redirectResponse,
    });

    const response = await worker.fetch(
      new Request('https://example.com/dashboard'),
      mockEnv,
      mockCtx,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
  });

  it('applies security headers to the beforeRender response', async () => {
    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      securityHeaders: true,
      beforeRender: async () => new Response('Redirecting', { status: 302 }),
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(response.status).toBe(302);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('does not run beforeRender for API routes', async () => {
    const apiHandler = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    const beforeRender = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { Location: '/login' } }));

    const worker = createHandler({
      app: () => mockApp(apiHandler),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      beforeRender,
    });

    const response = await worker.fetch(
      new Request('https://example.com/api/todos'),
      mockEnv,
      mockCtx,
    );

    expect(apiHandler).toHaveBeenCalled();
    expect(beforeRender).not.toHaveBeenCalled();
    expect(await response.text()).toBe('{"ok":true}');
  });

  it('does not run beforeRender for image optimizer routes', async () => {
    const beforeRender = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { Location: '/login' } }));
    const optimizerHandler = vi.fn().mockResolvedValue(
      new Response('optimized-image', {
        headers: { 'Content-Type': 'image/webp' },
      }),
    );

    const worker = createHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      imageOptimizer: optimizerHandler,
      beforeRender,
    });

    const response = await worker.fetch(
      new Request('https://example.com/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fx.jpg'),
      mockEnv,
      mockCtx,
    );

    expect(optimizerHandler).toHaveBeenCalled();
    expect(beforeRender).not.toHaveBeenCalled();
    expect(response.headers.get('Content-Type')).toBe('image/webp');
  });
});
