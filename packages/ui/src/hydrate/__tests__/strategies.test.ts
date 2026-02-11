import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eagerStrategy, interactionStrategy, lazyStrategy } from '../strategies';

describe('eagerStrategy', () => {
  it('calls hydrateFn immediately', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    eagerStrategy(el, hydrateFn);
    expect(hydrateFn).toHaveBeenCalledOnce();
  });
});

describe('lazyStrategy', () => {
  let observeCallback: IntersectionObserverCallback;
  let observedElements: Element[];
  let disconnectSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    observedElements = [];
    disconnectSpy = vi.fn();

    vi.stubGlobal(
      'IntersectionObserver',
      class MockIntersectionObserver {
        constructor(callback: IntersectionObserverCallback) {
          observeCallback = callback;
        }
        observe(el: Element): void {
          observedElements.push(el);
        }
        disconnect = disconnectSpy;
        unobserve = vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call hydrateFn immediately', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    lazyStrategy(el, hydrateFn);
    expect(hydrateFn).not.toHaveBeenCalled();
    expect(observedElements).toContain(el);
  });

  it('calls hydrateFn when element becomes visible', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    lazyStrategy(el, hydrateFn);

    // Simulate intersection
    observeCallback(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(hydrateFn).toHaveBeenCalledOnce();
    expect(disconnectSpy).toHaveBeenCalledOnce();
  });

  it('does not call hydrateFn when element is not intersecting', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    lazyStrategy(el, hydrateFn);

    observeCallback(
      [{ isIntersecting: false, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(hydrateFn).not.toHaveBeenCalled();
  });
});

describe('interactionStrategy', () => {
  it('does not call hydrateFn immediately', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    interactionStrategy(el, hydrateFn);
    expect(hydrateFn).not.toHaveBeenCalled();
  });

  it('calls hydrateFn on click', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    interactionStrategy(el, hydrateFn);

    el.dispatchEvent(new Event('click'));
    expect(hydrateFn).toHaveBeenCalledOnce();
  });

  it('calls hydrateFn on focus', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    interactionStrategy(el, hydrateFn);

    el.dispatchEvent(new Event('focus'));
    expect(hydrateFn).toHaveBeenCalledOnce();
  });

  it('calls hydrateFn on pointerenter', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    interactionStrategy(el, hydrateFn);

    el.dispatchEvent(new Event('pointerenter'));
    expect(hydrateFn).toHaveBeenCalledOnce();
  });

  it('only fires once even with multiple events', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    interactionStrategy(el, hydrateFn);

    el.dispatchEvent(new Event('click'));
    el.dispatchEvent(new Event('focus'));
    el.dispatchEvent(new Event('pointerenter'));
    expect(hydrateFn).toHaveBeenCalledOnce();
  });
});
