import { describe, expect, test } from 'vitest';
import { createContext, useContext } from '../component/context';
import { ErrorBoundary } from '../component/error-boundary';
import { onMount } from '../component/lifecycle';
import { ref } from '../component/refs';
import { onCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { domEffect, signal } from '../runtime/signal';

describe('Integration Tests — Component Model', () => {
  // IT-1C-1: onMount runs once, onCleanup runs on unmount
  test('onMount fires once, onCleanup fires on dispose', () => {
    let mounted = false;
    let cleaned = false;

    const scope = pushScope();
    onMount(() => {
      mounted = true;
      onCleanup(() => {
        cleaned = true;
      });
    });
    popScope();

    // onMount callback ran immediately
    expect(mounted).toBe(true);
    // Cleanup not yet called
    expect(cleaned).toBe(false);

    // Simulate unmount by running disposal
    runCleanups(scope);
    expect(cleaned).toBe(true);
  });

  // IT-1C-2: effect re-runs callback when dependency changes
  test('effect re-runs on dependency change', () => {
    const values: number[] = [];
    const count = signal(0);

    pushScope();
    domEffect(() => {
      values.push(count.value);
    });
    popScope();

    // Initial run captures value 0
    expect(values).toEqual([0]);

    // Dependency change triggers re-run
    count.value = 1;
    expect(values).toEqual([0, 1]);
  });

  // IT-1C-3: Context flows through component tree
  test('context value flows from Provider to consumer', () => {
    const ThemeCtx = createContext<string>('light');

    // Without Provider, default is returned
    expect(useContext(ThemeCtx)).toBe('light');

    // Provider sets the value for the scope
    ThemeCtx.Provider('dark', () => {
      expect(useContext(ThemeCtx)).toBe('dark');

      // Nested Provider shadows the outer value
      ThemeCtx.Provider('blue', () => {
        expect(useContext(ThemeCtx)).toBe('blue');
      });

      // After inner scope ends, outer value is restored
      expect(useContext(ThemeCtx)).toBe('dark');
    });

    // After all Providers, default is restored
    expect(useContext(ThemeCtx)).toBe('light');
  });

  // IT-1C-4: ErrorBoundary catches errors and renders fallback with retry
  test('ErrorBoundary catches and allows retry', () => {
    let attempts = 0;
    let retryFn: (() => void) | undefined;

    const container = document.createElement('div');
    const result = ErrorBoundary({
      children: () => {
        attempts++;
        if (attempts < 2) {
          throw new TypeError('component error');
        }
        const el = document.createElement('p');
        el.textContent = 'recovered';
        return el;
      },
      fallback: (error, retry) => {
        retryFn = retry;
        const el = document.createElement('span');
        el.textContent = `Error: ${error.message}`;
        return el;
      },
    });
    container.appendChild(result);

    // First render: children throws, fallback shown
    expect(container.textContent).toBe('Error: component error');
    expect(retryFn).toBeDefined();
    expect(attempts).toBe(1);

    // Call actual retry — it replaces fallback with children result in the DOM
    retryFn?.();
    expect(container.textContent).toBe('recovered');
    expect(attempts).toBe(2);
  });

  // IT-1C-5: ref provides access to DOM element after mount
  test('ref.current is set after mount', () => {
    const r = ref<HTMLDivElement>();

    // Before mount, ref is undefined
    expect(r.current).toBeUndefined();

    // Simulate mount: assign the DOM element to the ref
    const scope = pushScope();
    onMount(() => {
      const el = document.createElement('div');
      el.id = 'test-ref';
      r.current = el;
    });
    popScope();

    // After mount, ref.current is set
    expect(r.current).toBeDefined();
    expect(r.current?.id).toBe('test-ref');
    expect(r.current).toBeInstanceOf(HTMLDivElement);

    // Cleanup
    runCleanups(scope);
  });
});
