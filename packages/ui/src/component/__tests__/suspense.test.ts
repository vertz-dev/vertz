import { describe, expect, test, vi } from 'vitest';
import { Suspense } from '../suspense';

describe('Suspense', () => {
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

  test('reports error via console.error when the thrown promise rejects', async () => {
    const error = new Error('async failure');
    const rejecting = Promise.reject(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    Suspense({
      children: () => {
        throw rejecting;
      },
      fallback: () => document.createElement('span'),
    });

    // Wait for the rejection to propagate
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleSpy).toHaveBeenCalledWith('[Suspense] Async child rejected:', error);

    consoleSpy.mockRestore();
  });

  test('reports error via console.error when retry throws a non-Promise error', async () => {
    let resolvePromise: () => void;
    const pending = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const retryError = new TypeError('component crashed');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let attempt = 0;
    Suspense({
      children: () => {
        attempt++;
        if (attempt === 1) {
          throw pending;
        }
        // On retry after promise resolves, throw a regular error
        throw retryError;
      },
      fallback: () => document.createElement('span'),
    });

    resolvePromise?.();
    await pending;
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleSpy).toHaveBeenCalledWith('[Suspense] Async child error on retry:', retryError);

    consoleSpy.mockRestore();
  });
});
