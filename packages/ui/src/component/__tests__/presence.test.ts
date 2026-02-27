import { describe, expect, it } from 'bun:test';
import { onCleanup } from '../../runtime/disposal';
import { domEffect, signal } from '../../runtime/signal';
import { Presence } from '../presence';

describe('Presence', () => {
  it('renders nothing when `when` is false', () => {
    const container = document.createElement('div');
    const result = Presence({
      when: false,
      children: () => {
        const span = document.createElement('span');
        span.textContent = 'hello';
        return span;
      },
    });
    container.appendChild(result);
    // Should only have the comment anchor, no child content
    expect(container.textContent).toBe('');
  });

  it('renders children when `when` is true', () => {
    const container = document.createElement('div');
    const result = Presence({
      when: true,
      children: () => {
        const span = document.createElement('span');
        span.textContent = 'hello';
        return span;
      },
    });
    container.appendChild(result);
    expect(container.textContent).toBe('hello');
  });

  it('mounts child on false→true transition', () => {
    const show = signal(false);
    const container = document.createElement('div');
    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        const span = document.createElement('span');
        span.textContent = 'mounted';
        return span;
      },
    });
    container.appendChild(result);
    expect(container.textContent).toBe('');

    show.value = true;
    expect(container.textContent).toBe('mounted');
  });

  it('removes child on true→false transition', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        const span = document.createElement('span');
        span.textContent = 'visible';
        return span;
      },
    });
    container.appendChild(result);
    expect(container.textContent).toBe('visible');

    show.value = false;
    expect(container.textContent).toBe('');
  });

  it('runs cleanups on exit', () => {
    const show = signal(true);
    let cleanedUp = false;
    const container = document.createElement('div');
    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        onCleanup(() => {
          cleanedUp = true;
        });
        const span = document.createElement('span');
        span.textContent = 'child';
        return span;
      },
    });
    container.appendChild(result);
    expect(cleanedUp).toBe(false);

    show.value = false;
    expect(cleanedUp).toBe(true);
  });

  it('disposes effects inside children on exit', () => {
    const show = signal(true);
    const counter = signal(0);
    let effectRunCount = 0;
    const container = document.createElement('div');
    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        const span = document.createElement('span');
        span.textContent = 'child';
        domEffect(() => {
          counter.value;
          effectRunCount++;
        });
        return span;
      },
    });
    container.appendChild(result);
    expect(effectRunCount).toBe(1);

    // Hide the child
    show.value = false;

    // The effect should be disposed — updating counter should NOT re-run it
    effectRunCount = 0;
    counter.value = 1;
    expect(effectRunCount).toBe(0);
  });

  it('throws on non-HTMLElement child', () => {
    expect(() => {
      Presence({
        when: true,
        children: () => document.createTextNode('text') as unknown as HTMLElement,
      });
    }).toThrow('Presence requires a single HTMLElement child');
  });

  it('dispose() cleans up everything on parent disposal', () => {
    const show = signal(true);
    const counter = signal(0);
    let effectRunCount = 0;
    let cleanedUp = false;
    const container = document.createElement('div');
    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        onCleanup(() => {
          cleanedUp = true;
        });
        domEffect(() => {
          counter.value;
          effectRunCount++;
        });
        const span = document.createElement('span');
        span.textContent = 'child';
        return span;
      },
    });
    container.appendChild(result);
    expect(effectRunCount).toBe(1);
    expect(cleanedUp).toBe(false);
    expect(container.textContent).toBe('child');

    // Dispose the Presence
    (result as unknown as { dispose: () => void }).dispose();

    expect(cleanedUp).toBe(true);

    // Effect should be disposed
    effectRunCount = 0;
    counter.value = 1;
    expect(effectRunCount).toBe(0);
  });

  it('sets data-presence="enter" on mount', () => {
    const container = document.createElement('div');
    let childEl!: HTMLSpanElement;
    const result = Presence({
      when: true,
      children: () => {
        const span = document.createElement('span');
        span.textContent = 'child';
        // Mock getAnimations to return a pending animation so
        // data-presence persists (not cleared immediately)
        span.getAnimations = () => [
          {
            finished: new Promise<void>(() => {}),
          } as unknown as Animation,
        ];
        childEl = span;
        return span;
      },
    });
    container.appendChild(result);
    expect(childEl.getAttribute('data-presence')).toBe('enter');
  });

  it('removes data-presence after enter animation completes', async () => {
    let resolveAnim!: () => void;
    const container = document.createElement('div');
    const result = Presence({
      when: true,
      children: () => {
        const span = document.createElement('span');
        span.textContent = 'child';
        const animFinished = new Promise<void>((r) => {
          resolveAnim = r;
        });
        span.getAnimations = () => [{ finished: animFinished } as unknown as Animation];
        return span;
      },
    });
    container.appendChild(result);
    const child = container.querySelector('span')!;
    expect(child.getAttribute('data-presence')).toBe('enter');

    // Resolve the animation
    resolveAnim();
    await new Promise((r) => setTimeout(r, 0));

    expect(child.getAttribute('data-presence')).toBeNull();
  });

  it('sets data-presence="exit" on unmount', () => {
    const show = signal(true);
    let resolveExitAnim!: () => void;
    const container = document.createElement('div');
    let childEl!: HTMLSpanElement;
    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        const span = document.createElement('span');
        span.textContent = 'child';
        childEl = span;
        return span;
      },
    });
    container.appendChild(result);
    expect(container.textContent).toBe('child');

    // Mock getAnimations on the child BEFORE triggering exit
    // so the exit animation is deferred
    const exitAnimFinished = new Promise<void>((r) => {
      resolveExitAnim = r;
    });
    childEl.getAnimations = () => [{ finished: exitAnimFinished } as unknown as Animation];

    show.value = false;
    expect(childEl.getAttribute('data-presence')).toBe('exit');

    // Cleanup
    resolveExitAnim();
  });

  it('defers removal until exit animation completes', async () => {
    const show = signal(true);
    let resolveExitAnim!: () => void;
    const container = document.createElement('div');
    let childEl!: HTMLSpanElement;
    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        const span = document.createElement('span');
        span.textContent = 'child';
        childEl = span;
        return span;
      },
    });
    container.appendChild(result);

    // Mock getAnimations before triggering exit
    const exitAnimFinished = new Promise<void>((r) => {
      resolveExitAnim = r;
    });
    childEl.getAnimations = () => [{ finished: exitAnimFinished } as unknown as Animation];

    show.value = false;

    // Element should still be in the DOM during animation
    expect(container.contains(childEl)).toBe(true);
    expect(childEl.getAttribute('data-presence')).toBe('exit');

    // Resolve the exit animation
    resolveExitAnim();
    await exitAnimFinished;
    await new Promise((r) => setTimeout(r, 0));

    // NOW the element should be removed
    expect(container.contains(childEl)).toBe(false);
  });

  it('runs cleanups immediately on exit, before animation completes', () => {
    const show = signal(true);
    let cleanedUp = false;
    let resolveExitAnim!: () => void;
    const container = document.createElement('div');
    let childEl!: HTMLSpanElement;
    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        onCleanup(() => {
          cleanedUp = true;
        });
        const span = document.createElement('span');
        span.textContent = 'child';
        childEl = span;
        return span;
      },
    });
    container.appendChild(result);

    // Mock animations before exit
    const exitAnimFinished = new Promise<void>((r) => {
      resolveExitAnim = r;
    });
    childEl.getAnimations = () => [{ finished: exitAnimFinished } as unknown as Animation];

    show.value = false;

    // Cleanup should fire immediately even though animation is pending
    expect(cleanedUp).toBe(true);
    // Element still in DOM during animation
    expect(container.contains(childEl)).toBe(true);

    // Cleanup
    resolveExitAnim();
  });

  it('rapid true→false→true cancels pending exit removal', async () => {
    const show = signal(true);
    let resolveExitAnim!: () => void;
    const container = document.createElement('div');
    let childCount = 0;
    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        childCount++;
        const span = document.createElement('span');
        span.textContent = `child-${childCount}`;
        return span;
      },
    });
    container.appendChild(result);
    expect(container.textContent).toBe('child-1');

    // Get reference to first child and mock exit animation
    const firstChild = container.querySelector('span')!;
    const exitAnimFinished = new Promise<void>((r) => {
      resolveExitAnim = r;
    });
    firstChild.getAnimations = () => [{ finished: exitAnimFinished } as unknown as Animation];

    // Toggle false → exit animation starts
    show.value = false;
    expect(firstChild.getAttribute('data-presence')).toBe('exit');
    expect(container.contains(firstChild)).toBe(true);

    // Toggle true immediately → should cancel exit and mount new child
    show.value = true;
    const secondChild = container.querySelector('span:last-of-type');
    expect(secondChild?.textContent).toBe('child-2');

    // Now resolve the old exit animation — should NOT remove the new child
    resolveExitAnim();
    await exitAnimFinished;
    await new Promise((r) => setTimeout(r, 0));

    // Second child should still be in the DOM
    expect(container.contains(secondChild)).toBe(true);
  });

  it('rapid toggle re-creates element in fresh scope', () => {
    const show = signal(true);
    const counter = signal(0);
    let effect1Runs = 0;
    let effect2Runs = 0;
    let resolveExitAnim!: () => void;
    const container = document.createElement('div');
    let isFirstChild = true;
    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        const span = document.createElement('span');
        if (isFirstChild) {
          domEffect(() => {
            counter.value;
            effect1Runs++;
          });
          isFirstChild = false;
        } else {
          domEffect(() => {
            counter.value;
            effect2Runs++;
          });
        }
        return span;
      },
    });
    container.appendChild(result);
    expect(effect1Runs).toBe(1);

    // Get reference to first child and mock exit animation
    const firstChild = container.querySelector('span')!;
    const exitAnimFinished = new Promise<void>((r) => {
      resolveExitAnim = r;
    });
    firstChild.getAnimations = () => [{ finished: exitAnimFinished } as unknown as Animation];

    // Exit
    show.value = false;
    // First effect should be disposed
    effect1Runs = 0;
    counter.value = 1;
    expect(effect1Runs).toBe(0);

    // Re-enter — new scope, new effect
    show.value = true;
    expect(effect2Runs).toBe(1);

    // Second effect should track counter
    effect2Runs = 0;
    counter.value = 2;
    expect(effect2Runs).toBe(1);

    // Cleanup
    resolveExitAnim();
  });

  // ─── Integration Tests ──────────────────────────────────────────────

  it('data-presence attribute is available for CSS hooks', () => {
    const container = document.createElement('div');
    let childEl!: HTMLDivElement;
    const result = Presence({
      when: true,
      children: () => {
        const div = document.createElement('div');
        div.className = 'panel';
        div.textContent = 'styled';
        div.getAnimations = () => [
          { finished: new Promise<void>(() => {}) } as unknown as Animation,
        ];
        childEl = div;
        return div;
      },
    });
    container.appendChild(result);

    // CSS can target [data-presence="enter"] for animations
    expect(childEl.getAttribute('data-presence')).toBe('enter');
    expect(childEl.className).toBe('panel');
  });

  it('respects prefers-reduced-motion — immediate removal', () => {
    const originalMatchMedia = globalThis.matchMedia;
    globalThis.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
    })) as typeof globalThis.matchMedia;

    const show = signal(true);
    const container = document.createElement('div');
    let childEl!: HTMLSpanElement;
    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        const span = document.createElement('span');
        span.textContent = 'child';
        // Even with animations, reduced-motion should skip them
        span.getAnimations = () => [
          { finished: new Promise<void>(() => {}) } as unknown as Animation,
        ];
        childEl = span;
        return span;
      },
    });
    container.appendChild(result);
    // With reduced motion, data-presence="enter" is cleared immediately
    expect(childEl.getAttribute('data-presence')).toBeNull();

    show.value = false;
    // With reduced motion, element should be removed immediately
    expect(container.contains(childEl)).toBe(false);

    globalThis.matchMedia = originalMatchMedia;
  });

  it('parent disposal cleans up Presence including pending exit animations', async () => {
    const show = signal(true);
    let resolveExitAnim!: () => void;
    let cleanedUp = false;
    const container = document.createElement('div');
    let childEl!: HTMLSpanElement;

    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        onCleanup(() => {
          cleanedUp = true;
        });
        const span = document.createElement('span');
        span.textContent = 'child';
        childEl = span;
        return span;
      },
    });
    container.appendChild(result);

    // Mock exit animation
    const exitAnimFinished = new Promise<void>((r) => {
      resolveExitAnim = r;
    });
    childEl.getAnimations = () => [{ finished: exitAnimFinished } as unknown as Animation];

    // Start exit animation
    show.value = false;
    expect(container.contains(childEl)).toBe(true);
    expect(cleanedUp).toBe(true);

    // Dispose the Presence entirely (parent disposal)
    (result as unknown as { dispose: () => void }).dispose();

    // Resolve exit animation after disposal
    resolveExitAnim();
    await exitAnimFinished;
    await new Promise((r) => setTimeout(r, 0));

    // The stale exit callback should NOT crash or do unexpected things
    // (generation counter prevents removal of already-disposed elements)
  });

  it('nested __conditional inside Presence children is disposed on exit', () => {
    const { __conditional } = require('../../dom/conditional');

    const show = signal(true);
    const innerShow = signal(true);
    const counter = signal(0);
    let innerEffectRuns = 0;
    const container = document.createElement('div');

    const result = Presence({
      get when() {
        return show.value;
      },
      children: () => {
        const div = document.createElement('div');
        const conditional = __conditional(
          () => innerShow.value,
          () => {
            const span = document.createElement('span');
            span.textContent = 'inner-yes';
            domEffect(() => {
              counter.value;
              innerEffectRuns++;
            });
            return span;
          },
          () => {
            const span = document.createElement('span');
            span.textContent = 'inner-no';
            return span;
          },
        );
        div.appendChild(conditional);
        return div;
      },
    });
    container.appendChild(result);
    expect(innerEffectRuns).toBe(1);

    // Hiding Presence should dispose the nested conditional and its effects
    show.value = false;

    innerEffectRuns = 0;
    counter.value = 1;
    expect(innerEffectRuns).toBe(0);
  });
});
