import type { AppBuilder } from '@vertz/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, generateHTMLTemplate } from '../src/handler.js';

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

  it('strips basePath prefix from pathname', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { basePath: '/api' });
    const request = new Request('https://example.com/api/users');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    expect(mockHandler).toHaveBeenCalledTimes(1);
    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/users');
  });

  it('strips basePath with trailing slash correctly', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { basePath: '/api' });
    const request = new Request('https://example.com/api/');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/');
  });

  it('handles basePath when pathname does not start with basePath', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { basePath: '/api' });
    const request = new Request('https://example.com/other/path');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/other/path');
  });

  it('preserves query parameters when stripping basePath', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { basePath: '/api' });
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

    const worker = createHandler(mockApp, { basePath: '/api' });
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

  it('works without basePath option', async () => {
    const mockResponse = new Response('No basePath');
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
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
      basePath: '/api',
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
    const apiHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const appFactory = vi.fn().mockReturnValue(mockApp(apiHandler));

    const worker = createHandler({
      app: appFactory,
      basePath: '/api',
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
      app: () => mockApp(vi.fn().mockResolvedValue(new Response('OK'))),
      basePath: '/api',
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
      basePath: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      securityHeaders: true,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('passes full URL to app handler (no basePath stripping)', async () => {
    const apiHandler = vi.fn().mockResolvedValue(new Response('OK'));

    const worker = createHandler({
      app: () => mockApp(apiHandler),
      basePath: '/api',
    });

    await worker.fetch(new Request('https://example.com/api/todos/123'), mockEnv, mockCtx);

    const calledRequest = apiHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/api/todos/123');
  });

  it('returns 500 with error message when app handler throws', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const worker = createHandler({
      app: () => mockApp(vi.fn().mockRejectedValue(new Error('DB connection failed'))),
      basePath: '/api',
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
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const worker = createHandler({
      app: () => mockApp(),
      basePath: '/api',
      ssr: () => Promise.reject(new Error('SSR render failed')),
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Internal Server Error');
    consoleErrorSpy.mockRestore();
  });

  it('returns 404 for non-API routes when no SSR handler is provided', async () => {
    const worker = createHandler({
      app: () => mockApp(),
      basePath: '/api',
    });

    const response = await worker.fetch(
      new Request('https://example.com/some-page'),
      mockEnv,
      mockCtx,
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
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

  // We mock @vertz/ui-server's createSSRHandler to isolate wiring logic.
  // The mock returns a handler that echoes 'SSR Module' so we can verify routing.
  const mockSSRRequestHandler = vi.fn().mockResolvedValue(
    new Response('<html>SSR Module</html>', {
      headers: { 'Content-Type': 'text/html' },
    }),
  );
  const mockCreateSSRHandler = vi.fn().mockReturnValue(mockSSRRequestHandler);

  beforeEach(() => {
    vi.doMock('@vertz/ui-server/ssr', () => ({
      createSSRHandler: mockCreateSSRHandler,
    }));
    mockSSRRequestHandler.mockClear();
    mockCreateSSRHandler.mockClear();
  });

  afterEach(() => {
    vi.doUnmock('@vertz/ui-server/ssr');
  });

  it('routes non-API requests through the SSR handler created from module config', async () => {
    const { createHandler: freshCreateHandler } = await import('../src/handler.js');

    const ssrModule = { App: () => ({}) };
    const worker = freshCreateHandler({
      app: () => mockApp(),
      basePath: '/api',
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
      basePath: '/api',
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
      basePath: '/api',
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
      basePath: '/api',
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
      basePath: '/api',
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
