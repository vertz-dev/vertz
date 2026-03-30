# Runtime Async Context — Design Document

> Implement TC39 `AsyncContext.Variable` natively in the Vertz runtime, with `node:async_hooks` `AsyncLocalStorage` as a compat wrapper. Unlocks SSR tests (Tier 2) on the runtime.

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-30 | Initial draft |
| 2 | 2026-03-30 | Address 6 blockers from DX, Product, and Technical reviews: fix async polyfill analysis (broken for all async callbacks, not just concurrent), add TC39 constructor options, explicit enterWith/disable removal, run() return value tests, concrete V8 promise hook path, technical approach section |

---

## Executive Summary

The Vertz runtime already has a stack-based `AsyncLocalStorage` polyfill (`ssr/async_local_storage.rs`), but it has two problems:

1. **Not exposed to the test runner** — not injected as a `node:async_hooks` synthetic module, so `import { AsyncLocalStorage } from 'node:async_hooks'` fails at load time.
2. **Broken for async callbacks** — the `finally` block in `run()` pops the context immediately when the async callback returns a Promise, before the first `await` even suspends. Context is lost for any async `run()` call.

This design adds:
1. **TC39 `AsyncContext.Variable`** as the native primitive, with V8 promise hooks for correct async propagation
2. **`node:async_hooks` synthetic module** exporting `AsyncLocalStorage` (and `AsyncResource` stub) as a thin wrapper
3. Wiring into the test executor (`executor.rs`) and module loader

### Why TC39 First

The TC39 `AsyncContext` proposal (Stage 2) is the standardized version of `AsyncLocalStorage`. Both Cloudflare Workers (workerd) and Deno are tracking it. By building on the standard:
- The runtime is forward-compatible with the eventual TC39 spec
- `AsyncLocalStorage` becomes a thin compat layer, not a core primitive
- When TC39 ships, `@vertz/ui-server` can switch to `AsyncContext.Variable` directly

### Current State

| Component | Status |
|---|---|
| Stack-based polyfill | Exists at `ssr/async_local_storage.rs` — **broken for async callbacks** (see Problem section) |
| `node:async_hooks` module | Missing from synthetic modules — blocks SSR tests |
| Test harness integration | Not loaded — `executor.rs` doesn't call `load_async_local_storage` |
| V8 promise hooks | Available via deno_core's V8 binding (`v8::Context::set_promise_hooks()`) but not used |
| SSR tests (entity-todo) | Fail at load: `Cannot find module 'node:async_hooks'` |

---

## Manifesto Alignment

- **Principle 5 (If you can't test it, don't build it):** The runtime can't test SSR code. This is a testing gap.
- **Principle 8 (No ceilings):** Aligning with TC39 means the runtime tracks the standard, not a Node.js-specific API.
- **Principle 3 (Convention over configuration):** `node:async_hooks` just works — no configuration needed.

---

## The Problem

`@vertz/ui-server` uses `AsyncLocalStorage` for two critical SSR patterns:

1. **Per-request SSR context** (`ssr-context.ts`): Stores render state (queries, CSS tracker, errors, cleanup stack) so `@vertz/ui`'s `getSSRContext()` can access it from anywhere in the render tree.

2. **Per-request fetch scoping** (`fetch-scope.ts`): Replaces `globalThis.fetch` with a proxy that delegates to a per-request interceptor, enabling server-side data fetching during SSR without global mutation.

Both use `AsyncLocalStorage.run(store, callback)` with **async callbacks** — the SSR render awaits queries inside the `run()` scope (`ssr-render.ts` line 225). This means the context must survive across `await` boundaries.

### Why the Stack-Based Polyfill is Broken

The current polyfill (`async_local_storage.rs`) uses a try/finally pattern:

```js
run(store, callback, ...args) {
  stack.push(store);
  try {
    return callback(...args);  // returns a Promise for async callbacks
  } finally {
    stack.pop();  // runs IMMEDIATELY when the Promise is returned
  }
}
```

