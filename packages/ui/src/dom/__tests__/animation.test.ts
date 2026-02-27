import { beforeEach, describe, expect, it, mock } from 'bun:test';

describe('onAnimationsComplete', () => {
  let onAnimationsComplete: typeof import('../animation').onAnimationsComplete;
  let el: HTMLElement;

  beforeEach(async () => {
    // Re-import to reset module state
    const mod = await import('../animation');
    onAnimationsComplete = mod.onAnimationsComplete;
    el = document.createElement('div');
  });

  it('calls callback immediately when no animations are running', () => {
    const cb = mock(() => {});
    onAnimationsComplete(el, cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('calls callback immediately when getAnimations returns empty', () => {
    el.getAnimations = () => [];
    const cb = mock(() => {});
    onAnimationsComplete(el, cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('waits for animations to finish before calling callback', async () => {
    let resolveAnim!: () => void;
    const animFinished = new Promise<void>((resolve) => {
      resolveAnim = resolve;
    });

    el.getAnimations = () => [{ finished: animFinished } as unknown as Animation];

    const cb = mock(() => {});
    onAnimationsComplete(el, cb);

    // Callback should not have been called yet
    expect(cb).toHaveBeenCalledTimes(0);

    // Resolve the animation
    resolveAnim();
    await animFinished;
    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 0));

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('skips wait when prefers-reduced-motion: reduce', () => {
    // Mock matchMedia to report reduced motion
    const original = globalThis.matchMedia;
    globalThis.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
    })) as typeof globalThis.matchMedia;

    let resolveAnim!: () => void;
    const animFinished = new Promise<void>((resolve) => {
      resolveAnim = resolve;
    });
    el.getAnimations = () => [{ finished: animFinished } as unknown as Animation];

    const cb = mock(() => {});
    onAnimationsComplete(el, cb);

    // Should call immediately despite running animations
    expect(cb).toHaveBeenCalledTimes(1);

    // Cleanup
    resolveAnim();
    globalThis.matchMedia = original;
  });

  it('handles cancelled animations gracefully', async () => {
    const cancelledAnim = Promise.reject(new DOMException('Cancelled', 'AbortError'));

    el.getAnimations = () => [{ finished: cancelledAnim } as unknown as Animation];

    const cb = mock(() => {});
    onAnimationsComplete(el, cb);

    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 0));

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('forces reflow before snapshotting animations', () => {
    // Track that offsetHeight is accessed before getAnimations
    const accessOrder: string[] = [];

    Object.defineProperty(el, 'offsetHeight', {
      get() {
        accessOrder.push('offsetHeight');
        return 0;
      },
    });

    const originalGetAnimations = el.getAnimations;
    el.getAnimations = () => {
      accessOrder.push('getAnimations');
      return originalGetAnimations ? originalGetAnimations.call(el) : [];
    };

    const cb = mock(() => {});
    onAnimationsComplete(el, cb);

    // offsetHeight should be accessed BEFORE getAnimations
    expect(accessOrder).toEqual(['offsetHeight', 'getAnimations']);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
