import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentFunction, ComponentRegistry } from '../component-registry';
import { hydrate } from '../hydrate';

describe('hydrate()', () => {
  let observeCallback: IntersectionObserverCallback;
  let disconnectSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    disconnectSpy = vi.fn();

    vi.stubGlobal(
      'IntersectionObserver',
      class MockIntersectionObserver {
        constructor(callback: IntersectionObserverCallback) {
          observeCallback = callback;
        }
        observe = vi.fn();
        disconnect = disconnectSpy;
        unobserve = vi.fn();
      },
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  // IT-5B-1: Hydration bootstraps interactive components from server HTML
  it('bootstraps interactive component from server-rendered HTML', async () => {
    document.body.innerHTML = `
      <div data-v-id="Counter" data-v-key="c1" hydrate="eager">
        <script type="application/json">{"initial":0}</script>
        <button>0</button>
      </div>
    `;

    let receivedProps: Record<string, unknown> = {};
    let receivedEl: Element | null = null;

    const CounterComponent: ComponentFunction = (props, el) => {
      receivedProps = props;
      receivedEl = el;
      // Simulate hydration: bind click handler
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

    // Wait for async resolution
    await vi.waitFor(() => {
      expect(receivedEl).not.toBeNull();
    });

    expect(receivedProps).toEqual({ initial: 0 });

    const button = document.querySelector('button');
    expect(button).not.toBeNull();
    button?.click();
    expect(button?.textContent).toBe('1');
  });

  // IT-5B-2: Lazy hydration uses IntersectionObserver
  it('lazy hydration delays until element is visible', () => {
    document.body.innerHTML = `
      <div data-v-id="LazyComponent" data-v-key="l1" hydrate="lazy">
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

  // IT-5B-3: Interaction hydration triggers on first user event
  it('interaction hydration triggers on first click', () => {
    document.body.innerHTML = `
      <div data-v-id="InteractiveComponent" data-v-key="i1" hydrate="interaction">
        <script type="application/json">{}</script>
        <button>Click me</button>
      </div>
    `;

    const hydrateSpy = vi.fn();
    const registry: ComponentRegistry = {
      InteractiveComponent: () => {
        hydrateSpy();
        return Promise.resolve({
          default: () => {},
        });
      },
    };

    hydrate(registry);
    expect(hydrateSpy).not.toHaveBeenCalled();

    // Click the button -- event bubbles to the container
    document.querySelector('button')?.click();
    expect(hydrateSpy).toHaveBeenCalled();
  });

  it('reports error via console.error when chunk load fails during hydration', async () => {
    document.body.innerHTML = `
      <div data-v-id="BrokenComponent" data-v-key="b1" hydrate="eager">
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

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[hydrate] Failed to hydrate component "BrokenComponent":',
        chunkError,
      );
    });

    consoleSpy.mockRestore();
  });

  // Default strategy is lazy
  it('defaults to lazy strategy when no hydrate attribute', () => {
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
    // Should not be called yet (lazy waits for intersection)
    expect(hydrateSpy).not.toHaveBeenCalled();
  });
});
