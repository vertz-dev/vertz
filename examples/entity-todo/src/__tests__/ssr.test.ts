/**
 * Integration tests for zero-config SSR.
 *
 * These tests verify that the app can be rendered server-side using the
 * framework's built-in SSR pipeline (@vertz/ui-server/dom-shim + renderToStream).
 */

import { describe, expect, test, afterEach } from 'bun:test';
import { installDomShim, removeDomShim, toVNode } from '@vertz/ui-server/dom-shim';
import { renderToStream, streamToString } from '@vertz/ui-server';

/**
 * Helper: render the app at a given URL, mimicking what the virtual SSR entry does.
 */
async function renderApp(): Promise<string> {
  (globalThis as any).__SSR_URL__ = '/';
  installDomShim();

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
    const html = await renderApp();
    expect(html).toContain('data-testid="app-root"');
  });

  test('renders todo list page content', async () => {
    const html = await renderApp();
    expect(html).toContain('data-testid="todo-list-page"');
    expect(html).toContain('Entity Todo');
  });

  test('renders theme provider with data-theme attribute', async () => {
    const html = await renderApp();
    expect(html).toContain('data-theme="light"');
  });

  test('renders create form', async () => {
    const html = await renderApp();
    expect(html).toContain('data-testid="create-todo-form"');
    expect(html).toContain('What needs to be done?');
  });
});
