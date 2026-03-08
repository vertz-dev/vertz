import { describe, expect, it } from 'bun:test';
import { createRouter, defineRoutes, defineTheme, RouterContext, RouterView } from '@vertz/ui';
import { installDomShim } from '../dom-shim';
import { registerSSRQuery } from '../ssr-context';
import { ssrDiscoverQueries, ssrRenderToString, ssrStreamNavQueries } from '../ssr-render';

// Install DOM shim for tests that create routers outside SSR context.
// In production, ensureDomShim() runs at startup; tests need it too.
installDomShim();

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

  it('collects CSS via module.getInjectedCSS', async () => {
    const trackedCSS = ['.my-component { color: red; }'];
    const module = {
      default: () => {
        const el = document.createElement('div');
        el.setAttribute('class', 'my-component');
        el.textContent = 'Styled';
        return el;
      },
      getInjectedCSS: () => trackedCSS,
    };

    const result = await ssrRenderToString(module, '/');

    // CSS collected via module.getInjectedCSS should be in output
    expect(result.css).toContain('.my-component { color: red; }');
    expect(result.css).toContain('data-vertz-css');
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
