/**
 * Tests for the animation hooks created by ComposedList.
 * These test the createAnimationHooks() behavior indirectly by
 * capturing hooks from the ListAnimationContext that ComposedList provides.
 *
 * NOTE: JSX must be in named functions (component-like) because the Vertz
 * compiler only transforms JSX inside functions that look like components.
 */
import { afterEach, describe, expect, it } from '@vertz/test';
import type { ListAnimationHooks } from '@vertz/ui';
import { ListAnimationContext, useContext } from '@vertz/ui';
import { ComposedList } from '../list-composed';

// ---------------------------------------------------------------------------
// Helpers — named functions so the compiler processes JSX
// ---------------------------------------------------------------------------

function CaptureHooks(props: {
  animate: boolean | { duration?: number; easing?: string };
  result: { hooks?: ListAnimationHooks };
}) {
  return (
    <ComposedList animate={props.animate}>
      {(() => {
        props.result.hooks = useContext(ListAnimationContext) as ListAnimationHooks | undefined;
        return <ComposedList.Item>test</ComposedList.Item>;
      })()}
    </ComposedList>
  );
}

function captureAnimationHooks(
  animate: boolean | { duration?: number; easing?: string },
): ListAnimationHooks | undefined {
  const result: { hooks?: ListAnimationHooks } = {};
  CaptureHooks({ animate, result });
  return result.hooks;
}

function RenderAnimatedList() {
  return (
    <ComposedList animate={true}>
      <ComposedList.Item>First</ComposedList.Item>
      <ComposedList.Item>Second</ComposedList.Item>
    </ComposedList>
  );
}

