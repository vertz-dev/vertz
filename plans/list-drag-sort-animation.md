# List Drag-Sort Animation

## Summary

Upgrade the `<List sortable>` drag-sort experience from a static drop-indicator to a smooth, animated reorder — items shift in real-time as the user drags, similar to React DND / Framer Motion Reorder.

Also fixes an off-by-one bug in `calcInsertionIndex()` that prevents appending items to the end of the list.

## Problem

Two issues with the current implementation (`packages/ui-primitives/src/list/list-composed.tsx`):

1. **No visual feedback during drag.** The only feedback is a 2px drop indicator line. Non-dragged items remain stationary. Users can't intuit where the item will land.

2. **Off-by-one in insertion index.** `calcInsertionIndex()` (line 280) returns `items.length - 1` when the pointer is below all items. It should return `items.length` to allow appending to the end. This causes the dropped item to land one position before where the user intended.

### Root Cause

The drag system (`setupDragSort`) and the animation system (`createAnimationHooks`) are completely disconnected:

- `setupDragSort` only applies `translateY` on the dragged element and shows a line indicator.
- `createAnimationHooks` only runs during reactive reconciliation (after the items array updates).
- Nothing shifts non-dragged items during the drag gesture.

## API Surface

### `onReorder` semantics: destination index after removal

The `onReorder(from, to)` callback uses **destination-after-removal** semantics: `to` is the index where the item should end up in the array after being removed from `from`. This means the consumer splice pattern is always:

```ts
const arr = [...items];
const [moved] = arr.splice(from, 1);
arr.splice(to, 0, moved);
items = arr;
```

Internally, `calcInsertionIndex()` returns an "insertion-before" index (0 to `items.length`). `setupDragSort` converts this to destination-after-removal before calling `onReorder`: if `insertionIndex > fromIndex`, `destIndex = insertionIndex - 1`, otherwise `destIndex = insertionIndex`.

**Examples with 3 items [A, B, C]:**
| Action | insertionIndex | fromIndex | destIndex (onReorder `to`) | Result |
|--------|---------------|-----------|---------------------------|--------|
| Drag A below C | 3 | 0 | 2 | [B, C, A] |
| Drag A between B and C | 2 | 0 | 1 | [B, A, C] |
| Drag C before A | 0 | 2 | 0 | [C, A, B] |
| Drag C below all (no-op) | 3 | 2 | 2 = fromIndex → not fired | [A, B, C] |

### New: `List.reorder()` utility

A convenience helper to eliminate the splice boilerplate:

```tsx
import { List } from '@vertz/ui/components';

function handleReorder(from: number, to: number) {
  items = List.reorder(items, from, to);
}
```

Implementation:
```ts
List.reorder = <T>(arr: readonly T[], from: number, to: number): T[] => {
  const result = [...arr];
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
};
```

### Basic usage (no API changes)

```tsx
import { List } from '@vertz/ui/components';

let items = [
  { id: '1', label: 'First' },
  { id: '2', label: 'Second' },
  { id: '3', label: 'Third' },
];

function handleReorder(from: number, to: number) {
  items = List.reorder(items, from, to);
}

// Before: items stay put, only a line indicator shows
// After: items smoothly shift to make room as you drag
<List animate sortable onReorder={handleReorder}>
  {items.map((item) => (
    <List.Item key={item.id}>
      <List.DragHandle>☰</List.DragHandle>
      {item.label}
    </List.Item>
  ))}
</List>
```

### Animation timing configuration (existing prop)

```tsx
// Default — items shift with transforms (always-on when sortable + animate)
<List animate sortable onReorder={handleReorder}>

// Custom animation timing for drag shifts
<List
  animate={{ duration: 150, easing: 'ease-in-out' }}
  sortable
  onReorder={handleReorder}
>
```

No new props. The `animate` config that already controls FLIP animations also controls drag-shift timing.

### Invalid usage (no change)

```tsx
// @ts-expect-error — onReorder required when sortable
<List sortable>

// @ts-expect-error — sortable must be boolean
<List sortable="yes">
```

## Manifesto Alignment

### "One way to do things"

There's one drag-sort behavior: animated shifting. No flags to choose between "line indicator" vs "animated". When `sortable` + `animate` are both enabled, you get the full experience.

### "If it builds, it works"

No API change — existing code gets the improved behavior automatically. The index fix means the calculated destination now matches what the user sees.

### "Performance is not optional"