When `callback` is async, `callback(...args)` returns a Promise. The `finally` block executes **immediately** — before the first `await` inside the callback suspends. By the time the callback resumes after its first `await`, the context has already been popped.

This means `getStore()` returns `undefined` (or the wrong context) after any `await` inside `run()`. This is broken for **all** async callbacks, not just concurrent ones.

The polyfill appears to work in the runtime's SSR path (`render.rs`) because:
- The Rust runtime creates a fresh V8 isolate per SSR request — there's no concurrent access
- The actual async `run()` calls in `ssr-render.ts` execute on **Bun** (which has a real `AsyncLocalStorage`), not on the Vertz runtime

**V8 promise hooks** solve this by snapshotting the current context at promise creation and restoring it when continuations (`.then` handlers, `await` resumptions) execute.

---

## Non-Goals

- **Not implementing full `node:async_hooks`** — only `AsyncLocalStorage` and a stub `AsyncResource`. The broader `async_hooks` API (`createHook`, `executionAsyncId`, etc.) is not needed.
- **Not implementing `AsyncContext.Snapshot`** — Stage 2 and not used by our SSR code. Can be added later.
- **Not refactoring `@vertz/ui-server`** — the existing `AsyncLocalStorage` API works. We expose it via the synthetic module; ui-server doesn't need changes.
- **Not implementing `enterWith()` or `disable()`** — these exist in the current polyfill but are removed. `enterWith()` is semi-deprecated in Node.js, not part of TC39, and creates hard-to-debug context leaks. `disable()` is only useful with `enterWith()`. The existing Rust tests for these methods will be deleted.
- **Not benchmarking promise hook overhead** — deferred to when concurrent SSR is implemented in the dev server. SSR renders create ~10-50 promises per request; overhead measurement is premature.

---

## Unknowns

| ID | Question | Resolution |
|---|---|---|
| U1 | Does injecting `AsyncLocalStorage` in the test executor cause any conflicts with the existing DOM class stubs? | Phase 2 — run SSR tests. Polyfill loads before DOM stubs. |

---

## POC Results

N/A — unknowns are resolved during Phase 1 implementation. The V8 promise hook API path is well-documented (see Technical Approach).

---

## API Surface

### TC39 `AsyncContext.Variable` (native)

```ts
// Exposed on globalThis.AsyncContext
const requestId = new AsyncContext.Variable({ name: 'requestId' });
const theme = new AsyncContext.Variable({ defaultValue: 'light' });

requestId.run('req-123', async () => {
  await someAsyncWork();
  requestId.get(); // 'req-123' — preserved across await
});

requestId.get(); // undefined — outside run scope
theme.get();     // 'light' — returns defaultValue when no run() is active
```

**Constructor:** `new AsyncContext.Variable(options?: { name?: string, defaultValue?: T })`
- `name` — identifier for debugging (optional, no runtime behavior)
- `defaultValue` — value returned by `get()` when no `run()` is active (defaults to `undefined`)

**Methods:**
- `run(value, fn)` — executes `fn` with the variable set to `value`, returns `fn`'s return value
- `get()` — returns the current value, or `defaultValue` if outside any `run()` scope

**Note:** `Variable.run()` takes exactly two arguments (value, fn) per the TC39 spec. Extra arguments are not passed through. `AsyncLocalStorage.run(store, fn, ...args)` wraps the extra args at the compat layer.

### `node:async_hooks` (compat wrapper)

```ts
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

const result = storage.run({ userId: '123' }, async () => {
  await someWork();
  storage.getStore(); // { userId: '123' }
  return 'done';
});
// result is a Promise<'done'>

storage.getStore(); // undefined — outside run scope
```

Internally, `AsyncLocalStorage` delegates to `AsyncContext.Variable`:

