import { onCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { effect } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';
import { untrack } from '../runtime/tracking';

/**
 * Runs callback once on mount. Never re-executes.
 * Supports `onCleanup` inside for teardown on unmount.
 */
export function onMount(callback: () => void): void {
  // Execute untracked so signal reads inside do not create subscriptions
  untrack(callback);
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
  onCleanup(() => {
    if (innerCleanups) {
      runCleanups(innerCleanups);
    }
    dispose();
  });
}
