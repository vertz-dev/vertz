# Deferred `onMount` — Post-JSX Callback Execution

**Status:** Draft (reviews addressed)
**Issue:** #1526
**Author:** viniciusdacal

---

## Problem

`onMount` currently runs its callback **immediately and synchronously** when called during component body execution. Since `onMount()` is called _before_ the `return` statement, `ref.current` and any DOM elements created by JSX are not yet available:

```tsx
function MyComponent() {
  const elRef = ref();

  onMount(() => {
    elRef.current.focus(); // null — <div> doesn't exist yet
  });

  return <div ref={elRef}>Hello</div>;
}
```

**Execution order today:**
```
Component function called
  → onMount(callback) → callback runs immediately
  → return <div ref={elRef}>...</div>
    → compiler IIFE: el = __element('div'); elRef.current = el; return el;
```

All 21 composed primitives in `@vertz/ui-primitives` work around this with `document.getElementById()` instead of refs — fragile and counter to developer expectations.

---

## API Surface

**No public API change.** `onMount` keeps its existing signature:

```ts
function onMount(callback: () => (() => void) | void): void;
```

The behavioral change: callbacks are deferred to run **after** the component's return JSX has been evaluated (refs set, elements created), but **before** the component function returns to its caller.

### Developer experience — after this change:

```tsx
function MyComponent() {
  const elRef = ref();

  onMount(() => {
    // ref.current is now set
    elRef.current.focus();

    // cleanup still works
    return () => { /* dispose */ };
  });

  return <div ref={elRef}>Hello</div>;
}
```

### What doesn't change:

- `onMount` called outside a component (event handlers, `watch`, etc.) — runs immediately (no mount frame active)
- SSR — still a no-op
- Cleanup registration — still works via disposal scope
- `onCleanup` inside `onMount` — still works

---

## Design

### Approach: Mount frame stack (runtime) + compiler-inserted flush

**Runtime changes** (`packages/ui/src/component/lifecycle.ts`):

```ts
// Module-level stack of mount frames
const mountFrames: Array<Array<() => void>> = [];

export function __pushMountFrame(): void {
  mountFrames.push([]);
}

export function __flushMountFrame(): void {
  const frame = mountFrames.pop();
  if (!frame) return;

  // Execute ALL callbacks even if one throws — collect errors, rethrow first.
  // This prevents one failing onMount from silently killing sibling onMount
  // callbacks in the same component.
  let firstError: unknown;
  for (const cb of frame) {
    try {
      cb();
    } catch (e) {
      if (firstError === undefined) firstError = e;
    }
  }
  if (firstError !== undefined) throw firstError;
}

export function __discardMountFrame(): void {
  // Safe pop — only called in compiler catch path.
  // No-op if frame was already popped by __flushMountFrame.
  mountFrames.pop();
}

export function onMount(callback: () => (() => void) | void): void {
  if (getSSRContext()) return;

  const frame = mountFrames[mountFrames.length - 1];
  if (frame) {
    // Inside a component — defer the callback
    frame.push(() => executeOnMount(callback));
  } else {
    // Outside a component (event handler, watch, etc.) — run immediately
    executeOnMount(callback);
  }
}

// Extracted from current onMount — handles disposal scope + cleanup.
// Note on disposal scope ownership: when deferred, the active disposal scope
// at flush time is the parent scope (e.g., the Fast Refresh wrapper's scope,
// or the render() root scope). Cleanups are forwarded there via _tryOnCleanup.
// If no parent scope exists, cleanups are silently discarded (same as current
// immediate behavior — see lifecycle.test.ts "without parent scope" test).
function executeOnMount(callback: () => (() => void) | void): void {
  const scope = pushScope();
  try {
    const cleanup = untrack(callback);
    if (typeof cleanup === 'function') {
      _tryOnCleanup(cleanup);
    }
  } finally {
    popScope();
    if (scope.length > 0) {
      _tryOnCleanup(() => runCleanups(scope));
    }
  }
}
```

**Compiler changes** (`packages/ui-compiler/src/`):

