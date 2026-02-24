import { afterEach, describe, expect, test, vi } from 'bun:test';
import { ErrorBoundary } from '../error-boundary';
import { Suspense } from '../suspense';

describe('Suspense', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders children synchronously when no async', () => {
    const child = document.createElement('div');
    child.textContent = 'loaded';
    const result = Suspense({
      children: () => child,
      fallback: () => {
        const el = document.createElement('span');
        el.textContent = 'loading...';
        return el;
      },
    });
    expect(result.textContent).toBe('loaded');
  });

  test('renders fallback when children throw a Promise', () => {
    const result = Suspense({
      children: () => {
        throw Promise.resolve('data');
      },
      fallback: () => {
        const el = document.createElement('span');
        el.textContent = 'loading...';
        return el;
      },
    });
    expect(result.textContent).toBe('loading...');
  });

  test('replaces fallback with children after promise resolves', async () => {
    const container = document.createElement('div');
    let resolvePromise: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });

    let attempt = 0;
    const result = Suspense({
      children: () => {
        attempt++;
        if (attempt === 1) {
          throw pending;
        }
        const el = document.createElement('p');
        el.textContent = 'done';
        return el;
      },
      fallback: () => {
        const el = document.createElement('span');
        el.textContent = 'loading...';
        return el;
      },
    });

    container.appendChild(result);
    expect(container.textContent).toBe('loading...');

    // Resolve the promise
    resolvePromise?.('data');
    await pending;
    // Wait for microtask to flush
    await new Promise((r) => setTimeout(r, 0));

    expect(container.textContent).toBe('done');
  });

  test('re-throws non-Promise errors (use ErrorBoundary for those)', () => {
    expect(() =>
      Suspense({
        children: () => {
          throw new TypeError('real error');
        },
        fallback: () => document.createElement('span'),
      }),
    ).toThrow('real error');
  });

  test('Suspense with rejecting async child triggers ErrorBoundary fallback', async () => {
    const container = document.createElement('div');
    const error = new Error('async failure');
    const rejecting = Promise.reject(error);

    const result = ErrorBoundary({
      children: () =>
        Suspense({
          children: () => {
            throw rejecting;
          },
          fallback: () => {
            const el = document.createElement('span');
            el.textContent = 'loading...';
            return el;
          },
        }),
      fallback: (err) => {
        const el = document.createElement('div');
        el.textContent = `error: ${err.message}`;
        return el;
      },
    });

    container.appendChild(result);
    // Initially shows the suspense fallback
    expect(container.textContent).toBe('loading...');

    // Wait for the rejection to propagate
    await new Promise((r) => setTimeout(r, 0));

    // ErrorBoundary fallback should replace the suspense fallback
    expect(container.textContent).toBe('error: async failure');
  });

  test('Suspense with rejecting async child and NO ErrorBoundary surfaces error via queueMicrotask', async () => {
    const error = new Error('unhandled async failure');
    const rejecting = Promise.reject(error);

    // Intercept queueMicrotask to capture the re-thrown error
    const thrownErrors: Error[] = [];
    const originalQueueMicrotask = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (callback: () => void) => {
      try {
        callback();
      } catch (e) {
        thrownErrors.push(e as Error);
      }
    };

    try {
      Suspense({
        children: () => {
          throw rejecting;
        },
        fallback: () => document.createElement('span'),
      });

      // Wait for the rejection to propagate
      await new Promise((r) => setTimeout(r, 10));

      expect(thrownErrors.length).toBe(1);
      expect(thrownErrors[0]).toBe(error);
    } finally {
      globalThis.queueMicrotask = originalQueueMicrotask;
    }
  });

  test('Suspense retry error triggers ErrorBoundary fallback', async () => {
    const container = document.createElement('div');
    let resolvePromise: () => void;
    const pending = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const retryError = new TypeError('component crashed');

    let attempt = 0;
    const result = ErrorBoundary({
      children: () =>
        Suspense({
          children: () => {
            attempt++;
            if (attempt === 1) {
              throw pending;
            }
            // On retry after promise resolves, throw a regular error
            throw retryError;
          },
          fallback: () => {
            const el = document.createElement('span');
            el.textContent = 'loading...';
            return el;
          },
        }),
      fallback: (err) => {
        const el = document.createElement('div');
        el.textContent = `error: ${err.message}`;
        return el;
      },
    });

    container.appendChild(result);
    expect(container.textContent).toBe('loading...');

    resolvePromise?.();
    await pending;
    await new Promise((r) => setTimeout(r, 0));

    // ErrorBoundary fallback should replace the suspense fallback
    expect(container.textContent).toBe('error: component crashed');
  });

  test('Suspense retry error with NO ErrorBoundary surfaces error via queueMicrotask', async () => {
    let resolvePromise: () => void;
    const pending = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const retryError = new TypeError('component crashed');

    // Intercept queueMicrotask to capture the re-thrown error
    const thrownErrors: Error[] = [];
    const originalQueueMicrotask = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (callback: () => void) => {
      try {
        callback();
      } catch (e) {
        thrownErrors.push(e as Error);
      }
    };

    try {
      let attempt = 0;
      Suspense({
        children: () => {
          attempt++;
          if (attempt === 1) {
            throw pending;
          }
          throw retryError;
        },
        fallback: () => document.createElement('span'),
      });

      resolvePromise?.();
      await pending;
      await new Promise((r) => setTimeout(r, 10));

      expect(thrownErrors.length).toBe(1);
      expect(thrownErrors[0]).toBe(retryError);
    } finally {
      globalThis.queueMicrotask = originalQueueMicrotask;
    }
  });
});
