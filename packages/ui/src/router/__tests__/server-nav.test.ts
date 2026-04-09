import { afterEach, beforeEach, describe, expect, it, mock } from '@vertz/test';
import {
  ensureSSRDataBus,
  isNavPrefetchActive,
  parseSSE,
  prefetchNavData,
  pushNavData,
} from '../server-nav';

// ─── SSE Parser ───────────────────────────────────────────────

describe('parseSSE', () => {
  it('parses a single complete event', () => {
    const buffer = 'event: data\ndata: {"key":"k","data":1}\n\n';
    const result = parseSSE(buffer);
    expect(result.events).toEqual([{ type: 'data', data: '{"key":"k","data":1}' }]);
    expect(result.remaining).toBe('');
  });

  it('returns incomplete event as remaining buffer', () => {
    const buffer = 'event: data\ndata: {"key":"k"';
    const result = parseSSE(buffer);
    expect(result.events).toEqual([]);
    expect(result.remaining).toBe(buffer);
  });

  it('parses multiple events from a single buffer', () => {
    const buffer = 'event: data\ndata: {"key":"a","data":1}\n\nevent: done\ndata: {}\n\n';
    const result = parseSSE(buffer);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]?.type).toBe('data');
    expect(result.events[1]?.type).toBe('done');
  });
});

// ─── Bus Management ───────────────────────────────────────────

describe('ensureSSRDataBus', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__;
  });

  it('creates __VERTZ_SSR_DATA__ and __VERTZ_SSR_PUSH__ globals', () => {
    ensureSSRDataBus();
    expect((globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__).toEqual([]);
    expect(typeof (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__).toBe('function');
  });

  it('clears existing buffer data when recreated', () => {
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [{ key: 'stale', data: 'old' }];
    ensureSSRDataBus();
    expect((globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__).toEqual([]);
  });
});

describe('pushNavData', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__;
  });

  it('dispatches vertz:ssr-data event with key and data', () => {
    ensureSSRDataBus();
    const handler = mock(() => {});
    document.addEventListener('vertz:ssr-data', handler);
    pushNavData('test-key', { value: 42 });
    expect(handler).toHaveBeenCalled();
    const detail = (handler.mock.calls[0]?.[0] as CustomEvent).detail;
    expect(detail).toEqual({ key: 'test-key', data: { value: 42 } });
    document.removeEventListener('vertz:ssr-data', handler);
  });

  it('adds entry to __VERTZ_SSR_DATA__ buffer', () => {
    ensureSSRDataBus();
    pushNavData('buf-key', 'buf-data');
    expect(
      (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ as Array<{
        key: string;
        data: unknown;
      }>,
    ).toContainEqual({
      key: 'buf-key',
      data: 'buf-data',
    });
  });
});

// ─── prefetchNavData ──────────────────────────────────────────

