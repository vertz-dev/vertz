import { batch, scheduleNotify } from './scheduler';
import type { Computed, DisposeFn, Signal, Subscriber } from './signal-types';
import { getSubscriber, setSubscriber } from './tracking';

/** Global ID counter for subscriber deduplication. */
let nextId = 0;

// ─── Signal ────────────────────────────────────────────────────────────────

class SignalImpl<T> implements Signal<T> {
  _value: T;
  _subscribers: Set<Subscriber> = new Set();

  constructor(initial: T) {
    this._value = initial;
  }

  get value(): T {
    const sub = getSubscriber();
    if (sub) {
      this._subscribers.add(sub);
    }
    return this._value;
  }

  set value(newValue: T) {
    if (Object.is(this._value, newValue)) {
      return;
    }
    this._value = newValue;
    this._notifySubscribers();
  }

  peek(): T {
    return this._value;
  }

  notify(): void {
    this._notifySubscribers();
  }

  _notifySubscribers(): void {
    // Auto-batch: ensures all dirtiness propagates through computeds
    // before effects are flushed, enabling diamond dependency deduplication.
    batch(() => {
      for (const sub of this._subscribers) {
        scheduleNotify(sub);
      }
    });
  }
}

/**
 * Create a reactive signal with an initial value.
 */
export function signal<T>(initial: T): Signal<T> {
  return new SignalImpl(initial);
}

// ─── Computed ──────────────────────────────────────────────────────────────

enum ComputedState {
  Clean = 0,
  Dirty = 1,
  Computing = 2,
}

class ComputedImpl<T> implements Computed<T>, Subscriber {
  _id: number;
  _isEffect = false;
  _fn: () => T;
  _cachedValue: T | undefined;
  _state: ComputedState = ComputedState.Dirty;
  _subscribers: Set<Subscriber> = new Set();

  constructor(fn: () => T) {
    this._id = nextId++;
    this._fn = fn;
  }

  get value(): T {
    const sub = getSubscriber();
    if (sub) {
      this._subscribers.add(sub);
    }
    if (this._state !== ComputedState.Clean) {
      this._compute();
    }
    return this._cachedValue as T;
  }

  peek(): T {
    if (this._state !== ComputedState.Clean) {
      this._compute();
    }
    return this._cachedValue as T;
  }

  _compute(): void {
    this._state = ComputedState.Computing;
    const prev = setSubscriber(this);
    try {
      const newValue = this._fn();
      if (!Object.is(this._cachedValue, newValue)) {
        this._cachedValue = newValue;
      }
    } finally {
      setSubscriber(prev);
      this._state = ComputedState.Clean;
    }
  }

  _notify(): void {
    // Mark dirty and propagate to our own subscribers
    if (this._state === ComputedState.Dirty) {
      return; // Already dirty, no need to re-propagate
    }
    this._state = ComputedState.Dirty;
    for (const sub of this._subscribers) {
      scheduleNotify(sub);
    }
  }
}

/**
 * Create a computed (derived) reactive value.
 * The function is lazily evaluated and cached.
 */
export function computed<T>(fn: () => T): Computed<T> {
  return new ComputedImpl(fn);
}

// ─── Effect ────────────────────────────────────────────────────────────────

class EffectImpl implements Subscriber {
  _id: number;
  _isEffect = true;
  _fn: () => void;
  _disposed = false;

  constructor(fn: () => void) {
    this._id = nextId++;
    this._fn = fn;
  }

  _notify(): void {
    if (this._disposed) {
      return;
    }
    this._run();
  }

  _run(): void {
    const prev = setSubscriber(this);
    try {
      this._fn();
    } finally {
      setSubscriber(prev);
    }
  }

  _dispose(): void {
    this._disposed = true;
  }
}

/**
 * Create a reactive effect that re-runs whenever its dependencies change.
 * Returns a dispose function to stop the effect.
 */
export function effect(fn: () => void): DisposeFn {
  const eff = new EffectImpl(fn);
  // Run the effect immediately to establish subscriptions
  eff._run();
  return () => eff._dispose();
}
