# ResizablePanel Compound Pattern Migration

**Issue:** #1555
**Status:** Design
**Type:** Refactoring — internal implementation change, no public API changes

## Summary

Migrate `ComposedResizablePanel` from the registration-based composed pattern to the React-style compound pattern, matching Carousel, Dialog, and the other 15 already-migrated primitives.

## API Surface

The public API does **not** change. Same props, same sub-components, same class distribution:

```tsx
// Usage stays identical
<ResizablePanel orientation="horizontal" onResize={handleResize}>
  <ResizablePanel.Panel defaultSize={30} className="left">
    <LeftContent />
  </ResizablePanel.Panel>
  <ResizablePanel.Handle />
  <ResizablePanel.Panel defaultSize={70} className="right">
    <RightContent />
  </ResizablePanel.Panel>
</ResizablePanel>
```

### Props (unchanged)

```ts
interface ComposedResizablePanelProps {
  children?: ChildValue;
  classes?: ResizablePanelClasses;
  orientation?: 'horizontal' | 'vertical';
  onResize?: (sizes: number[]) => void;
}

interface PanelSlotProps extends PanelOptions {
  children?: ChildValue;
  className?: string;
  /** @deprecated */ class?: string;
}

interface HandleSlotProps {
  className?: string;
  /** @deprecated */ class?: string;
}
```

### Exports (unchanged)

```ts
export { ComposedResizablePanel };
export type { ComposedResizablePanelProps, ResizablePanelClasses, ResizablePanelClassKey };
```

## Internal Architecture Change

### Current (registration pattern)

```
Root
  ├── Phase 1: resolveChildren() → collect registrations via callback context
  └── Phase 2: iterate registrations → call low-level factory API → appendChild
```

Problems:
- Wraps low-level factory API (`ResizablePanel.Root()`, `rp.Panel()`, `rp.Handle()`)
- Uses `resolveChildren` (imports from `@vertz/ui`)
- Imperative DOM manipulation (`appendChild`, `createTextNode`)
- Two-phase rendering breaks hydration
- Registration callback context is opaque

### Target (compound pattern — Carousel style)

```
Root
  ├── Render: JSX tree with Provider wrapping children
  ├── Sub-components render their own DOM with data attributes
  └── Post-render: initPanels() queries DOM, applies sizes, wires handlers
```

### Context (data only, no callbacks)

```ts
interface ResizablePanelContextValue {
  orientation: 'horizontal' | 'vertical';
  classes?: ResizablePanelClasses;
}
```

### Panel sub-component

Renders its own `<div>` with data attributes encoding size config. Defaults for `minSize`/`maxSize` are NOT applied in the sub-component — they are applied only in `initPanels()` to keep a single source of truth. The `data-default-size` attribute is conditionally rendered to ensure `undefined` doesn't produce a `"undefined"` string attribute:

```tsx
function ResizablePanelPanel({
  children, className, class: classProp,
  defaultSize, minSize, maxSize,
}: PanelSlotProps) {
  const ctx = useResizablePanelContext('Panel');
  const cls = className ?? classProp;
  const combined = [ctx.classes?.panel, cls].filter(Boolean).join(' ');

  return (
    <div
      data-part="panel"
      data-default-size={defaultSize != null ? String(defaultSize) : undefined}
      data-min-size={minSize != null ? String(minSize) : undefined}
      data-max-size={maxSize != null ? String(maxSize) : undefined}
      class={combined || undefined}
    >
      {children}
    </div>
  );
}
```

Uses `data-part="panel"` instead of `data-panel=""` for theme integration consistency (matches `theme-shadcn` tests which query `[data-part="panel"]`).

**Note on `data-panel` vs `data-part="panel"` divergence:** The low-level factory API (`resizable-panel.tsx`) continues to use `data-panel=""`. This is intentional — the low-level API is a separate concern and NOT changed by this migration. The composed compound layer uses `data-part="panel"` which is the convention used by all other composed primitives. The `theme-shadcn` test already queries `[data-part="panel"]` and needs no change.

### Handle sub-component

Renders its own separator element:

```tsx
function ResizablePanelHandle({ className, class: classProp }: HandleSlotProps) {
  const ctx = useResizablePanelContext('Handle');
  const cls = className ?? classProp;
  const combined = [ctx.classes?.handle, cls].filter(Boolean).join(' ');

  return (
    <div
      role="separator"
      tabindex="0"
      data-orientation={ctx.orientation}
      data-state="idle"
      class={combined || undefined}
    />
  );
}
```

### Root — event delegation + post-render init

