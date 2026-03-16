# Move Event Wiring & Attr Forwarding to ui-primitives

**Issue:** [#1341](https://github.com/vertz-dev/vertz/issues/1341)
**Type:** Internal refactoring
**Breaking Changes:** None — `event-handlers.ts` is not part of `theme-shadcn`'s public API.

## Problem

`@vertz/theme-shadcn` currently owns DOM behavior that belongs in `@vertz/ui-primitives`:

- `wireEventHandlers()` — wires `on*` props as `addEventListener` calls
- `isKnownEventHandler()` — discriminates event handler keys from attribute keys
- `ElementEventHandlers` — typed interface for event handler props
- The `for (const [key, val] of Object.entries(rest))` attr loop with event-handler guard — duplicated across Button, Input, Textarea

The theme should be a thin styling layer. All DOM behavior (event wiring, attribute forwarding) should live in `@vertz/ui-primitives`.

## API Surface

### New: `@vertz/ui-primitives/utils` additions

```ts
// packages/ui-primitives/src/utils/event-handlers.ts — moved from theme-shadcn

export interface ElementEventHandlers {
  onClick?: (event: MouseEvent) => void;
  onDblClick?: (event: MouseEvent) => void;
  onMouseDown?: (event: MouseEvent) => void;
  onMouseUp?: (event: MouseEvent) => void;
  onMouseEnter?: (event: MouseEvent) => void;
  onMouseLeave?: (event: MouseEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onKeyUp?: (event: KeyboardEvent) => void;
  onPointerDown?: (event: PointerEvent) => void;
  onPointerUp?: (event: PointerEvent) => void;
  onInput?: (event: InputEvent) => void;
  onChange?: (event: Event) => void;
}

export function wireEventHandlers(el: HTMLElement, handlers: ElementEventHandlers): void;
export function isKnownEventHandler(key: string): boolean;
```

### New: `applyProps()` — combines event wiring and attribute forwarding

```ts
// packages/ui-primitives/src/utils/props.ts

/**
 * Apply a bag of props to a DOM element: wire on* event handlers via addEventListener,
 * then forward remaining keys as HTML attributes (delegating to applyAttrs).
 *
 * Use applyAttrs directly if your props bag contains no event handlers.
 *
 * Designed for imperative .ts theme components. JSX .tsx components compiled by Vertz
 * do not need this — the compiler handles event wiring automatically.
 */
export function applyProps(el: HTMLElement, props: Record<string, unknown>): void;
```

`applyProps` filters out event handler keys, calls `wireEventHandlers` with them, then passes the remaining props to `applyAttrs`. It does NOT duplicate `applyAttrs` logic — it delegates to it, inheriting class merging, style merging, and null-skipping behavior.

**`rest` invariant:** `applyProps` is designed to receive the `...rest` bag *after* components have destructured their known props (intent, size, className, class, children, disabled, etc.). If `className`/`class` leaks into `rest`, `applyAttrs` will safely merge-append it to the element's existing class.

### Changed: theme-shadcn components import from `@vertz/ui-primitives`

```ts
// Before (theme-shadcn/src/components/button.ts)
import type { ElementEventHandlers } from '../event-handlers';
import { isKnownEventHandler, wireEventHandlers } from '../event-handlers';
// ...
wireEventHandlers(el, rest as ElementEventHandlers);
for (const [key, value] of Object.entries(rest)) {
  if (value === undefined || value === null) continue;
  if (isKnownEventHandler(key)) continue;
  el.setAttribute(key, String(value));
}

// After
import { applyProps } from '@vertz/ui-primitives/utils';
// ...
applyProps(el, rest);
```

Same change for Input and Textarea — the 6-line wireEventHandlers+loop block becomes a single `applyProps(el, rest)` call.

### Exports

- `ElementEventHandlers`, `wireEventHandlers`, `isKnownEventHandler` → exported from `@vertz/ui-primitives/utils`
- `applyProps` → exported from `@vertz/ui-primitives/utils`
- `applyAttrs` → exported from `@vertz/ui-primitives/utils` (currently only internal; promoted for consistency)
- `ElementAttrs` type → exported from both `@vertz/ui-primitives` index (existing) and `@vertz/ui-primitives/utils`
- `ElementEventHandlers` type → exported from both `@vertz/ui-primitives` index and `@vertz/ui-primitives/utils`

This gives theme authors a consistent toolkit from a single import path: `applyProps` for the common case, `applyAttrs` and `wireEventHandlers` for fine-grained control.

## Manifesto Alignment

- **Principle: Separation of Concerns** — theme packages are styling layers, primitives own DOM behavior
- **Principle: DRY** — eliminates the duplicated 6-line event+attr pattern across 3 components
- **Tradeoff: None significant** — this is a pure internal refactoring with no API change

## Non-Goals

- Converting theme-shadcn components from imperative `.ts` to declarative `.tsx` (separate issue)
- Adding new event handler types beyond what's currently supported (backwards-compatible addition later)
- Changing `applyAttrs` behavior (it stays as-is, `applyProps` composes it)
- Unifying `ElementAttrs & ElementEventHandlers` into a single combined interface

## Verified Out-of-Scope

- **AlertDialog.Action / AlertDialog.Cancel** — these delegate to ui-primitives composed components, they do NOT have inline event wiring
- **Pagination** — uses direct `addEventListener` for internal click handlers (different pattern, not prop-forwarding)
- Only Button, Input, and Textarea use the `wireEventHandlers`+loop pattern

## Unknowns

None identified — straightforward code move + composition.

## Type Flow Map

```
ElementEventHandlers (ui-primitives/utils/event-handlers.ts)
  → ButtonProps extends ElementEventHandlers (theme-shadcn/components/button.ts)
  → InputProps extends ElementEventHandlers (theme-shadcn/components/input.ts)
  → TextareaProps extends ElementEventHandlers (theme-shadcn/components/textarea.ts)
```

No new generics introduced.

## E2E Acceptance Test

```ts
describe('Feature: Event wiring lives in ui-primitives', () => {
  describe('Given wireEventHandlers imported from @vertz/ui-primitives/utils', () => {
    describe('When wiring onClick on a button element', () => {
      it('Then fires the handler on click', () => {
        const el = document.createElement('button');
        let clicked = false;
        wireEventHandlers(el, { onClick: () => { clicked = true; } });
        el.click();
        expect(clicked).toBe(true);
      });
    });
  });

  describe('Given applyProps from @vertz/ui-primitives/utils', () => {
    describe('When called with event handlers and attributes', () => {
      it('Then wires events and sets attributes in one call', () => {
        const el = document.createElement('button');
        let clicked = false;
        applyProps(el, {
          onClick: () => { clicked = true; },
          'data-testid': 'my-btn',
          'aria-label': 'Close',
        });
        el.click();
        expect(clicked).toBe(true);
        expect(el.getAttribute('data-testid')).toBe('my-btn');
        expect(el.getAttribute('aria-label')).toBe('Close');
      });
    });
  });

  describe('Given theme-shadcn Button using applyProps', () => {
    describe('When passing onClick and data-testid props', () => {
      it('Then the button fires onClick and has the attribute', () => {
        const Button = createButtonComponent(buttonStyles);
        let clicked = false;
        const el = Button({ onClick: () => { clicked = true; }, 'data-testid': 'btn' });
        el.click();
        expect(clicked).toBe(true);
        expect(el.getAttribute('data-testid')).toBe('btn');
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: Move event-handlers to ui-primitives + add applyProps

**Files:**
- `packages/ui-primitives/src/utils/event-handlers.ts` (new — moved from theme-shadcn)
- `packages/ui-primitives/src/utils/__tests__/event-handlers.test.ts` (new — moved from theme-shadcn)
- `packages/ui-primitives/src/utils/props.ts` (new — `applyProps` combining events + attrs)
- `packages/ui-primitives/src/utils/__tests__/props.test.ts` (new)
- `packages/ui-primitives/src/utils.ts` (modified — add exports)
- `packages/ui-primitives/src/index.ts` (modified — add `ElementEventHandlers` type export)

**Acceptance criteria:**
```ts
describe('Feature: wireEventHandlers in ui-primitives', () => {
  // All existing event-handlers.test.ts tests pass with new import path
});

describe('Feature: applyProps combines events + attrs', () => {
  describe('Given a DOM element and mixed props', () => {
    describe('When calling applyProps', () => {
      it('Then wires event handlers', () => {});
      it('Then sets data-* attributes', () => {});
      it('Then sets aria-* attributes', () => {});
      it('Then skips null/undefined values', () => {});
      it('Then does not set event handlers as attributes', () => {});
      it('Then merges class into existing class (delegates to applyAttrs)', () => {});
      it('Then appends style to existing style (delegates to applyAttrs)', () => {});
    });
  });
});
```

### Phase 2: Update theme-shadcn to import from ui-primitives

**Files:**
- `packages/theme-shadcn/src/components/button.ts` (modified — use `applyProps`)
- `packages/theme-shadcn/src/components/input.ts` (modified — use `applyProps`)
- `packages/theme-shadcn/src/components/textarea.ts` (modified — use `applyProps`)
- `packages/theme-shadcn/src/event-handlers.ts` (deleted)
- `packages/theme-shadcn/src/__tests__/event-handlers.test.ts` (deleted)

**Acceptance criteria:**
```ts
describe('Feature: theme-shadcn delegates DOM behavior to primitives', () => {
  describe('Given Button component', () => {
    describe('When passing onClick and data-testid', () => {
      it('Then fires onClick handler', () => {});
      it('Then sets data-testid attribute', () => {});
    });
  });
  describe('Given Input component', () => {
    describe('When passing onInput, onChange, onFocus', () => {
      it('Then fires all event handlers', () => {});
      it('Then does not set on* as attributes', () => {});
    });
  });
  describe('Given Textarea component', () => {
    describe('When passing onInput, onChange, onFocus', () => {
      it('Then fires all event handlers', () => {});
      it('Then does not set on* as attributes', () => {});
    });
  });
});

// Verify no imports from '../event-handlers' remain in theme-shadcn/src/components/
// Verify event-handlers.ts is deleted from theme-shadcn
```
