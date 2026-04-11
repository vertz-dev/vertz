/**
 * Internal event channel client for @vertz/desktop.
 *
 * NOT exported to developers. Used by shell.spawn() and future features
 * (fs.watch, etc.) to manage push event subscriptions from Rust.
 *
 * The actual event dispatch logic lives in the injected JS client
 * (IPC_CLIENT_JS in ipc_dispatcher.rs). This module provides typed
 * wrappers for the global functions injected there.
 */

declare global {
  interface Window {
    /** Pre-allocate a subscription slot (buffer mode). */
    __vtz_event_alloc?(subId: number): void;
    /** Register an event listener. Returns a disposer. */
    __vtz_event_on?(
      subId: number,
      eventType: string,
      callback: (data: unknown) => void,
    ): () => void;
    /** Remove a subscription entirely. */
    __vtz_event_unsub?(subId: number): void;
  }
}

/**
 * Pre-allocate a subscription in the EventRegistry.
 *
 * Must be called BEFORE the IPC spawn request so that events arriving
 * before listeners are registered are buffered (not dropped).
 */
export function allocateSubscription(subId: number): void {
  if (typeof window !== 'undefined' && window.__vtz_event_alloc) {
    window.__vtz_event_alloc(subId);
  }
}

/**
 * Register a typed event listener on a subscription.
 *
 * Multiple listeners per event type are supported. Each call appends.
 * Returns a disposer function that removes this specific listener.
 *
 * On the first call for a subscription, any buffered events are flushed.
 */
export function addListener(
  subId: number,
  eventType: string,
  callback: (data: unknown) => void,
): () => void {
  if (typeof window !== 'undefined' && window.__vtz_event_on) {
    return window.__vtz_event_on(subId, eventType, callback);
  }
  return () => {};
}

/**
 * Remove a subscription entirely from the EventRegistry.
 *
 * Called when a process exits or is killed.
 */
export function unsubscribe(subId: number): void {
  if (typeof window !== 'undefined' && window.__vtz_event_unsub) {
    window.__vtz_event_unsub(subId);
  }
}
