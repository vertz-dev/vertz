import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { onAnimationsComplete } from '../animation';

describe('onAnimationsComplete', () => {
  let el: HTMLElement;

  beforeEach(() => {
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

  it('handles cancelled animations gracefully', async () => {
    const cancelledAnim = Promise.reject(new DOMException('Cancelled', 'AbortError'));

    el.getAnimations = () => [{ finished: cancelledAnim } as unknown as Animation];

    const cb = mock(() => {});
    onAnimationsComplete(el, cb);

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
});
