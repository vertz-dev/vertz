/**
 * Simplified signal implementation for the spike
 * Inspired by Vertz's fine-grained reactivity
 */

type Subscriber = () => void;

let currentSubscriber: Subscriber | null = null;

export class Signal<T> {
  private _value: T;
  private _subscribers = new Set<Subscriber>();

  constructor(initial: T) {
    this._value = initial;
  }

  get value(): T {
    if (currentSubscriber) {
      this._subscribers.add(currentSubscriber);
    }
    return this._value;
  }

  set value(newValue: T) {
    if (Object.is(this._value, newValue)) return;
    this._value = newValue;
    this._notify();
  }

  peek(): T {
    return this._value;
  }

  private _notify() {
    for (const sub of this._subscribers) {
      sub();
    }
  }
}

export function signal<T>(initial: T): Signal<T> {
  return new Signal(initial);
}

export function effect(fn: () => void): () => void {
  const execute = () => {
    currentSubscriber = execute;
    try {
      fn();
    } finally {
      currentSubscriber = null;
    }
  };
  
  execute();
  
  // Return cleanup function
  return () => {
    // In a full implementation, we'd track and clean up subscriptions
  };
}

export function computed<T>(fn: () => T): Signal<T> {
  const result = signal<T>(undefined as T);
  effect(() => {
    result.value = fn();
  });
  return result;
}
