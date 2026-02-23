import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { untrack } from '../runtime/tracking';

/**
 * Runs callback once on mount. Never re-executes.
 * Supports `onCleanup` inside for teardown on unmount.
 * If the callback returns a function, it is registered as cleanup.
 */
export function onMount(callback: () => (() => void) | void): void {
  // SSR safety: skip onMount during server-side rendering.
  // Uses the global function hook __VERTZ_IS_SSR__ (AsyncLocalStorage-backed).
  if (typeof globalThis !== 'undefined') {
    const check = (globalThis as any).__VERTZ_IS_SSR__;
    if (typeof check === 'function' && check()) return;
  }

  // Push a disposal scope so onCleanup() calls inside the callback are captured
  const scope = pushScope();
  try {
    // Execute untracked so signal reads inside do not create subscriptions
    const cleanup = untrack(callback);
    // If the callback returns a function, register it as cleanup
    if (typeof cleanup === 'function') {
      _tryOnCleanup(cleanup);
    }
  } finally {
    popScope();

    // Forward any captured cleanups to the parent scope so they run on disposal.
    // This is in `finally` so cleanups registered before an exception are still forwarded.
    if (scope.length > 0) {
      _tryOnCleanup(() => runCleanups(scope));
    }
  }
}
