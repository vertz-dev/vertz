import { afterEach, describe, expect, it } from '@vertz/test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { defineTheme, font } from '@vertz/ui';
import type { AuthSdk } from '@vertz/ui/auth';
import { AuthProvider } from '@vertz/ui/auth';
import { ProtectedRoute } from '@vertz/ui-auth';
import { createNodeHandler } from '../node-handler';
import { registerSSRQuery } from '../ssr-context';
import type { SSRModule } from '../ssr-shared';

/** Inline ok() helper to avoid @vertz/fetch dependency. */
function ok<T>(data: T) {
  return { ok: true as const, data };
}

function createMockAuthSdk(): AuthSdk {
  const noop = Object.assign(
    async () =>
      ok({
        user: { id: '1', email: 'test@test.com', role: 'user' },
        expiresAt: Date.now() + 60_000,
      }),
    { url: '/api/auth/signin', method: 'POST' },
  );
  return {
    signIn: noop,
    signUp: Object.assign(
      async () =>
        ok({
          user: { id: '1', email: 'test@test.com', role: 'user' },
          expiresAt: Date.now() + 60_000,
        }),
      { url: '/api/auth/signup', method: 'POST' },
    ),
    signOut: async () => ok({ ok: true }),
    refresh: async () =>
      ok({
        user: { id: '1', email: 'test@test.com', role: 'user' },
        expiresAt: Date.now() + 60_000,
      }),
    providers: async () => ok([]),
  };
}

const simpleModule: SSRModule = {
  default: () => {
    const el = document.createElement('div');
    el.textContent = 'Hello World';
    return el;
  },
};

