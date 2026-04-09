import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';
import type { AppBuilder } from '@vertz/core';
import { createHandler } from '../src/handler.js';
import type { CacheEntry } from '../src/isr-cache.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockApp(handler?: (...args: unknown[]) => Promise<Response>): AppBuilder {
  return {
    handler: handler ?? vi.fn().mockResolvedValue(new Response('OK')),
  } as unknown as AppBuilder;
}

interface MockKV {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

function createMockKV(): MockKV {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockCtx(): ExecutionContext & { _waitUntilPromises: Promise<unknown>[] } {
  const promises: Promise<unknown>[] = [];
  return {
    waitUntil: vi.fn((p: Promise<unknown>) => {
      promises.push(p);
    }),
    passThroughOnException: vi.fn(),
    _waitUntilPromises: promises,
  } as unknown as ExecutionContext & { _waitUntilPromises: Promise<unknown>[] };
}

// ---------------------------------------------------------------------------
// Mock functions hoisted above vi.mock factory
// ---------------------------------------------------------------------------

const mockSSRRequestHandler = vi.fn().mockImplementation(
  async () =>
    new Response('<html>SSR rendered</html>', {
      headers: { 'Content-Type': 'text/html' },
    }),
);
const mockCreateSSRHandler = vi.fn().mockReturnValue(mockSSRRequestHandler);

// Mock the SSR module at the top level (compiler hoists this)
vi.mock('@vertz/ui-server/ssr', () => ({
  createSSRHandler: mockCreateSSRHandler,
}));

// ---------------------------------------------------------------------------
// ISR integration with createHandler
// ---------------------------------------------------------------------------

describe('createHandler with ISR cache', () => {
  const mockEnv = { DB: {}, PAGE_CACHE: {} };

  beforeEach(() => {
    mockSSRRequestHandler.mockClear();
    mockCreateSSRHandler.mockClear();
  });

  it('serves SSR and stores result in KV on cache MISS', async () => {
    const kv = createMockKV();
    const ctx = createMockCtx();

    const { createHandler: freshCreateHandler } = await import('../src/handler.js');
    const worker = freshCreateHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: { module: { App: () => ({}) } },
      cache: {
        kv: () => kv as unknown as KVNamespace,
        ttl: 3600,
      },
    });

    const response = await worker.fetch(new Request('https://example.com/about'), mockEnv, ctx);

    // SSR should have been called
    expect(mockSSRRequestHandler).toHaveBeenCalled();
    // Response should have cache MISS header
    expect(response.headers.get('X-Vertz-Cache')).toBe('MISS');
    // HTML should be the SSR output
    expect(await response.text()).toBe('<html>SSR rendered</html>');
    // KV should have been written
    expect(kv.put).toHaveBeenCalledTimes(1);
  });

  it('serves from KV without SSR on cache HIT', async () => {
    const kv = createMockKV();
    const entry: CacheEntry = {
      html: '<html>cached page</html>',
      timestamp: Date.now() - 1000, // 1 second ago — fresh
    };
    kv.get.mockResolvedValue(JSON.stringify(entry));
    const ctx = createMockCtx();

    const { createHandler: freshCreateHandler } = await import('../src/handler.js');
    const worker = freshCreateHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: { module: { App: () => ({}) } },
      cache: {
        kv: () => kv as unknown as KVNamespace,
        ttl: 3600,
      },
    });

    const response = await worker.fetch(new Request('https://example.com/about'), mockEnv, ctx);

    // SSR should NOT have been called
    expect(mockSSRRequestHandler).not.toHaveBeenCalled();
    // Response should have cache HIT header
    expect(response.headers.get('X-Vertz-Cache')).toBe('HIT');
    // HTML should be the cached content
    expect(await response.text()).toBe('<html>cached page</html>');
  });

  it('serves stale HTML and revalidates in background on cache STALE', async () => {
    const kv = createMockKV();
    const entry: CacheEntry = {
      html: '<html>stale page</html>',
      timestamp: Date.now() - 7200_000, // 2 hours ago — past 1h TTL
    };
    kv.get.mockResolvedValue(JSON.stringify(entry));
    const ctx = createMockCtx();

    const { createHandler: freshCreateHandler } = await import('../src/handler.js');
    const worker = freshCreateHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: { module: { App: () => ({}) } },
      cache: {
        kv: () => kv as unknown as KVNamespace,
        ttl: 3600,
      },
    });

    const response = await worker.fetch(new Request('https://example.com/about'), mockEnv, ctx);

    // Response should be served immediately with stale content
    expect(response.headers.get('X-Vertz-Cache')).toBe('STALE');
    expect(await response.text()).toBe('<html>stale page</html>');
    // Background revalidation should be scheduled via waitUntil
    expect(ctx.waitUntil).toHaveBeenCalled();
    // Wait for background revalidation to complete
    await Promise.all(ctx._waitUntilPromises);
    // SSR should have been called in background
    expect(mockSSRRequestHandler).toHaveBeenCalled();
    // KV should have been updated with fresh content
    expect(kv.put).toHaveBeenCalled();
  });

  it('does not cache API routes', async () => {
    const kv = createMockKV();
    const apiHandler = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    const ctx = createMockCtx();

    const { createHandler: freshCreateHandler } = await import('../src/handler.js');
    const worker = freshCreateHandler({
      app: () => mockApp(apiHandler),
      apiPrefix: '/api',
      ssr: { module: { App: () => ({}) } },
      cache: {
        kv: () => kv as unknown as KVNamespace,
        ttl: 3600,
      },
    });

    const response = await worker.fetch(new Request('https://example.com/api/todos'), mockEnv, ctx);

    // API handler should be called directly
    expect(apiHandler).toHaveBeenCalled();
    // No KV operations
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
    // No cache header on API responses
    expect(response.headers.get('X-Vertz-Cache')).toBeNull();
  });

  it('uses default TTL of 3600 when not specified', async () => {
    const kv = createMockKV();
    // Entry that is 30 minutes old — should be HIT with default 3600s TTL
    const entry: CacheEntry = {
      html: '<html>recent</html>',
      timestamp: Date.now() - 1800_000,
    };
    kv.get.mockResolvedValue(JSON.stringify(entry));
    const ctx = createMockCtx();

    const { createHandler: freshCreateHandler } = await import('../src/handler.js');
    const worker = freshCreateHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: { module: { App: () => ({}) } },
      cache: {
        kv: () => kv as unknown as KVNamespace,
      },
    });

    const response = await worker.fetch(new Request('https://example.com/'), mockEnv, ctx);

    expect(response.headers.get('X-Vertz-Cache')).toBe('HIT');
  });

  it('disables stale-while-revalidate when configured', async () => {
    const kv = createMockKV();
    const entry: CacheEntry = {
      html: '<html>stale</html>',
      timestamp: Date.now() - 7200_000,
    };
    kv.get.mockResolvedValue(JSON.stringify(entry));
    const ctx = createMockCtx();

    const { createHandler: freshCreateHandler } = await import('../src/handler.js');
    const worker = freshCreateHandler({
      app: () => mockApp(),
      apiPrefix: '/api',
      ssr: { module: { App: () => ({}) } },
      cache: {
        kv: () => kv as unknown as KVNamespace,
        ttl: 3600,
        staleWhileRevalidate: false,
      },
    });

    const response = await worker.fetch(new Request('https://example.com/about'), mockEnv, ctx);

    // With staleWhileRevalidate: false, stale entries are treated as MISS
    expect(response.headers.get('X-Vertz-Cache')).toBe('MISS');
    // SSR should be called synchronously
    expect(mockSSRRequestHandler).toHaveBeenCalled();
    // The fresh SSR result is stored in KV (via waitUntil for non-blocking write)
    expect(kv.put).toHaveBeenCalled();
  });
});
