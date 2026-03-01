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
 * Unwraps a ReadonlySignal to its value type.
 * Used by signal APIs (like query()) to expose plain values in TypeScript
 * while the compiler auto-unwraps them at runtime.
 *
 * @example
 * type UnwrappedData = Unwrapped<ReadonlySignal<Task | undefined>>; // → Task | undefined
 */
export type Unwrapped<T> = T extends ReadonlySignal<infer U> ? U : T;

/**
 * Unwraps all signal properties of an object type.
 * Properties that are signals become their inner value type.
 * Non-signal properties and primitive types pass through unchanged.
 *
 * Used by `useContext` to present context values without the Signal wrapper.
 *
 * @example
 * type Settings = { theme: Signal<string>; setTheme: (t: string) => void };
 * type Unwrapped = UnwrapSignals<Settings>; // { theme: string; setTheme: (t: string) => void }
 */
export type UnwrapSignals<T> = T extends object ? { [K in keyof T]: Unwrapped<T[K]> } : T;

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
