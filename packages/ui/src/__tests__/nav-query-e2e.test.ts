import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { MemoryCache } from '../query/cache';
import { query, resetDefaultQueryCache } from '../query/query';
import { defineRoutes } from '../router/define-routes';
import { createRouter } from '../router/navigate';
import { ensureSSRDataBus, pushNavData } from '../router/server-nav';

// Globals accessor for cleanup
const g = globalThis as Record<string, unknown>;

// ─── Mock Prefetch Helper ────────────────────────────────────────────────

interface MockPrefetchControl {
  resolveFirstEvent: () => void;
  resolveDone: () => void;
}

/**
 * Create a mock `_prefetchNavData` function and an array of controls.
 * Each call to the mock pushes a new control into the array.
 */
function createMockPrefetch() {
  const controls: MockPrefetchControl[] = [];

  const mockFn = (_url: string, _options?: { timeout?: number }) => {
    ensureSSRDataBus();
    g.__VERTZ_NAV_PREFETCH_ACTIVE__ = true;

    let _resolveFirstEvent!: () => void;
    let _resolveDone!: () => void;

    const firstEvent = new Promise<void>((r) => {
      _resolveFirstEvent = r;
    });
    const done = new Promise<void>((r) => {
      _resolveDone = r;
    });

    controls.push({
      resolveFirstEvent: _resolveFirstEvent,
      resolveDone: () => {
        _resolveDone();
        g.__VERTZ_NAV_PREFETCH_ACTIVE__ = false;
        document.dispatchEvent(new CustomEvent('vertz:nav-prefetch-done'));
      },
    });

    return { abort: () => {}, done, firstEvent };
  };

  return { mockFn, controls };
}

// ─── Flush Helper ────────────────────────────────────────────────────────

/** Flush pending microtasks (e.g. Promise.then callbacks). */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

// ─── Routes ──────────────────────────────────────────────────────────────

const routes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks': { component: () => document.createElement('div') },
});

// ─── Tests ───────────────────────────────────────────────────────────────