The compiler already identifies component functions via `ComponentAnalyzer`. After JSX transformation, wrap the component body's return expression:

```ts
// Before (simplified compiler output):
function MyComponent() {
  const elRef = ref();
  onMount(() => { elRef.current.focus(); });
  return (() => {
    const __el0 = __element('div');
    elRef.current = __el0;
    return __el0;
  })();
}

// After (with mount frame):
function MyComponent() {
  __pushMountFrame();
  const elRef = ref();
  onMount(() => { elRef.current.focus(); });
  const __result = (() => {
    const __el0 = __element('div');
    elRef.current = __el0;
    return __el0;
  })();
  __flushMountFrame();
  return __result;
}
```

**New execution order:**
```
Component function called
  → __pushMountFrame()          — new empty frame
  → onMount(callback)           — pushed to frame (NOT executed)
  → __result = IIFE {
      el = __element('div')
      elRef.current = el         — ref is set
      return el
    }
  → __flushMountFrame()         — runs callback, ref.current available
  → return __result
```

### Nested components

Child components rendered via JSX (`<Child />`) get their own mount frame. The child's `__pushMountFrame` / `__flushMountFrame` pair is fully scoped — child callbacks flush when child JSX is ready, parent callbacks flush when parent JSX is ready:

```
Parent()
  → __pushMountFrame()        — parent frame [0]
  → onMount(parentCb)         — pushed to frame [0]
  → __result = IIFE {
      <Child />  →  Child()
        → __pushMountFrame()    — child frame [1]
        → onMount(childCb)      — pushed to frame [1]
        → childResult = IIFE { ... }
        → __flushMountFrame()   — runs childCb (child frame [1])
        → return childResult
      __append(parent, childResult)
    }
  → __flushMountFrame()       — runs parentCb (parent frame [0])
  → return __result
```

### Error handling

Three error scenarios must be handled correctly:

**1. Component body throws before reaching flush:**
The frame leaks on the stack. The compiler wraps the body with try/catch and calls `__discardMountFrame()` (safe pop, no-op if already popped):

```ts
function MyComponent() {
  __pushMountFrame();
  try {
    // ... component body ...
    const __result = /* JSX IIFE */;
    __flushMountFrame();
    return __result;
  } catch (__e) {
    __discardMountFrame(); // safe pop — no-op if __flushMountFrame already popped
    throw __e;
  }
}
```

**2. A deferred `onMount` callback throws during flush:**
`__flushMountFrame` pops the frame first, then executes callbacks. If a callback throws, the frame is already off the stack — no leak, no double-pop. All remaining callbacks still execute (error collection pattern). The first error is rethrown after all callbacks run. The compiler's catch calls `__discardMountFrame()` which is a no-op (frame already popped by flush).

**3. HMR Fast Refresh re-mount throws:**
The FR wrapper calls the compiled component via `factory(...args)`. The compiled component has its own try/catch that handles mount frame cleanup. The FR wrapper's outer error handling (which calls `runCleanups` + `popScope`) does not interact with the mount frame stack. Since `__discardMountFrame()` is a safe no-op when the stack is empty, there is no corruption risk.

---

## Manifesto Alignment

**"Explicit over implicit"** — `onMount` means "run when mounted." Today it runs before mount is complete, violating the name's contract. This fix makes the behavior match the name.

**"Compile-time over runtime"** — The compiler inserts the frame management. Developers don't need to think about timing — the compiler ensures correct execution order.

**"One way to do things"** — Eliminates the `document.getElementById()` workaround pattern used in all 21 composed primitives. After this change, `ref` + `onMount` is the one correct way.

**"Predictability over convenience"** — Developers expect `onMount` to run after DOM elements exist. The timing is synchronous, post-DOM-creation, pre-paint — analogous to React's `useLayoutEffect`, not `useEffect` (which is async/post-paint). This distinction matters: refs are guaranteed available, but long-running callbacks will block paint.

---

## Non-Goals

