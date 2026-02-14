/**
 * Integration tests for SSR.
 * 
 * These tests verify that the server can render the actual app components
 * to HTML strings using the DOM shim approach.
 * 
 * NOTE: These tests exercise the entry-server module directly. Due to module
 * caching in test runners, we run these tests sequentially and accept that
 * the first URL tested will be "cached" in subsequent tests. The real Vite SSR
 * server invalidates modules between requests, so this limitation only affects
 * unit tests.
 * 
 * For testing multiple routes, use the HTTP test (ssr-http.test.ts) which
 * starts the actual Vite dev server.
 */

import { describe, expect, test } from 'bun:test';

describe('SSR integration', () => {
  test('renders complete HTML document', async () => {
    const { renderToString } = await import('../entry-server');
    const html = await renderToString('/');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
    expect(html).toContain('<meta charset="UTF-8"');
    expect(html).toContain('<title>Task Manager');
  });

  test('renders app root with testid', async () => {
    const { renderToString } = await import('../entry-server');
    const html = await renderToString('/');

    expect(html).toContain('data-testid="app-root"');
  });

  test('renders real task list page content', async () => {
    const { renderToString } = await import('../entry-server');
    const html = await renderToString('/');

    // Should contain actual page content from the real TaskListPage component
    expect(html).toContain('data-testid="task-list-page"');
    expect(html).toContain('Task Manager');
  });

  test('renders navigation links', async () => {
    const { renderToString } = await import('../entry-server');
    const html = await renderToString('/');

    expect(html).toContain('All Tasks');
    expect(html).toContain('Create Task');
    expect(html).toContain('Settings');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/tasks/new"');
    expect(html).toContain('href="/settings"');
  });

  test('includes client entry script tag', async () => {
    const { renderToString } = await import('../entry-server');
    const html = await renderToString('/');

    expect(html).toContain('<script type="module" src="/src/entry-client.ts"></script>');
  });

  test('renders theme provider with data-theme attribute', async () => {
    const { renderToString } = await import('../entry-server');
    const html = await renderToString('/');

    expect(html).toContain('data-theme="light"');
  });

  test('render returns ReadableStream', async () => {
    const { render } = await import('../entry-server');
    const stream = await render('/');

    expect(stream).toBeInstanceOf(ReadableStream);
  });
});