function RenderNonAnimatedList() {
  return (
    <ComposedList>
      {(() => {
        const result: { hooks?: ListAnimationHooks } = {};
        result.hooks = useContext(ListAnimationContext) as ListAnimationHooks | undefined;
        (globalThis as Record<string, unknown>).__testCapturedHooks = result.hooks;
        return <ComposedList.Item>test</ComposedList.Item>;
      })()}
    </ComposedList>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComposedList animation hooks behavior', () => {
  describe('Given <List animate> with items', () => {
    describe('When a new item is added (not first render)', () => {
      it('Then onItemEnter sets data-presence="enter" (cleared when no CSS anims)', () => {
        const hooks = captureAnimationHooks(true);
        expect(hooks).toBeDefined();

        const el = document.createElement('li');
        hooks?.onItemEnter(el, 'key-1');

        // In happy-dom, getAnimations() returns [] → data-presence set then immediately cleared
        expect(el.getAttribute('data-presence')).toBeNull();
      });

      it('Then first-render items do NOT get data-presence', () => {
        const el = RenderAnimatedList();
        const items = el.querySelectorAll('li');
        for (const item of items) {
          expect(item.getAttribute('data-presence')).toBeNull();
        }
      });
    });

    describe('When an item is removed', () => {
      it('Then item gets data-presence="exit"', () => {
        const hooks = captureAnimationHooks(true);
        const el = document.createElement('li');

        hooks?.onItemExit(el, 'key-1', () => {});
        expect(el.getAttribute('data-presence')).toBe('exit');
      });

      it('Then item is styled for collapse animation', () => {
        const hooks = captureAnimationHooks(true);
        const el = document.createElement('li');

        hooks?.onItemExit(el, 'key-1', () => {});
        expect(el.style.overflow).toBe('hidden');
        expect(el.style.pointerEvents).toBe('none');
        expect(el.style.borderBottomWidth).toBe('0px');
        // Height transitions to 0 for collapse effect (browser normalizes to "0px")
        expect(el.style.height).toBe('0px');
        expect(el.style.opacity).toBe('0');
      });

      it('Then done() is called via transitionend or safety timeout', async () => {
        const hooks = captureAnimationHooks(true);
        const el = document.createElement('li');
        const calls: string[] = [];

        hooks?.onItemExit(el, 'key-1', () => {
          calls.push('done');
        });

        // done() is not called synchronously — it waits for transitionend
        expect(calls).toEqual([]);

        // Simulate transitionend event
        el.dispatchEvent(new Event('transitionend'));
        expect(calls).toEqual(['done']);
      });

      it('Then done() is called exactly once even when both transitionend and timeout fire', async () => {
        const hooks = captureAnimationHooks({ duration: 50 });
        const el = document.createElement('li');
        let callCount = 0;

        hooks?.onItemExit(el, 'key-1', () => {
          callCount++;
        });

        // Simulate transitionend fires first
        el.dispatchEvent(new Event('transitionend'));
        expect(callCount).toBe(1);

        // Wait for the safety timeout to fire (duration + 50 = 100ms)
        await new Promise((resolve) => setTimeout(resolve, 150));

        // done() must NOT have been called a second time
        expect(callCount).toBe(1);
      });

      it('Then done() is called exactly once via timeout when transitionend never fires', async () => {
        const hooks = captureAnimationHooks({ duration: 50 });
        const el = document.createElement('li');
        let callCount = 0;

        hooks?.onItemExit(el, 'key-1', () => {
          callCount++;
        });

        // Don't dispatch transitionend — let the safety timeout handle it
        expect(callCount).toBe(0);

        // Wait for safety timeout (duration 50 + 50 = 100ms)
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(callCount).toBe(1);
      });
    });
  });

  describe('Given animate={{ duration: 300, easing: "ease-in-out" }}', () => {
    it('Then hooks are created from custom config', () => {
      const hooks = captureAnimationHooks({ duration: 300, easing: 'ease-in-out' });
      expect(hooks).toBeDefined();
      expect(typeof hooks?.onBeforeReconcile).toBe('function');
      expect(typeof hooks?.onAfterReconcile).toBe('function');
      expect(typeof hooks?.onItemEnter).toBe('function');
      expect(typeof hooks?.onItemExit).toBe('function');
    });

    it('Then FLIP applies transform for moved elements', () => {
      const hooks = captureAnimationHooks({ duration: 300, easing: 'ease-in-out' });
      const el = document.createElement('li');

      // Register the element
      hooks?.onItemEnter(el, 'key-1');

      // Snapshot rects (all zeros in happy-dom)
      hooks?.onBeforeReconcile();

      // Mock getBoundingClientRect to simulate element moved to y=100
      el.getBoundingClientRect = () =>
        ({
          top: 100,
          left: 0,
          bottom: 140,
          right: 200,
          width: 200,
          height: 40,
          x: 0,
          y: 100,
          toJSON: () => {},
        }) as DOMRect;

      // FLIP should detect movement and apply transform
      hooks?.onAfterReconcile();

      const style = el.getAttribute('style');
      expect(style).toContain('translate(0px, -100px)');
      expect(style).toContain('transition: none');
    });
  });

  describe('Given prefers-reduced-motion', () => {
    const savedMatchMedia = globalThis.matchMedia;

    afterEach(() => {
      globalThis.matchMedia = savedMatchMedia;
    });

    it('Then FLIP animations are skipped', () => {
      const hooks = captureAnimationHooks(true);
      const el = document.createElement('li');

      // Register element
      hooks?.onItemEnter(el, 'key-1');
      hooks?.onBeforeReconcile();

      // Mock matchMedia to report reduced motion
      globalThis.matchMedia = ((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      })) as typeof globalThis.matchMedia;

      // Mock moved position
      el.getBoundingClientRect = () =>
        ({
          top: 100,
          left: 0,
          bottom: 140,
          right: 200,
          width: 200,
          height: 40,
          x: 0,
          y: 100,
          toJSON: () => {},
        }) as DOMRect;

      // After reconcile — should NOT apply any transform
      hooks?.onAfterReconcile();

      const style = el.getAttribute('style');
      expect(style).toBeNull();
    });
  });

  describe('When items are reordered', () => {
    it('Then non-moved items are unaffected (no style set)', () => {
      const hooks = captureAnimationHooks(true);
      const el = document.createElement('li');

      // Register element
      hooks?.onItemEnter(el, 'key-1');

      // Snapshot rects (all zeros)
      hooks?.onBeforeReconcile();

      // getBoundingClientRect still returns zeros → delta < 0.5 → no transform
      hooks?.onAfterReconcile();

      const style = el.getAttribute('style');
      expect(style).toBeNull();
    });

    it('Then moved items get FLIP transform', () => {
      const hooks = captureAnimationHooks(true);
      const el = document.createElement('li');

      // Register element
      hooks?.onItemEnter(el, 'key-1');

      // Snapshot rects (all zeros in happy-dom)
      hooks?.onBeforeReconcile();

      // Mock moved position (simulating reorder)
      el.getBoundingClientRect = () =>
        ({
          top: 50,
          left: 20,
          bottom: 90,
          right: 220,
          width: 200,
          height: 40,
          x: 20,
          y: 50,
          toJSON: () => {},
        }) as DOMRect;

      hooks?.onAfterReconcile();

      // Delta: first(0,0) - last(20,50) = (-20, -50)
      const style = el.getAttribute('style');
      expect(style).toContain('translate(-20px, -50px)');
    });
  });

  describe('Given animate={false} (default)', () => {
    it('Then no animation hooks are provided', () => {
      RenderNonAnimatedList();
      const captured = (globalThis as Record<string, unknown>).__testCapturedHooks;
      expect(captured).toBeUndefined();
      delete (globalThis as Record<string, unknown>).__testCapturedHooks;
    });
  });
});
