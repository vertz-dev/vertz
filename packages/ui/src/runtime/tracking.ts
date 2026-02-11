import type { Subscriber } from './signal-types';

/**
 * The currently active subscriber being tracked.
 * When a signal's .value is read while this is set,
 * the signal records this subscriber as a dependency.
 */
let currentSubscriber: Subscriber | null = null;

/**
 * Get the currently active subscriber (if any).
 */
export function getSubscriber(): Subscriber | null {
  return currentSubscriber;
}

/**
 * Set the active subscriber for dependency tracking.
 * Returns the previous subscriber so it can be restored.
 */
export function setSubscriber(sub: Subscriber | null): Subscriber | null {
  const prev = currentSubscriber;
  currentSubscriber = sub;
  return prev;
}

/**
 * Execute a function without tracking any signal reads.
 * Useful for reading signals without creating subscriptions.
 */
export function untrack<T>(fn: () => T): T {
  const prev = currentSubscriber;
  currentSubscriber = null;
  try {
    return fn();
  } finally {
    currentSubscriber = prev;
  }
}
