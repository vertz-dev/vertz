/**
 * Test routing correctness during SSR.
 *
 * Verifies that the router correctly matches routes when rendering
 * server-side using the framework's zero-config SSR pipeline.
 */

import { describe, expect, test, afterEach } from 'bun:test';
import { installDomShim, removeDomShim, toVNode } from '@vertz/ui-server/dom-shim';
import { renderToStream, streamToString } from '@vertz/ui-server';

async function renderApp(url: string): Promise<string> {
  (globalThis as any).__SSR_URL__ = url;
  installDomShim();

  const { appRouter, routes } = await import('../router');
  const { matchRoute } = await import('@vertz/ui/internals');
  
  const match = matchRoute(routes, url);
  appRouter.current.value = match;

  const { App } = await import('../app');
  const appResult = App();
  const vnode = toVNode(appResult);
  const stream = renderToStream(vnode);
  return streamToString(stream);
}

describe('SSR routing', () => {
  afterEach(() => {
    removeDomShim();
    delete (globalThis as any).__SSR_URL__;
  });

  test('/ route should match TaskListPage, not 404', async () => {
    const html = await renderApp('/');
    expect(html).toContain('data-testid="task-list-page"');
    expect(html).not.toContain('data-testid="not-found"');
    expect(html).not.toContain('Page not found');
  });

  test('/settings route should match SettingsPage', async () => {
    const html = await renderApp('/settings');
    expect(html).toContain('data-testid="settings-page"');
    expect(html).not.toContain('data-testid="not-found"');
  });

  test('/tasks/new route should match CreateTaskPage', async () => {
    const html = await renderApp('/tasks/new');
    expect(html).toContain('data-testid="create-task-page"');
    expect(html).not.toContain('data-testid="not-found"');
  });
});