- **Making `onMount` async** — callbacks remain synchronous (like `useLayoutEffect`, not `useEffect`). No microtask delay.
- **Changing `lifecycleEffect`** — internal API, used by `query()`. Unaffected.
- **Removing `document.getElementById` from primitives** — that's a follow-up cleanup. A separate issue must be created as part of Phase 4 completion criteria to track the migration of all 21+ composed primitives to `ref` + `onMount`.
- **Injecting mount frames in non-compiled code** — `.ts` files don't go through the compiler, so no mount frames are injected. However, `onMount` called from a `.ts` utility hook that is invoked *within* a compiled component WILL correctly defer (the mount frame stack is a runtime mechanism — the calling component's frame is active). Only truly standalone `onMount` calls (top-level module code, event handlers, `watch` callbacks) run immediately.

---

## Unknowns

### 1. Performance of the stack approach

**Risk:** Low. Mount frames are arrays of callbacks. Push/pop is O(1). The stack depth equals component nesting depth (typically < 20).

**Resolution:** Benchmark after implementation. If measurable, switch to a linked-list approach.

### 2. Library code compiled with `createVertzLibraryPlugin`

**Question:** Do library packages (`ui-primitives`, `theme-shadcn`) get the mount frame injection?

**Answer:** Yes — `createVertzLibraryPlugin()` runs the full compiler pipeline on `.tsx` files. Library components will get `__pushMountFrame` / `__flushMountFrame` injected automatically.

### 3. Backward compatibility for non-component `onMount` usage

**Question:** Is `onMount` ever called outside component functions where immediate execution is expected?

**Analysis:** The SSR safety diagnostics suggest `onMount` as a safe scope for browser APIs. If someone calls `onMount` in a plain `.ts` utility function (no compiler), it should still work. The fallback (no active frame → immediate execution) handles this.

---

## Type Flow Map

No generics involved. `onMount` signature is unchanged:

```ts
onMount(callback: () => (() => void) | void): void
```

The new internal helpers are non-generic:

```ts
__pushMountFrame(): void
__flushMountFrame(): void
```

No type flow verification needed beyond confirming the existing signature still compiles.

---

## E2E Acceptance Test

```tsx
import { describe, it, expect } from 'bun:test';

describe('Feature: Deferred onMount', () => {
  describe('Given a component with ref and onMount', () => {
    describe('When the component is rendered', () => {
      it('Then ref.current is available inside onMount callback', () => {
        let capturedRef: HTMLElement | undefined;

        function TestComponent() {
          const elRef = ref<HTMLDivElement>();

          onMount(() => {
            capturedRef = elRef.current;
          });

          return <div ref={elRef}>Hello</div>;
        }

        render(TestComponent);
        expect(capturedRef).toBeDefined();
        expect(capturedRef!.tagName).toBe('DIV');
      });
    });
  });

  describe('Given a component with onMount cleanup', () => {
    describe('When the component is unmounted', () => {
      it('Then cleanup function runs', () => {
        let cleaned = false;

        function TestComponent() {
          onMount(() => {
            return () => { cleaned = true; };
          });

          return <div>Hello</div>;
        }

        const dispose = render(TestComponent);
        expect(cleaned).toBe(false);
        dispose();
        expect(cleaned).toBe(true);
      });
    });
  });

  describe('Given nested components with onMount', () => {
    describe('When both are rendered', () => {
      it('Then child onMount runs before parent onMount', () => {
        const order: string[] = [];

        function Child() {
          const elRef = ref<HTMLSpanElement>();
          onMount(() => {
            order.push('child');
            expect(elRef.current).toBeDefined();
          });
          return <span ref={elRef}>Child</span>;
        }

        function Parent() {
          const elRef = ref<HTMLDivElement>();
          onMount(() => {
            order.push('parent');
            expect(elRef.current).toBeDefined();
          });
          return <div ref={elRef}><Child /></div>;
        }

        render(Parent);
        expect(order).toEqual(['child', 'parent']);
      });
    });
  });

  describe('Given onMount called outside a component', () => {
    describe('When invoked directly', () => {
      it('Then runs immediately (backward compat)', () => {
        let ran = false;
        onMount(() => { ran = true; });
        expect(ran).toBe(true);
      });
    });
  });

  describe('Given SSR context', () => {
    describe('When a component with onMount is rendered', () => {
      it('Then onMount callback is not executed', () => {
        let ran = false;
        // Simulate SSR context active
        withSSRContext(() => {
          onMount(() => { ran = true; });
        });
        expect(ran).toBe(false);
      });
    });
  });

  describe('Given components rendered inside .map()', () => {
    describe('When each component has onMount', () => {
      it('Then each component gets its own mount frame', () => {
        const mounted: string[] = [];

        function Item({ id }: { id: string }) {
          const elRef = ref<HTMLLIElement>();
          onMount(() => {
            expect(elRef.current).toBeDefined();
            mounted.push(id);
          });
          return <li ref={elRef}>{id}</li>;
        }

        function List() {
          const items = ['a', 'b', 'c'];
          return <ul>{items.map((id) => <Item id={id} />)}</ul>;
        }

        render(List);
        expect(mounted).toEqual(['a', 'b', 'c']);
      });
    });
  });

  describe('Given multiple onMount calls where one throws', () => {
    describe('When the component is rendered', () => {
      it('Then all callbacks execute and the first error is rethrown', () => {
        let firstRan = false;
        let thirdRan = false;

        function TestComponent() {
          onMount(() => { firstRan = true; });
          onMount(() => { throw new Error('boom'); });
          onMount(() => { thirdRan = true; });
          return <div>Hello</div>;
        }

        expect(() => render(TestComponent)).toThrow('boom');
        expect(firstRan).toBe(true);
        expect(thirdRan).toBe(true); // all callbacks run despite error
      });
    });
  });
});

// Type test — signature unchanged
// @ts-expect-error — onMount requires a callback
onMount();
```

