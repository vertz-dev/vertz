import { describe, expect, it } from 'bun:test';
import { getAdapter } from '../dom/adapter';
import {
  getSSRContext,
  registerSSRResolver,
  type SSRRenderContext,
} from '../ssr/ssr-render-context';

describe('SSRRenderContext', () => {
  it('returns undefined when no resolver is registered', () => {
    expect(getSSRContext()).toBeUndefined();
  });

  it('returns undefined outside AsyncLocalStorage.run() even with resolver', () => {
    const { AsyncLocalStorage } = require('node:async_hooks');
    const als = new AsyncLocalStorage();
    registerSSRResolver(() => als.getStore());
    // Outside .run() — should return undefined
    expect(getSSRContext()).toBeUndefined();
  });

  it('returns context inside AsyncLocalStorage.run()', () => {
    const { AsyncLocalStorage } = require('node:async_hooks');
    const als = new AsyncLocalStorage<SSRRenderContext>();
    registerSSRResolver(() => als.getStore());

    const mockAdapter = {} as import('../dom/adapter').RenderAdapter;
    const ctx: SSRRenderContext = { url: '/test', adapter: mockAdapter };

    als.run(ctx, () => {
      const result = getSSRContext();
      expect(result).toBe(ctx);
      expect(result?.url).toBe('/test');
      expect(result?.adapter).toBe(mockAdapter);
    });
  });

  it('getAdapter() returns SSR adapter inside context, DOM adapter outside', () => {
    const { AsyncLocalStorage } = require('node:async_hooks');
    const als = new AsyncLocalStorage<SSRRenderContext>();
    registerSSRResolver(() => als.getStore());

    const ssrAdapter = {
      createElement: () => ({}),
      createElementNS: () => ({}),
      createTextNode: () => ({}),
      createComment: () => ({}),
      createDocumentFragment: () => ({}),
      isNode: () => true,
    } as unknown as import('../dom/adapter').RenderAdapter;

    const ctx: SSRRenderContext = { url: '/test', adapter: ssrAdapter };

    // Inside SSR context — should return the SSR adapter
    als.run(ctx, () => {
      const adapter = getAdapter();
      expect(adapter).toBe(ssrAdapter);
    });

    // Outside SSR context — should return DOM adapter (not SSR adapter)
    const outsideAdapter = getAdapter();
    expect(outsideAdapter).not.toBe(ssrAdapter);
  });

  it('two concurrent SSR renders get different adapter instances', async () => {
    const { AsyncLocalStorage } = require('node:async_hooks');
    const als = new AsyncLocalStorage<SSRRenderContext>();
    registerSSRResolver(() => als.getStore());

    const adapter1 = { id: 1 } as unknown as import('../dom/adapter').RenderAdapter;
    const adapter2 = { id: 2 } as unknown as import('../dom/adapter').RenderAdapter;
    const ctx1: SSRRenderContext = { url: '/page-1', adapter: adapter1 };
    const ctx2: SSRRenderContext = { url: '/page-2', adapter: adapter2 };

    const results: import('../dom/adapter').RenderAdapter[] = [];

    await Promise.all([
      als.run(ctx1, async () => {
        // Simulate async work
        await new Promise((r) => setTimeout(r, 10));
        results.push(getAdapter());
      }),
      als.run(ctx2, async () => {
        // Simulate async work
        await new Promise((r) => setTimeout(r, 10));
        results.push(getAdapter());
      }),
    ]);

    // Each render got its own adapter — no cross-contamination
    expect(results).toHaveLength(2);
    expect(results).toContain(adapter1);
    expect(results).toContain(adapter2);
  });
});
