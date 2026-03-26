/**
 * Test routing correctness during SSR.
 *
 * Verifies that the router correctly matches routes when rendering
 * server-side using the framework's zero-config SSR pipeline.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import {
  EntityStore,
  MemoryCache,
  QueryEnvelopeStore,
  registerSSRResolver,
  type SSRRenderContext,
} from '@vertz/ui/internals';
import { createSSRAdapter, renderToStream, ssrStorage, streamToString } from '@vertz/ui-server';
import { installDomShim, removeDomShim, toVNode } from '@vertz/ui-server/dom-shim';

function createMinimalSSRContext(url: string): SSRRenderContext {
  return {
    url,
    adapter: createSSRAdapter(),
    subscriber: null,
    readValueCb: null,
    cleanupStack: [],
    batchDepth: 0,
    pendingEffects: new Map(),
    contextScope: null,
    entityStore: new EntityStore(),
    envelopeStore: new QueryEnvelopeStore(),
    queryCache: new MemoryCache<unknown>({ maxSize: Infinity }),
    inflight: new Map(),
    queries: [],
    errors: [],
  };
}

async function renderApp(url: string): Promise<string> {
  installDomShim();

  return ssrStorage.run(createMinimalSSRContext(url), async () => {
    const { App } = await import('../app');
    const appResult = App();
    const vnode = toVNode(appResult);
    const stream = renderToStream(vnode);
    return streamToString(stream);
  });
}

describe('SSR routing', () => {
  // Importing @vertz/ui-server registers an SSR resolver on globalThis as a
  // module-level side effect. Re-register explicitly so this file works even
  // when a previous test file cleared the resolver.
  beforeAll(() => {
    registerSSRResolver(() => ssrStorage.getStore());
  });

  afterEach(() => {
    removeDomShim();
  });

  // Clear the SSR resolver so subsequent test files see isBrowser()=true.
  // Without this, navigation tests in later files get the SSR (read-only)
  // router, breaking client-side navigation assertions.
  afterAll(() => {
    registerSSRResolver(null);
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
