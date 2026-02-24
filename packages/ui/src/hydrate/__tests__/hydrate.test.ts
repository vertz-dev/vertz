import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import type { ComponentFunction, ComponentRegistry } from '../component-registry';
import { hydrate } from '../hydrate';

async function waitFor(fn: () => void, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      fn();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  fn();
}

describe('hydrate()', () => {
  let observeCallback: IntersectionObserverCallback;
  let disconnectSpy: ReturnType<typeof vi.fn>;
  let origIntersectionObserver: typeof globalThis.IntersectionObserver;

  beforeEach(() => {
    disconnectSpy = vi.fn();
    origIntersectionObserver = globalThis.IntersectionObserver;

    globalThis.IntersectionObserver = class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observeCallback = callback;
      }
      observe = vi.fn();
      disconnect = disconnectSpy;
      unobserve = vi.fn();
      root = null;
      rootMargin = '';
      thresholds = [] as number[];
      takeRecords = vi.fn(() => [] as IntersectionObserverEntry[]);
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    globalThis.IntersectionObserver = origIntersectionObserver;
  });

  it('bootstraps interactive component from server-rendered HTML', async () => {
    document.body.innerHTML = `
      <div data-v-id="Counter" data-v-key="c1">
        <script type="application/json">{"initial":0}</script>
        <button>0</button>
      </div>
    `;

    let receivedProps: Record<string, unknown> = {};
    let receivedEl: Element | null = null;

    const CounterComponent: ComponentFunction = (props, el) => {
      receivedProps = props;
      receivedEl = el;
      const button = el.querySelector('button');
      if (!button) return;
      let count = (props.initial as number) ?? 0;
      button.addEventListener('click', () => {
        count++;
        button.textContent = String(count);
      });
    };

    const registry: ComponentRegistry = {
      Counter: () => Promise.resolve({ default: CounterComponent }),
    };

    hydrate(registry);

    // Trigger auto-strategy IO callback
    const el = document.querySelector('[data-v-id]');
    observeCallback(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(receivedEl).not.toBeNull();
    });

    expect(receivedProps).toEqual({ initial: 0 });

    const button = document.querySelector('button');
    expect(button).not.toBeNull();
    button?.click();
    expect(button?.textContent).toBe('1');
  });

  it('auto strategy delays hydration until element is near viewport', () => {
    document.body.innerHTML = `
      <div data-v-id="LazyComponent" data-v-key="l1">
        <script type="application/json">{}</script>
        <div>Content</div>
      </div>
    `;

    const hydrateSpy = vi.fn();
    const registry: ComponentRegistry = {
      LazyComponent: () => {
        hydrateSpy();
        return Promise.resolve({
          default: () => {},
        });
      },
    };

    hydrate(registry);
    expect(hydrateSpy).not.toHaveBeenCalled();

    // Trigger intersection
    const el = document.querySelector('[data-v-id]');
    expect(el).not.toBeNull();
    observeCallback(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(hydrateSpy).toHaveBeenCalled();
  });

  it('reports error via console.error when chunk load fails during hydration', async () => {
    document.body.innerHTML = `
      <div data-v-id="BrokenComponent" data-v-key="b1">
        <script type="application/json">{}</script>
        <div>Content</div>
      </div>
    `;

    const chunkError = new Error('Failed to fetch chunk');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const registry: ComponentRegistry = {
      BrokenComponent: () => Promise.reject(chunkError),
    };

    hydrate(registry);

    // Trigger auto-strategy IO callback
    const el = document.querySelector('[data-v-id]');
    observeCallback(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[hydrate] Failed to hydrate component "BrokenComponent":',
        chunkError,
      );
    });

    consoleSpy.mockRestore();
  });

  it('uses auto strategy when no hydrate attribute is present', () => {
    document.body.innerHTML = `
      <div data-v-id="DefaultComponent" data-v-key="d1">
        <script type="application/json">{}</script>
        <div>Content</div>
      </div>
    `;

    const hydrateSpy = vi.fn();
    const registry: ComponentRegistry = {
      DefaultComponent: () => {
        hydrateSpy();
        return Promise.resolve({
          default: () => {},
        });
      },
    };

    hydrate(registry);
    // Auto strategy waits for intersection, should not fire immediately
    expect(hydrateSpy).not.toHaveBeenCalled();
  });

  it('sets data-v-hydrated attribute after hydration', async () => {
    document.body.innerHTML = `
      <div data-v-id="MarkedComponent" data-v-key="m1">
        <script type="application/json">{}</script>
        <div>Content</div>
      </div>
    `;

    const componentFn = vi.fn();
    const registry: ComponentRegistry = {
      MarkedComponent: () =>
        Promise.resolve({
          default: componentFn,
        }),
    };

    hydrate(registry);

    // Trigger auto-strategy IO callback
    const el = document.querySelector('[data-v-id="MarkedComponent"]');
    observeCallback(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(componentFn).toHaveBeenCalledOnce();
    });

    expect(el?.getAttribute('data-v-hydrated')).toBe('');
  });

  it('does not double-hydrate a component when hydrate() is called twice', async () => {
    document.body.innerHTML = `
      <div data-v-id="DoubleComponent" data-v-key="dbl1">
        <script type="application/json">{}</script>
        <div>Content</div>
      </div>
    `;

    const componentFn = vi.fn();
    const registry: ComponentRegistry = {
      DoubleComponent: () =>
        Promise.resolve({
          default: componentFn,
        }),
    };

    hydrate(registry);

    // Trigger auto-strategy IO callback
    const el = document.querySelector('[data-v-id]');
    observeCallback(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(componentFn).toHaveBeenCalledOnce();
    });

    // Call hydrate again on the same page
    hydrate(registry);

    // Wait a tick to ensure nothing else fires
    await new Promise((r) => setTimeout(r, 10));
    expect(componentFn).toHaveBeenCalledOnce();
  });

  it('skips elements that already have data-v-hydrated attribute', () => {
    document.body.innerHTML = `
      <div data-v-id="AlreadyHydrated" data-v-key="ah1" data-v-hydrated>
        <script type="application/json">{}</script>
        <div>Content</div>
      </div>
    `;

    const componentFn = vi.fn();
    const registry: ComponentRegistry = {
      AlreadyHydrated: () =>
        Promise.resolve({
          default: componentFn,
        }),
    };

    hydrate(registry);

    // Component should NOT be hydrated because it already has the marker
    expect(componentFn).not.toHaveBeenCalled();
  });
});
