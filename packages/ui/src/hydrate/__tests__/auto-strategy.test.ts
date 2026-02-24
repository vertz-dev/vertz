import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { autoStrategy } from '../strategies';

describe('autoStrategy', () => {
  let observeCallback: IntersectionObserverCallback;
  let observedElements: Element[];
  let disconnectSpy: ReturnType<typeof vi.fn>;
  let origIntersectionObserver: typeof globalThis.IntersectionObserver;
  let constructorOptions: IntersectionObserverInit | undefined;

  beforeEach(() => {
    observedElements = [];
    disconnectSpy = vi.fn();
    constructorOptions = undefined;
    origIntersectionObserver = globalThis.IntersectionObserver;

    globalThis.IntersectionObserver = class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observeCallback = callback;
        constructorOptions = options;
      }
      observe(el: Element): void {
        observedElements.push(el);
      }
      disconnect = disconnectSpy;
      unobserve = vi.fn();
      root = null;
      rootMargin = '';
      thresholds = [] as number[];
      takeRecords = vi.fn(() => [] as IntersectionObserverEntry[]);
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = origIntersectionObserver;
  });

  it('does not call hydrateFn immediately (observes element)', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    autoStrategy(el, hydrateFn);
    expect(hydrateFn).not.toHaveBeenCalled();
    expect(observedElements).toContain(el);
  });

  it('calls hydrateFn when isIntersecting is true', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    autoStrategy(el, hydrateFn);

    observeCallback(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(hydrateFn).toHaveBeenCalledOnce();
  });

  it('does not call hydrateFn when isIntersecting is false', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    autoStrategy(el, hydrateFn);

    observeCallback(
      [{ isIntersecting: false, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(hydrateFn).not.toHaveBeenCalled();
  });

  it('disconnects observer after hydration', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    autoStrategy(el, hydrateFn);

    observeCallback(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(disconnectSpy).toHaveBeenCalledOnce();
  });

  it('falls back to eager when IntersectionObserver is unavailable', () => {
    (globalThis as Record<string, unknown>).IntersectionObserver = undefined;
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    autoStrategy(el, hydrateFn);
    expect(hydrateFn).toHaveBeenCalledOnce();
  });

  it('uses 200px rootMargin', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    autoStrategy(el, hydrateFn);
    expect(constructorOptions?.rootMargin).toBe('200px');
  });
});
