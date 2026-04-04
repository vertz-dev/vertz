import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, describe, expect, it } from 'bun:test';
import { createContext, getContextScope, setContextScope } from '../component/context';
import { getAdapter } from '../dom/adapter';
import { popScope, pushScope } from '../runtime/disposal';
import { batch } from '../runtime/scheduler';
import { getSubscriber, setSubscriber } from '../runtime/tracking';
import {
  getSSRContext,
  hasSSRResolver,
  registerSSRResolver,
  type SSRRenderContext,
} from '../ssr/ssr-render-context';

describe('SSRRenderContext', () => {
  afterEach(() => {
    registerSSRResolver(null);
  });
  it('returns undefined when no resolver is registered', () => {
    expect(getSSRContext()).toBeUndefined();
  });

  it('returns undefined outside AsyncLocalStorage.run() even with resolver', () => {
    const als = new AsyncLocalStorage();
    registerSSRResolver(() => als.getStore());
    // Outside .run() — should return undefined
    expect(getSSRContext()).toBeUndefined();
  });

  it('returns context inside AsyncLocalStorage.run()', () => {
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

  it('concurrent renders do not corrupt subscriber tracking', async () => {
    const als = new AsyncLocalStorage<SSRRenderContext>();
    registerSSRResolver(() => als.getStore());

    const mockAdapter = {} as import('../dom/adapter').RenderAdapter;
    const sub1 = { _id: 1 } as unknown as import('../runtime/signal-types').Subscriber;
    const sub2 = { _id: 2 } as unknown as import('../runtime/signal-types').Subscriber;

    const ctx1: SSRRenderContext = {
      url: '/a',
      adapter: mockAdapter,
      subscriber: null,
      readValueCb: null,
    };
    const ctx2: SSRRenderContext = {
      url: '/b',
      adapter: mockAdapter,
      subscriber: null,
      readValueCb: null,
    };

    const results: Array<{
      set: import('../runtime/signal-types').Subscriber | null;
      got: import('../runtime/signal-types').Subscriber | null;
    }> = [];

    await Promise.all([
      als.run(ctx1, async () => {
        setSubscriber(sub1);
        await new Promise((r) => setTimeout(r, 10));
        results.push({ set: sub1, got: getSubscriber() });
      }),
      als.run(ctx2, async () => {
        setSubscriber(sub2);
        await new Promise((r) => setTimeout(r, 10));
        results.push({ set: sub2, got: getSubscriber() });
      }),
    ]);

    // Each render sees its own subscriber — no cross-contamination
    for (const { set, got } of results) {
      expect(got).toBe(set);
    }
  });

  it('cleanup scopes are isolated per request', async () => {
    const als = new AsyncLocalStorage<SSRRenderContext>();
    registerSSRResolver(() => als.getStore());

    const mockAdapter = {} as import('../dom/adapter').RenderAdapter;
    const ctx1: SSRRenderContext = {
      url: '/a',
      adapter: mockAdapter,
      subscriber: null,
      readValueCb: null,
      cleanupStack: [],
    };
    const ctx2: SSRRenderContext = {
      url: '/b',
      adapter: mockAdapter,
      subscriber: null,
      readValueCb: null,
      cleanupStack: [],
    };

    // Push scope in ctx1, then push scope in ctx2.
    // If cleanupStack is shared, ctx2's push lands on the same array
    // and ctx1's pop removes ctx2's scope.
    let scope1Len = -1;
    let scope2Len = -1;

    await Promise.all([
      als.run(ctx1, async () => {
        pushScope(); // push to ctx1's stack
        await new Promise((r) => setTimeout(r, 20));
        // After ctx2 pushed and popped, ctx1 stack should still have 1
        scope1Len = ctx1.cleanupStack.length;
        popScope();
      }),
      als.run(ctx2, async () => {
        await new Promise((r) => setTimeout(r, 5));
        pushScope(); // push to ctx2's stack (while ctx1 is awaiting)
        scope2Len = ctx2.cleanupStack.length;
        popScope();
      }),
    ]);

    // Each context's stack operated independently
    expect(scope1Len).toBe(1);
    expect(scope2Len).toBe(1);
  });

  it('batch depth is isolated per request', async () => {
    const als = new AsyncLocalStorage<SSRRenderContext>();
    registerSSRResolver(() => als.getStore());

    const mockAdapter = {} as import('../dom/adapter').RenderAdapter;
    const ctx1: SSRRenderContext = {
      url: '/a',
      adapter: mockAdapter,
      subscriber: null,
      readValueCb: null,
      cleanupStack: [],
      batchDepth: 0,
      pendingEffects: new Map(),
    };
    const ctx2: SSRRenderContext = {
      url: '/b',
      adapter: mockAdapter,
      subscriber: null,
      readValueCb: null,
      cleanupStack: [],
      batchDepth: 0,
      pendingEffects: new Map(),
    };

    let ctx1DepthDuringBatch = -1;
    let ctx2DepthDuringBatch = -1;

    await Promise.all([
      als.run(ctx1, async () => {
        batch(() => {
          ctx1DepthDuringBatch = ctx1.batchDepth;
        });
      }),
      als.run(ctx2, async () => {
        batch(() => {
          ctx2DepthDuringBatch = ctx2.batchDepth;
        });
      }),
    ]);

    // Each had its own depth counter
    expect(ctx1DepthDuringBatch).toBe(1);
    expect(ctx2DepthDuringBatch).toBe(1);
    // Both reset after batch
    expect(ctx1.batchDepth).toBe(0);
    expect(ctx2.batchDepth).toBe(0);
  });

  it('context scope is isolated per request', async () => {
    const als = new AsyncLocalStorage<SSRRenderContext>();
    registerSSRResolver(() => als.getStore());

    const mockAdapter = {} as import('../dom/adapter').RenderAdapter;
    const ctx1: SSRRenderContext = {
      url: '/a',
      adapter: mockAdapter,
      subscriber: null,
      readValueCb: null,
      cleanupStack: [],
      batchDepth: 0,
      pendingEffects: new Map(),
      contextScope: null,
    };
    const ctx2: SSRRenderContext = {
      url: '/b',
      adapter: mockAdapter,
      subscriber: null,
      readValueCb: null,
      cleanupStack: [],
      batchDepth: 0,
      pendingEffects: new Map(),
      contextScope: null,
    };

    const ThemeCtx = createContext<string>('light');

    await Promise.all([
      als.run(ctx1, async () => {
        const scope = new Map();
        scope.set(ThemeCtx, 'dark');
        setContextScope(scope);
        await new Promise((r) => setTimeout(r, 10));
        // Should still see ctx1's scope
        expect(getContextScope()?.get(ThemeCtx)).toBe('dark');
      }),
      als.run(ctx2, async () => {
        // ctx2 has no scope set — should not see ctx1's scope
        await new Promise((r) => setTimeout(r, 10));
        expect(getContextScope()).toBeNull();
      }),
    ]);
  });

  it('entity store and query envelope store are isolated per request', async () => {
    const als = new AsyncLocalStorage<SSRRenderContext>();
    registerSSRResolver(() => als.getStore());

    const { EntityStore } = await import('../store/entity-store');
    const { QueryEnvelopeStore } = await import('../store/query-envelope-store');
    const { getEntityStore, getQueryEnvelopeStore } =
      await import('../store/entity-store-singleton');

    const store1 = new EntityStore();
    const store2 = new EntityStore();
    const envelope1 = new QueryEnvelopeStore();
    const envelope2 = new QueryEnvelopeStore();

    const mockAdapter = {} as import('../dom/adapter').RenderAdapter;
    const ctx1: SSRRenderContext = {
      url: '/a',
      adapter: mockAdapter,
      entityStore: store1,
      envelopeStore: envelope1,
    };
    const ctx2: SSRRenderContext = {
      url: '/b',
      adapter: mockAdapter,
      entityStore: store2,
      envelopeStore: envelope2,
    };

    let result1EntityStore: unknown;
    let result2EntityStore: unknown;
    let result1EnvelopeStore: unknown;
    let result2EnvelopeStore: unknown;

    await Promise.all([
      als.run(ctx1, async () => {
        result1EntityStore = getEntityStore();
        result1EnvelopeStore = getQueryEnvelopeStore();
        await new Promise((r) => setTimeout(r, 10));
        // Still the same after async work
        expect(getEntityStore()).toBe(store1);
      }),
      als.run(ctx2, async () => {
        result2EntityStore = getEntityStore();
        result2EnvelopeStore = getQueryEnvelopeStore();
        await new Promise((r) => setTimeout(r, 10));
        expect(getEntityStore()).toBe(store2);
      }),
    ]);

    // Each request got its own stores
    expect(result1EntityStore).toBe(store1);
    expect(result2EntityStore).toBe(store2);
    expect(result1EntityStore).not.toBe(result2EntityStore);
    expect(result1EnvelopeStore).toBe(envelope1);
    expect(result2EnvelopeStore).toBe(envelope2);
    expect(result1EnvelopeStore).not.toBe(result2EnvelopeStore);
  });

  it('stores resolver on globalThis so it survives require.cache clears', () => {
    const resolver = () => undefined;
    registerSSRResolver(resolver);
    expect((globalThis as Record<string, unknown>).__VERTZ_SSR_RESOLVER__).toBe(resolver);
    expect(hasSSRResolver()).toBe(true);
  });

  it('registerSSRResolver(null) removes the globalThis entry', () => {
    registerSSRResolver(() => undefined);
    expect(hasSSRResolver()).toBe(true);
    registerSSRResolver(null);
    expect(hasSSRResolver()).toBe(false);
    expect((globalThis as Record<string, unknown>).__VERTZ_SSR_RESOLVER__).toBeUndefined();
  });
});