During drag, we only apply CSS `transform` on items (GPU-composited, no layout thrash). No DOM reordering mid-drag. The `will-change: transform` hint is applied on drag start and removed on drag end. Item rects are **snapshotted once at drag start** — no `getBoundingClientRect()` calls during `pointermove`.

### Tradeoffs

- **We chose CSS transforms over DOM reordering during drag** — DOM reordering mid-drag would trigger reconciliation and could conflict with the reactive items array. Transforms are visual-only and cheaper.
- **We chose to tie drag animation to the `animate` prop** — rather than adding a new `animateDrag` prop. This keeps the API simple. If `animate` is false but `sortable` is true, you get the basic line indicator (current behavior, as a fallback).
- **We use snapshotted rects, not live rects** — `calcInsertionIndex` operates on rects captured at drag start. For lists with large height variations (>2x between items), the visual crossing point won't perfectly match the trigger point. This is acceptable for v1.

## Non-Goals

- **Horizontal drag-sort** — only vertical lists for now.
- **Cross-list drag** — dragging items between two `<List>` components.
- **Drag to external drop targets** — this is list-internal reordering only.
- **Touch scroll disambiguation** — the existing `touch-action: none` on drag handles is sufficient. Full touch gesture disambiguation (drag vs scroll) is a separate concern.
- **Virtual/windowed lists** — drag-sort within virtualized lists.
- **Keyboard-accessible reorder** — arrow keys to move a selected item up/down. Important for accessibility but a separate concern with different UX patterns. Future work.
- **`onDragStart` / `onDragEnd` lifecycle callbacks** — useful for dimming the list, disabling other interactions, or analytics. Deferred as a future extension point.
- **Reactive updates during drag** — if the items array changes mid-drag (e.g., WebSocket push), behavior is undefined. The drag will be cancelled if detected (guard added in Phase 2).

## Unknowns

1. **Variable-height items during drag shift** — When items have different heights, the shift transform uses the **dragged item's height** (measured at drag start). Items that need to shift "up" (to fill the gap) get `translateY(-draggedHeight)`. Items that need to shift "down" (when dragging upward) get `translateY(+draggedHeight)`. This produces correct visual gaps regardless of individual item heights. **Status: resolved in design.**

2. **`position: relative` on list root** — Already set by the theme (`packages/theme-shadcn/src/styles/list.ts`, line 28). `setupDragSort` must NOT set or unset this inline — it would override the theme class. **Status: resolved — no action needed.**

## Type Flow Map

No new generics introduced. The existing types remain:

```
ComposedListProps.animate (boolean | AnimateConfig)
  → resolveAnimateConfig() → { duration, easing }
    → createAnimationHooks() → ListAnimationHooks
      → ListAnimationContext.Provider
        → consumed by __listValue() for FLIP

ComposedListProps.onReorder ((from, to) => void)
  → setupDragSort() getOnReorder closure
    → calcInsertionIndex() returns insertion-before index
      → converted to destination-after-removal index
        → onReorder(from, destIndex) called on pointerup
```

New static method:
```
List.reorder<T>(arr: readonly T[], from: number, to: number): T[]
  → splice(from, 1) → splice(to, 0, moved) → return new array
```

No dead generics.

## E2E Acceptance Test

### Bug fix: insertion at end of list

```tsx
describe('Feature: Correct insertion index with destination-after-removal semantics', () => {
  describe('Given a list with 3 items [A, B, C]', () => {
    describe('When dragging item A below item C (below all midpoints)', () => {
      it('Then onReorder is called with (0, 2)', () => {
        // insertionIndex=3, fromIndex=0, destIndex=3-1=2
        // List.reorder([A,B,C], 0, 2) → [B, C, A]
      });
    });
  });

  describe('Given a list with 3 items [A, B, C]', () => {
    describe('When dragging item A to between B and C', () => {
      it('Then onReorder is called with (0, 1)', () => {
        // insertionIndex=2, fromIndex=0, destIndex=2-1=1
        // List.reorder([A,B,C], 0, 1) → [B, A, C]
      });
    });
  });

  describe('Given a list with 3 items [A, B, C]', () => {
    describe('When dragging item C to before item A', () => {
      it('Then onReorder is called with (2, 0)', () => {
        // insertionIndex=0, fromIndex=2, destIndex=0 (no adjustment, insertion <= from)
        // List.reorder([A,B,C], 2, 0) → [C, A, B]
      });
    });
  });

  describe('Given a list with 5 items [A, B, C, D, E]', () => {
    describe('When dragging item E below all items (no-op)', () => {
      it('Then onReorder is NOT called', () => {
        // insertionIndex=5, fromIndex=4, destIndex=5-1=4=fromIndex → no-op
      });
    });
  });

  describe('Given a list with 3 items [A, B, C]', () => {
    describe('When dragging item A above all items (no-op)', () => {
      it('Then onReorder is NOT called', () => {
        // insertionIndex=0, fromIndex=0, destIndex=0=fromIndex → no-op
      });
    });
  });
});
```

