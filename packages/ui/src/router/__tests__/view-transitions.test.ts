import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { _resetTransitionGen, withViewTransition } from '../view-transitions';

function createMockTransition() {
  let resolveFinished: (() => void) | undefined;
  let rejectFinished: ((err: Error) => void) | undefined;
  const finished = new Promise<void>((res, rej) => {
    resolveFinished = res;
    rejectFinished = rej;
  });

  const transition = {
    finished,
    ready: Promise.resolve(),
    updateCallbackDone: Promise.resolve(),
  };

  return {
    transition,
    resolve: () => resolveFinished?.(),
    reject: (err: Error) => rejectFinished?.(err),
  };
}

describe('withViewTransition', () => {
  let originalStartVT: unknown;
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalStartVT = (document as Record<string, unknown>).startViewTransition;
    originalMatchMedia = window.matchMedia;
    _resetTransitionGen();
    // Default: no reduced motion
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  });

  afterEach(() => {
    if (originalStartVT !== undefined) {
      (document as Record<string, unknown>).startViewTransition = originalStartVT;
    } else {
      delete (document as Record<string, unknown>).startViewTransition;
    }
    window.matchMedia = originalMatchMedia;
    document.documentElement.classList.remove('slide', 'fade');
    vi.restoreAllMocks();
  });

  describe('Given config is undefined', () => {
    describe('When called with an update function', () => {
      it('Then runs the update directly without startViewTransition', async () => {
        const update = vi.fn();
        const startVT = vi.fn();
        (document as Record<string, unknown>).startViewTransition = startVT;

        await withViewTransition(update, undefined);

        expect(update).toHaveBeenCalledTimes(1);
        expect(startVT).not.toHaveBeenCalled();
      });
    });
  });

  describe('Given config is false', () => {
    describe('When called with an update function', () => {
      it('Then runs the update directly', async () => {
        const update = vi.fn();
        const startVT = vi.fn();
        (document as Record<string, unknown>).startViewTransition = startVT;

        await withViewTransition(update, false);

        expect(update).toHaveBeenCalledTimes(1);
        expect(startVT).not.toHaveBeenCalled();
      });
    });
  });

  describe('Given config is true and startViewTransition is supported', () => {
    describe('When called with a sync update function', () => {
      it('Then calls document.startViewTransition with the update', async () => {
        const update = vi.fn();
        const startVT = vi.fn((cb: () => void) => {
          cb();
          return { finished: Promise.resolve(), ready: Promise.resolve() };
        });
        (document as Record<string, unknown>).startViewTransition = startVT;

        await withViewTransition(update, true);

        expect(startVT).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledTimes(1);
      });

      it('Then awaits transition.finished', async () => {
        const order: string[] = [];
        const { transition, resolve } = createMockTransition();

        const startVT = vi.fn((cb: () => void) => {
          cb();
          return transition;
        });
        (document as Record<string, unknown>).startViewTransition = startVT;

        const promise = withViewTransition(() => {
          order.push('update');
        }, true);

        order.push('before-resolve');
        resolve();
        await promise;
        order.push('after-resolve');

        expect(order).toEqual(['update', 'before-resolve', 'after-resolve']);
      });
    });
  });

  describe('Given config is true and startViewTransition is NOT supported', () => {
    describe('When called with an update function', () => {
      it('Then runs the update directly (graceful degradation)', async () => {
        const update = vi.fn();
        delete (document as Record<string, unknown>).startViewTransition;

        await withViewTransition(update, true);

        expect(update).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Given prefers-reduced-motion is enabled', () => {
    describe('When config is true', () => {
      it('Then runs the update directly without transition', async () => {
        const update = vi.fn();
        const startVT = vi.fn();
        (document as Record<string, unknown>).startViewTransition = startVT;

        vi.spyOn(window, 'matchMedia').mockReturnValue({
          matches: true,
        } as MediaQueryList);

        await withViewTransition(update, true);

        expect(update).toHaveBeenCalledTimes(1);
        expect(startVT).not.toHaveBeenCalled();
      });
    });
  });

  describe('Given config is { className: "slide" }', () => {
    describe('When called with an update', () => {
      it('Then adds "slide" class to documentElement before transition', async () => {
        let classListDuringUpdate: string[] = [];
        const startVT = vi.fn((cb: () => void) => {
          cb();
          return { finished: Promise.resolve(), ready: Promise.resolve() };
        });
        (document as Record<string, unknown>).startViewTransition = startVT;

        await withViewTransition(
          () => {
            classListDuringUpdate = [...document.documentElement.classList];
          },
          { className: 'slide' },
        );

        expect(classListDuringUpdate).toContain('slide');
      });

      it('Then removes "slide" class after transition.finished', async () => {
        const { transition, resolve } = createMockTransition();
        const startVT = vi.fn((cb: () => void) => {
          cb();
          return transition;
        });
        (document as Record<string, unknown>).startViewTransition = startVT;

        const promise = withViewTransition(() => {}, { className: 'slide' });

        // Class should be present before finished resolves
        expect(document.documentElement.classList.contains('slide')).toBe(true);

        resolve();
        await promise;

        // Class should be removed after finished resolves
        expect(document.documentElement.classList.contains('slide')).toBe(false);
      });
    });

    describe('When transition.finished rejects with AbortError (transition abandoned)', () => {
      it('Then silently swallows the AbortError and cleans up the class', async () => {
        const { transition, reject } = createMockTransition();
        const startVT = vi.fn((cb: () => void) => {
          cb();
          return transition;
        });
        (document as Record<string, unknown>).startViewTransition = startVT;

        const promise = withViewTransition(() => {}, { className: 'slide' });

        expect(document.documentElement.classList.contains('slide')).toBe(true);

        reject(new DOMException('Transition was aborted', 'AbortError'));

        // AbortError is expected during concurrent transitions — should resolve, not reject
        await promise;

        expect(document.documentElement.classList.contains('slide')).toBe(false);
      });
    });

    describe('When transition.finished rejects with a non-AbortError', () => {
      it('Then propagates the error', async () => {
        const { transition, reject } = createMockTransition();
        const startVT = vi.fn((cb: () => void) => {
          cb();
          return transition;
        });
        (document as Record<string, unknown>).startViewTransition = startVT;

        const promise = withViewTransition(() => {}, { className: 'slide' });

        reject(new Error('unexpected failure'));

        await expect(promise).rejects.toThrow('unexpected failure');

        expect(document.documentElement.classList.contains('slide')).toBe(false);
      });
    });
  });

  describe('Given config is true and the update function throws', () => {
    describe('When startViewTransition is supported', () => {
      it('Then propagates the error via transition.finished', async () => {
        // In a real browser, if the update callback rejects,
        // startViewTransition surfaces the error through finished.
        const updateError = new Error('update failed');
        const finishedPromise = Promise.reject(updateError);
        // Attach a no-op catch to suppress unhandled rejection warnings
        // on the promises we won't directly await in this test.
        const updateCallbackDone = Promise.reject(updateError);
        updateCallbackDone.catch(() => {});

        const startVT = vi.fn((cb: () => Promise<void>) => {
          const cbResult = cb();
          cbResult.catch(() => {}); // suppress unhandled rejection
          return {
            finished: finishedPromise,
            ready: Promise.resolve(),
            updateCallbackDone,
          };
        });
        (document as Record<string, unknown>).startViewTransition = startVT;

        await expect(
          withViewTransition(() => {
            throw updateError;
          }, true),
        ).rejects.toThrow('update failed');
      });
    });
  });

  describe('Given two rapid calls with { className: "slide" }', () => {
    describe('When the first transition is still in progress', () => {
      it('Then the first transition cleanup does not remove the second class', async () => {
        const mock1 = createMockTransition();
        const mock2 = createMockTransition();
        let callCount = 0;

        const startVT = vi.fn((cb: () => void) => {
          cb();
          callCount++;
          return callCount === 1 ? mock1.transition : mock2.transition;
        });
        (document as Record<string, unknown>).startViewTransition = startVT;

        // Start first transition
        const promise1 = withViewTransition(() => {}, { className: 'slide' });

        // Start second transition (while first is still in progress)
        const promise2 = withViewTransition(() => {}, { className: 'slide' });

        // First transition is abandoned (rejects with AbortError)
        mock1.reject(new DOMException('Aborted', 'AbortError'));

        // First transition's cleanup should NOT remove the class
        // because the generation counter has advanced.
        // AbortError is silently swallowed.
        await promise1;

        // Class should still be present (owned by second transition)
        expect(document.documentElement.classList.contains('slide')).toBe(true);

        // Second transition completes
        mock2.resolve();
        await promise2;

        // Now the class should be removed
        expect(document.documentElement.classList.contains('slide')).toBe(false);
      });
    });
  });
});