Follows the Carousel pattern: root renders JSX, then calls `initPanels()` to wire behavior:

```tsx
function ComposedResizablePanelRoot({
  children, classes, orientation = 'horizontal', onResize,
}: ComposedResizablePanelProps) {

  // Panel state — mutable, updated by handlers
  let panels: { el: HTMLElement; minSize: number; maxSize: number }[] = [];
  let handles: HTMLElement[] = [];
  let sizes: number[] = [];

  function updateSizes(newSizes: number[]): void {
    sizes = [...newSizes];
    // Apply flex styles to panels
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      if (panel) panel.el.style.flex = `0 0 ${newSizes[i] ?? 0}%`;
    }
    // Update ARIA on handles
    for (let i = 0; i < handles.length; i++) {
      const handle = handles[i];
      const leftPanel = panels[i];
      if (handle && leftPanel) {
        const size = newSizes[i] ?? 0;
        handle.setAttribute('aria-valuenow', String(Math.round(size)));
        handle.setAttribute('aria-valuemin', String(Math.round(leftPanel.minSize)));
        handle.setAttribute('aria-valuemax', String(Math.round(leftPanel.maxSize)));
      }
    }
    onResize?.(newSizes);
  }

  function initPanels(rootEl: HTMLElement): void {
    // Query DIRECT children only — `:scope >` prevents picking up
    // panels/handles from nested ResizablePanel instances.
    panels = [...rootEl.querySelectorAll<HTMLElement>(':scope > [data-part="panel"]')].map((el) => ({
      el,
      minSize: Number(el.dataset.minSize ?? 0),
      maxSize: Number(el.dataset.maxSize ?? 100),
    }));
    handles = [...rootEl.querySelectorAll<HTMLElement>(':scope > [role="separator"]')];

    // Calculate initial sizes.
    // Use a Set to track which indices have explicit defaultSize,
    // so defaultSize={0} is not confused with "unset".
    const initialSizes: number[] = new Array(panels.length).fill(0);
    const explicitIndices = new Set<number>();

    for (let i = 0; i < panels.length; i++) {
      const ds = panels[i]!.el.dataset.defaultSize;
      if (ds != null) {
        initialSizes[i] = Number(ds);
        explicitIndices.add(i);
      }
    }

    if (explicitIndices.size === 0) {
      // No explicit sizes — equal distribution
      const equal = 100 / panels.length;
      for (let i = 0; i < panels.length; i++) initialSizes[i] = equal;
    } else {
      // Fill unset panels with equal share of remaining space
      const used = [...explicitIndices].reduce((sum, i) => sum + (initialSizes[i] ?? 0), 0);
      const unsetCount = panels.length - explicitIndices.size;
      const each = unsetCount > 0 ? (100 - used) / unsetCount : 0;
      for (let i = 0; i < initialSizes.length; i++) {
        if (!explicitIndices.has(i)) initialSizes[i] = each;
      }
    }
    updateSizes(initialSizes);
  }

  // Event delegation handlers on root
  function handleKeydown(e: Event): void { /* ... keyboard resize logic ... */ }
  function handlePointerdown(e: Event): void { /* ... drag resize logic ... */ }

  const ctx: ResizablePanelContextValue = { orientation, classes };

  const el = (
    <ResizablePanelContext.Provider value={ctx}>
      <div
        style={`display: flex; flex-direction: ${orientation === 'horizontal' ? 'row' : 'column'};`}
        data-orientation={orientation}
        class={classes?.root}
        onKeydown={handleKeydown}
        onPointerdown={handlePointerdown}
      >
        {children}
      </div>
    </ResizablePanelContext.Provider>
  );

  // Post-render initialization (Carousel pattern)
  initPanels(el as HTMLElement);
  return el;
}
```

### Keyboard handler (event delegation)

```ts
function handleKeydown(e: Event): void {
  const ke = e as KeyboardEvent;
  const target = ke.target as HTMLElement;
  if (target.getAttribute('role') !== 'separator') return;

  const handleIndex = handles.indexOf(target);
  if (handleIndex < 0) return;

  const leftIdx = handleIndex;
  const rightIdx = handleIndex + 1;
  const leftPanel = panels[leftIdx];
  const rightPanel = panels[rightIdx];
  if (!leftPanel || !rightPanel) return;

  let leftSize = sizes[leftIdx] ?? 0;
  let rightSize = sizes[rightIdx] ?? 0;
  const STEP = 5;
  const growKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
  const shrinkKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';

  if (ke.key === growKey) {
    ke.preventDefault();
    const delta = Math.min(STEP, rightSize - rightPanel.minSize, leftPanel.maxSize - leftSize);
    leftSize += delta; rightSize -= delta;
  } else if (ke.key === shrinkKey) { /* symmetric */ }
  else if (ke.key === 'Home') { /* collapse left */ }
  else if (ke.key === 'End') { /* expand left */ }
  else return;

  const newSizes = [...sizes];
  newSizes[leftIdx] = leftSize;
  newSizes[rightIdx] = rightSize;
  updateSizes(newSizes);
}
```

