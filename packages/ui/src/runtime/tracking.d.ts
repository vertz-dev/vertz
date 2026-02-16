import type { Subscriber } from './signal-types';
/**
 * Get the currently active subscriber (if any).
 */
export declare function getSubscriber(): Subscriber | null;
/**
 * Set the active subscriber for dependency tracking.
 * Returns the previous subscriber so it can be restored.
 */
export declare function setSubscriber(sub: Subscriber | null): Subscriber | null;
/**
 * Get the current read-value callback (if any).
 */
export declare function getReadValueCallback(): ((value: unknown) => void) | null;
/**
 * Set the read-value callback. Returns the previous callback so it can be
 * restored. When set, the callback is invoked with the value each time a
 * signal's `.value` is read inside a tracking context.
 */
export declare function setReadValueCallback(
  cb: ((value: unknown) => void) | null,
): ((value: unknown) => void) | null;
/**
 * Execute a function without tracking any signal reads.
 * Useful for reading signals without creating subscriptions.
 */
export declare function untrack<T>(fn: () => T): T;
//# sourceMappingURL=tracking.d.ts.map