---

## Design Decisions

### 1. Unconditional vs conditional injection

**Option A (unconditional):** Always inject `__pushMountFrame` / `__flushMountFrame` into every component, regardless of whether it calls `onMount`.

- Pro: Simpler compiler logic — no need to detect `onMount` usage (which could be indirect via a utility function)
- Pro: Works with dynamic patterns like `if (condition) onMount(cb)`
- Con: Every component pays the cost of pushing/popping an empty array

**Option B (conditional):** Only inject when the compiler detects `onMount` in the component body.

- Pro: Zero overhead for components that don't use `onMount`
- Con: Misses indirect usage (`useMyHook()` internally calls `onMount`)
- Con: Requires import analysis (what if `onMount` is aliased?)

**Recommendation:** Option A (unconditional). The runtime cost is negligible (push/pop an empty array is ~nanoseconds), and it avoids an entire class of false-negative bugs. The compiler already injects signal/computed transforms unconditionally when a variable matches — same principle.

### 2. Multiple return statements

Components may have early returns with JSX:

```tsx
function MyComponent({ error }: Props) {
  onMount(() => { /* ... */ });

  if (error) return <div>Error</div>;
  return <div>OK</div>;
}
```

The compiler must insert `__flushMountFrame()` before **every** return path that has been JSX-transformed, not just the final one. The generated output:

```ts
function MyComponent({ error }: Props) {
  __pushMountFrame();
  try {
    onMount(() => { /* ... */ });

    if (error) {
      const __result = (() => { /* Error JSX IIFE */ })();
      __flushMountFrame();
      return __result;
    }
    const __result = (() => { /* OK JSX IIFE */ })();
    __flushMountFrame();
    return __result;
  } catch (__e) {
    __discardMountFrame(); // safe no-op if __flushMountFrame already popped
    throw __e;
  }
}
```

The try/catch guards against exceptions thrown between push and flush. Each return path flushes independently. `__flushMountFrame` pops the frame first, then executes callbacks — so `__discardMountFrame` in the catch is a safe no-op if flush was already reached (no double-pop risk).

**Implementation note:** The compiler should detect `ReturnStatement` nodes within the component body and wrap each with the `const __result = <expr>; __flushMountFrame(); return __result;` pattern. The `JsxTransformer` already replaces JSX in all positions; a new `MountFrameTransformer` should run **after** JSX transform and wrap return statements.

