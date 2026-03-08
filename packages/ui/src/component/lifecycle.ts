import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { untrack } from '../runtime/tracking';
import { getSSRContext } from '../ssr/ssr-render-context';

/**
 * Runs callback once on mount. Never re-executes.
 * Return a function to register cleanup that runs on unmount.
 *
 * ```tsx
 * onMount(() => {
 *   const id = setInterval(() => seconds++, 1000);
 *   return () => clearInterval(id);
 * });
 * ```
 */
export function onMount(callback: () => (() => void) | void): void {
  // SSR safety: skip onMount during server-side rendering.
  if (getSSRContext()) return;

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