### List.reorder utility

```tsx
describe('Feature: List.reorder utility', () => {
  it('moves item from index 0 to index 2', () => {
    expect(List.reorder(['A', 'B', 'C'], 0, 2)).toEqual(['B', 'C', 'A']);
  });

  it('moves item from index 2 to index 0', () => {
    expect(List.reorder(['A', 'B', 'C'], 2, 0)).toEqual(['C', 'A', 'B']);
  });

  it('returns a new array (no mutation)', () => {
    const original = ['A', 'B', 'C'];
    const result = List.reorder(original, 0, 2);
    expect(result).not.toBe(original);
    expect(original).toEqual(['A', 'B', 'C']);
  });
});
```

### Animated item shifting during drag

```tsx
describe('Feature: Animated drag-sort reordering', () => {
  describe('Given a sortable animated list with items [A(h=40), B(h=40), C(h=40)]', () => {
    describe('When the user starts dragging item A downward past item B midpoint', () => {
      it('Then item A follows the pointer with absolute positioning', () => {
        // draggedItem has position: absolute, transform matches pointer delta
      });

      it('Then item B shifts up by the height of item A', () => {
        // B gets transform: translateY(-40px) with transition
      });

      it('Then item C remains in its original position', () => {
        // C has no transform applied
      });
    });

    describe('When the user continues dragging A past item C midpoint', () => {
      it('Then both B and C shift up by the height of item A', () => {
        // B: translateY(-40px), C: translateY(-40px)
      });
    });

    describe('When the user drags A back above B midpoint', () => {
      it('Then B and C shift back to their original positions', () => {
        // B: transform cleared, C: transform cleared — with transition
      });
    });
  });

  // Upward drag
  describe('Given a sortable animated list with items [A(h=40), B(h=40), C(h=40)]', () => {
    describe('When the user drags item C upward past item B midpoint', () => {
      it('Then item B shifts down by the height of item C', () => {
        // B gets transform: translateY(40px) with transition
      });

      it('Then item A remains in its original position', () => {
        // A has no transform applied
      });
    });

    describe('When the user continues dragging C past item A midpoint', () => {
      it('Then both A and B shift down by the height of item C', () => {
        // A: translateY(40px), B: translateY(40px)
      });
    });
  });

  // Variable-height items
  describe('Given a sortable animated list with items [A(h=60), B(h=30), C(h=45)]', () => {
    describe('When dragging A (60px tall) past B', () => {
      it('Then B shifts up by 60px (dragged item height, not its own height)', () => {
        // B gets transform: translateY(-60px)
      });
    });
  });

  // Drop and FLIP transition
  describe('Given items have been shifted during drag', () => {
    describe('When the user drops item A at position 2', () => {
      it('Then transition is set to none before clearing transforms', () => {
        // Prevents animated snap-back that would corrupt FLIP snapshots
      });

      it('Then all shift transforms are cleared instantly', () => {
        // No inline transforms remain on non-dragged items
      });

      it('Then onReorder(0, 2) is called', () => {
        // Developer updates items array → FLIP reconciliation handles final animation
      });
    });
  });

  describe('Given a sortable list with animate=false', () => {
    describe('When the user drags an item', () => {
      it('Then the drop indicator line is shown (fallback behavior)', () => {
        // Legacy behavior preserved when animate is disabled
      });

      it('Then non-dragged items do not shift', () => {
        // No transforms applied to siblings
      });
    });
  });

  describe('Given the user prefers reduced motion', () => {
    describe('When dragging in an animated sortable list', () => {
      it('Then items shift instantly without transition', () => {
        // Transforms applied but transition duration is 0
      });
    });
  });
});
```

### Dragged item visual state