### 3. Arrow functions with expression bodies

```tsx
const MyComponent = () => <div>Hello</div>;
```

The compiler currently transforms this into an IIFE. With mount frames, the expression body needs to become a block body:

```ts
const MyComponent = () => {
  __pushMountFrame();
  try {
    const __result = (() => { /* JSX IIFE */ })();
    __flushMountFrame();
    return __result;
  } catch (__e) {
    __discardMountFrame();
    throw __e;
  }
};
```

This is a structural change that the `MountFrameTransformer` must handle for arrow functions with expression bodies.

---

## Implementation Plan

### Phase 1: Runtime mount frame stack

**Files changed:**
- `packages/ui/src/component/lifecycle.ts` — add mount frame stack, modify `onMount`, extract `executeOnMount`
- `packages/ui/src/internals.ts` — export `__pushMountFrame`, `__flushMountFrame`, and `__discardMountFrame`
- `packages/ui/src/component/__tests__/lifecycle.test.ts` — new tests for deferred behavior

**Acceptance criteria:**
```typescript
describe('Feature: Mount frame stack', () => {
  describe('Given an active mount frame', () => {
    describe('When onMount is called', () => {
      it('Then defers the callback until __flushMountFrame', () => {})
    })
  })

  describe('Given no active mount frame', () => {
    describe('When onMount is called', () => {
      it('Then runs the callback immediately (backward compat)', () => {})
    })
  })

  describe('Given nested mount frames (parent + child)', () => {
    describe('When both are flushed', () => {
      it('Then child callbacks run on child flush, parent on parent flush', () => {})
    })
  })

  describe('Given a mount frame where a callback throws', () => {
    describe('When __flushMountFrame is called', () => {
      it('Then the frame is still popped (no leak)', () => {})
      it('Then all remaining callbacks still execute', () => {})
      it('Then the first error is rethrown after all callbacks run', () => {})
    })
  })

  describe('Given __discardMountFrame called after __flushMountFrame', () => {
    describe('When the frame was already popped by flush', () => {
      it('Then __discardMountFrame is a safe no-op (no double-pop)', () => {})
    })
  })

  describe('Given SSR context is active', () => {
    describe('When onMount is called with an active frame', () => {
      it('Then callback is not deferred and not executed (SSR no-op)', () => {})
    })
  })

  describe('Given a deferred onMount with cleanup return', () => {
    describe('When the scope is disposed', () => {
      it('Then cleanup runs', () => {})
    })
  })
})
```

- All existing `onMount` tests still pass (they call `onMount` outside components → no frame → immediate execution)

### Phase 2: Compiler injection — MountFrameTransformer

**Files changed:**
- `packages/ui-compiler/src/transformers/mount-frame-transformer.ts` — new transformer
- `packages/ui-compiler/src/compiler.ts` — add `__pushMountFrame`, `__flushMountFrame`, and `__discardMountFrame` to `DOM_HELPERS`, wire in transformer after JSX transform
- `packages/ui-compiler/src/transformers/__tests__/mount-frame-transformer.test.ts` — snapshot tests

**Acceptance criteria:**
```typescript
describe('Feature: Mount frame compiler injection', () => {
  describe('Given a component with a single return statement', () => {
    describe('When compiled', () => {
      it('Then wraps body with __pushMountFrame / try-catch / __flushMountFrame', () => {})
    })
  })

  describe('Given a component with multiple return statements (early returns)', () => {
    describe('When compiled', () => {
      it('Then inserts __flushMountFrame before each return', () => {})
    })
  })

  describe('Given an arrow component with expression body', () => {
    describe('When compiled', () => {
      it('Then converts to block body with mount frame wrapping', () => {})
    })
  })

  describe('Given a component that does NOT use onMount', () => {
    describe('When compiled', () => {
      it('Then still injects mount frame (unconditional)', () => {})
    })
  })

  describe('Given auto-imports', () => {
    describe('When __pushMountFrame, __flushMountFrame, or __discardMountFrame appear in output', () => {
      it('Then they are imported from @vertz/ui/internals', () => {})
    })
  })
})
```

