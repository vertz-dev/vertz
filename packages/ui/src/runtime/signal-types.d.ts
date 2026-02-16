/**
 * A reactive signal that holds a value and notifies subscribers on change.
 */
export interface Signal<T> {
  /** Get the current value and subscribe to changes (when inside a tracking context). */
  get value(): T;
  /** Set the current value and notify subscribers if changed. */
  set value(newValue: T);
  /** Read the current value without subscribing (no tracking). */
  peek(): T;
  /** Manually notify all subscribers (useful after mutating the value in place). */
  notify(): void;
}
/**
 * A read-only reactive value derived from other signals.
 */
export interface ReadonlySignal<T> {
  /** Get the current value and subscribe to changes. */
  readonly value: T;
  /** Read the current value without subscribing. */
  peek(): T;
}
/**
 * A computed signal — lazily evaluated, cached, and automatically re-computed
 * when dependencies change.
 */
export interface Computed<T> extends ReadonlySignal<T> {
  /** Get the current value, re-computing if dirty. Subscribes in tracking context. */
  readonly value: T;
  /** Read the current value without subscribing. */
  peek(): T;
}
/** Dispose function returned by effect(). */
export type DisposeFn = () => void;
/**
 * Internal: any object that owns a `_subscribers` set.
 * Used by subscribers to track their sources for cleanup.
 */
export interface SubscriberSource {
  _subscribers: Set<Subscriber>;
}
/** Internal subscriber interface for the reactive graph. */
export interface Subscriber {
  /** Called when a dependency has changed. */
  _notify(): void;
  /** Unique ID for deduplication in batch queue. */
  _id: number;
  /** Whether this is an effect (leaf subscriber) or computed (intermediate). */
  _isEffect: boolean;
  /** Track a source that this subscriber reads from. */
  _addSource(source: SubscriberSource): void;
}
//# sourceMappingURL=signal-types.d.ts.map
