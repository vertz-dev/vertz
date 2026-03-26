/**
 * Integration tests for zero-config SSR.
 *
 * These tests verify that the app can be rendered server-side using the
 * framework's built-in SSR pipeline (ssrRenderToString).
 *
 * The per-request SSR context automatically provides the URL to the router
 * via SSR-aware getters — no manual router.current.value assignment needed.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { ssrRenderToString } from '@vertz/ui-server';
import { removeDomShim } from '@vertz/ui-server/dom-shim';

/**
 * Helper: render the app at a given URL using the framework's SSR pipeline.
 * ssrRenderToString handles DOM shim installation (once per process) and
 * per-request isolation via AsyncLocalStorage.
 */
async function renderApp(url: string): Promise<string> {
  const appModule = await import('../app');
  const result = await ssrRenderToString(appModule, url);
  return result.html;
}

describe('SSR integration (zero-config)', () => {
  afterAll(() => {
    removeDomShim();
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

  test('renders settings page at /settings', async () => {
    const html = await renderApp('/settings');
    expect(html).toContain('data-testid="settings-page"');
  });

  test('renders create task page at /tasks/new', async () => {
    const html = await renderApp('/tasks/new');
    expect(html).toContain('data-testid="create-task-page"');
  });

  test('renders task detail page at /tasks/:id', async () => {
    const html = await renderApp('/tasks/123');
    expect(html).toContain('data-testid="task-detail-page"');
  });
});
