import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { effect } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';
import { untrack } from '../runtime/tracking';

/**
 * Runs callback once on mount. Never re-executes.
 * Supports `onCleanup` inside for teardown on unmount.
 */
export function onMount(callback: () => void): void {
  // SSR safety: skip onMount execution entirely during server-side rendering.
  // Check multiple indicators — Vite's module runner may provide different globals.
  if (typeof document === 'undefined') return;
  try { if ((import.meta as any).env?.SSR) return; } catch { /* import.meta may not exist */ }
  if (typeof globalThis !== 'undefined' && (globalThis as any).__SSR_URL__ !== undefined) return;

  // Push a disposal scope so onCleanup() calls inside the callback are captured
  const scope = pushScope();
  try {
    // Execute untracked so signal reads inside do not create subscriptions
    untrack(callback);
  } finally {
    popScope();

    // Forward any captured cleanups to the parent scope so they run on disposal.
    // This is in `finally` so cleanups registered before an exception are still forwarded.
    if (scope.length > 0) {
      _tryOnCleanup(() => runCleanups(scope));
    }
  }
}

/**
 * Watches a dependency accessor and runs callback whenever it changes.
 * Always takes TWO arguments: a dependency accessor and a callback.
 * Runs callback immediately with current value.
 * Before each re-run, any `onCleanup` from previous run executes first.
 */
export function watch<T>(dep: () => T, callback: (value: T) => void): void {
  let innerCleanups: DisposeFn[] | null = null;

  const dispose = effect(() => {
    // Run previous inner cleanups before re-running
    if (innerCleanups) {
      runCleanups(innerCleanups);
    }

    // Read the dependency (tracked)
    const value = dep();

    // Set up a new inner scope for onCleanup calls inside the callback
    innerCleanups = pushScope();
    try {
      // Execute callback untracked so only `dep` is the reactive dependency
      untrack(() => callback(value));
    } finally {
      popScope();
    }
  });

  // Register disposal of the effect + final inner cleanups with the outer scope
  _tryOnCleanup(() => {
    if (innerCleanups) {
      runCleanups(innerCleanups);
    }
    dispose();
  });
}
