# Phase 1: Runtime `__formOnChange` Helper

## Context

This is the first phase of the form-level onChange with per-input debounce feature (#2151). This phase delivers the runtime helper that wires up form-level change detection with debounce support via event delegation.

Design doc: `plans/form-onchange-debounce.md`

## Tasks

### Task 1: `FormValues` type + `__formOnChange` runtime function

**Files:**
- `packages/ui/src/dom/form-on-change.ts` (new)
- `packages/ui/src/dom/__tests__/form-on-change.test.ts` (new)

**What to implement:**

Create the `__formOnChange` runtime helper that:
1. Exports a `FormValues` interface: `{ [key: string]: string }`
2. Implements `__formOnChange(form: HTMLFormElement, handler: (values: FormValues) => void): () => void`
3. Listens to `input` events on the form via event delegation (NOT `change` — avoids double-fire)
4. Listens to `reset` events on the form to handle `form.reset()`
5. For each `input` event:
   - Checks `event.target` is an `HTMLInputElement`, `HTMLTextAreaElement`, or `HTMLSelectElement` (via `instanceof`)
   - Reads `data-vertz-debounce` attribute from the target
   - If `debounceMs > 0`: clears existing timer for that input `name`, sets a new timer that calls `scheduleFlush()`
   - If `debounceMs <= 0` or no attribute: calls `scheduleFlush()` immediately
6. `scheduleFlush()` uses `queueMicrotask` to batch multiple events in the same tick
7. `flush()` cancels ALL pending debounce timers before calling the handler (immediate flush subsumes pending debounces)
8. `flush()` collects values via `formDataToObject(new FormData(form))` and calls the handler
9. Registers cleanup via `_tryOnCleanup` (removes event listeners, clears timers)
10. Returns a cleanup function

**Imports needed:**
- `_tryOnCleanup` from `../runtime/disposal`
- `formDataToObject` from `../form/form-data`

**Acceptance criteria:**

```typescript
describe('Feature: __formOnChange runtime helper', () => {
  describe('Given a form with __formOnChange wired up', () => {
    describe('When an input without debounce fires an input event', () => {
      it('Then handler fires with all form values on next microtask', () => {});
    });

    describe('When an input with data-vertz-debounce="300" fires an input event', () => {
      it('Then handler does NOT fire immediately', () => {});
      it('Then handler fires after 300ms with all form values', () => {});
    });

    describe('When a debounced input fires rapidly', () => {
      it('Then handler fires only once after debounce period', () => {});
    });

    describe('When a non-debounced select fires after a debounced input is pending', () => {
      it('Then handler fires once immediately (pending timer canceled)', () => {});
    });
  });

  describe('Given form.reset() is called', () => {
    it('Then handler fires with the reset values', () => {});
  });

  describe('Given cleanup is called', () => {
    it('Then event listeners are removed', () => {});
    it('Then pending debounce timers are cleared', () => {});
    it('Then no handler fires after cleanup', () => {});
  });

  describe('Given event target has no name attribute', () => {
    it('Then handler does not fire', () => {});
  });

  describe('Given event target is not a form element (e.g. div)', () => {
    it('Then handler does not fire', () => {});
  });

  describe('Given debounce={0} is set explicitly', () => {
    it('Then handler fires immediately (0 is treated as no debounce)', () => {});
  });

  describe('Given a checkbox inside the form', () => {
    it('Then checked checkbox value is included in FormValues', () => {});
    it('Then unchecked checkbox key is absent from FormValues', () => {});
  });
});
```

---

### Task 2: Export from internals and public API

**Files:**
- `packages/ui/src/internals.ts` (modified)
- `packages/ui/src/index.ts` (modified)
- `packages/ui/src/dom/index.ts` (modified — if barrel exists)

**What to implement:**

1. Add `export { __formOnChange } from './dom/form-on-change';` to `packages/ui/src/internals.ts` (alongside other DOM helpers like `__on`, `__attr`, etc.)
2. Add `export type { FormValues } from './dom/form-on-change';` to `packages/ui/src/index.ts` (public type export, alongside other form exports)

**Acceptance criteria:**
- [ ] `import { __formOnChange } from '@vertz/ui/internals'` resolves correctly
- [ ] `import type { FormValues } from '@vertz/ui'` resolves correctly
- [ ] `vtz run typecheck` passes for `packages/ui`