```ts
class AsyncLocalStorage {
  #variable = new AsyncContext.Variable();
  run(store, fn, ...args) { return this.#variable.run(store, () => fn(...args)); }
  getStore() { return this.#variable.get(); }
}

// AsyncResource — minimal stub for import compatibility
class AsyncResource {
  constructor(type, opts) { this.type = type; }
  runInAsyncScope(fn, thisArg, ...args) { return fn.apply(thisArg, args); }
  emitDestroy() { return this; }
  asyncId() { return -1; }
  triggerAsyncId() { return -1; }
}
```

---

## Technical Approach

### V8 Promise Hooks via deno_core

V8 exposes `v8::Context::set_promise_hooks()` with four hook callbacks: `init`, `before`, `after`, `resolve`. The Rust `v8` crate (v0.106.0, bundled with deno_core 0.311.0) exposes this method.

**Access path:**
1. Get a `v8::HandleScope` via `runtime.inner_mut().handle_scope()`
2. Get the current context via `scope.get_current_context()`
3. Call `context.set_promise_hooks(init_hook, before_hook, after_hook, resolve_hook)`

**Implementation approach: All-JS via a Rust op**

The context state (`Map<Variable, value>`) lives in JavaScript. A thin Rust op (`op_set_promise_hooks`) wires V8's `set_promise_hooks` to JS callback functions. The JS callbacks manage context snapshots entirely in JS-land.

```
┌─────────────────────────────────────────────┐
│ JavaScript                                   │
│                                              │
│  AsyncContext.Variable                       │
│    - run(value, fn) → set current, call fn   │
│    - get() → read current                    │
│                                              │
│  __promiseInit(promise) →                    │
│    promise.__asyncContext = snapshot()        │
│  __promiseBefore(promise) →                  │
│    restore(promise.__asyncContext)            │
│  __promiseAfter(promise) →                   │
│    restore(previousSnapshot)                 │
│                                              │
│  Deno.core.ops.op_set_promise_hooks(         │
│    __promiseInit, __promiseBefore,            │
│    __promiseAfter, __promiseResolve           │
│  )                                           │
└─────────────┬───────────────────────────────┘
              │ op call
┌─────────────▼───────────────────────────────┐
│ Rust op (thin)                               │
│                                              │
│  fn op_set_promise_hooks(scope, init, ...)   │
│    context.set_promise_hooks(init, ...)      │
└─────────────────────────────────────────────┘
```

**Why all-JS:** The state is entirely in JS, making debugging easier. The Rust op is thin (just wires `set_promise_hooks` to JS callbacks). No cross-boundary state management.

**Context snapshot format:** A `Map<Variable, value>` cloned on promise init. Restoring means replacing the "current context" global pointer. Since V8 is single-threaded, no locking needed.

### Known Limitations

- **`setTimeout`/`setInterval` callbacks**: Promise hooks don't cover timer callbacks. Context will be lost in `storage.run(ctx, () => { setTimeout(() => { storage.getStore(); /* undefined */ }, 0); })`. Fixing this requires wrapping `setTimeout` to snapshot/restore context. Documented as a known limitation; SSR code doesn't use timers inside `run()`.
- **`queueMicrotask` callbacks**: Same issue. Microtasks scheduled via `queueMicrotask()` don't go through promise hooks. Can be addressed by wrapping `queueMicrotask` if needed.
- **`EventEmitter` async listener propagation**: Synchronous listeners called via `emit()` inside a `run()` scope already see the correct context — no special handling needed. However, if a listener is registered with `on()` inside one `run()` scope and `emit()` is called from a different scope (or outside any scope), the listener will see the emitter's context, not the registerer's context. Node.js solves this by capturing context at `on()` time and restoring it at `emit()` time. The V8 promise hooks architecture does NOT preclude this — it's an additive enhancement that wraps `on()`/`addListener()` to snapshot context at registration and `emit()` to restore per-listener context. Tracked as #2106.

---

## Implementation Plan

