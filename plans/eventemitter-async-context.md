# EventEmitter Async Context Propagation

**Issue:** #2106
**Status:** Draft

## API Surface

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';

const storage = new AsyncLocalStorage();
const emitter = new EventEmitter();

// Listener registered inside ctx1 scope
storage.run('ctx1', () => {
  emitter.on('data', (value) => {
    // BEFORE: storage.getStore() === undefined (or ctx2)
    // AFTER:  storage.getStore() === 'ctx1'
    console.log(storage.getStore()); // 'ctx1'
  });
});

// Emitted from ctx2 scope — listener still sees ctx1
storage.run('ctx2', () => {
  emitter.emit('data', 42);
});

// Emitted from outside any scope — listener still sees ctx1
emitter.emit('data', 99);
```

Works with `AsyncContext.Variable` too:

```typescript
const v = new AsyncContext.Variable();
const ee = new EventEmitter();

v.run('registration-scope', () => {
  ee.on('event', () => {
    console.log(v.get()); // 'registration-scope'
  });
});

ee.emit('event'); // listener sees 'registration-scope'
```

## Manifesto Alignment

- **Node.js parity:** This matches Node.js behavior where `AsyncLocalStorage` context propagates through `EventEmitter` listeners.
- **No surprises:** Developers expect the context from registration time, not emission time. This is the principle of least surprise.
- **Zero-cost when unused:** When `AsyncContext.Snapshot` is not available (e.g., no async context polyfill loaded), the EventEmitter works unchanged.

**Note:** The parent design doc (`plans/runtime-async-context.md`) listed "Not implementing `AsyncContext.Snapshot`" as a non-goal. This design lifts that non-goal because `Snapshot` is the enabling primitive for EventEmitter context propagation — it's the TC39-specified mechanism for this exact use case.

## Non-Goals

- **Custom context override at emit time:** We don't support `emit()` with an explicit context parameter.
- **EventTarget support:** Only `EventEmitter` (Node.js API). Web `EventTarget` is a separate concern.
- **`prependOnceListener`:** Not currently implemented in the polyfill, won't be added here.

## Unknowns

None identified — the approach follows the TC39 `AsyncContext.Snapshot` spec and Node.js behavior.

## Implementation Approach

### Step 1: Add `AsyncContext.Snapshot` to the async context polyfill

Add a `Snapshot` class that captures `__currentMapping` at construction time and can restore it:

```javascript
class Snapshot {
  #mapping;
  constructor() {
    this.#mapping = __currentMapping;
  }
  run(fn, ...args) {
    const prev = __currentMapping;
    __currentMapping = this.#mapping;
    try {
      return fn(...args);
    } finally {
      __currentMapping = prev;
    }
  }
}
globalThis.AsyncContext.Snapshot = Snapshot;
```

This follows the TC39 AsyncContext Stage 2 proposal.

### Step 2: Modify EventEmitter to capture + restore context

In `on()`: snapshot the current context and store it alongside the listener.

In `emit()`: restore each listener's captured context before invocation.

```javascript
on(event, listener) {
  if (!this.#listeners.has(event)) {
    this.#listeners.set(event, []);
  }
  const snapshot = typeof globalThis.AsyncContext?.Snapshot === 'function'
    ? new globalThis.AsyncContext.Snapshot()
    : null;
  this.#listeners.get(event).push({ fn: listener, snapshot });
  return this;
}

