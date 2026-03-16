# Fix: Composed Primitives Event Listener Cleanup (#1340)

## Problem

Composed primitives (dialog, alert-dialog, sheet, dropdown-menu, popover) add event listeners via `addEventListener()` on slot-scanned elements but never call `removeEventListener()`. If the root element is removed from DOM but trigger/content elements are retained by other references, listeners leak.

### Affected Files

| File | Listeners | Cleanup |
|------|-----------|---------|
| `dialog-composed.tsx` | 2 (trigger click, content delegation) + optional closeIcon click | None |
| `alert-dialog-composed.tsx` | 2 (trigger click, content delegation) | None |
| `sheet-composed.tsx` | 2 (trigger click, content delegation) | None |
| `dropdown-menu-composed.tsx` | 1 (trigger click) | None |
| `popover-composed.tsx` | 1 (trigger click) | None |

**Excluded:** `slider-composed.tsx` — its `pointermove`/`pointerup` listeners are registered per-drag interaction and self-clean on `pointerup`. These are not indefinitely-retained mount-time listeners; they don't leak.

## API Surface

No public API changes. The fix is purely internal — adding cleanup registration to existing composed primitive Root functions.

### Before (current)

```ts
// dialog-composed.tsx line 181
userTrigger.addEventListener('click', () => {
  if (dialog.state.open.peek()) dialog.hide();
  else dialog.show();
});
```

### After (proposed)

```ts
import { _tryOnCleanup } from '@vertz/ui/internals';

// Store handler reference for cleanup
const handleTriggerClick = () => {
  if (dialog.state.open.peek()) dialog.hide();
  else dialog.show();
};
userTrigger.addEventListener('click', handleTriggerClick);
_tryOnCleanup(() => userTrigger.removeEventListener('click', handleTriggerClick));
```

## Approach

Use `_tryOnCleanup()` from `@vertz/ui/internals` (already a dependency of `@vertz/ui-primitives`) to register `removeEventListener` calls for every `addEventListener` in composed Root functions.

### Pattern

For each `addEventListener` call:
1. Extract the anonymous handler into a named `const`
2. Call `addEventListener` with the named handler
3. Call `_tryOnCleanup(() => el.removeEventListener(event, handler))`

### Why `_tryOnCleanup` and not `onCleanup`

`_tryOnCleanup` silently discards if no scope is active. This is consistent with how all other framework internals handle cleanup (`domEffect`, `watch`, `__list` all use `_tryOnCleanup`). In production via `mount()`, a disposal scope is always active, so cleanup is registered. In tests that call component functions directly (without `pushScope`/`popScope`), the cleanup is silently discarded — no worse than current behavior. Using `onCleanup` (which throws) would break all existing composed primitive tests.

## Non-Goals

- **Low-level primitives** (tabs.tsx, radio.tsx, calendar.tsx) — separate issue, different pattern
- **Changing how composed primitives wire events** — we're adding cleanup, not refactoring the wiring
- **Adding `AbortController` pattern** — overkill for this; named function + removeEventListener is simpler and consistent with existing patterns (dismiss.ts, focus.ts)

## Manifesto Alignment

- **Explicit over implicit** — cleanup is explicit via `onCleanup()`, not relying on GC or DOM removal
- **If you can't test it, don't build it** — each composed primitive gets a cleanup test

## Implementation Plan

### Single Phase — Add cleanup to all 5 composed primitives

For each of the 5 composed primitives:
1. **RED**: Write a test that verifies `removeEventListener` is called when cleanups run
2. **GREEN**: Add `onCleanup()` registration with named handlers
3. **Refactor**: Extract handler names consistently

### Acceptance Criteria

```typescript
describe('Feature: Composed primitive event listener cleanup (#1340)', () => {
  describe('Given a composed dialog with trigger and content', () => {
    describe('When the disposal scope cleanups are run', () => {
      it('Then removeEventListener is called for the trigger click handler', () => {})
      it('Then removeEventListener is called for the content delegation handler', () => {})
    })
  })

  describe('Given a composed dialog with a closeIcon', () => {
    describe('When the disposal scope cleanups are run', () => {
      it('Then removeEventListener is called for the closeIcon click handler', () => {})
    })
  })

  // Same pattern for alert-dialog, sheet, dropdown-menu, popover
})
```

## Type Flow Map

No generics introduced — this is purely runtime cleanup logic.

## E2E Acceptance Test

From a developer perspective: mount a composed dialog inside a disposal scope, trigger cleanup, verify no lingering event listeners.

```typescript
const scope = pushScope();
const root = ComposedDialog({ children: () => [...], classes: {} });
container.appendChild(root);
popScope();

// Spy on removeEventListener before cleanup
const trigger = root.querySelector('[aria-haspopup]')!;
const spy = vi.spyOn(trigger, 'removeEventListener');

runCleanups(scope);

expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
```

## Unknowns

None identified. The pattern is straightforward and consistent with existing cleanup patterns in the codebase.