### Phase 1: AsyncContext.Variable with Correct Async Propagation

**Goal:** Replace the broken stack-based polyfill with a correct implementation using V8 promise hooks.

**Steps:**
1. Write a Rust integration test proving the stack-based polyfill fails with a single async `run()` callback (RED state — the `finally` pops before the first await)
2. Add a Rust op `op_set_promise_hooks` that calls `v8::Context::set_promise_hooks()` with JS function arguments
3. Implement `AsyncContext.Variable` in JS (injected via Rust) with:
   - Constructor: `new Variable({ name?, defaultValue? })`
   - `run(value, fn)` — sets variable, calls fn, returns fn's return value (including Promises)
   - `get()` — returns current value or defaultValue
   - Promise hook callbacks that snapshot/restore the context mapping
4. Write `AsyncLocalStorage` as a wrapper: `run(store, fn, ...args)`, `getStore()`
5. Add stub `AsyncResource` class (no-op for import compat)
6. Delete old `enterWith()`/`disable()` tests from `async_local_storage.rs`
7. Test: single async run, concurrent SSR isolation, nested run, throw cleanup, return value propagation

**Acceptance Criteria:**
```typescript
describe('Phase 1: AsyncContext.Variable with async propagation', () => {
  // Core: async propagation
  describe('Given a Variable with run(value, asyncFn)', () => {
    describe('When the callback awaits', () => {
      it('get() returns the correct value after the await', () => {});
    });
    describe('When the callback contains nested awaits', () => {
      it('get() returns the correct value at each await resumption', () => {});
    });
  });

  // Concurrent isolation
  describe('Given two concurrent async operations using the same Variable', () => {
    describe('When both await inside their run() scope', () => {
      it('each continuation sees its own value (not the others)', () => {});
    });
  });

  // Return value
  describe('Given Variable.run(value, fn)', () => {
    describe('When fn returns a synchronous value', () => {
      it('run() returns that value', () => {});
    });
    describe('When fn returns a Promise', () => {
      it('run() returns that Promise (resolved to the inner value)', () => {});
    });
  });

  // Default value
  describe('Given a Variable with defaultValue', () => {
    describe('When get() is called outside any run()', () => {
      it('returns the defaultValue', () => {});
    });
  });

  // Edge cases
  describe('Given a Variable used outside any run()', () => {
    describe('When get() is called', () => {
      it('returns undefined (no defaultValue)', () => {});
    });
  });

  describe('Given nested run() calls on the same Variable', () => {
    describe('When the inner run completes', () => {
      it('the outer value is restored', () => {});
    });
  });

  describe('Given run() where the callback throws', () => {
    describe('When the error propagates', () => {
      it('the previous value is restored (cleanup)', () => {});
    });
  });

  // Escaped closure (context shouldn't leak)
  describe('Given a closure captured inside run() and called after run() returns', () => {
    describe('When the closure calls get()', () => {
      it('returns undefined (context does not leak via closures)', () => {});
    });
  });

  // AsyncLocalStorage wrapper
  describe('Given AsyncLocalStorage as a wrapper', () => {
    describe('When run(store, fn) is called', () => {
      it('getStore() returns the store inside fn', () => {});
      it('getStore() returns undefined outside fn', () => {});
      it('run() returns the callback return value', () => {});
    });
    describe('When run(store, fn, ...args) is called with extra args', () => {
      it('args are passed to fn', () => {});
    });
  });

  // AsyncResource stub
  describe('Given AsyncResource', () => {
    it('can be constructed without error', () => {});
    it('runInAsyncScope calls the function and returns its value', () => {});
  });
});
```

---

### Phase 2: Wire into Module Loader and Test Runner

**Goal:** Expose `AsyncLocalStorage` as a `node:async_hooks` synthetic module so test code can import it.

