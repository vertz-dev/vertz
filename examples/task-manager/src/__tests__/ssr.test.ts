/**
 * Integration tests for zero-config SSR.
 *
 * These tests verify that the app can be rendered server-side using the
 * framework's built-in SSR pipeline (ssrRenderToString).
 *
 * The per-request SSR context automatically provides the URL to the router
 * via SSR-aware getters — no manual router.current.value assignment needed.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { GlobalWindow } from 'happy-dom';
import { registerSSRResolver } from '@vertz/ui/internals';
import { ssrRenderToString, ssrStorage } from '@vertz/ui-server';
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
  // Importing @vertz/ui-server registers an SSR resolver on globalThis as a
  // module-level side effect. Re-register explicitly so this file works even
  // when a previous test file cleared the resolver.
  beforeAll(() => {
    registerSSRResolver(() => ssrStorage.getStore());
  });

  afterAll(() => {
    removeDomShim();
    // Clear the SSR resolver so subsequent test files see isBrowser()=true.
    // Without this cleanup, navigation tests in later files get the SSR
    // (read-only) router, breaking client-side navigation assertions.
    registerSSRResolver(null);
    // installDomShim() replaces window.location with a plain object and
    // removeDomShim() can't undo in-place mutations on the saved window
    // reference. Re-create fresh happy-dom globals so component/navigation
    // tests in subsequent files get a fully working DOM environment.
    const w = new GlobalWindow();
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.window = w;
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.document = w.document;
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.HTMLElement = w.HTMLElement;
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.Element = w.Element;
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.Node = w.Node;
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.NodeList = w.NodeList;
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.NodeFilter = w.NodeFilter;
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.MouseEvent = w.MouseEvent;
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.KeyboardEvent = w.KeyboardEvent;
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.Event = w.Event;
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.navigator = w.navigator;
    // @ts-expect-error - re-injecting DOM globals after SSR shim
    globalThis.FormData = w.FormData;
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
