import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { untrack } from '../runtime/tracking';
import { getSSRContext } from '../ssr/ssr-render-context';

// ---------------------------------------------------------------------------
// Mount frame stack — defers onMount callbacks until after JSX evaluation
// ---------------------------------------------------------------------------

const mountFrames: Array<Array<() => void>> = [];

// ---------------------------------------------------------------------------
// Post-hydration mount queue — defers onMount callbacks until after hydration
// ---------------------------------------------------------------------------

/**
 * When non-null, __flushMountFrame() pushes callbacks here instead of
 * executing them immediately. Flushed by flushDeferredMounts() after
 * endHydration(). Null in CSR mode (zero overhead — single falsy check).
 */
let postHydrationQueue: Array<() => void> | null = null;

/**
 * Compiler-injected: push a new mount frame at component body start.
 * Returns the stack depth AFTER pushing — used by __discardMountFrame
 * to avoid popping a parent frame if __flushMountFrame already popped ours.
 */
export function __pushMountFrame(): number {
  mountFrames.push([]);
  return mountFrames.length;
}

/**
 * Compiler-injected: flush the current mount frame after JSX evaluation.
 * Pops the frame first (so the stack is clean even if a callback throws),
 * then executes all deferred callbacks. All callbacks run even if one throws —
 * the first error is rethrown after all have executed.
 *
 * During hydration (postHydrationQueue is non-null), callbacks are pushed
 * to the queue instead of executing — they run after endHydration() via
 * flushDeferredMounts(). This prevents onMount DOM manipulation from
 * corrupting the hydration cursor.
 */
export function __flushMountFrame(): void {
  const frame = mountFrames.pop();
  if (!frame) return;

  if (postHydrationQueue) {
    // During hydration — defer to post-hydration queue.
    // Preserves child-before-parent ordering because depth-first
    // JSX evaluation pushes child callbacks before parent callbacks.
    for (const cb of frame) {
      postHydrationQueue.push(cb);
    }
    return;
  }

  // Normal (CSR) execution — unchanged
  let firstError: unknown;
  for (const cb of frame) {
    try {
      cb();
    } catch (e) {
      if (firstError === undefined) firstError = e;
    }
  }
  if (firstError !== undefined) throw firstError;
}

/**
 * Compiler-injected: discard the current mount frame in error paths.
 * Only pops if the stack depth still matches `expectedDepth` (the value
 * returned by __pushMountFrame). This prevents popping a parent frame
 * when __flushMountFrame already popped ours (e.g., a callback threw).
 */
export function __discardMountFrame(expectedDepth: number): void {
  if (mountFrames.length === expectedDepth) {
    mountFrames.pop();
  }
}

/**
 * Begin deferring mount callbacks. Called by mount() before startHydration().
 * While active, __flushMountFrame() queues callbacks instead of executing them.
 */
export function beginDeferringMounts(): void {
  postHydrationQueue = [];
}

/**
 * Flush all deferred mount callbacks in FIFO order (child-before-parent).
 * All callbacks execute even if one throws — the first error is rethrown
 * after all have executed (matches __flushMountFrame semantics).
 *
 * INVARIANT: must be called before popScope() so that cleanup functions
 * from onMount register in the mount scope.
 */
export function flushDeferredMounts(): void {
  const queue = postHydrationQueue;
  postHydrationQueue = null;
  if (!queue) return;

  let firstError: unknown;
  for (const cb of queue) {
    try {
      cb();
    } catch (e) {
      if (firstError === undefined) firstError = e;
    }
  }
  if (firstError !== undefined) throw firstError;
}

/**
 * Discard all queued mount callbacks without executing them.
 * Nulls the queue — callbacks are never run.
 * Called in hydration error recovery before CSR fallback.
 */
export function discardDeferredMounts(): void {
  postHydrationQueue = null;
}

// ---------------------------------------------------------------------------
// onMount
// ---------------------------------------------------------------------------

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

  const frame = mountFrames[mountFrames.length - 1];
  if (frame) {
    // Inside a compiled component — defer until __flushMountFrame
    frame.push(() => executeOnMount(callback));
  } else {
    // Outside a component (event handler, watch, etc.) — run immediately
    executeOnMount(callback);
  }
}

/**
 * Executes an onMount callback within a disposal scope.
 *
 * Note on disposal scope ownership: when deferred, the active disposal scope
 * at flush time is the parent scope (e.g., the Fast Refresh wrapper's scope,
 * or the render() root scope). Cleanups are forwarded there via _tryOnCleanup.
 * If no parent scope exists, cleanups are silently discarded (same as current
 * immediate behavior — see lifecycle.test.ts "without parent scope" test).
 */
function executeOnMount(callback: () => (() => void) | void): void {
  const scope = pushScope();
  try {
    const cleanup = untrack(callback);
    if (typeof cleanup === 'function') {
      _tryOnCleanup(cleanup);
    }
  } finally {
    popScope();
    if (scope.length > 0) {
      _tryOnCleanup(() => runCleanups(scope));
    }
  }
}
