import { describe, expect, it, spyOn } from 'bun:test';
import {
  createRouter,
  defineRoutes,
  defineTheme,
  Outlet,
  RouterContext,
  RouterView,
} from '@vertz/ui';
import type { AuthSdk } from '@vertz/ui/auth';
import { AuthProvider, useAuth } from '@vertz/ui/auth';
import { getSSRContext } from '@vertz/ui/internals';
import { ProtectedRoute } from '@vertz/ui-auth';
import { installDomShim } from '../dom-shim';
import { registerSSRQuery } from '../ssr-context';
import { ssrDiscoverQueries, ssrRenderToString, ssrStreamNavQueries } from '../ssr-render';

/** Inline ok() helper to avoid @vertz/fetch dependency. */
function ok<T>(data: T) {
  return { ok: true as const, data };
}

// Install DOM shim for tests that create routers outside SSR context.
// In production, ensureDomShim() runs at startup; tests need it too.
installDomShim();

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

describe('ssrRenderToString', () => {
  it('returns { html, css, ssrData } shape', async () => {
    const module = {
      default: () => {
        // Simple component that returns a div
        const el = document.createElement('div');
        el.textContent = 'Hello SSR';
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/');

    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('css');
    expect(result).toHaveProperty('ssrData');
    expect(typeof result.html).toBe('string');
    expect(typeof result.css).toBe('string');
    expect(Array.isArray(result.ssrData)).toBe(true);
    expect(result.html).toContain('Hello SSR');
  });

  it('two-pass rendering resolves queries and includes data in ssrData', async () => {
    let callCount = 0;
    const module = {
      default: () => {
        callCount++;
        if (callCount === 1) {
          // Pass 1: register a query
          const resolve = (_data: unknown) => {};
          registerSSRQuery({
            key: 'tasks',
            promise: Promise.resolve({ items: ['task1', 'task2'] }),
            timeout: 300,
            resolve,
          });
        }
        const el = document.createElement('div');
        el.textContent = `Render pass ${callCount}`;
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/');

    expect(callCount).toBe(2); // Two passes
    expect(result.ssrData).toHaveLength(1);
    expect(result.ssrData[0].key).toBe('tasks');
    expect(result.ssrData[0].data).toEqual({ items: ['task1', 'task2'] });
    expect(result.html).toContain('Render pass 2');
  });

  it('includes compiled theme CSS when module exports theme', async () => {
    const theme = defineTheme({
      colors: {
        primary: { DEFAULT: '#3b82f6' },
        background: { DEFAULT: '#ffffff' },
      },
    });

    const module = {
      default: () => {
        const el = document.createElement('div');
        el.textContent = 'Themed';
        return el;
      },
      theme,
    };

    const result = await ssrRenderToString(module, '/');

    expect(result.css).toContain('--color-primary');
    expect(result.css).toContain('--color-background');
    expect(result.css).toContain('data-vertz-css');
  });

  it('respects ssrTimeout — slow query not included in ssrData', async () => {
    const module = {
      default: () => {
        // Register a query that takes too long
        registerSSRQuery({
          key: 'slow-query',
          promise: new Promise((resolve) => setTimeout(() => resolve({ data: 'late' }), 5000)),
          timeout: 50, // 50ms timeout
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/', { ssrTimeout: 50 });

    // Slow query should have timed out and not be included
    expect(result.ssrData).toHaveLength(0);
    expect(result.html).toContain('App');
  });
});

describe('ssrDiscoverQueries', () => {
  it('returns resolved query data without rendering HTML', async () => {
    let callCount = 0;
    const module = {
      default: () => {
        callCount++;
        registerSSRQuery({
          key: 'tasks',
          promise: Promise.resolve({ items: ['a', 'b'] }),
          timeout: 300,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const result = await ssrDiscoverQueries(module, '/tasks');

    // Only Pass 1 — called once
    expect(callCount).toBe(1);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].key).toBe('tasks');
    expect(result.resolved[0].data).toEqual({ items: ['a', 'b'] });
  });
});

/** Helper: read a ReadableStream<Uint8Array> to a string. */
async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe('ssrStreamNavQueries', () => {
  it('returns a ReadableStream with individual SSE events for resolved queries', async () => {
    const module = {
      default: () => {
        registerSSRQuery({
          key: 'tasks',
          promise: Promise.resolve({ items: ['a', 'b'] }),
          timeout: 300,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const stream = await ssrStreamNavQueries(module, '/tasks');
    expect(stream).toBeInstanceOf(ReadableStream);

    const text = await streamToText(stream);
    // Should contain individual data event
    expect(text).toContain('event: data\n');
    expect(text).toContain('"key":"tasks"');
    // Should end with done event
    expect(text).toContain('event: done\ndata: {}\n\n');
  });

  it('silently closes timed-out queries (no pending event)', async () => {
    const module = {
      default: () => {
        registerSSRQuery({
          key: 'slow-query',
          promise: new Promise((resolve) => setTimeout(() => resolve({ data: 'late' }), 5000)),
          timeout: 50,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const stream = await ssrStreamNavQueries(module, '/', { navSsrTimeout: 50 });
    const text = await streamToText(stream);

    // No pending event — just closes with done
    expect(text).not.toContain('event: pending');
    expect(text).not.toContain('event: data');
    expect(text).toContain('event: done\ndata: {}\n\n');
  });

  it('emits data for fast query, silently drops slow query', async () => {
    const module = {
      default: () => {
        registerSSRQuery({
          key: 'fast-query',
          promise: Promise.resolve({ items: [1] }),
          timeout: 300,
          resolve: () => {},
        });
        registerSSRQuery({
          key: 'slow-query',
          promise: new Promise((resolve) => setTimeout(() => resolve('late'), 5000)),
          timeout: 50,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const stream = await ssrStreamNavQueries(module, '/', { navSsrTimeout: 50 });
    const text = await streamToText(stream);

    expect(text).toContain('event: data\n');
    expect(text).toContain('"key":"fast-query"');
    // No pending event for slow query
    expect(text).not.toContain('event: pending');
    expect(text).toContain('event: done\ndata: {}\n\n');
  });

  it('uses navSsrTimeout (default 5000ms) for streaming nav queries', async () => {
    // A query that takes 100ms should resolve within default 5000ms timeout
    const module = {
      default: () => {
        registerSSRQuery({
          key: 'medium-query',
          promise: new Promise((resolve) => setTimeout(() => resolve({ data: 'ok' }), 100)),
          timeout: 5000,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const stream = await ssrStreamNavQueries(module, '/');
    const text = await streamToText(stream);

    // Should resolve as data, not timeout
    expect(text).toContain('event: data\n');
    expect(text).toContain('"key":"medium-query"');
    expect(text).not.toContain('event: pending');
  });

  it('emits done event when no queries are registered', async () => {
    const module = {
      default: () => {
        const el = document.createElement('div');
        el.textContent = 'No queries';
        return el;
      },
    };

    const stream = await ssrStreamNavQueries(module, '/');
    const text = await streamToText(stream);

    expect(text).toBe('event: done\ndata: {}\n\n');
  });

  it('releases render lock before streaming begins', async () => {
    const module = {
      default: () => {
        registerSSRQuery({
          key: 'q1',
          promise: new Promise((r) => setTimeout(() => r({ data: 1 }), 50)),
          timeout: 300,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    // Start streaming — should release lock after discovery
    const streamPromise = ssrStreamNavQueries(module, '/');

    // A concurrent render should succeed (not blocked by the stream)
    const renderModule = {
      default: () => {
        const el = document.createElement('div');
        el.textContent = 'Concurrent';
        return el;
      },
    };

    const [stream, renderResult] = await Promise.all([
      streamPromise,
      ssrRenderToString(renderModule, '/concurrent'),
    ]);

    expect(renderResult.html).toContain('Concurrent');
    // Clean up the stream
    await streamToText(stream);
  });
});

describe('ssrStreamNavQueries abort safety', () => {
  it('does not crash when stream is cancelled before queries settle', async () => {
    const module = {
      default: () => {
        registerSSRQuery({
          key: 'slow-q',
          // This promise resolves AFTER we cancel the stream
          promise: new Promise((r) => setTimeout(() => r({ data: 'late' }), 100)),
          timeout: 300,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const stream = await ssrStreamNavQueries(module, '/');
    const reader = stream.getReader();

    // Cancel the stream immediately (simulates client navigating away)
    await reader.cancel();

    // Wait for the query promise and timeout to fire
    await new Promise((r) => setTimeout(r, 200));

    // If we got here without throwing, the abort-safety works
    expect(true).toBe(true);
  });
});

describe('SSR lazy route resolution', () => {
  it('resolves lazy route components and includes content in SSR HTML', async () => {
    const routes = defineRoutes({
      '/': {
        component: () => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'home');
          el.textContent = 'Home Page';
          return el;
        },
      },
      '/about': {
        component: async () => ({
          default: () => {
            const el = document.createElement('div');
            el.setAttribute('data-testid', 'about');
            el.textContent = 'About Page Content';
            return el;
          },
        }),
      },
    });

    const module = {
      default: () => {
        const router = createRouter(routes);
        const container = document.createElement('div');
        RouterContext.Provider(router, () => {
          container.appendChild(RouterView({ router }));
        });
        return container;
      },
    };

    // SSR render for /about — lazy component should be resolved
    const result = await ssrRenderToString(module, '/about');
    expect(result.html).toContain('About Page Content');
    expect(result.html).toContain('data-testid="about"');
  });

  it('sync routes still work unchanged alongside lazy routes', async () => {
    const routes = defineRoutes({
      '/': {
        component: () => {
          const el = document.createElement('div');
          el.textContent = 'Home';
          return el;
        },
      },
      '/lazy': {
        component: async () => ({
          default: () => {
            const el = document.createElement('div');
            el.textContent = 'Lazy';
            return el;
          },
        }),
      },
    });

    const module = {
      default: () => {
        const router = createRouter(routes);
        const container = document.createElement('div');
        RouterContext.Provider(router, () => {
          container.appendChild(RouterView({ router }));
        });
        return container;
      },
    };

    // Sync route should work as before
    const result = await ssrRenderToString(module, '/');
    expect(result.html).toContain('Home');
  });

  it('resolves nested lazy routes (lazy layout + lazy child)', async () => {
    const routes = defineRoutes({
      '/docs': {
        component: async () => ({
          default: () => {
            const wrapper = document.createElement('div');
            wrapper.setAttribute('data-testid', 'docs-layout');
            wrapper.textContent = 'Docs Layout';
            wrapper.appendChild(Outlet() as HTMLElement);
            return wrapper;
          },
        }),
        children: {
          '/': {
            component: async () => ({
              default: () => {
                const el = document.createElement('div');
                el.setAttribute('data-testid', 'docs-index');
                el.textContent = 'Docs Index Content';
                return el;
              },
            }),
          },
        },
      },
    });

    const module = {
      default: () => {
        const router = createRouter(routes);
        const container = document.createElement('div');
        RouterContext.Provider(router, () => {
          container.appendChild(RouterView({ router }));
        });
        return container;
      },
    };

    const result = await ssrRenderToString(module, '/docs/');
    expect(result.html).toContain('Docs Layout');
    expect(result.html).toContain('Docs Index Content');
    expect(result.html).toContain('data-testid="docs-layout"');
    expect(result.html).toContain('data-testid="docs-index"');
  });

  it('timed-out lazy components fall back to empty container', async () => {
    const routes = defineRoutes({
      '/slow': {
        // A component that never resolves — simulates a very slow lazy load
        component: () => new Promise<{ default: () => Node }>(() => {}),
      },
    });

    const module = {
      default: () => {
        const router = createRouter(routes);
        const container = document.createElement('div');
        RouterContext.Provider(router, () => {
          container.appendChild(RouterView({ router }));
        });
        return container;
      },
    };

    // With a very short timeout, the lazy component should time out
    const result = await ssrRenderToString(module, '/slow', { ssrTimeout: 10 });
    // Should still produce valid HTML, just without the lazy content
    expect(result.html).toBeDefined();
    expect(result.html).not.toContain('Slow Content');
  });
});

describe('per-request isolation', () => {
  it('concurrent ssrRenderToString calls do not interfere', async () => {
    const makeModule = (label: string) => ({
      default: () => {
        registerSSRQuery({
          key: `query-${label}`,
          promise: Promise.resolve({ label }),
          timeout: 300,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = label;
        return el;
      },
    });

    const [result1, result2] = await Promise.all([
      ssrRenderToString(makeModule('A'), '/a'),
      ssrRenderToString(makeModule('B'), '/b'),
    ]);

    // Each result should only have its own query
    expect(result1.ssrData).toHaveLength(1);
    expect(result1.ssrData[0].key).toBe('query-A');
    expect(result1.html).toContain('A');

    expect(result2.ssrData).toHaveLength(1);
    expect(result2.ssrData[0].key).toBe('query-B');
    expect(result2.html).toContain('B');
  });

  it('concurrent renders with async queries all succeed without 500s', async () => {
    // Simulate real-world scenario: same module rendered concurrently with
    // async queries that yield the event loop (causing actual interleaving)
    const makeModule = (label: string) => ({
      default: () => {
        registerSSRQuery({
          key: `data-${label}`,
          // Use a real async delay to force event loop interleaving
          promise: new Promise((resolve) => setTimeout(() => resolve({ label }), 10)),
          timeout: 300,
          resolve: () => {},
        });
        const el = document.createElement('div');
        el.textContent = label;
        return el;
      },
    });

    // Launch 10 concurrent renders — mirrors rapid browser refreshes
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => ssrRenderToString(makeModule(`req-${i}`), `/page-${i}`)),
    );

    // Every single render must succeed with correct HTML and query data
    for (let i = 0; i < 10; i++) {
      expect(results[i].html).toContain(`req-${i}`);
      expect(results[i].ssrData).toHaveLength(1);
      expect(results[i].ssrData[0].key).toBe(`data-req-${i}`);
      expect(results[i].ssrData[0].data).toEqual({ label: `req-${i}` });
    }
  });

  it('collects CSS injected during render via cssTracker', async () => {
    const { injectCSS } = await import('@vertz/ui');
    const module = {
      default: () => {
        // Simulate component CSS injection during render (realistic flow)
        injectCSS('.my-component { color: red; }');
        const el = document.createElement('div');
        el.setAttribute('class', 'my-component');
        el.textContent = 'Styled';
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/');

    // CSS injected during render should be in output
    expect(result.css).toContain('.my-component { color: red; }');
    expect(result.css).toContain('data-vertz-css');
  });

  it('consolidates multiple component CSS strings into a single style tag', async () => {
    const { injectCSS } = await import('@vertz/ui');
    const module = {
      default: () => {
        // Simulate multiple component CSS injections during render
        injectCSS('.panel { background: white; }');
        injectCSS('.button { color: blue; }');
        injectCSS('.card { border: 1px solid; }');
        const el = document.createElement('div');
        el.textContent = 'Multi CSS';
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/');

    // All CSS content should be present
    expect(result.css).toContain('.panel { background: white; }');
    expect(result.css).toContain('.button { color: blue; }');
    expect(result.css).toContain('.card { border: 1px solid; }');

    // Component CSS should be in a SINGLE style tag, not 3 separate ones
    const componentStyleTags = result.css.match(/<style data-vertz-css>/g);
    expect(componentStyleTags).toHaveLength(1);
  });

  it('consolidates globals into a single style tag', async () => {
    const module = {
      default: () => {
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
      styles: ['*, *::before { box-sizing: border-box; }', 'body { font-family: system-ui; }'],
    };

    const result = await ssrRenderToString(module, '/');

    expect(result.css).toContain('box-sizing: border-box');
    expect(result.css).toContain('font-family: system-ui');

    // Global styles should be in a SINGLE style tag
    const styleTags = result.css.match(/<style data-vertz-css>/g);
    expect(styleTags).toHaveLength(1);
  });

  it('produces at most 3 style tags (theme + globals + components)', async () => {
    const { injectCSS } = await import('@vertz/ui');
    const theme = defineTheme({
      colors: { primary: { DEFAULT: '#3b82f6' } },
    });

    const module = {
      default: () => {
        // Inject component CSS during render
        injectCSS('.a { color: red; }');
        injectCSS('.b { color: blue; }');
        const el = document.createElement('div');
        el.textContent = 'Full';
        return el;
      },
      theme,
      styles: ['body { margin: 0; }', 'h1 { font-size: 2rem; }'],
    };

    const result = await ssrRenderToString(module, '/');

    // Theme CSS, globals, and component CSS should each be at most 1 tag
    const styleTags = result.css.match(/<style data-vertz-css>/g);
    expect(styleTags!.length).toBeLessThanOrEqual(3);
    // But all content is present
    expect(result.css).toContain('--color-primary');
    expect(result.css).toContain('margin: 0');
    expect(result.css).toContain('font-size: 2rem');
    expect(result.css).toContain('.a { color: red; }');
    expect(result.css).toContain('.b { color: blue; }');
  });

  it('renders correct page for each URL when router is created per-render', async () => {
    // In SSR with per-request isolation, routers must be created inside the
    // render function (where SSR context is active). createRouter() detects
    // SSR context and returns a lightweight read-only router matched to ctx.url.
    const routes = defineRoutes({
      '/': {
        component: () => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'home-page');
          el.textContent = 'Home';
          return el;
        },
      },
      '/about': {
        component: () => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'about-page');
          el.textContent = 'About';
          return el;
        },
      },
      '/tasks/:id': {
        component: () => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'task-detail-page');
          el.textContent = 'Task Detail';
          return el;
        },
      },
    });

    const module = {
      default: () => {
        // Router created per-render — detects SSR context and uses ctx.url
        const router = createRouter(routes);
        const container = document.createElement('div');
        RouterContext.Provider(router, () => {
          const view = RouterView({ router });
          container.appendChild(view);
        });
        return container;
      },
    };

    // Render for '/' — should show home page
    const homeResult = await ssrRenderToString(module, '/');
    expect(homeResult.html).toContain('data-testid="home-page"');
    expect(homeResult.html).toContain('Home');

    // Render for '/about' — should show about page, NOT home
    const aboutResult = await ssrRenderToString(module, '/about');
    expect(aboutResult.html).toContain('data-testid="about-page"');
    expect(aboutResult.html).toContain('About');

    // Render for '/tasks/123' — should show task detail, NOT home
    const taskResult = await ssrRenderToString(module, '/tasks/123');
    expect(taskResult.html).toContain('data-testid="task-detail-page"');
    expect(taskResult.html).toContain('Task Detail');
  });

  it('includes module.styles in CSS output for every render', async () => {
    const globalResetCSS = '*, *::before, *::after { box-sizing: border-box; margin: 0; }';
    const bodyCSS = 'body { font-family: system-ui; background: var(--color-background); }';

    const module = {
      default: () => {
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
      styles: [globalResetCSS, bodyCSS],
    };

    // First render
    const result1 = await ssrRenderToString(module, '/');
    expect(result1.css).toContain('box-sizing: border-box');
    expect(result1.css).toContain('font-family: system-ui');

    // Second render — styles must still be present (not cleared by resetInjectedStyles)
    const result2 = await ssrRenderToString(module, '/page2');
    expect(result2.css).toContain('box-sizing: border-box');
    expect(result2.css).toContain('font-family: system-ui');
  });
});

describe('ssrRenderToString discoveredRoutes', () => {
  it('includes discoveredRoutes when app creates a router', async () => {
    const module = {
      default: () => {
        const routes = defineRoutes({
          '/': { component: () => document.createElement('div') },
          '/about': { component: () => document.createElement('div') },
          '/users/:id': { component: () => document.createElement('div') },
        });
        const router = createRouter(routes);
        // Access current.value to trigger lazy route discovery (as RouterView would)
        router.current.value;
        const el = document.createElement('div');
        el.textContent = 'App';
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/');

    expect(result.discoveredRoutes).toBeDefined();
    expect(result.discoveredRoutes).toContain('/');
    expect(result.discoveredRoutes).toContain('/about');
    expect(result.discoveredRoutes).toContain('/users/:id');
  });

  it('returns empty discoveredRoutes when app has no router', async () => {
    const module = {
      default: () => {
        const el = document.createElement('div');
        el.textContent = 'No router';
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/');

    // discoveredRoutes should be undefined or empty when no router is created
    expect(result.discoveredRoutes ?? []).toEqual([]);
  });

  it('discovers nested route patterns as full paths', async () => {
    const module = {
      default: () => {
        const routes = defineRoutes({
          '/docs': {
            component: () => document.createElement('div'),
            children: {
              '/': { component: () => document.createElement('div') },
              '/:slug': { component: () => document.createElement('div') },
            },
          },
        });
        const router = createRouter(routes);
        // Access current.value to trigger lazy route discovery (as RouterView would)
        router.current.value;
        const el = document.createElement('div');
        el.textContent = 'Docs';
        return el;
      },
    };

    const result = await ssrRenderToString(module, '/');

    expect(result.discoveredRoutes).toContain('/docs');
    expect(result.discoveredRoutes).toContain('/docs/:slug');
  });
});

describe('SSR redirect plumbing', () => {
  describe('Given ssrRenderToString called with ssrAuth option', () => {
    it('Then the SSRRenderContext has ssrAuth set (unauthenticated)', async () => {
      let capturedAuth: unknown;
      const module = {
        default: () => {
          const ctx = getSSRContext();
          capturedAuth = ctx?.ssrAuth;
          const el = document.createElement('div');
          el.textContent = 'App';
          return el;
        },
      };

      await ssrRenderToString(module, '/admin', {
        ssrAuth: { status: 'unauthenticated' },
      });

      expect(capturedAuth).toEqual({ status: 'unauthenticated' });
    });

    it('Then the SSRRenderContext has ssrAuth set (authenticated)', async () => {
      let capturedAuth: unknown;
      const module = {
        default: () => {
          const ctx = getSSRContext();
          capturedAuth = ctx?.ssrAuth;
          const el = document.createElement('div');
          el.textContent = 'App';
          return el;
        },
      };

      const user = { id: '1', email: 'test@example.com', role: 'admin' };
      await ssrRenderToString(module, '/admin', {
        ssrAuth: { status: 'authenticated', user, expiresAt: Date.now() + 3600_000 },
      });

      expect(capturedAuth).toEqual(expect.objectContaining({ status: 'authenticated', user }));
    });

    it('Then the SSRRenderContext has ssrAuth undefined when not provided', async () => {
      let capturedAuth: unknown = 'SENTINEL';
      const module = {
        default: () => {
          const ctx = getSSRContext();
          capturedAuth = ctx?.ssrAuth;
          const el = document.createElement('div');
          el.textContent = 'App';
          return el;
        },
      };

      await ssrRenderToString(module, '/admin');

      expect(capturedAuth).toBeUndefined();
    });
  });

  describe('Given ctx.ssrRedirect is set during Pass 1', () => {
    it('Then Pass 2 is skipped and result.redirect is populated', async () => {
      let callCount = 0;
      const module = {
        default: () => {
          callCount++;
          // Simulate ProtectedRoute writing ssrRedirect during Pass 1
          if (callCount === 1) {
            const ctx = getSSRContext();
            if (ctx) {
              ctx.ssrRedirect = { to: '/login?returnTo=%2Fadmin' };
            }
          }
          const el = document.createElement('div');
          el.textContent = 'Should not render';
          return el;
        },
      };

      const result = await ssrRenderToString(module, '/admin');

      expect(callCount).toBe(1); // Only Pass 1 — Pass 2 skipped
      expect(result.redirect).toEqual({ to: '/login?returnTo=%2Fadmin' });
    });

    it('Then result.html, result.css, and result.ssrData are empty', async () => {
      const module = {
        default: () => {
          const ctx = getSSRContext();
          if (ctx) {
            ctx.ssrRedirect = { to: '/login' };
          }
          const el = document.createElement('div');
          el.textContent = 'Content';
          return el;
        },
      };

      const result = await ssrRenderToString(module, '/admin');

      expect(result.html).toBe('');
      expect(result.css).toBe('');
      expect(result.ssrData).toEqual([]);
      expect(result.redirect).toEqual({ to: '/login' });
    });
  });

  describe('Given url includes search params', () => {
    it('Then ctx.url includes the full path with search string', async () => {
      let capturedUrl: string | undefined;
      const module = {
        default: () => {
          const ctx = getSSRContext();
          capturedUrl = ctx?.url;
          const el = document.createElement('div');
          el.textContent = 'App';
          return el;
        },
      };

      await ssrRenderToString(module, '/admin?tab=settings');

      expect(capturedUrl).toBe('/admin?tab=settings');
    });
  });
});

describe('AuthProvider SSR hydration', () => {
  describe('Given AuthProvider running during SSR with ssrAuth authenticated', () => {
    it('Then status is "authenticated" and user has user data', async () => {
      let capturedStatus: unknown;
      let capturedUser: unknown;
      const user = { id: '1', email: 'test@example.com', role: 'admin' };
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const auth = useAuth();
              capturedStatus = auth.status;
              capturedUser = auth.user;
              container.textContent = 'Authenticated';
              return container;
            },
          });
          return container;
        },
      };

      await ssrRenderToString(module, '/app', {
        ssrAuth: { status: 'authenticated', user, expiresAt: Date.now() + 3600_000 },
      });

      expect(capturedStatus).toBe('authenticated');
      expect(capturedUser).toEqual(user);
    });
  });

  describe('Given AuthProvider running during SSR with ssrAuth unauthenticated', () => {
    it('Then status is "unauthenticated" and user is null', async () => {
      let capturedStatus: unknown;
      let capturedUser: unknown;
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const auth = useAuth();
              capturedStatus = auth.status;
              capturedUser = auth.user;
              container.textContent = 'Unauthenticated';
              return container;
            },
          });
          return container;
        },
      };

      await ssrRenderToString(module, '/app', {
        ssrAuth: { status: 'unauthenticated' },
      });

      expect(capturedStatus).toBe('unauthenticated');
      expect(capturedUser).toBeNull();
    });
  });

  describe('Given AuthProvider running during SSR without ssrAuth', () => {
    it('Then status stays "idle"', async () => {
      let capturedStatus: unknown;
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const auth = useAuth();
              capturedStatus = auth.status;
              container.textContent = 'Idle';
              return container;
            },
          });
          return container;
        },
      };

      await ssrRenderToString(module, '/app');

      expect(capturedStatus).toBe('idle');
    });
  });
});

describe('ProtectedRoute SSR redirect', () => {
  describe('Given ProtectedRoute during SSR with unauthenticated status', () => {
    it('Then result.redirect is set with loginPath and returnTo', async () => {
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const result = ProtectedRoute({
                loginPath: '/login',
                children: () => {
                  container.textContent = 'Protected content';
                  return container;
                },
              });
              // Trigger evaluation of the computed
              if (result && typeof result === 'object' && 'value' in result) {
                (result as { value: unknown }).value;
              }
              return container;
            },
          });
          return container;
        },
      };

      const result = await ssrRenderToString(module, '/admin', {
        ssrAuth: { status: 'unauthenticated' },
      });

      expect(result.redirect).toBeDefined();
      expect(result.redirect!.to).toBe('/login?returnTo=%2Fadmin');
    });
  });

  describe('Given ProtectedRoute during SSR with authenticated status', () => {
    it('Then result.redirect is undefined', async () => {
      const user = { id: '1', email: 'test@example.com', role: 'user' };
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const result = ProtectedRoute({
                children: () => {
                  container.textContent = 'Protected content';
                  return container;
                },
              });
              if (result && typeof result === 'object' && 'value' in result) {
                (result as { value: unknown }).value;
              }
              return container;
            },
          });
          return container;
        },
      };

      const result = await ssrRenderToString(module, '/dashboard', {
        ssrAuth: { status: 'authenticated', user, expiresAt: Date.now() + 3600_000 },
      });

      expect(result.redirect).toBeUndefined();
    });
  });

  describe('Given ProtectedRoute during SSR with no ssrAuth (idle)', () => {
    it('Then result.redirect is undefined (no SSR redirect, client handles it)', async () => {
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const result = ProtectedRoute({
                children: () => {
                  container.textContent = 'Protected content';
                  return container;
                },
              });
              if (result && typeof result === 'object' && 'value' in result) {
                (result as { value: unknown }).value;
              }
              return container;
            },
          });
          return container;
        },
      };

      const result = await ssrRenderToString(module, '/admin');

      expect(result.redirect).toBeUndefined();
    });
  });

  describe('Given ProtectedRoute with returnTo=false during SSR', () => {
    it('Then redirect has no ?returnTo= query parameter', async () => {
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const result = ProtectedRoute({
                loginPath: '/login',
                returnTo: false,
                children: () => {
                  container.textContent = 'Protected';
                  return container;
                },
              });
              if (result && typeof result === 'object' && 'value' in result) {
                (result as { value: unknown }).value;
              }
              return container;
            },
          });
          return container;
        },
      };

      const result = await ssrRenderToString(module, '/admin', {
        ssrAuth: { status: 'unauthenticated' },
      });

      expect(result.redirect).toBeDefined();
      expect(result.redirect!.to).toBe('/login');
    });
  });

  describe('Given ProtectedRoute with custom loginPath during SSR', () => {
    it('Then redirect uses the custom loginPath', async () => {
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const result = ProtectedRoute({
                loginPath: '/auth/signin',
                children: () => {
                  container.textContent = 'Protected';
                  return container;
                },
              });
              if (result && typeof result === 'object' && 'value' in result) {
                (result as { value: unknown }).value;
              }
              return container;
            },
          });
          return container;
        },
      };

      const result = await ssrRenderToString(module, '/admin', {
        ssrAuth: { status: 'unauthenticated' },
      });

      expect(result.redirect).toBeDefined();
      expect(result.redirect!.to).toBe('/auth/signin?returnTo=%2Fadmin');
    });
  });

  describe('Given request URL with query params during SSR', () => {
    it('Then returnTo preserves the full path including query string', async () => {
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const result = ProtectedRoute({
                loginPath: '/login',
                children: () => {
                  container.textContent = 'Protected';
                  return container;
                },
              });
              if (result && typeof result === 'object' && 'value' in result) {
                (result as { value: unknown }).value;
              }
              return container;
            },
          });
          return container;
        },
      };

      const result = await ssrRenderToString(module, '/admin?tab=settings', {
        ssrAuth: { status: 'unauthenticated' },
      });

      expect(result.redirect).toBeDefined();
      expect(result.redirect!.to).toBe('/login?returnTo=%2Fadmin%3Ftab%3Dsettings');
    });
  });

  describe('Given authenticated request to a non-protected route', () => {
    it('Then server renders HTML normally (ssrAuth does not interfere)', async () => {
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              // No ProtectedRoute — just normal content
              container.textContent = 'Public page';
              return container;
            },
          });
          return container;
        },
      };

      const user = { id: '1', email: 'test@example.com', role: 'user' };
      const result = await ssrRenderToString(module, '/public', {
        ssrAuth: { status: 'authenticated', user, expiresAt: Date.now() + 3600_000 },
      });

      expect(result.redirect).toBeUndefined();
      expect(result.html).toContain('Public page');
    });
  });

  describe('Given a redirect result from ssrRenderToString', () => {
    it('Then result.ssrData is empty (no queries resolved)', async () => {
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              const result = ProtectedRoute({
                children: () => {
                  container.textContent = 'Protected';
                  return container;
                },
              });
              if (result && typeof result === 'object' && 'value' in result) {
                (result as { value: unknown }).value;
              }
              return container;
            },
          });
          return container;
        },
      };

      const result = await ssrRenderToString(module, '/admin', {
        ssrAuth: { status: 'unauthenticated' },
      });

      expect(result.redirect).toBeDefined();
      expect(result.ssrData).toEqual([]);
    });
  });

  describe('Given nested ProtectedRoute components during SSR', () => {
    it('Then the first ProtectedRoute writes ssrRedirect and redirect is returned', async () => {
      const module = {
        default: () => {
          const container = document.createElement('div');
          AuthProvider({
            auth: createMockAuthSdk(),
            children: () => {
              // Outer ProtectedRoute
              const outer = ProtectedRoute({
                loginPath: '/login',
                children: () => {
                  // Inner ProtectedRoute (nested)
                  const inner = ProtectedRoute({
                    loginPath: '/inner-login',
                    children: () => {
                      container.textContent = 'Deeply protected';
                      return container;
                    },
                  });
                  if (inner && typeof inner === 'object' && 'value' in inner) {
                    (inner as { value: unknown }).value;
                  }
                  return container;
                },
              });
              if (outer && typeof outer === 'object' && 'value' in outer) {
                (outer as { value: unknown }).value;
              }
              return container;
            },
          });
          return container;
        },
      };

      const result = await ssrRenderToString(module, '/admin', {
        ssrAuth: { status: 'unauthenticated' },
      });

      expect(result.redirect).toBeDefined();
      // Redirect URL contains loginPath (either outer or inner — both are valid)
      expect(result.redirect!.to).toContain('returnTo=%2Fadmin');
    });
  });
});

