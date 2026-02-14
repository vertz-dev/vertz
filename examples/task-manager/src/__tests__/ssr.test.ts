/**
 * Integration tests for zero-config SSR.
 *
 * These tests verify that the app can be rendered server-side using the
 * framework's built-in SSR pipeline (@vertz/ui-server/dom-shim + renderToStream).
 *
 * NOTE: Due to bun test module caching, the router module initializes once
 * and subsequent URL changes require updating the router's current match.
 * In real Vite SSR, modules are invalidated per request via ssrLoadModule.
 */

import { describe, expect, test, afterEach } from 'bun:test';
import { installDomShim, removeDomShim, toVNode } from '@vertz/ui-server/dom-shim';
import { renderToStream, streamToString } from '@vertz/ui-server';

/**
 * Helper: render the app at a given URL, mimicking what the virtual SSR entry does.
 */
async function renderApp(url: string): Promise<string> {
  (globalThis as any).__SSR_URL__ = url;
  installDomShim();

  // Import the router module to update match before rendering
  const { appRouter, routes } = await import('../router');
  const { matchRoute } = await import('@vertz/ui/internals');
  
  // Update the router's current match for this URL  
  const match = matchRoute(routes, url);
  appRouter.current.value = match;

  const { App } = await import('../app');
  const appResult = App();
  const vnode = toVNode(appResult);
  const stream = renderToStream(vnode);
  return streamToString(stream);
}

describe('SSR integration (zero-config)', () => {
  afterEach(() => {
    removeDomShim();
    delete (globalThis as any).__SSR_URL__;
  });

  test('renders app root with testid', async () => {
    const html = await renderApp('/');
    expect(html).toContain('data-testid="app-root"');
  });

  test('renders real task list page content at /', async () => {
    const html = await renderApp('/');
    expect(html).toContain('data-testid="task-list-page"');
    expect(html).toContain('Task Manager');
  });

  test('renders navigation links', async () => {
    const html = await renderApp('/');
    expect(html).toContain('All Tasks');
    expect(html).toContain('Create Task');
    expect(html).toContain('Settings');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/tasks/new"');
    expect(html).toContain('href="/settings"');
  });

  test('renders theme provider with data-theme attribute', async () => {
    const html = await renderApp('/');
    expect(html).toContain('data-theme="light"');
  });
});
