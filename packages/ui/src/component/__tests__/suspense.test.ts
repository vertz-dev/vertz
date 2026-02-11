import { describe, expect, test } from 'vitest';
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

  test('renders fallback when children throw an error (not a Promise)', () => {
    // Non-promise errors should be caught and fallback shown
    const result = Suspense({
      children: () => {
        throw new TypeError('real error');
      },
      fallback: () => {
        const el = document.createElement('span');
        el.textContent = 'error fallback';
        return el;
      },
    });
    expect(result.textContent).toBe('error fallback');
  });
});
