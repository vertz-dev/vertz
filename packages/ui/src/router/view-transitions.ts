/**
 * View Transitions API integration.
 *
 * Provides a utility to wrap DOM updates in browser view transitions,
 * with graceful degradation for unsupported browsers, reduced motion
 * preferences, and SSR environments.
 */

/** View transition configuration. */
export interface ViewTransitionConfig {
  /**
   * CSS class name added to `<html>` during the transition,
   * enabling per-transition CSS animation rules via
   * `.className::view-transition-old(root)` etc.
   *
   * Omit for the default cross-fade.
   */
  className?: string;
}

/** Return type of `document.startViewTransition()`. */
interface ViewTransitionObject {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
}

/**
 * Generation counter for concurrent transition safety.
 * Prevents CSS class cleanup from an abandoned transition
 * from removing a class that a newer transition added.
 */
let transitionGen = 0;

/**
 * Wrap a DOM update in a view transition if supported and enabled.
 *
 * Gracefully degrades:
 * - API unsupported → runs update directly
 * - `prefers-reduced-motion` → runs update directly
 * - config disabled/undefined → runs update directly
 *
 * @param update - The callback that performs the DOM mutation.
 * @param config - View transition config (from route, router, or per-navigation).
 */
export async function withViewTransition(
  update: () => void | Promise<void>,
  config: ViewTransitionConfig | boolean | undefined,
): Promise<void> {
  // Short-circuit: disabled or no config
  if (config === undefined || config === false) {
    await update();
    return;
  }

  // Short-circuit: API not supported (SSR or old browser)
  if (typeof document === 'undefined' || !('startViewTransition' in document)) {
    await update();
    return;
  }

  // Short-circuit: respect reduced motion preference
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    await update();
    return;
  }

  const className = typeof config === 'object' && config.className ? config.className : undefined;

  const gen = ++transitionGen;

  if (className) {
    document.documentElement.classList.add(className);
  }

  const transition = (
    document.startViewTransition as (cb: () => void | Promise<void>) => ViewTransitionObject
  ).call(document, async () => {
    await update();
  });

  try {
    await transition.finished;
  } catch (err: unknown) {
    // AbortError is expected when a newer transition supersedes this one.
    // Swallow it silently — the newer transition takes over.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return;
    }
    throw err;
  } finally {
    // Only remove the class if no newer transition has started.
    // The generation guard ensures we don't remove a class that a newer
    // transition added.
    if (className && gen === transitionGen) {
      document.documentElement.classList.remove(className);
    }
  }
}

/** @internal — Reset generation counter for testing. */
export function _resetTransitionGen(): void {
  transitionGen = 0;
}
