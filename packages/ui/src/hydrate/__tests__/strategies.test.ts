import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  eagerStrategy,
  idleStrategy,
  interactionStrategy,
  lazyStrategy,
  mediaStrategy,
  visibleStrategy,
} from '../strategies';

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

  it('falls back to eager when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    lazyStrategy(el, hydrateFn);
    expect(hydrateFn).toHaveBeenCalledOnce();
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

describe('idleStrategy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('schedules hydration via requestIdleCallback', () => {
    let idleCallback: IdleRequestCallback | undefined;
    vi.stubGlobal('requestIdleCallback', (cb: IdleRequestCallback) => {
      idleCallback = cb;
      return 1;
    });

    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    idleStrategy(el, hydrateFn);

    expect(hydrateFn).not.toHaveBeenCalled();
    expect(idleCallback).toBeDefined();

    // Simulate idle callback firing
    idleCallback!({} as IdleDeadline);
    expect(hydrateFn).toHaveBeenCalledOnce();
  });

  it('falls back to setTimeout when requestIdleCallback is unavailable', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();

    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    idleStrategy(el, hydrateFn);

    expect(hydrateFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(0);
    expect(hydrateFn).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });
});

describe('mediaStrategy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hydrates immediately when media query already matches', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    mediaStrategy('(min-width: 768px)')(el, hydrateFn);

    expect(hydrateFn).toHaveBeenCalledOnce();
  });

  it('defers hydration until media query matches', () => {
    let changeHandler: ((event: { matches: boolean }) => void) | undefined;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_event: string, handler: (event: { matches: boolean }) => void) => {
        changeHandler = handler;
      },
      removeEventListener: vi.fn(),
    }));

    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    mediaStrategy('(min-width: 768px)')(el, hydrateFn);

    expect(hydrateFn).not.toHaveBeenCalled();
    expect(changeHandler).toBeDefined();

    // Simulate media query matching
    changeHandler!({ matches: true });
    expect(hydrateFn).toHaveBeenCalledOnce();
  });

  it('does not hydrate when media query change does not match', () => {
    let changeHandler: ((event: { matches: boolean }) => void) | undefined;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_event: string, handler: (event: { matches: boolean }) => void) => {
        changeHandler = handler;
      },
      removeEventListener: vi.fn(),
    }));

    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    mediaStrategy('(min-width: 768px)')(el, hydrateFn);

    changeHandler!({ matches: false });
    expect(hydrateFn).not.toHaveBeenCalled();
  });

  it('removes event listener after hydration', () => {
    let changeHandler: ((event: { matches: boolean }) => void) | undefined;
    const removeEventListenerSpy = vi.fn();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_event: string, handler: (event: { matches: boolean }) => void) => {
        changeHandler = handler;
      },
      removeEventListener: removeEventListenerSpy,
    }));

    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    mediaStrategy('(min-width: 768px)')(el, hydrateFn);

    changeHandler!({ matches: true });
    expect(removeEventListenerSpy).toHaveBeenCalledWith('change', changeHandler);
  });
});

describe('visibleStrategy', () => {
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
    visibleStrategy(el, hydrateFn);
    expect(hydrateFn).not.toHaveBeenCalled();
    expect(observedElements).toContain(el);
  });

  it('calls hydrateFn when element enters the viewport', () => {
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    visibleStrategy(el, hydrateFn);

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
    visibleStrategy(el, hydrateFn);

    observeCallback(
      [{ isIntersecting: false, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(hydrateFn).not.toHaveBeenCalled();
  });

  it('falls back to eager when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const el = document.createElement('div');
    const hydrateFn = vi.fn();
    visibleStrategy(el, hydrateFn);
    expect(hydrateFn).toHaveBeenCalledOnce();
  });
});