describe('prefetchNavData', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__;
    delete (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__;
    delete (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__;
  });

  it('sends fetch with X-Vertz-Nav header', () => {
    const mockFetch = mock(() => new Promise<Response>(() => {}));
    globalThis.fetch = mockFetch;
    const handle = prefetchNavData('/tasks');
    expect(mockFetch).toHaveBeenCalled();
    const callArgs = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    const [url, opts] = callArgs;
    expect(url).toBe('/tasks');
    expect((opts.headers as Record<string, string>)['X-Vertz-Nav']).toBe('1');
    handle.abort();
  });

  it('sets __VERTZ_NAV_PREFETCH_ACTIVE__ to true when starting', () => {
    globalThis.fetch = mock(() => new Promise<Response>(() => {}));
    const handle = prefetchNavData('/tasks');
    expect(isNavPrefetchActive()).toBe(true);
    handle.abort();
  });

  it('pushes received SSE data into hydration bus', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: data\ndata: {"key":"q1","data":{"id":1}}\n\n'));
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    });
    globalThis.fetch = mock(() => Promise.resolve(new Response(stream, { status: 200 })));

    prefetchNavData('/tasks');

    // Wait for the async stream processing
    await new Promise((r) => setTimeout(r, 50));

    const ssrData = (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ as Array<{
      key: string;
      data: unknown;
    }>;
    expect(ssrData).toContainEqual({ key: 'q1', data: { id: 1 } });
  });

  it('clears active flag and dispatches done event on completion', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    });
    globalThis.fetch = mock(() => Promise.resolve(new Response(stream, { status: 200 })));

    const doneHandler = mock(() => {});
    document.addEventListener('vertz:nav-prefetch-done', doneHandler);

    prefetchNavData('/tasks');
    await new Promise((r) => setTimeout(r, 50));

    expect(isNavPrefetchActive()).toBe(false);
    expect(doneHandler).toHaveBeenCalled();
    document.removeEventListener('vertz:nav-prefetch-done', doneHandler);
  });

  it('abort cancels the in-flight fetch', () => {
    const mockFetch = mock((_url: string) => {
      return new Promise<Response>(() => {
        // never resolves — will be aborted
      });
    });
    globalThis.fetch = mockFetch;

    const handle = prefetchNavData('/tasks');
    handle.abort();

    const signal = (mockFetch.mock.calls[0]?.[1] as RequestInit).signal;
    expect(signal?.aborted).toBe(true);
  });

  it('silently handles fetch errors and clears active flag', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));

    prefetchNavData('/tasks');
    await new Promise((r) => setTimeout(r, 50));

    expect(isNavPrefetchActive()).toBe(false);
  });

  it('returns a done promise that resolves when SSE completes', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: data\ndata: {"key":"q1","data":1}\n\n'));
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    });
    globalThis.fetch = mock(() => Promise.resolve(new Response(stream, { status: 200 })));

    const handle = prefetchNavData('/tasks');
    expect(handle.done).toBeInstanceOf(Promise);

    await handle.done;

    // After done resolves, data should be in the bus
    const ssrData = (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ as Array<{
      key: string;
      data: unknown;
    }>;
    expect(ssrData).toContainEqual({ key: 'q1', data: 1 });
    expect(isNavPrefetchActive()).toBe(false);
  });

  it('can be called concurrently (caller manages lifecycle)', () => {
    const mockFetch = mock(() => new Promise<Response>(() => {}));
    globalThis.fetch = mockFetch;

    const handleA = prefetchNavData('/tasks');
    const handleB = prefetchNavData('/tasks/123');

    // Both calls should initiate fetches — the caller (router) manages aborting
    expect(mockFetch).toHaveBeenCalledTimes(2);
    handleA.abort();
    handleB.abort();
  });

  it('ignores unknown event types without crashing', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: unknown\ndata: {"key":"mystery"}\n\n'));
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    });
    globalThis.fetch = mock(() => Promise.resolve(new Response(stream, { status: 200 })));

    const handle = prefetchNavData('/tasks');
    await handle.done;

    expect(isNavPrefetchActive()).toBe(false);
  });

  it('firstEvent resolves on first SSE event before done', async () => {
    const encoder = new TextEncoder();
    let enqueueFn: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        enqueueFn = controller;
      },
    });
    globalThis.fetch = mock(() => Promise.resolve(new Response(stream, { status: 200 })));

    const handle = prefetchNavData('/tasks');
    expect(handle.firstEvent).toBeInstanceOf(Promise);

    let firstEventResolved = false;
    const firstEvent = handle.firstEvent as Promise<void>;
    firstEvent.then(() => {
      firstEventResolved = true;
    });

    // No events yet — firstEvent should not have resolved
    await new Promise((r) => setTimeout(r, 10));
    expect(firstEventResolved).toBe(false);

    // Send first event
    const ctrl = enqueueFn as ReadableStreamDefaultController<Uint8Array>;
    ctrl.enqueue(encoder.encode('event: data\ndata: {"key":"q1","data":1}\n\n'));
    await new Promise((r) => setTimeout(r, 10));
    expect(firstEventResolved).toBe(true);

    // Clean up
    ctrl.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
    ctrl.close();
    await handle.done;
  });

  it('firstEvent resolves on done when no data events arrive', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    });
    globalThis.fetch = mock(() => Promise.resolve(new Response(stream, { status: 200 })));

    const handle = prefetchNavData('/tasks');
    let firstEventResolved = false;
    const firstEvent = handle.firstEvent as Promise<void>;
    firstEvent.then(() => {
      firstEventResolved = true;
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(firstEventResolved).toBe(true);
  });

  it('aborted prefetch does not clear active flag when a newer prefetch exists', async () => {
    // Simulate: prefetch A starts, then prefetch B starts (aborting A).
    // A's .catch() must NOT dispatch done or clear the active flag.
    // Mock fetch that rejects on abort (like real fetch does).
    const abortAwareFetch = mock(
      (_url: string, opts?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    globalThis.fetch = abortAwareFetch;

    const handleA = prefetchNavData('/page-a');
    expect(isNavPrefetchActive()).toBe(true);

    // Start a second prefetch — this increments the generation counter
    const handleB = prefetchNavData('/page-b');
    expect(isNavPrefetchActive()).toBe(true);

    // Abort A (simulates startPrefetch aborting the previous one)
    handleA.abort();

    // Wait for abort's async .catch() to fire
    await new Promise((r) => setTimeout(r, 50));

    // Active flag must still be true — B is still running
    expect(isNavPrefetchActive()).toBe(true);

    // Clean up
    handleB.abort();
    await new Promise((r) => setTimeout(r, 50));
    // Now B was the latest prefetch AND it's aborted — flag should be cleared
    expect(isNavPrefetchActive()).toBe(false);
  });

  it('aborted prefetch does not dispatch vertz:nav-prefetch-done when superseded', async () => {
    const abortAwareFetch = mock(
      (_url: string, opts?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    globalThis.fetch = abortAwareFetch;

    const doneHandler = mock(() => {});
    document.addEventListener('vertz:nav-prefetch-done', doneHandler);

    const handleA = prefetchNavData('/page-a');
    const handleB = prefetchNavData('/page-b');

    // Abort A
    handleA.abort();
    await new Promise((r) => setTimeout(r, 50));

    // done event must NOT have fired — B is still active
    expect(doneHandler).not.toHaveBeenCalled();

    // Abort B — now the done event should fire
    handleB.abort();
    await new Promise((r) => setTimeout(r, 50));
    expect(doneHandler).toHaveBeenCalledTimes(1);

    document.removeEventListener('vertz:nav-prefetch-done', doneHandler);
  });
});
