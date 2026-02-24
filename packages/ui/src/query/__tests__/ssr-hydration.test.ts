import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupSSRData, hydrateQueryFromSSR } from '../ssr-hydration';

// Minimal browser-like environment for event dispatching
const listeners = new Map<string, Set<EventListener>>();

beforeEach(() => {
  listeners.clear();

  // Mock document.addEventListener / removeEventListener
  (globalThis as Record<string, unknown>).document = {
    addEventListener: (type: string, fn: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(fn);
    },
    removeEventListener: (type: string, fn: EventListener) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (event: { type: string; detail: unknown }) => {
      const fns = listeners.get(event.type);
      if (fns) {
        for (const fn of fns) fn(event as unknown as Event);
      }
    },
  };

  // Ensure no SSR data globals exist before each test
  delete (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__;
  delete (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__;
  delete (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__;
});

describe('hydrateQueryFromSSR', () => {
  it('resolves immediately when data exists in buffered array', () => {
    // Simulate data already pushed before hydration
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [
      { key: 'my-query', data: { items: [1, 2, 3] } },
    ];

    const resolve = vi.fn();
    hydrateQueryFromSSR('my-query', resolve);

    expect(resolve).toHaveBeenCalledWith({ items: [1, 2, 3] });
  });

  it('resolves on event when data arrives later', () => {
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [];

    const resolve = vi.fn();
    hydrateQueryFromSSR('late-query', resolve);

    // Data not yet available
    expect(resolve).not.toHaveBeenCalled();

    // Simulate streamed data arrival via event
    const doc = (globalThis as Record<string, unknown>).document as {
      dispatchEvent: (e: unknown) => void;
    };
    doc.dispatchEvent({
      type: 'vertz:ssr-data',
      detail: { key: 'late-query', data: 'streamed-value' },
    });

    expect(resolve).toHaveBeenCalledWith('streamed-value');
  });

  it('ignores data for non-matching key', () => {
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [];

    const resolve = vi.fn();
    hydrateQueryFromSSR('target-key', resolve);

    // Dispatch event for a different key
    const doc = (globalThis as Record<string, unknown>).document as {
      dispatchEvent: (e: unknown) => void;
    };
    doc.dispatchEvent({
      type: 'vertz:ssr-data',
      detail: { key: 'other-key', data: 'wrong-data' },
    });

    expect(resolve).not.toHaveBeenCalled();
  });

  it('cleanup removes event listener', () => {
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [];

    const resolve = vi.fn();
    const cleanup = hydrateQueryFromSSR('cleanup-key', resolve);

    cleanup();

    // Dispatch event after cleanup — should not resolve
    const doc = (globalThis as Record<string, unknown>).document as {
      dispatchEvent: (e: unknown) => void;
    };
    doc.dispatchEvent({
      type: 'vertz:ssr-data',
      detail: { key: 'cleanup-key', data: 'late-data' },
    });

    expect(resolve).not.toHaveBeenCalled();
  });

  it('returns null cleanup when no SSR data exists', () => {
    // No __VERTZ_SSR_DATA__ — not an SSR page
    const resolve = vi.fn();
    const cleanup = hydrateQueryFromSSR('no-ssr', resolve);

    expect(cleanup).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe('cleanupSSRData', () => {
  it('clears SSR globals', () => {
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [{ key: 'k', data: 'd' }];
    (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__ = () => {};

    cleanupSSRData();

    expect((globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__).toBeUndefined();
    expect((globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__).toBeUndefined();
  });
});
