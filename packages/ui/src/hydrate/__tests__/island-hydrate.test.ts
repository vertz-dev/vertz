import { afterEach, beforeEach, describe, expect, it, mock, vi } from '@vertz/test';
import type { IslandRegistry } from '../island-hydrate';
import { hydrateIslands } from '../island-hydrate';

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

describe('Feature: Island hydration', () => {
  let observeCallback: IntersectionObserverCallback;
  let observeSpy: ReturnType<typeof vi.fn>;
  let origIntersectionObserver: typeof globalThis.IntersectionObserver;

  beforeEach(() => {
    document.body.innerHTML = '';
    observeSpy = vi.fn();
    origIntersectionObserver = globalThis.IntersectionObserver;

    globalThis.IntersectionObserver = class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observeCallback = callback;
      }
      observe = vi.fn((el: Element) => {
        observeSpy(el);
        // Simulate immediate intersection for above-fold elements
        observeCallback(
          [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      });
      disconnect = vi.fn();
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

  describe('Given a DOM with one data-v-island element and a matching registry', () => {
    describe('When hydrateIslands is called', () => {
      it('Then the component loader is called for the matching island', async () => {
        document.body.innerHTML = `
          <div data-v-island="Counter">
            <script data-v-island-props type="application/json">{"start":0}</script>
            <button>0</button>
          </div>
        `;

        const componentFn = mock(() => {});
        const loader = mock(() => Promise.resolve({ default: componentFn }));

        hydrateIslands({ Counter: loader } as IslandRegistry);

        await waitFor(() => {
          expect(loader).toHaveBeenCalledTimes(1);
        });
      });
    });
  });

  describe('Given a DOM with data-v-island but no matching registry entry', () => {
    describe('When hydrateIslands is called', () => {
      it('Then a console error is logged with the island ID', () => {
        document.body.innerHTML = `
          <div data-v-island="Missing">
            <script data-v-island-props type="application/json">{}</script>
            <span>content</span>
          </div>
        `;

        const errorSpy = mock(() => {});
        const originalError = console.error;
        console.error = errorSpy;

        hydrateIslands({});

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][0]).toContain('Missing');

        console.error = originalError;
      });
    });
  });

  describe('Given a DOM with data-v-island that is already hydrated', () => {
    describe('When hydrateIslands is called', () => {
      it('Then the island is skipped (no double hydration)', () => {
        document.body.innerHTML = `
          <div data-v-island="Counter" data-v-hydrated>
            <script data-v-island-props type="application/json">{}</script>
            <button>0</button>
          </div>
        `;

        const loader = mock(() => Promise.resolve({ default: () => {} }));
        hydrateIslands({ Counter: loader } as IslandRegistry);

        expect(loader).not.toHaveBeenCalled();
      });
    });
  });

  describe('Given island props serialized in the DOM', () => {
    describe('When the island component hydrates', () => {
      it('Then the component receives the deserialized props', async () => {
        document.body.innerHTML = `
          <div data-v-island="Greeter">
            <script data-v-island-props type="application/json">{"name":"World","count":42}</script>
            <span>Hello World</span>
          </div>
        `;

        let receivedProps: Record<string, unknown> = {};
        const componentFn = mock((props: Record<string, unknown>) => {
          receivedProps = props;
        });

        hydrateIslands({
          Greeter: () => Promise.resolve({ default: componentFn }),
        } as IslandRegistry);

        await waitFor(() => {
          expect(receivedProps).toEqual({ name: 'World', count: 42 });
        });
      });
    });
  });

  describe('Given a DOM with no data-v-island elements', () => {
    describe('When hydrateIslands is called', () => {
      it('Then no errors are thrown and no loaders are called', () => {
        document.body.innerHTML = '<div><p>Static content</p></div>';

        const loader = mock(() => Promise.resolve({ default: () => {} }));
        hydrateIslands({ Counter: loader } as IslandRegistry);

        expect(loader).not.toHaveBeenCalled();
      });
    });
  });

  describe('Given a component that returns a DOM node', () => {
    describe('When hydrateIslands is called', () => {
      it('Then the returned node replaces the SSR content', async () => {
        document.body.innerHTML = `
          <div data-v-island="CopyBtn">
            <script data-v-island-props type="application/json">{}</script>
            <button>SSR content</button>
          </div>
        `;

        const interactiveBtn = document.createElement('button');
        interactiveBtn.textContent = 'Interactive';
        const componentFn = mock(() => interactiveBtn);

        hydrateIslands({
          CopyBtn: () => Promise.resolve({ default: componentFn }),
        } as IslandRegistry);

        await waitFor(() => {
          const el = document.querySelector('[data-v-island="CopyBtn"]')!;
          expect(el.querySelector('button')!.textContent).toBe('Interactive');
          // Props script tag is preserved
          expect(el.querySelector('script[data-v-island-props]')).not.toBeNull();
        });
      });
    });
  });

  describe('Given a hydrated island', () => {
    describe('When hydration completes', () => {
      it('Then the element gets data-v-hydrated attribute', async () => {
        document.body.innerHTML = `
          <div data-v-island="Counter">
            <script data-v-island-props type="application/json">{}</script>
            <button>0</button>
          </div>
        `;

        const el = document.querySelector('[data-v-island]')!;
        expect(el.hasAttribute('data-v-hydrated')).toBe(false);

        hydrateIslands({
          Counter: () => Promise.resolve({ default: () => {} }),
        } as IslandRegistry);

        await waitFor(() => {
          expect(el.hasAttribute('data-v-hydrated')).toBe(true);
        });
      });
    });
  });
});