describe('SSR error paths', () => {
  describe('Given a module with no default or App export', () => {
    it('Then ssrRenderToString throws with descriptive error', async () => {
      const module = { styles: ['body { margin: 0 }'] };
      await expect(ssrRenderToString(module, '/')).rejects.toThrow(
        'App entry must export a default function or named App function',
      );
    });

    it('Then ssrDiscoverQueries throws with descriptive error', async () => {
      const module = {};
      await expect(ssrDiscoverQueries(module, '/')).rejects.toThrow(
        'App entry must export a default function or named App function',
      );
    });

    it('Then ssrStreamNavQueries throws with descriptive error', async () => {
      const module = { App: 'not-a-function' as unknown as () => unknown };
      await expect(ssrStreamNavQueries(module as never, '/')).rejects.toThrow(
        'App entry must export a default function or named App function',
      );
    });
  });

  describe('Given a module with an invalid theme', () => {
    it('Then compileTheme failure is caught, logged, and rendering continues', async () => {
      const spy = spyOn(console, 'error').mockImplementation(() => {});
      const module = {
        default: () => {
          const el = document.createElement('div');
          el.textContent = 'Themed App';
          return el;
        },
        theme: { __invalid: true } as never,
      };
      const result = await ssrRenderToString(module, '/');
      expect(result.html).toContain('Themed App');
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to compile theme'),
        expect.anything(),
      );
      spy.mockRestore();
    });
  });

  describe('Given a query that resolves after the timeout in ssrDiscoverQueries', () => {
    it('Then the timed-out query appears in pending, not resolved', async () => {
      const module = {
        default: () => {
          registerSSRQuery({
            key: 'slow-query',
            promise: new Promise((r) => setTimeout(() => r({ data: 'late' }), 500)),
            timeout: 10,
            resolve: () => {},
          });
          const el = document.createElement('div');
          el.textContent = 'App';
          return el;
        },
      };
      const result = await ssrDiscoverQueries(module, '/');
      expect(result.pending).toContain('slow-query');
      expect(result.resolved.find((r) => r.key === 'slow-query')).toBeUndefined();
    });
  });

  describe('Given a query that rejects in ssrStreamNavQueries', () => {
    it('Then the rejected query is silently dropped and done event emitted', async () => {
      const module = {
        default: () => {
          registerSSRQuery({
            key: 'failing-query',
            promise: Promise.reject(new Error('fetch failed')),
            timeout: 5000,
            resolve: () => {},
          });
          const el = document.createElement('div');
          el.textContent = 'App';
          return el;
        },
      };
      const stream = await ssrStreamNavQueries(module, '/');
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let text = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      expect(text).not.toContain('failing-query');
      expect(text).toContain('event: done');
    });
  });
});