### Pointer drag handler (event delegation)

```ts
function handlePointerdown(e: Event): void {
  const pe = e as PointerEvent;
  const target = pe.target as HTMLElement;
  if (target.getAttribute('role') !== 'separator') return;

  pe.preventDefault();
  target.setPointerCapture(pe.pointerId);
  target.setAttribute('data-state', 'dragging');

  const handleIndex = handles.indexOf(target);
  const rootEl = e.currentTarget as HTMLElement;
  const startPos = orientation === 'horizontal' ? pe.clientX : pe.clientY;
  const rootSize = orientation === 'horizontal' ? rootEl.offsetWidth : rootEl.offsetHeight;
  const startSizes = [...sizes];

  function onMove(ev: PointerEvent): void { /* ... same logic as current ... */ }
  function onUp(ev: PointerEvent): void {
    target.releasePointerCapture(ev.pointerId);
    target.setAttribute('data-state', 'idle');
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
  }

  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
}
```

## Manifesto Alignment

- **Declarative > Imperative** — Replaces registration callbacks and `appendChild` with JSX sub-components that render their own DOM.
- **Composability** — Each sub-component is independent, reads context, renders directly. No coupling between Panel and Handle via registration.
- **No internal API imports** — Eliminates `resolveChildren` import from `@vertz/ui` and stops wrapping the low-level factory API.
- **Hydration-safe** — Single-pass rendering. No two-phase collection→build cycle.

## Non-Goals

- **N-panel improvements** — Not changing the resize algorithm. The existing behavior (each handle controls two adjacent panels) is preserved.
- **Low-level API changes** — `ResizablePanel.Root()` factory API is untouched. It continues to exist for direct use.
- **New features** — No new props, no new behaviors. This is a pure internal refactor.

## Unknowns

- **Panel data attribute naming**: `data-part="panel"` vs `data-panel=""`. The theme-shadcn test at line 85 already queries `[data-part="panel"]`, so `data-part="panel"` is the right choice. Confirmed — no unknown remaining.

## POC Results

N/A — the Carousel compound pattern is already proven across 15+ primitives. No POC needed.

## Type Flow Map

No generic type parameters. Props types are concrete interfaces (`PanelSlotProps`, `HandleSlotProps`, `ComposedResizablePanelProps`). No type flow verification needed.

## E2E Acceptance Test

```ts
describe('Feature: ResizablePanel compound pattern', () => {
  describe('Given a ResizablePanel with two panels and a handle', () => {
    describe('When rendered', () => {
      it('Then root has display:flex and data-orientation', () => {});
      it('Then each panel renders a div with data-part="panel"', () => {});
      it('Then handle renders a div with role="separator" and tabindex="0"', () => {});
      it('Then panels default to 50/50 sizing', () => {});
      it('Then children are rendered inside their panels', () => {});
    });

    describe('When ArrowRight is pressed on the handle', () => {
      it('Then left panel grows by 5% and right shrinks by 5%', () => {});
      it('Then onResize is called with [55, 45]', () => {});
    });

    describe('When the handle is pointer-dragged', () => {
      it('Then data-state changes to "dragging" and back to "idle"', () => {});
      it('Then panel sizes update proportionally to drag delta', () => {});
    });
  });

  describe('Given panels with defaultSize props', () => {
    describe('When rendered', () => {
      it('Then panels use specified sizes instead of equal distribution', () => {});
    });
  });

  describe('Given classes prop on root', () => {
    describe('When rendered', () => {
      it('Then root class is applied to root div', () => {});
      it('Then panel class is applied to all panel divs', () => {});
      it('Then handle class is applied to all handle divs', () => {});
    });
  });

  describe('Given a nested ResizablePanel inside a panel', () => {
    describe('When rendered', () => {
      it('Then outer root only sees its own direct panels', () => {});
      it('Then inner root only sees its own direct panels', () => {});
      it('Then resizing outer handle does not affect inner panels', () => {});
    });
  });

  describe('Given panels with defaultSize={0}', () => {
    describe('When rendered', () => {
      it('Then the panel is sized to 0%, not treated as unset', () => {});
    });
  });

  describe('Given Panel used outside ResizablePanel', () => {
    describe('When Panel renders', () => {
      it('Then throws "must be used inside" error', () => {});
    });
  });
});
```

