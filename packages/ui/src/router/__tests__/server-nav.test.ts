import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
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
    prefetchNavData('/tasks');
    expect(mockFetch).toHaveBeenCalled();
    const callArgs = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    const [url, opts] = callArgs;
    expect(url).toBe('/tasks');
    expect((opts.headers as Record<string, string>)['X-Vertz-Nav']).toBe('1');
  });

  it('sets __VERTZ_NAV_PREFETCH_ACTIVE__ to true when starting', () => {
    globalThis.fetch = mock(() => new Promise<Response>(() => {}));
    prefetchNavData('/tasks');
    expect(isNavPrefetchActive()).toBe(true);
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

    prefetchNavData('/tasks');
    prefetchNavData('/tasks/123');

    // Both calls should initiate fetches — the caller (router) manages aborting
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
