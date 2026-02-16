/**
 * The currently active subscriber being tracked.
 * When a signal's .value is read while this is set,
 * the signal records this subscriber as a dependency.
 */
let currentSubscriber = null;
/**
 * Optional callback invoked whenever a signal value is read inside a tracking
 * context. Used by the query module to capture dependency values for
 * deterministic cache key derivation.
 */
let readValueCallback = null;
/**
 * Get the currently active subscriber (if any).
 */
export function getSubscriber() {
  return currentSubscriber;
}
/**
 * Set the active subscriber for dependency tracking.
 * Returns the previous subscriber so it can be restored.
 */
export function setSubscriber(sub) {
  const prev = currentSubscriber;
  currentSubscriber = sub;
  return prev;
}
/**
 * Get the current read-value callback (if any).
 */
export function getReadValueCallback() {
  return readValueCallback;
}
/**
 * Set the read-value callback. Returns the previous callback so it can be
 * restored. When set, the callback is invoked with the value each time a
 * signal's `.value` is read inside a tracking context.
 */
export function setReadValueCallback(cb) {
  const prev = readValueCallback;
  readValueCallback = cb;
  return prev;
}
/**
 * Execute a function without tracking any signal reads.
 * Useful for reading signals without creating subscriptions.
 */
export function untrack(fn) {
  const prev = currentSubscriber;
  currentSubscriber = null;
  try {
    return fn();
  } finally {
    currentSubscriber = prev;
  }
}
//# sourceMappingURL=tracking.js.map