emit(event, ...args) {
  const arr = this.#listeners.get(event);
  if (!arr || arr.length === 0) return false;
  for (const entry of [...arr]) {
    if (entry.snapshot) {
      entry.snapshot.run(() => entry.fn.apply(this, args));
    } else {
      entry.fn.apply(this, args);
    }
  }
  return true;
}
```

The listener storage changes from `Function[]` to `{ fn: Function, snapshot: Snapshot | null }[]`. All methods that access listeners (`removeListener`, `listeners`, `rawListeners`, `listenerCount`, etc.) are updated accordingly.

### Key design decisions

- **`_original` tracking for `once()` preserved:** The wrapped listener still stores `_original` for correct `removeListener` matching.
- **`removeListener` matches on `fn` field:** `findIndex(entry => entry.fn === listener || entry.fn._original === listener)`.
- **`listeners()` returns unwrapped functions:** `arr.map(entry => entry.fn._original || entry.fn)`.
- **`rawListeners()` returns wrapped functions:** `arr.map(entry => entry.fn)` — preserves the contract of returning function references (including `once` wrappers), not `{fn, snapshot}` entry objects.
- **Graceful degradation:** If `AsyncContext.Snapshot` is not available, listeners store `snapshot: null` and emit calls the function directly — zero overhead.
- **`prependListener` also captures context:** Same pattern as `on()`.
- **Future `prependOnceListener`:** Not implemented in the current polyfill, but if added later it must capture context like `prependListener`.

## Type Flow Map

N/A — this is a pure JS polyfill change with no TypeScript generics.

## E2E Acceptance Test

```typescript
// Test 1: Listener sees registration-time context, not emit-time context
const storage = new AsyncLocalStorage();
const emitter = new EventEmitter();

let captured;
storage.run('ctx1', () => {
  emitter.on('data', () => { captured = storage.getStore(); });
});

storage.run('ctx2', () => {
  emitter.emit('data');
});

expect(captured).toBe('ctx1'); // NOT 'ctx2'

// Test 2: Listener sees registration-time context when emitted from no context
emitter.emit('data');
expect(captured).toBe('ctx1'); // NOT undefined

// Test 3: removeListener works correctly with wrapped listeners
const fn = () => {};
storage.run('ctx3', () => { emitter.on('remove-test', fn); });
emitter.removeListener('remove-test', fn);
expect(emitter.listenerCount('remove-test')).toBe(0);

// Test 4: once() captures context and removes after first call
let onceCaptured;
storage.run('once-ctx', () => {
  emitter.once('once-test', () => { onceCaptured = storage.getStore(); });
});
emitter.emit('once-test');
expect(onceCaptured).toBe('once-ctx');
expect(emitter.listenerCount('once-test')).toBe(0);

// Test 5: Multiple listeners each see their own registration context
let captured1, captured2;
storage.run('ctx-a', () => {
  emitter.on('multi', () => { captured1 = storage.getStore(); });
});
storage.run('ctx-b', () => {
  emitter.on('multi', () => { captured2 = storage.getStore(); });
});
emitter.emit('multi');
expect(captured1).toBe('ctx-a');
expect(captured2).toBe('ctx-b');
```

## Implementation Plan

### Phase 1: AsyncContext.Snapshot + EventEmitter context propagation

Single phase — the feature is small and self-contained.

**Acceptance criteria (BDD):**

```typescript
describe('Feature: EventEmitter async context propagation', () => {
  describe('Given a listener registered inside storage.run(ctx1)', () => {
    describe('When emit is called from inside storage.run(ctx2)', () => {
      it('Then the listener sees ctx1', () => {})
    })
    describe('When emit is called from outside any run() scope', () => {
      it('Then the listener sees ctx1', () => {})
    })
  })

  describe('Given a once() listener registered inside storage.run(ctx1)', () => {
    describe('When emit is called', () => {
      it('Then the listener sees ctx1', () => {})
      it('Then the listener is removed after first call', () => {})
    })
  })

  describe('Given a listener registered with context', () => {
    describe('When removeListener is called with the original function', () => {
      it('Then the listener is correctly removed', () => {})
    })
  })

  describe('Given no async context is loaded', () => {
    describe('When emit is called', () => {
      it('Then synchronous emit still works (no regression)', () => {})
    })
  })

  describe('Given AsyncContext.Snapshot is added', () => {
    describe('When a Snapshot is created inside Variable.run()', () => {
      it('Then snapshot.run(fn) restores the captured context', () => {})
    })
  })
})
```
