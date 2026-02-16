import { getContextScope, setContextScope } from '../component/context';
import { _tryOnCleanup } from './disposal';
import { batch, scheduleNotify } from './scheduler';
import { getReadValueCallback, getSubscriber, setSubscriber } from './tracking';

/** Global ID counter for subscriber deduplication. */
let nextId = 0;
// ─── Signal ────────────────────────────────────────────────────────────────
class SignalImpl {
  _value;
  _subscribers = new Set();
  constructor(initial) {
    this._value = initial;
  }
  get value() {
    const sub = getSubscriber();
    if (sub) {
      this._subscribers.add(sub);
      sub._addSource(this);
      const cb = getReadValueCallback();
      if (cb) cb(this._value);
    }
    return this._value;
  }
  set value(newValue) {
    if (Object.is(this._value, newValue)) {
      return;
    }
    this._value = newValue;
    this._notifySubscribers();
  }
  peek() {
    return this._value;
  }
  notify() {
    this._notifySubscribers();
  }
  _notifySubscribers() {
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
export function signal(initial) {
  return new SignalImpl(initial);
}
// ─── Computed ──────────────────────────────────────────────────────────────
var ComputedState;
((ComputedState) => {
  ComputedState[(ComputedState.Clean = 0)] = 'Clean';
  ComputedState[(ComputedState.Dirty = 1)] = 'Dirty';
  ComputedState[(ComputedState.Computing = 2)] = 'Computing';
})(ComputedState || (ComputedState = {}));
class ComputedImpl {
  _id;
  _isEffect = false;
  _fn;
  _cachedValue;
  _state = ComputedState.Dirty;
  _subscribers = new Set();
  _sources = new Set();
  constructor(fn) {
    this._id = nextId++;
    this._fn = fn;
  }
  get value() {
    const sub = getSubscriber();
    if (sub) {
      this._subscribers.add(sub);
      sub._addSource(this);
    }
    if (this._state !== ComputedState.Clean) {
      this._compute();
    }
    return this._cachedValue;
  }
  peek() {
    if (this._state !== ComputedState.Clean) {
      this._compute();
    }
    return this._cachedValue;
  }
  _addSource(source) {
    this._sources.add(source);
  }
  _compute() {
    this._state = ComputedState.Computing;
    // Clear old subscriptions before re-tracking
    this._clearSources();
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
  _clearSources() {
    for (const source of this._sources) {
      source._subscribers.delete(this);
    }
    this._sources.clear();
  }
  _notify() {
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
export function computed(fn) {
  return new ComputedImpl(fn);
}
// ─── Effect ────────────────────────────────────────────────────────────────
class EffectImpl {
  _id;
  _isEffect = true;
  _fn;
  _disposed = false;
  _sources = new Set();
  /** Context scope captured at effect creation time. */
  _contextScope;
  constructor(fn) {
    this._id = nextId++;
    this._fn = fn;
    // Capture the current context scope so it can be restored on re-runs
    this._contextScope = getContextScope();
  }
  _addSource(source) {
    this._sources.add(source);
  }
  _notify() {
    if (this._disposed) {
      return;
    }
    this._run();
  }
  _run() {
    // Clear old subscriptions before re-tracking
    this._clearSources();
    const prev = setSubscriber(this);
    // Restore the context scope that was active when this effect was created
    const prevCtx = setContextScope(this._contextScope);
    try {
      this._fn();
    } finally {
      setContextScope(prevCtx);
      setSubscriber(prev);
    }
  }
  _clearSources() {
    for (const source of this._sources) {
      source._subscribers.delete(this);
    }
    this._sources.clear();
  }
  _dispose() {
    this._disposed = true;
    // Remove from all signal/computed subscriber sets
    this._clearSources();
    // Release captured context scope so the Map (and its values) can be GC'd
    this._contextScope = null;
  }
}
/**
 * Create a reactive effect that re-runs whenever its dependencies change.
 * Returns a dispose function to stop the effect.
 */
export function effect(fn) {
  const eff = new EffectImpl(fn);
  // Run the effect immediately to establish subscriptions
  eff._run();
  const dispose = () => eff._dispose();
  // Auto-register with the current disposal scope if one is active
  _tryOnCleanup(dispose);
  return dispose;
}
//# sourceMappingURL=signal.js.map