const template = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><div id="app"><!--ssr-outlet--></div></body>
</html>`;

/** Helper to create a test server and get its port. */
async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; port: number }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  return { server, port };
}

/** Helper to close a server. */
function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe('createNodeHandler', () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (server) {
      await closeServer(server);
      server = null;
    }
  });

  describe('Phase 1: Buffered HTML', () => {
    describe('Given createNodeHandler with an SSR module', () => {
      describe('When a GET request arrives at /', () => {
        it('Then writes SSR HTML directly to ServerResponse', async () => {
          const handler = createNodeHandler({ module: simpleModule, template });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`);
          expect(res.status).toBe(200);
          const html = await res.text();
          expect(html).toContain('Hello World');
          expect(html).toContain('<!DOCTYPE html>');
        });

        it('Then sets Content-Type to text/html; charset=utf-8', async () => {
          const handler = createNodeHandler({ module: simpleModule, template });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`);
          expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
        });

        it('Then sets Cache-Control when configured', async () => {
          const handler = createNodeHandler({
            module: simpleModule,
            template,
            cacheControl: 'public, max-age=3600',
          });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`);
          expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
        });
      });
    });

    describe('When SSR render returns a redirect', () => {
      // TODO: ProtectedRoute SSR redirect requires native compiler for signal
      // auto-unwrap on AuthContext. When @vertz/ui-auth is built without the native
      // compiler (CI uses Bun JSX fallback), ctx.status remains a Signal object
      // instead of unwrapping to the string value, so shouldRedirect is always false.
      it.todo('Then writes 302 with Location header');
    });

    describe('When SSR render throws', () => {
      it('Then writes 500 with plain text error', async () => {
        const crashModule: SSRModule = {
          default: () => {
            throw new Error('Render crash');
          },
        };
        const handler = createNodeHandler({ module: crashModule, template });
        const result = await startServer(handler);
        server = result.server;

        const res = await fetch(`http://localhost:${result.port}/`);
        expect(res.status).toBe(500);
        const body = await res.text();
        expect(body).toBe('Internal Server Error');
      });

      it('Then does not leave the response hanging', async () => {
        const crashModule: SSRModule = {
          default: () => {
            throw new Error('crash');
          },
        };
        const handler = createNodeHandler({ module: crashModule, template });
        const result = await startServer(handler);
        server = result.server;

        // If response doesn't end, this will timeout
        const res = await fetch(`http://localhost:${result.port}/`);
        expect(res.status).toBe(500);
      });
    });

    describe('When sessionResolver is configured', () => {
      it('Then constructs a Request with all IncomingMessage headers', async () => {
        let capturedRequest: Request | null = null;

        const handler = createNodeHandler({
          module: simpleModule,
          template,
          sessionResolver: async (request) => {
            capturedRequest = request;
            return null;
          },
        });
        const result = await startServer(handler);
        server = result.server;

        await fetch(`http://localhost:${result.port}/test-path`, {
          headers: {
            Cookie: 'session=abc123',
            Authorization: 'Bearer token',
            'X-Custom': 'value',
          },
        });

        expect(capturedRequest).not.toBeNull();
        expect(capturedRequest!.headers.get('cookie')).toBe('session=abc123');
        expect(capturedRequest!.headers.get('authorization')).toBe('Bearer token');
        expect(capturedRequest!.headers.get('x-custom')).toBe('value');
      });

      it('Then injects session script into HTML', async () => {
        const handler = createNodeHandler({
          module: simpleModule,
          template,
          sessionResolver: async () => ({
            session: {
              user: { id: '1', email: 'test@test.com', role: 'admin' },
              expiresAt: Date.now() + 60_000,
            },
          }),
        });
        const result = await startServer(handler);
        server = result.server;

        const res = await fetch(`http://localhost:${result.port}/`);
        const html = await res.text();
        expect(html).toContain('__VERTZ_SESSION__');
      });

      it('Then degrades gracefully when resolver throws', async () => {
        const handler = createNodeHandler({
          module: simpleModule,
          template,
          sessionResolver: async () => {
            throw new Error('Redis timeout');
          },
        });
        const result = await startServer(handler);
        server = result.server;

        const res = await fetch(`http://localhost:${result.port}/`);
        // Should still return HTML, just without session (200 for routerless modules)
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('Hello World');
        expect(html).not.toContain('__VERTZ_SESSION__');
      });
    });

    describe('When inlineCSS is configured', () => {
      it('Then inlines CSS into the template', async () => {
        const templateWithCSS = `<!DOCTYPE html>
<html>
<head><title>Test</title><link rel="stylesheet" href="/assets/vertz.css"></head>
<body><div id="app"><!--ssr-outlet--></div></body>
</html>`;

        const handler = createNodeHandler({
          module: simpleModule,
          template: templateWithCSS,
          inlineCSS: { '/assets/vertz.css': '.app { color: red; }' },
        });
        const result = await startServer(handler);
        server = result.server;

        const res = await fetch(`http://localhost:${result.port}/`);
        const html = await res.text();
        expect(html).toContain('data-vertz-css');
        expect(html).toContain('.app { color: red; }');
        expect(html).not.toContain('href="/assets/vertz.css"');
      });
    });

    describe('When SSR data is present', () => {
      it('Then includes __VERTZ_SSR_DATA__ in the HTML', async () => {
        let callCount = 0;
        const moduleWithQuery: SSRModule = {
          default: () => {
            callCount++;
            if (callCount === 1) {
              registerSSRQuery({
                key: 'items',
                promise: Promise.resolve([1, 2, 3]),
                timeout: 300,
                resolve: () => {},
              });
            }
            const el = document.createElement('div');
            el.textContent = 'Content';
            return el;
          },
        };

        const handler = createNodeHandler({
          module: moduleWithQuery,
          template,
        });
        const result = await startServer(handler);
        server = result.server;

        const res = await fetch(`http://localhost:${result.port}/`);
        const html = await res.text();
        expect(html).toContain('__VERTZ_SSR_DATA__');
      });
    });

    describe('When theme with font preloads is configured', () => {
      it('Then sets Link header for font preloads', async () => {
        const sans = font('DM Sans', {
          weight: '100..1000',
          src: '/fonts/dm-sans.woff2',
          fallback: ['system-ui', 'sans-serif'],
        });
        const theme = defineTheme({
          colors: { primary: { 500: '#3b82f6' } },
          fonts: { sans },
        });

        const moduleWithTheme: SSRModule = {
          ...simpleModule,
          theme,
        };

        const handler = createNodeHandler({
          module: moduleWithTheme,
          template,
        });
        const result = await startServer(handler);
        server = result.server;

        const res = await fetch(`http://localhost:${result.port}/`);
        const linkHeader = res.headers.get('link');
        expect(linkHeader).toContain('rel=preload');
        expect(linkHeader).toContain('/fonts/dm-sans.woff2');

        const html = await res.text();
        expect(html).toContain('--color-primary');
      });
    });

    describe('When modulepreload paths are configured', () => {
      it('Then injects modulepreload tags', async () => {
        const handler = createNodeHandler({
          module: simpleModule,
          template,
          modulepreload: ['/assets/chunk-abc.js', '/assets/chunk-def.js'],
        });
        const result = await startServer(handler);
        server = result.server;

        const res = await fetch(`http://localhost:${result.port}/`);
        const html = await res.text();
        expect(html).toContain('rel="modulepreload"');
        expect(html).toContain('/assets/chunk-abc.js');
        expect(html).toContain('/assets/chunk-def.js');
      });
    });
  });

  describe('Phase 2: Progressive streaming', () => {
    describe('Given createNodeHandler with progressiveHTML: true', () => {
      describe('When a page request arrives', () => {
        it('Then streams HTML chunks directly to ServerResponse', async () => {
          const handler = createNodeHandler({
            module: simpleModule,
            template,
            progressiveHTML: true,
          });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`);
          expect(res.status).toBe(200);
          expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
          const html = await res.text();
          expect(html).toContain('Hello World');
          expect(html).toContain('<!DOCTYPE html>');
          expect(html).toContain('</html>');
        });

        it('Then includes SSR data script in tail', async () => {
          let callCount = 0;
          const moduleWithQuery: SSRModule = {
            default: () => {
              callCount++;
              if (callCount === 1) {
                registerSSRQuery({
                  key: 'stream-data',
                  promise: Promise.resolve({ msg: 'hello' }),
                  timeout: 300,
                  resolve: () => {},
                });
              }
              const el = document.createElement('div');
              el.textContent = 'Streamed';
              return el;
            },
          };

          const handler = createNodeHandler({
            module: moduleWithQuery,
            template,
            progressiveHTML: true,
          });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`);
          const html = await res.text();
          expect(html).toContain('__VERTZ_SSR_DATA__');
        });
      });

      describe('When render returns a redirect', () => {
        // TODO: ProtectedRoute SSR redirect requires native compiler for signal
        // auto-unwrap on AuthContext. When @vertz/ui-auth is built without the native
        // compiler (CI uses Bun JSX fallback), ctx.status remains a Signal object
        // instead of unwrapping to the string value, so shouldRedirect is always false.
        it.todo('Then writes 302 with Location header');
      });

      describe('When sessionResolver is configured', () => {
        it('Then injects session script into streamed HTML', async () => {
          const handler = createNodeHandler({
            module: simpleModule,
            template,
            progressiveHTML: true,
            sessionResolver: async () => ({
              session: {
                user: { id: '1', email: 'test@test.com', role: 'admin' },
                expiresAt: Date.now() + 60_000,
              },
            }),
          });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`);
          const html = await res.text();
          expect(html).toContain('__VERTZ_SESSION__');
          expect(html).toContain('</head>');
          expect(html).toContain('</html>');
        });
      });

      describe('When template has no </head> tag', () => {
        it('Then appends injections at end of head chunk', async () => {
          const noHeadTemplate = `<!DOCTYPE html><html><body><div id="app"><!--ssr-outlet--></div></body></html>`;
          const handler = createNodeHandler({
            module: simpleModule,
            template: noHeadTemplate,
            progressiveHTML: true,
            sessionResolver: async () => ({
              session: {
                user: { id: '1', email: 'test@test.com', role: 'admin' },
                expiresAt: Date.now() + 60_000,
              },
            }),
          });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`);
          const html = await res.text();
          expect(html).toContain('__VERTZ_SESSION__');
          expect(html).toContain('Hello World');
        });
      });

      describe('When Cache-Control is configured', () => {
        it('Then sets Cache-Control header on streamed response', async () => {
          const handler = createNodeHandler({
            module: simpleModule,
            template,
            progressiveHTML: true,
            cacheControl: 'no-store',
          });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`);
          expect(res.headers.get('cache-control')).toBe('no-store');
        });
      });

      describe('When render throws', () => {
        it('Then writes 500 error response', async () => {
          const crashModule: SSRModule = {
            default: () => {
              throw new Error('Stream crash');
            },
          };
          const handler = createNodeHandler({
            module: crashModule,
            template,
            progressiveHTML: true,
          });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`);
          expect(res.status).toBe(500);
        });
      });
    });
  });

  describe('AOT manifest integration', () => {
    describe('Given an AOT manifest with a matching route', () => {
      describe('When a GET request arrives for that route', () => {
        it('Then renders via AOT string concatenation', async () => {
          const aotManifest = {
            routes: {
              '/projects/board': {
                render: () => '<div class="board">AOT Board</div>',
                holes: [],
                queryKeys: [],
              },
            },
          };

          const handler = createNodeHandler({
            module: simpleModule,
            template,
            aotManifest,
          });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/projects/board`);
          expect(res.status).toBe(200);
          const html = await res.text();
          expect(html).toContain('AOT Board');
        });
      });
    });

    describe('Given an AOT manifest without a match for the requested route', () => {
      describe('When a GET request arrives', () => {
        it('Then falls back to ssrRenderSinglePass', async () => {
          const aotManifest = {
            routes: {
              '/projects/board': {
                render: () => '<div>AOT Board</div>',
                holes: [],
                queryKeys: [],
              },
            },
          };

          const handler = createNodeHandler({
            module: simpleModule,
            template,
            aotManifest,
          });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/settings`);
          const html = await res.text();
          expect(html).toContain('Hello World');
          expect(res.status).toBe(200);
        });
      });
    });

    describe('Given no AOT manifest', () => {
      describe('When a GET request arrives', () => {
        it('Then renders via ssrRenderSinglePass (backward compatible)', async () => {
          const handler = createNodeHandler({
            module: simpleModule,
            template,
          });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`);
          const html = await res.text();
          expect(html).toContain('Hello World');
          expect(res.status).toBe(200);
        });
      });
    });
  });

  describe('Phase 3: SSE nav pre-fetch', () => {
    describe('Given a request with X-Vertz-Nav: 1 header', () => {
      describe('When queries are discovered for the URL', () => {
        it('Then streams SSE events directly to ServerResponse', async () => {
          const moduleWithQuery: SSRModule = {
            default: () => {
              registerSSRQuery({
                key: 'nav-data',
                promise: Promise.resolve({ id: 42 }),
                timeout: 300,
                resolve: () => {},
              });
              const el = document.createElement('div');
              el.textContent = 'App';
              return el;
            },
          };

          const handler = createNodeHandler({
            module: moduleWithQuery,
            template,
          });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/tasks/42`, {
            headers: { 'X-Vertz-Nav': '1' },
          });

          expect(res.status).toBe(200);
          const body = await res.text();
          expect(body).toContain('event: data');
          expect(body).toContain('"nav-data"');
          expect(body).toContain('event: done');
        });

        it('Then sets Content-Type to text/event-stream', async () => {
          const handler = createNodeHandler({ module: simpleModule, template });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`, {
            headers: { 'X-Vertz-Nav': '1' },
          });
          expect(res.headers.get('content-type')).toBe('text/event-stream');
        });

        it('Then sets Cache-Control to no-cache', async () => {
          const handler = createNodeHandler({ module: simpleModule, template });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`, {
            headers: { 'X-Vertz-Nav': '1' },
          });
          expect(res.headers.get('cache-control')).toBe('no-cache');
        });
      });

      describe('When URL has query parameters', () => {
        it('Then passes pathname without query string to SSR', async () => {
          const handler = createNodeHandler({ module: simpleModule, template });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/page?foo=bar`, {
            headers: { 'X-Vertz-Nav': '1' },
          });
          expect(res.status).toBe(200);
          expect(res.headers.get('content-type')).toBe('text/event-stream');
        });
      });

      describe('When SSE streaming fails', () => {
        it('Then writes graceful fallback (done event)', async () => {
          const crashModule: SSRModule = {
            default: () => {
              throw new Error('SSE crash');
            },
          };
          const handler = createNodeHandler({ module: crashModule, template });
          const result = await startServer(handler);
          server = result.server;

          const res = await fetch(`http://localhost:${result.port}/`, {
            headers: { 'X-Vertz-Nav': '1' },
          });
          expect(res.status).toBe(200);
          const body = await res.text();
          expect(body).toContain('event: done');
          expect(body).toContain('data: {}');
        });
      });
    });
  });
});
