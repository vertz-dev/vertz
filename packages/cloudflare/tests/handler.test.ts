import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { AppBuilder } from '@vertz/core';
import { createHandler, generateHTMLTemplate, generateNonce } from '../src/handler.js';

function mockApp(handler?: (...args: unknown[]) => Promise<Response>): AppBuilder {
  return {
    handler: handler ?? mock().mockResolvedValue(new Response('OK')),
  } as unknown as AppBuilder;
}

describe('createHandler', () => {
  it('returns proper Worker export with fetch method', () => {
    const mockHandler = mock().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp);

    expect(worker).toHaveProperty('fetch');
    expect(typeof worker.fetch).toBe('function');
  });

  it('forwards requests to the vertz handler', async () => {
    const mockResponse = new Response('Hello from handler');
    const mockHandler = mock().mockResolvedValue(mockResponse);
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
    const mockHandler = mock().mockResolvedValue(new Response('OK'));
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
    const mockHandler = mock().mockResolvedValue(new Response('OK'));
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
    const mockHandler = mock().mockResolvedValue(new Response('OK'));
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
    const mockHandler = mock().mockResolvedValue(new Response('OK'));
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
    const mockHandler = mock().mockResolvedValue(new Response('OK'));
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
    const mockHandler = mock().mockResolvedValue(mockResponse);
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
    const mockHandler = mock().mockRejectedValue(testError);
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
    const apiHandler = mock().mockResolvedValue(
      new Response('{"items":[]}', {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const ssrHandler = mock().mockResolvedValue(
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
    const apiHandler = mock().mockResolvedValue(new Response('OK'));
    const appFactory = mock().mockReturnValue(mockApp(apiHandler));

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
      app: () => mockApp(mock().mockImplementation(() => new Response('OK'))),
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
    const apiHandler = mock().mockResolvedValue(new Response('OK'));

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
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    const worker = createHandler({
      app: () => mockApp(mock().mockRejectedValue(new Error('DB connection failed'))),
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
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

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
  const mockSSRRequestHandler = mock().mockResolvedValue(
    new Response('<html>SSR Module</html>', {
      headers: { 'Content-Type': 'text/html' },
    }),
  );
  const mockCreateSSRHandler = mock().mockReturnValue(mockSSRRequestHandler);

  beforeEach(() => {
    mock.module('@vertz/ui-server/ssr', () => ({
      createSSRHandler: mockCreateSSRHandler,
    }));
    mockSSRRequestHandler.mockClear();
    mockCreateSSRHandler.mockClear();
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

    const ssrCallback = mock().mockResolvedValue(
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

    const apiHandler = mock().mockResolvedValue(
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
      app: () => mockApp(mock().mockImplementation(() => new Response('OK'))),
      basePath: '/api',
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
      app: () => mockApp(mock().mockImplementation(() => new Response('OK'))),
      basePath: '/api',
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
      app: () => mockApp(mock().mockImplementation(() => new Response('OK'))),
      basePath: '/api',
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
      basePath: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      securityHeaders: true,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    const csp = response.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  });

  it('applies nonce-based CSP to 404 responses', async () => {
    const worker = createHandler({
      app: () => mockApp(),
      basePath: '/api',
      securityHeaders: true,
    });

    const response = await worker.fetch(
      new Request('https://example.com/some-page'),
      mockEnv,
      mockCtx,
    );

    expect(response.status).toBe(404);
    const csp = response.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  });

  it('applies nonce-based CSP to 500 error responses', async () => {
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    const worker = createHandler({
      app: () => mockApp(mock().mockRejectedValue(new Error('fail'))),
      basePath: '/api',
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
    const apiHandler = mock().mockResolvedValue(new Response('API'));
    const optimizerHandler = mock(fakeImageOptimizerHandler());

    const worker = createHandler({
      app: () => mockApp(apiHandler),
      basePath: '/api',
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
      basePath: '/api',
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
    const apiHandler = mock().mockResolvedValue(
      new Response('{"items":[]}', {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const optimizerHandler = mock(fakeImageOptimizerHandler());

    const worker = createHandler({
      app: () => mockApp(apiHandler),
      basePath: '/api',
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
    const ssrHandler = mock().mockResolvedValue(
      new Response('<html>SSR</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    const optimizerHandler = mock(fakeImageOptimizerHandler());

    const worker = createHandler({
      app: () => mockApp(),
      basePath: '/api',
      ssr: ssrHandler,
      imageOptimizer: optimizerHandler,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(ssrHandler).toHaveBeenCalled();
    expect(optimizerHandler).not.toHaveBeenCalled();
    expect(await response.text()).toBe('<html>SSR</html>');
  });

  it('falls through to SSR or 404 when no imageOptimizer configured', async () => {
    const worker = createHandler({
      app: () => mockApp(),
      basePath: '/api',
    });

    const response = await worker.fetch(
      new Request('https://example.com/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fx.jpg'),
      mockEnv,
      mockCtx,
    );

    // No optimizer → falls through to 404 (no SSR configured either)
    expect(response.status).toBe(404);
  });

  it('image optimizer route takes priority over basePath when both could match', async () => {
    const apiHandler = mock().mockResolvedValue(new Response('API'));
    const optimizerHandler = mock(fakeImageOptimizerHandler());

    // Edge case: basePath is /_vertz — optimizer route should still win
    const worker = createHandler({
      app: () => mockApp(apiHandler),
      basePath: '/_vertz',
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
    const ssrHandler = mock().mockResolvedValue(
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
      basePath: '/api',
      ssr: ssrHandler,
      beforeRender: async () => redirectResponse,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
    expect(ssrHandler).not.toHaveBeenCalled();
  });

  it('proceeds with SSR when beforeRender returns undefined', async () => {
    const ssrHandler = mock().mockResolvedValue(
      new Response('<html>SSR</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const worker = createHandler({
      app: () => mockApp(),
      basePath: '/api',
      ssr: ssrHandler,
      beforeRender: async () => undefined,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(ssrHandler).toHaveBeenCalled();
    expect(await response.text()).toBe('<html>SSR</html>');
  });

  it('proceeds normally when no beforeRender hook is provided (backward compat)', async () => {
    const ssrHandler = mock().mockResolvedValue(
      new Response('<html>SSR</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const worker = createHandler({
      app: () => mockApp(),
      basePath: '/api',
      ssr: ssrHandler,
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(ssrHandler).toHaveBeenCalled();
    expect(await response.text()).toBe('<html>SSR</html>');
  });

  it('passes request and env to the beforeRender hook', async () => {
    const beforeRender = mock().mockResolvedValue(undefined);
    const env = { DB: {}, AUTH_SECRET: 'secret' };

    const worker = createHandler({
      app: () => mockApp(),
      basePath: '/api',
      ssr: () => Promise.resolve(new Response('<html></html>')),
      beforeRender,
    });

    const request = new Request('https://example.com/dashboard');
    await worker.fetch(request, env, mockCtx);

    expect(beforeRender).toHaveBeenCalledWith(request, env);
  });

  it('short-circuits even when no SSR handler is configured (non-SSR routes)', async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: '/login' },
    });

    const worker = createHandler({
      app: () => mockApp(),
      basePath: '/api',
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
      basePath: '/api',
      securityHeaders: true,
      beforeRender: async () => new Response('Redirecting', { status: 302 }),
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, mockCtx);

    expect(response.status).toBe(302);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('does not run beforeRender for API routes', async () => {
    const apiHandler = mock().mockResolvedValue(new Response('{"ok":true}'));
    const beforeRender = mock().mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: '/login' } }),
    );

    const worker = createHandler({
      app: () => mockApp(apiHandler),
      basePath: '/api',
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
    const beforeRender = mock().mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: '/login' } }),
    );
    const optimizerHandler = mock().mockResolvedValue(
      new Response('optimized-image', {
        headers: { 'Content-Type': 'image/webp' },
      }),
    );

    const worker = createHandler({
      app: () => mockApp(),
      basePath: '/api',
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