**Steps:**
1. Add `node:async_hooks` to the synthetic module map in `module_loader.rs` — re-exports from `globalThis.__vertz_async_hooks` (the hook point already exists in the polyfill)
2. The module exports `AsyncLocalStorage` and `AsyncResource`
3. Expose `AsyncContext` on `globalThis` (the TC39 API)
4. Load the polyfill in the test executor (`executor.rs`, in `execute_test_file_inner()`) — **before** DOM stubs and test harness globals, matching the pattern in `render.rs` line 134 and `persistent_isolate.rs` line 273
5. Run entity-todo SSR tests — they should now load (even if some fail for other reasons)

**Acceptance Criteria:**
```typescript
describe('Phase 2: Module integration', () => {
  describe('Given a test file that imports from node:async_hooks', () => {
    describe('When the test runner loads the file', () => {
      it('resolves the import without error', () => {});
      it('AsyncLocalStorage is a constructor', () => {});
      it('AsyncResource is a constructor', () => {});
    });
  });

  describe('Given entity-todo SSR tests', () => {
    describe('When vertz-runtime test runs ssr.test.ts', () => {
      it('the file loads without "Cannot find module node:async_hooks" error', () => {});
      it('reports per-test pass/fail results (not a load error)', () => {});
    });
  });

  describe('Given globalThis.AsyncContext', () => {
    describe('When accessed in test code', () => {
      it('AsyncContext.Variable is available as a constructor', () => {});
    });
  });
});
```

---

### Phase 3: Update Benchmarks

**Goal:** Re-run the full-stack test benchmark with SSR tests included.

**Steps:**
1. Run all entity-todo tests on the runtime — document new Tier 2 (SSR) results
2. If SSR tests pass, add them to the benchmark suite
3. Update `plans/runtime-fullstack-testing-results.md` with new data

**Acceptance Criteria:**
```typescript
describe('Phase 3: Updated benchmarks', () => {
  describe('Given SSR tests are now runnable', () => {
    it('the results report includes Tier 2 pass/fail data', () => {});
    it('the benchmark includes SSR tests if they pass on both runners', () => {});
  });
});
```

---

## Type Flow Map

N/A — this is a runtime-internal implementation. No TypeScript generics. The only type-level contract is that `AsyncLocalStorage<T>.getStore()` returns `T | undefined`, which is preserved by the wrapper.

## E2E Acceptance Test

```typescript
// The end-to-end test: concurrent SSR isolation on the Vertz runtime
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<{ requestId: string }>();

// Concurrent SSR simulation — the core use case
const results = await Promise.all([
  storage.run({ requestId: 'req-1' }, async () => {
    await new Promise(r => setTimeout(r, 10));
    return storage.getStore()!.requestId;
  }),
  storage.run({ requestId: 'req-2' }, async () => {
    await new Promise(r => setTimeout(r, 10));
    return storage.getStore()!.requestId;
  }),
]);

expect(results[0]).toBe('req-1');
expect(results[1]).toBe('req-2');

// Outside run() returns undefined
expect(storage.getStore()).toBeUndefined();
```

---

## Risks

| Risk | Mitigation |
|---|---|
| V8 promise hooks have performance overhead | Defer measurement. SSR renders create ~10-50 promises per request. Optimization is a separate initiative if needed. |
| `v8::Context::set_promise_hooks()` not accessible through deno_core | The `v8` crate (0.106.0) exposes it directly. Access via `runtime.inner_mut().handle_scope()` → `scope.get_current_context()`. If the Rust binding is missing, fall back to `Promise.prototype.then` monkey-patching (less reliable but zero Rust changes). |
| SSR tests fail for reasons unrelated to async context (e.g., other missing APIs) | Expected. Phase 2 documents what passes and what fails. The goal is to unblock the load error, not guarantee all tests pass. |
| `setTimeout`/`queueMicrotask` don't propagate context | Documented as known limitation. SSR code doesn't use timers inside `run()`. Can be addressed later by wrapping these APIs if needed. |
