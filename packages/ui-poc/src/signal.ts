/**
 * Minimal signal runtime for @vertz/ui POC.
 *
 * Validates: signal creation, computed derivation, effect tracking,
 * dependency auto-tracking, batched updates, and cleanup.
 */

type Subscriber = () => void;

let activeEffect: Subscriber | null = null;
const effectStack: Subscriber[] = [];
let batchDepth = 0;
const batchQueue = new Set<Subscriber>();

export interface ReadonlySignal<T> {
  get(): T;
  subscribe(fn: Subscriber): () => void;
}

export interface Signal<T> extends ReadonlySignal<T> {
  set(value: T): void;
  update(fn: (prev: T) => T): void;
}

export function signal<T>(initialValue: T): Signal<T> {
  let value = initialValue;
  const subscribers = new Set<Subscriber>();

  return {
    get() {
      if (activeEffect !== null) {
        subscribers.add(activeEffect);
      }
      return value;
    },
    set(newValue: T) {
      if (Object.is(value, newValue)) return;
      value = newValue;
      notify(subscribers);
    },
    update(fn: (prev: T) => T) {
      const newValue = fn(value);
      if (Object.is(value, newValue)) return;
      value = newValue;
      notify(subscribers);
    },
    subscribe(fn: Subscriber) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
  };
}

function notify(subscribers: Set<Subscriber>): void {
  if (batchDepth > 0) {
    for (const sub of subscribers) {
      batchQueue.add(sub);
    }
    return;
  }
  for (const sub of [...subscribers]) {
    sub();
  }
}

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  let cachedValue: T;
  let dirty = true;
  const subscribers = new Set<Subscriber>();

  const recompute: Subscriber = () => {
    dirty = true;
    notify(subscribers);
  };

  return {
    get() {
      if (activeEffect !== null) {
        subscribers.add(activeEffect);
      }
      if (dirty) {
        const prevEffect = activeEffect;
        activeEffect = recompute;
        effectStack.push(recompute);
        try {
          cachedValue = fn();
        } finally {
          effectStack.pop();
          activeEffect = prevEffect;
        }
        dirty = false;
      }
      return cachedValue;
    },
    subscribe(fn: Subscriber) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
  };
}

export function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | undefined;

  const execute: Subscriber = () => {
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
    const prevEffect = activeEffect;
    activeEffect = execute;
    effectStack.push(execute);
    try {
      const result = fn();
      cleanup = typeof result === 'function' ? result : undefined;
    } finally {
      effectStack.pop();
      activeEffect = prevEffect;
    }
  };

  execute();

  return () => {
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
  };
}

export function batch(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      const queued = [...batchQueue];
      batchQueue.clear();
      for (const sub of queued) {
        sub();
      }
    }
  }
}

/** Expose for testing only */
export function _getActiveEffect(): Subscriber | null {
  return activeEffect;
}