```tsx
describe('Feature: Dragged item lift effect', () => {
  describe('Given a sortable animated list', () => {
    describe('When the user starts dragging an item', () => {
      it('Then the dragged item gets data-dragging attribute', () => {
        // Existing behavior preserved
      });

      it('Then the dragged item is positioned absolutely within the list', () => {
        // position: absolute, width preserved, z-index elevates above siblings
      });

      it('Then a placeholder with the same height maintains the gap', () => {
        // Placeholder styled via CSS (visibility: hidden, height matches item)
        // Uses data-drag-placeholder attribute for targeting
      });
    });

    describe('When the user drops the item', () => {
      it('Then position, width, z-index are cleaned up on the dragged item', () => {
        // All inline styles removed, item returns to flow
      });

      it('Then placeholder is removed from DOM', () => {
        // Placeholder element removed
      });
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Fix insertion index + add `List.reorder()` + define `onReorder` semantics

**Scope:** Bug fix + API clarity. No animation changes.

**Files:**
- `packages/ui-primitives/src/list/list-composed.tsx`:
  - Fix `calcInsertionIndex()` to return `items.length` when pointer is below all items
  - Add insertion-to-destination conversion in `setupDragSort` before calling `onReorder`
  - Add `List.reorder()` static method on the exported `ComposedList`
- `packages/ui-primitives/src/list/__tests__/list-drag.test.tsx`:
  - Test: end-of-list insertion returns correct index
  - Test: upward drag from first item (no-op)
  - Test: dragging last item below all items (no-op)
  - Test: destination-after-removal conversion for all directions
  - Test: `List.reorder()` utility
- `sites/component-docs/src/content/list-content.tsx` — update demo to use `List.reorder()`

**Acceptance criteria:**

```tsx
describe('Given a list with 3 items at Y positions [0-40, 40-80, 80-120]', () => {
  describe('When calcInsertionIndex is called with clientY=130 (below all items)', () => {
    it('Then returns 3 (items.length), not 2', () => {});
  });
});

describe('Given a sortable list [A, B, C]', () => {
  describe('When dragging A and dropping below C (clientY=130)', () => {
    it('Then onReorder is called with (0, 2) — destination after removal', () => {});
  });

  describe('When dragging C above A (clientY=10)', () => {
    it('Then onReorder is called with (2, 0)', () => {});
  });

  describe('When dragging C below all items', () => {
    it('Then onReorder is NOT called (no-op detected)', () => {});
  });
});