## Implementation Plan

### Phase 1: Rewrite composed component + update tests

**Scope:** Replace the entire `resizable-panel-composed.tsx` with compound pattern implementation. Update tests to match new DOM structure.

**Changes:**
1. Rewrite `resizable-panel-composed.tsx`:
   - Remove `resolveChildren` import
   - Remove `ResizablePanel` factory import
   - Context holds data (orientation, classes), not callbacks
   - Panel renders own `<div data-part="panel">` with data attributes
   - Handle renders own `<div role="separator">` with ARIA
   - Root renders JSX tree, then calls `initPanels()` for sizing and event wiring
   - Event delegation on root for keyboard and pointer handlers

2. Update `resizable-panel-composed.test.ts`:
   - Update panel queries from `[data-panel]` to `[data-part="panel"]`
   - All existing behavioral tests should pass with same assertions

3. Update `theme-shadcn` test if needed:
   - The theme test already queries `[data-part="panel"]` — should work after migration

**Acceptance criteria:**
```ts
describe('Feature: compound pattern migration', () => {
  describe('Given a ResizablePanel with two panels and a handle', () => {
    describe('When rendered', () => {
      it('Then root is a div with display:flex', () => {});
      it('Then root has data-orientation attribute', () => {});
      it('Then panels render as div[data-part="panel"]', () => {});
      it('Then handle renders as div[role="separator"][tabindex="0"]', () => {});
      it('Then panels default to 50/50 sizes (aria-valuenow="50")', () => {});
      it('Then children are rendered inside panels', () => {});
      it('Then classes.root is applied to root', () => {});
      it('Then classes.panel is applied to all panels', () => {});
      it('Then classes.handle is applied to all handles', () => {});
      it('Then per-panel className is applied', () => {});
      it('Then per-handle className is applied', () => {});
      it('Then Panel throws when used outside root', () => {});
      it('Then Handle throws when used outside root', () => {});
    });

    describe('When orientation is vertical', () => {
      it('Then data-orientation is "vertical"', () => {});
      it('Then handle data-orientation is "vertical"', () => {});
    });

    describe('When ArrowRight is pressed on handle', () => {
      it('Then onResize is called with [55, 45]', () => {});
    });

    describe('When panel has defaultSize', () => {
      it('Then aria-valuenow reflects custom size', () => {});
    });
  });
});
```

- No imports of `resolveChildren` from `@vertz/ui`
- No imports of `ResizablePanel` factory from `./resizable-panel`
- No `@vertz/ui/internals` imports
- No imperative DOM manipulation (`appendChild`, `createElement`, `createTextNode`)
- Quality gates pass: `bun test`, `bun run typecheck`, `bun run lint`

## Design Review Findings

### DX Review (Josh) — 2026-03-19

**Verdict:** Changes Requested → Resolved

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | `querySelectorAll` picks up nested ResizablePanel children | Blocker | Fixed: use `:scope >` selectors in `initPanels()` |
| 2 | Clarify `data-panel` vs `data-part="panel"` divergence | Should-fix | Fixed: added explicit note in Panel sub-component section |
| 3 | Class concatenation whitespace edge case | Nit | Accepted: matches established Carousel convention |

### Product/Scope Review — 2026-03-19

**Verdict:** Approved

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | Note Collapsible migration status | Nit | Acknowledged: tracked separately |
| 2 | Confirm test query updates | Nit | Already covered in Phase 1 description |

### Technical Review — 2026-03-19

**Verdict:** Changes Requested → Resolved

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | `defaultSize={0}` collides with "unset" placeholder | Blocker | Fixed: use `Set<number>` to track explicit indices |
| 2 | `minSize`/`maxSize` defaults duplicated | Should-fix | Fixed: defaults only in `initPanels()`, not sub-component |
| 3 | `querySelectorAll` picks up nested children | Should-fix | Fixed: use `:scope >` selectors |
| 4 | `data-default-size` may render as `"undefined"` string | Should-fix | Fixed: conditional `!= null` guard in Panel |
| 5 | Theme test vacuously passes on `[data-part="panel"]` | Nit | Pre-existing: migration fixes this |
| 6 | `e.currentTarget` for root in pointer handler | Confirmed correct | N/A |
| 7 | Low-level tests unaffected | Confirmed | N/A |
| 8 | Pointer capture with event delegation | Confirmed correct | N/A |