describe('Navigation → Query E2E Integration', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    delete g.__VERTZ_SSR_DATA__;
    delete g.__VERTZ_SSR_PUSH__;
    delete g.__VERTZ_NAV_PREFETCH_ACTIVE__;
    resetDefaultQueryCache();
  });

  afterEach(() => {
    delete g.__VERTZ_SSR_DATA__;
    delete g.__VERTZ_SSR_PUSH__;
    delete g.__VERTZ_NAV_PREFETCH_ACTIVE__;
    resetDefaultQueryCache();
  });

  it('fast SSE data → query hydrates without loading flash', async () => {
    const { mockFn, controls } = createMockPrefetch();
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockFn,
    });

    const taskData = { items: [{ id: '1', title: 'Buy milk' }] };

    // Start navigation — mockFn runs synchronously, then navigate awaits firstEvent
    const navPromise = router.navigate({ to: '/tasks' });

    // Data arrives before firstEvent resolves (fast SSE)
    pushNavData('task-list', taskData);
    controls[0].resolveFirstEvent();

    await navPromise;

    // Create query — should hydrate from the SSR bus buffer
    const fetchThunk = vi.fn(() => Promise.resolve({ items: [] }));
    const result = query(fetchThunk, { key: 'task-list' });

    expect(result.data.value).toEqual(taskData);
    expect(result.loading.value).toBe(false);
    expect(fetchThunk).not.toHaveBeenCalled();

    result.dispose();
    router.dispose();
  });

  it('slow SSE data → loading state, then data arrives via stream', async () => {
    const { mockFn, controls } = createMockPrefetch();
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockFn,
    });

    const taskData = { items: [{ id: '1', title: 'Buy milk' }] };

    // Start navigation — resolve firstEvent immediately (no data in buffer)
    const navPromise = router.navigate({ to: '/tasks' });
    controls[0].resolveFirstEvent();
    await navPromise;

    // Create query — no data in buffer, should be in loading/deferred state
    const fetchThunk = vi.fn(() => Promise.resolve({ items: [] }));
    const result = query(fetchThunk, { key: 'task-list' });

    expect(result.data.value).toBeUndefined();
    expect(result.loading.value).toBe(true);
    expect(fetchThunk).not.toHaveBeenCalled();

    // Data arrives via SSE stream (pushNavData dispatches vertz:ssr-data)
    pushNavData('task-list', taskData);

    expect(result.data.value).toEqual(taskData);
    expect(result.loading.value).toBe(false);
    expect(fetchThunk).not.toHaveBeenCalled();

    result.dispose();
    router.dispose();
  });

  it('SSE done without data triggers client fallback fetch', async () => {
    const { mockFn, controls } = createMockPrefetch();
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockFn,
    });

    const clientData = { items: [{ id: '2', title: 'Client fetched' }] };

    // Start navigation — resolve firstEvent immediately (no data in buffer)
    const navPromise = router.navigate({ to: '/tasks' });
    controls[0].resolveFirstEvent();
    await navPromise;

    // Create query — deferred, in loading state
    const fetchThunk = vi.fn(() => Promise.resolve(clientData));
    const result = query(fetchThunk, { key: 'task-list' });

    expect(result.loading.value).toBe(true);
    expect(fetchThunk).not.toHaveBeenCalled();

    // SSE stream completes without data for this query → doneHandler fires
    controls[0].resolveDone();

    // Flush microtasks so the fetch promise resolves
    await flush();

    expect(fetchThunk).toHaveBeenCalled();
    expect(result.data.value).toEqual(clientData);
    expect(result.loading.value).toBe(false);

    result.dispose();
    router.dispose();
  });

  it('SWR: persistent listener updates query when fresh data arrives after cache hit', async () => {
    const cache = new MemoryCache<unknown>();
    const taskDataV1 = { items: [{ id: '1', title: 'Buy milk' }] };
    const taskDataV2 = { items: [{ id: '1', title: 'Buy organic milk' }] };
    const { mockFn, controls } = createMockPrefetch();
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockFn,
    });

    // --- First visit to /tasks — data arrives via SSE ---
    const navPromise1 = router.navigate({ to: '/tasks' });
    pushNavData('task-list', taskDataV1);
    controls[0].resolveFirstEvent();
    await navPromise1;

    const q1 = query(
      vi.fn(() => Promise.resolve({ items: [] })),
      { key: 'task-list', cache },
    );
    expect(q1.data.value).toEqual(taskDataV1);
    q1.dispose();

    // Complete the SSE stream
    controls[0].resolveDone();

    // --- Navigate away ---
    const navPromise2 = router.navigate({ to: '/' });
    controls[1].resolveFirstEvent();
    controls[1].resolveDone();
    await navPromise2;

    // --- Revisit /tasks (cache hit → instant render) ---
    const navPromise3 = router.navigate({ to: '/tasks' });
    // Router skips wait (visited URL), but SSE prefetch starts in background
    await navPromise3;

    // Create query — should serve from cache immediately
    const fetchThunk = vi.fn(() => Promise.resolve({ items: [] }));
    const q2 = query(fetchThunk, { key: 'task-list', cache });
    expect(q2.data.value).toEqual(taskDataV1); // Cache hit
    expect(q2.loading.value).toBe(false);

    // SWR: fresh data arrives via background SSE prefetch
    pushNavData('task-list', taskDataV2);

    // The persistent listener should update the query with fresh data
    expect(q2.data.value).toEqual(taskDataV2);

    q2.dispose();
    router.dispose();
  });

  it('cache hit on revisit → instant render', async () => {
    const cache = new MemoryCache<unknown>();
    const taskData = { items: [{ id: '1', title: 'Buy milk' }] };
    const { mockFn, controls } = createMockPrefetch();
    const router = createRouter(routes, '/', {
      serverNav: true,
      _prefetchNavData: mockFn,
    });

    // --- First visit to /tasks ---
    const navPromise1 = router.navigate({ to: '/tasks' });
    pushNavData('task-list', taskData);
    controls[0].resolveFirstEvent();
    await navPromise1;

    const q1 = query(
      vi.fn(() => Promise.resolve({ items: [] })),
      {
        key: 'task-list',
        cache,
      },
    );
    expect(q1.data.value).toEqual(taskData);
    q1.dispose();

    // --- Navigate away to / ---
    controls[0].resolveDone();
    const navPromise2 = router.navigate({ to: '/' });
    controls[1].resolveFirstEvent();
    controls[1].resolveDone();
    await navPromise2;

    // --- Revisit /tasks (no data pushed this time) ---
    const navPromise3 = router.navigate({ to: '/tasks' });
    controls[2].resolveFirstEvent();
    await navPromise3;

    // Create query with same key and same cache instance
    const fetchThunk = vi.fn(() => Promise.resolve({ items: [] }));
    const q2 = query(fetchThunk, { key: 'task-list', cache });

    // Should serve from cache — instant, no loading flash
    expect(q2.data.value).toEqual(taskData);
    expect(q2.loading.value).toBe(false);
    expect(fetchThunk).not.toHaveBeenCalled();

    q2.dispose();
    router.dispose();
  });
});