### Phase 3: Integration tests (E2E with compiler + runtime)

**Files changed:**
- `packages/ui/src/component/__tests__/on-mount-integration.test.tsx` — compiled `.tsx` test file exercising real components

**Acceptance criteria:**
- E2E tests from the acceptance test section above
- Ref is available inside `onMount` callback
- Nested parent/child execution order is correct (child first, parent second)
- Components rendered inside `.map()` each get their own mount frame
- Multiple `onMount` callbacks where one throws — all execute, first error rethrown
- Cleanup registration works with deferred callbacks
- SSR behavior unchanged (still no-op)
- All composed primitives still work (`document.getElementById` is unaffected)
- All existing tests across the monorepo still pass

### Phase 4: Full validation — unit tests, integration tests, and E2E

This phase is a hard gate: **nothing ships until every test suite passes.** `onMount` is a foundational lifecycle hook — any regression could silently break components, SSR, or hydration across the entire framework.

**Validation steps (all must pass):**

1. **Unit tests (all packages):**
   ```bash
   bun test
   ```

2. **Typecheck (all packages):**
   ```bash
   bun run typecheck
   ```

3. **Lint:**
   ```bash
   bun run lint
   ```

4. **Integration tests (framework-level):**
   ```bash
   cd packages/integration-tests && bun test --timeout 120000
   ```

5. **E2E — task-manager example** (SSR, routing, forms, lifecycle, settings):
   ```bash
   cd examples/task-manager && npx playwright test
   ```

6. **E2E — component-catalog** (accordion, dialog, popover, sheet, toast, alert-dialog):
   ```bash
   cd examples/component-catalog && npx playwright test
   ```

7. **E2E — entity-todo** (CRUD flow):
   ```bash
   cd examples/entity-todo && npx playwright test
   ```

8. **E2E — linear example** (full app flow):
   ```bash
   cd examples/linear && npx playwright test
   ```

9. **E2E — benchmarks** (counter, hydration, navigation, SSR, timer):
   ```bash
   cd benchmarks/vertz && bun run e2e
   ```

**Why every E2E suite matters:** The mount frame change affects how every compiled component initializes. Playwright tests exercise the full stack (compiler → SSR → hydration → client-side interactivity). A subtle timing regression in `onMount` could break hydration, dialog stacks, route transitions, or form initialization — none of which would show up in unit tests alone.

**If any E2E test fails:** Investigate whether the failure is pre-existing (check `origin/main`) or introduced by this change. Pre-existing failures get documented as issues. Introduced failures must be fixed before merge.

### Phase 5 (follow-up, separate issue): Primitive cleanup

- Replace `document.getElementById()` workarounds in composed primitives with `ref` + `onMount`
- This is a large diff touching 21+ files — separate PR

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Breaking non-compiled `onMount` calls | Low | Fallback to immediate execution when no frame active |
| Stack leak on component error | Medium | `__discardMountFrame()` in compiler catch path; safe no-op if already popped |
| Double-pop corrupting parent frame | Medium | `__flushMountFrame` pops first; `__discardMountFrame` is a safe no-op after |
| Callback throw kills sibling callbacks | Medium | Error collection pattern — all callbacks execute, first error rethrown |
| Multiple return paths missed | Medium | Compiler walks all ReturnStatement nodes in component body |
| Arrow expression body transform | Medium | Explicit handling in MountFrameTransformer |
| HMR re-mount error path | Medium | Compiled component's internal try/catch handles its own frame cleanup; FR wrapper's error handling does not touch mount frame stack. `__discardMountFrame` is safe no-op. |
| SSR concurrent request isolation | Low | Mount frame stack is module-level, not per-request. Safe because SSR is synchronous within each ALS run and `onMount` is a no-op during SSR (never enqueues callbacks). Document as known limitation — if SSR becomes concurrent, mount frames would need per-request isolation (like disposal already has). |
| Performance regression from frame management | Low | Benchmark; push/pop empty array is ~nanoseconds |
| Library packages not getting injection | Low | `createVertzLibraryPlugin` runs full compiler pipeline |