describe('List.reorder()', () => {
  it('moves item forward: reorder([A,B,C], 0, 2) → [B,C,A]', () => {});
  it('moves item backward: reorder([A,B,C], 2, 0) → [C,A,B]', () => {});
  it('returns new array without mutating original', () => {});
});
```

### Phase 2: Animated item shifting during drag

**Scope:** Core drag animation — items shift in real-time with CSS transforms as the user drags.

**Key design decisions:**
- **Snapshotted rects:** All item rects are captured once at drag start. `calcInsertionIndex` uses these cached rects for all `pointermove` calculations. No `getBoundingClientRect()` during drag.
- **Shift direction:** Items between `fromIndex` and `targetIndex` shift by `±draggedItemHeight`. If target > from, items shift up (`-draggedHeight`). If target < from, items shift down (`+draggedHeight`).
- **Drag cancellation on reactive update (future work):** If `__listValue` reconciles during an active drag (items array changed externally), the drag should ideally be cancelled (transforms cleared, event listeners removed). This is not implemented in this iteration — behavior is undefined if the items array changes mid-drag. Listed in Non-Goals as "Reactive updates during drag".

**Files:**
- `packages/ui-primitives/src/list/list-composed.tsx` — refactor `setupDragSort()`:
  - On drag start: snapshot all item rects into an array, measure dragged item height, set `will-change: transform` on all items
  - On pointer move: calculate target index from snapshotted rects, apply `translateY` shifts to non-dragged items with transition
  - On pointer up: set `transition: none` on all items, clear all transforms instantly, then call `onReorder`. This ensures FLIP snapshots (triggered by reactive update) see correct resting positions.
  - Keep drop indicator as fallback when `animate=false`
- `packages/ui-primitives/src/list/__tests__/list-drag.test.tsx` — tests for shift transforms (downward, upward, variable heights, reverse direction)

**Note:** In Phase 2, the dragged item still occupies flow space (only translated visually). This means the dragged item and shifted items may visually overlap. Phase 3 resolves this by taking the dragged item out of flow.

**Acceptance criteria:**

```tsx
describe('Given a sortable animated list [A(h=40), B(h=40), C(h=40)]', () => {
  // Downward drag
  describe('When dragging A past B midpoint', () => {
    it('Then B has transform translateY(-40px) with transition', () => {});
    it('Then C has no transform', () => {});
  });

  describe('When dragging A past C midpoint', () => {
    it('Then B has transform translateY(-40px)', () => {});
    it('Then C has transform translateY(-40px)', () => {});
  });

  describe('When dragging A back above B midpoint', () => {
    it('Then B and C transforms are cleared', () => {});
  });

  // Upward drag
  describe('When dragging C past B midpoint (upward)', () => {
    it('Then B has transform translateY(40px)', () => {});
    it('Then A has no transform', () => {});
  });

  // Variable-height items
  describe('Given items [A(h=60), B(h=30), C(h=45)]', () => {
    describe('When dragging A past B', () => {
      it('Then B shifts up by 60px (dragged item height)', () => {});
    });
  });

  // Drop cleanup for FLIP
  describe('When dropping after shift transforms are applied', () => {
    it('Then transition is set to none before clearing transforms', () => {});
    it('Then all transforms are cleared instantly', () => {});
  });

  // Fallback
  describe('When animate=false', () => {
    it('Then drop indicator is shown (no shift transforms)', () => {});
  });
});
```

### Phase 3: Dragged item lift (absolute positioning + placeholder)

**Scope:** Take the dragged item out of flow for smoother visuals.

**Key design decisions:**
- **Placeholder approach:** On drag start, create a `<li data-drag-placeholder>` element with `visibility: hidden` and `height` matching the dragged item. Insert it adjacent to the dragged item using `insertBefore`. This is imperative DOM manipulation inside an event handler (not component render), which is acceptable — the placeholder is a transient visual artifact, not part of the reactive tree.
- **Placeholder exclusion from calculations:** The placeholder does NOT get `data-sortable-item`, so `querySelectorAll('[data-sortable-item]')` excludes it. However, since Phase 2 already uses snapshotted rects (not live DOM), the placeholder has no effect on index calculations.
- **Absolute positioning:** The dragged item gets `position: absolute`, `width: <measured>px`, `top: <offsetTop>px`, `left: <offsetLeft>px`. These are set relative to the `<ul>` which already has `position: relative` from the theme.

**Files:**
- `packages/ui-primitives/src/list/list-composed.tsx` — in `setupDragSort()`:
  - On drag start: measure item rect, create placeholder `<li>`, insert adjacent, set item to absolute
  - On pointer move: update item `top` based on pointer delta (replaces `translateY` on dragged item)
  - On pointer up: remove placeholder, reset item positioning styles
- `packages/ui-primitives/src/list/__tests__/list-drag.test.tsx` — tests for placeholder and absolute positioning

**Acceptance criteria:**

```tsx
describe('Given a sortable animated list', () => {
  describe('When the user starts dragging item B', () => {
    it('Then a placeholder li[data-drag-placeholder] is inserted at B original position', () => {});
    it('Then placeholder has visibility: hidden and height matching B', () => {});
    it('Then placeholder does NOT have data-sortable-item', () => {});
    it('Then B is positioned absolutely at its original coordinates', () => {});
    it('Then B has the same width as before', () => {});
  });

  describe('When the user moves the pointer 50px down', () => {
    it('Then B top increases by 50px', () => {});
  });

  describe('When the user drops', () => {
    it('Then placeholder is removed from DOM', () => {});
    it('Then B position, width, top, left styles are cleared', () => {});
  });
});
```

### Phase 4: Reduced motion + cleanup + docs

**Scope:** Polish, accessibility, documentation.

**Files:**
- `packages/ui-primitives/src/list/list-composed.tsx` — respect `prefers-reduced-motion` during drag (instant shifts, no transition)
- `packages/ui-primitives/src/list/__tests__/list-drag.test.tsx` — reduced motion test
- `sites/component-docs/src/content/list-content.tsx` — update demo to showcase animated reorder
- `packages/docs/` — update List component docs if applicable

**Acceptance criteria:**

```tsx
describe('Given prefers-reduced-motion is enabled', () => {
  describe('When dragging in a sortable animated list', () => {
    it('Then shift transforms are applied instantly (transition: none)', () => {});
  });
});
```

- Component-docs demo visually demonstrates smooth animated reordering
- Docs updated with animated sortable example

### Phase dependencies

```
Phase 1 (bug fix + semantics) → independent, can ship alone
Phase 2 (shift animation) → depends on Phase 1 (correct index + snapshotted rects)
Phase 3 (lift effect) → depends on Phase 2 (shift must work with absolute positioning)
Phase 4 (polish) → depends on Phase 2 + 3
```

Each phase is independently valuable:
- Phase 1 alone fixes broken end-of-list drops and clarifies the API
- Phase 1+2 gives the core animated experience (with minor visual overlap on dragged item)
- Phase 1+2+3 gives the full polished React-DND-like experience
- Phase 4 adds accessibility and documentation
