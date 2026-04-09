/**
 * End-to-end integration tests for SSR query data threshold.
 *
 * Tests the full renderToHTML() pipeline: query() registers with SSR context,
 * renderToHTML() awaits queries with per-query timeout, and the final HTML
 * contains resolved data for fast queries and loading state for slow ones.
 *
 * Uses relative imports to @vertz/ui source because the ui package build
 * is not available in the worktree. Public API validation tests in
 * packages/integration-tests/ will use package imports.
 */
import { afterAll, beforeAll, describe, expect, it } from '@vertz/test';
import { query } from '../../../ui/src/query/query';
import { registerSSRResolver } from '../../../ui/src/ssr/ssr-render-context';
import { installDomShim, removeDomShim } from '../dom-shim';
import { renderPage } from '../render-page';
import { getSSRQueries, ssrStorage } from '../ssr-context';
import { createRequestContext } from '../ssr-shared';
import type { VNode } from '../types';

// Bridge dual-module gap: this test imports query() from @vertz/ui SOURCE,
// but ssrStorage is from @vertz/ui-server which registered the resolver on
// the BUILT @vertz/ui. Register the same ALS-backed resolver on the SOURCE
// module's globalThis key so query()'s getSSRContext() returns the correct context.
// Must NOT null it in afterAll — resolver lives on globalThis and other tests need it.
beforeAll(() => {
  registerSSRResolver(() => ssrStorage.getStore());
});

/**
 * Helper to create a delayed promise that resolves after `ms` milliseconds.
 */
function delayed<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(resolve, ms, value));
}

/**
 * Minimal renderToHTML for testing — avoids importing @vertz/ui's compileTheme.
 * Does the same two-pass render as the real renderToHTML.
 */
async function testRenderToHTML(app: () => VNode): Promise<string> {
  installDomShim();
  return ssrStorage.run(createRequestContext('/'), async () => {
    try {
      // Pass 1: discover queries
      app();

      // Await SSR queries with per-query timeout
      const queries = getSSRQueries();
      if (queries.length > 0) {
        await Promise.allSettled(
          queries.map(({ promise, timeout, resolve }) =>
            Promise.race([
              promise.then((data) => resolve(data)),
              new Promise<void>((r) => setTimeout(r, timeout)),
            ]),
          ),
        );
        const store = ssrStorage.getStore();
        if (store) store.queries = [];
      }

      // Pass 2: render with data
      const vnode = app();
      const response = renderPage(vnode, {});
      return await response.text();
    } finally {
      removeDomShim();
    }
  });
}

describe('SSR query data threshold (e2e)', () => {
  it('fast query produces data in SSR HTML', async () => {
    function App(): VNode {
      const items = query(() => Promise.resolve(['Task 1', 'Task 2']), {
        key: 'fast-query-e2e',
        ssrTimeout: 500,
      });

      const data = items.data as unknown as { value: string[] | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ? data.value.join(', ') : 'Loading...'],
      };
    }

    const html = await testRenderToHTML(App);

    expect(html).toContain('Task 1, Task 2');
    expect(html).not.toContain('Loading...');
  });

  it('slow query produces loading state in SSR HTML', async () => {
    function App(): VNode {
      const items = query(() => delayed(['Slow Data'], 1000), {
        key: 'slow-query-e2e',
        ssrTimeout: 50,
      });

      const data = items.data as unknown as { value: string[] | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ? data.value.join(', ') : 'Loading...'],
      };
    }

    const html = await testRenderToHTML(App);

    expect(html).toContain('Loading...');
    expect(html).not.toContain('Slow Data');
  });

  it('mixed queries: fast data rendered, slow shows loading', async () => {
    function App(): VNode {
      const fast = query(() => Promise.resolve('Fast Result'), {
        key: 'mixed-fast-e2e',
        ssrTimeout: 500,
      });
      const slow = query(() => delayed('Slow Result', 1000), {
        key: 'mixed-slow-e2e',
        ssrTimeout: 50,
      });

      const fastData = fast.data as unknown as { value: string | undefined };
      const slowData = slow.data as unknown as { value: string | undefined };

      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [
          {
            tag: 'div',
            attrs: { id: 'fast' },
            children: [fastData.value ?? 'Fast Loading...'],
          },
          {
            tag: 'div',
            attrs: { id: 'slow' },
            children: [slowData.value ?? 'Slow Loading...'],
          },
        ],
      };
    }

    const html = await testRenderToHTML(App);

    expect(html).toContain('Fast Result');
    expect(html).not.toContain('Fast Loading...');
    expect(html).toContain('Slow Loading...');
    expect(html).not.toContain('Slow Result');
  });

  it('ssrTimeout: 0 disables SSR data loading', async () => {
    function App(): VNode {
      const items = query(() => Promise.resolve(['Fetched']), {
        key: 'disabled-ssr-e2e',
        ssrTimeout: 0,
      });

      const data = items.data as unknown as { value: string[] | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ? data.value.join(', ') : 'Loading...'],
      };
    }

    const html = await testRenderToHTML(App);

    expect(html).toContain('Loading...');
    expect(html).not.toContain('Fetched');
  });

  it('query error during SSR does not crash render', async () => {
    function App(): VNode {
      const items = query(() => Promise.reject(new Error('fetch failed')), {
        key: 'error-ssr-e2e',
        ssrTimeout: 500,
      });

      const data = items.data as unknown as { value: unknown };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ? 'Has data' : 'No data'],
      };
    }

    // Should not throw
    const html = await testRenderToHTML(App);

    expect(html).toContain('No data');
    expect(html).toBeDefined();
  });
});
