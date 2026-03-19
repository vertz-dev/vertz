# Composed Primitives: Replace `document.getElementById()` with `ref` + `onMount`

> Follow-up to deferred-on-mount (PR #1545). Now that `onMount` callbacks run after JSX evaluation, refs are available inside them — eliminating the need for `document.getElementById()` workarounds.

---

## Problem

All 21+ composed primitives in `@vertz/ui-primitives` were written before the `onMount` deferral change. They use `document.getElementById()` to access DOM elements because `ref.current` was `undefined` inside `onMount` at that time.

This creates several problems:

1. **Fragile** — relies on string IDs staying in sync between JSX attributes and lookup calls
2. **Redundant lookups** — same element queried multiple times across different handlers
3. **Violates "One way to do things"** — we have `ref()` for DOM access, but components bypass it
4. **Not compile-time safe** — a typo in the ID string silently returns `null`

Now that `onMount` defers callbacks until after JSX evaluation (commit `1709f6d9`), `ref.current` is guaranteed to be populated when `onMount` runs. The workaround pattern is obsolete.

---

## API Surface

### Before (current pattern — `getElementById` + `onMount` for event wiring)

```tsx
import { onMount } from '@vertz/ui';

function PopoverContent({ children, classes }: PopoverContentProps) {
  const ctx = usePopoverContext();

  onMount(() => {
    const content = document.getElementById(ctx.ids.contentId);
    if (!content) return;

    const handleKeydown = (e: KeyboardEvent) => { /* ... */ };
    content.addEventListener('keydown', handleKeydown);
    return () => content.removeEventListener('keydown', handleKeydown);
  });

  function close() {
    const content = document.getElementById(ctx.ids.contentId);
    if (!content) return;
    content.setAttribute('data-state', 'closed');
  }

  return (
    <div id={ctx.ids.contentId} data-state="closed" class={classes?.content}>
      {children}
    </div>
  );
}
```

### After (target pattern — `ref` + `onMount`)

```tsx
import { ref, type Ref, onMount } from '@vertz/ui';

function PopoverContent({ children, classes }: PopoverContentProps) {
  const ctx = usePopoverContext();
  const contentRef: Ref<HTMLDivElement> = ref();

  onMount(() => {
    const el = contentRef.current;
    if (!el) return;

    const handleKeydown = (e: KeyboardEvent) => { /* ... */ };
    el.addEventListener('keydown', handleKeydown);
    return () => el.removeEventListener('keydown', handleKeydown);
  });

  function close() {
    const el = contentRef.current;
    if (!el) return;
    el.setAttribute('data-state', 'closed');
  }

  return (
    <div ref={contentRef} id={ctx.ids.contentId} data-state="closed" class={classes?.content}>
      {children}
    </div>
  );
}
```

### Shared refs via context

When multiple sub-components need to access the same element (e.g., a trigger element referenced by both `Trigger` and `Content`):

```tsx
// In the Root component — store ref in context
const contentRef: Ref<HTMLDivElement> = ref();

// Pass via context
<PopoverContext.Provider value={{ ...ctx, contentRef }}>
  {children}
</PopoverContext.Provider>

// In Content — assign the ref
<div ref={ctx.contentRef} ... />

// In Trigger — read the ref
function toggle() {
  const content = ctx.contentRef.current;
  if (!content) return;
  // ...
}
```

---

## Scope: What Gets Migrated

### Tier 1 — Replace `document.getElementById()` (9 files, 17 instances)

These files use `document.getElementById()` to look up elements that could be accessed via `ref()`:

| File | Instances | Elements looked up |
|------|-----------|-------------------|
| `accordion-composed.tsx` | 3 | content (×2), trigger |
| `popover-composed.tsx` | 3 | content (×3) |
| `select-composed.tsx` | 2 | content (×2) |
| `tooltip-composed.tsx` | 1 | content |
| `dropdown-menu-composed.tsx` | 1 | content |
| `context-menu-composed.tsx` | 2 | content (×2, with `shared.contentEl` fallback) |
| `menubar-composed.tsx` | 2 | root (×2) |
| `date-picker-composed.tsx` | 1 | content |
| `navigation-menu-composed.tsx` | 2 | content, trigger |

**Note:** `context-menu-composed.tsx` already partially uses a manual ref pattern (`shared.contentEl`) due to happy-dom identity issues. This migration replaces that ad-hoc approach with a proper `Ref<HTMLElement>` for consistency.

### What is NOT in scope

- **`document.querySelector()` / `querySelectorAll()`** — These are used for *child discovery* within a container (e.g., finding all `[role="option"]` elements inside a select). This is a valid pattern — the parent doesn't own refs to dynamic children. Keep as-is.
- **`setTimeout()` for intentional delays** — Tooltip show delay, hover-card open/close delays, animation fallback timers. These are behavioral delays, not timing workarounds. Keep as-is.
- **`void el.offsetHeight` force reflows** — Required for CSS transition triggering. Keep as-is.
- **`queueMicrotask()`** — Used for deferred floating positioning. Keep as-is.
- **Low-level factory primitives** (`accordion.ts`, `dialog.ts`, etc.) — These are tracked separately under the broader "primitives JSX migration" project. This migration only touches composed (`*-composed.tsx`) files.
- **Test files** — Some test files (`sheet-composed.test.ts`, `alert-dialog-composed.test.ts`, `dialog-composed.test.ts`) use `document.getElementById` in test helpers. Tests run outside the Vertz compiler, so `ref()` is not available in test code. These stay as-is.

---

## Manifesto Alignment

### "One way to do things"

This is the primary driver. After this migration, `ref()` is the single way to access DOM elements in composed primitives. `document.getElementById()` becomes a code-smell, not a pattern.

### "Compile-time over runtime"

`ref()` is type-safe — `Ref<HTMLDivElement>` tells you the element type at compile time. `document.getElementById()` returns `HTMLElement | null` — losing type specificity.

### "Explicit over implicit"

`ref={contentRef}` in JSX makes the ref assignment visible. `document.getElementById(ids.contentId)` hides the relationship behind a string.

### "Predictability over convenience"

The `ref` + `onMount` pattern is the same pattern developers use in their own components. Primitives should use the same API they teach.

---

## Non-Goals

- **Migrating factory-level primitives to JSX** — separate project tracked in memory (`project-primitives-jsx-migration.md`)
- **Removing ID attributes from elements** — IDs serve purposes beyond DOM lookup (ARIA `aria-controls`, `aria-describedby`, `aria-labelledby`). They stay.
- **Refactoring child discovery patterns** — `querySelectorAll` for finding items within a container is valid
- **Changing animation/delay timing** — `setTimeout` for show/hide delays is behavioral, not a workaround
- **Performance optimization** — this is a correctness/consistency migration, not a performance one

---

## Unknowns

### 1. Cross-component ref sharing via context

**Question:** Some components need one sub-component to access another's DOM element (e.g., `PopoverTrigger` needs to read `PopoverContent`'s element for positioning). Currently done via `document.getElementById(ids.contentId)`. Should the ref be stored in context?

**Resolution:** Yes. Store `Ref<HTMLElement>` in the component's shared context (same object that holds `ids`, `isOpen`, etc.). The element-owning component assigns `ref={ctx.contentRef}` in JSX. Other components read `ctx.contentRef.current`. This is the pattern `dialog-composed.tsx` already uses with `ctx.dialogRef`.

### 2. Elements that don't exist yet when handlers run

**Question:** Some elements (like popover content) are conditionally rendered. Will `ref.current` be `null` when the element is hidden?

**Resolution:** Yes, and this is correct behavior. The existing code already handles this — every `document.getElementById()` call checks for `null`. The migration preserves the same null checks: `if (!contentRef.current) return;`. No behavioral change.

### 3. Reactivity of ref assignment

**Question:** When a conditionally-rendered element appears/disappears, does the ref update?

**Resolution:** Yes. The Vertz runtime sets `ref.current` when JSX creates the element and the `ref` attribute is processed. When the element is removed from DOM (conditional render false), the ref is NOT automatically cleared — this matches the existing `document.getElementById()` behavior (element still exists in DOM but may be hidden via `data-state`). Most primitives use show/hide via attributes, not conditional rendering.

### 4. Accordion: "element may have been replaced reactively" comments

**Question:** The accordion toggle handler has defensive comments saying "the signal update may trigger reactive re-evaluation that replaces the content DOM element" and re-looks up the element via `document.getElementById()` after toggling. Will a `ref` break if the element is replaced?

**Resolution:** The element is **not actually replaced.** In Vertz's Solid-like model, component functions run once — `AccordionContent` creates one `<div>` element at mount time and returns it. Subsequent signal updates (like `openValues` changing) do NOT re-execute the component body or create new elements. The content element's attributes (`data-state`, `aria-hidden`, `style.display`) are managed imperatively by the toggle handler, deliberately avoiding reactive JSX to preserve animation timing.

The defensive `document.getElementById()` re-lookup on line 109 always returns the same element as the lookup on line 102. A `ref` stored in item context (`ctx.contentRef.current`) will point to the same stable element throughout the component's lifetime.

The misleading comments should be cleaned up during the migration to avoid future confusion. The toggle handler will simply read `ctx.contentRef.current` and `ctx.triggerRef.current` — no pre/post-toggle distinction needed.

---

## Type Flow Map

This migration doesn't introduce new generics. The only type flow is:

```
ref<T>() → Ref<T> { current: T | undefined }
  → JSX ref={refObj} → assigns element to refObj.current
  → handler reads refObj.current (typed as T | undefined)
```

Existing `.test-d.ts` coverage for `ref()` and `onMount()` already validates this flow.

---

## E2E Acceptance Test

The composed primitives already have comprehensive test suites. The migration must not break any existing tests. Additionally:

```typescript
describe('Feature: ref + onMount in composed primitives', () => {
  describe('Given a Popover with ref-based content access', () => {
    describe('When the trigger is clicked', () => {
      it('Then the content element is positioned and shown', () => {
        // Existing popover interaction test — must still pass
      });
    });
  });

  describe('Given an Accordion with ref-based content/trigger access', () => {
    describe('When an item trigger is clicked', () => {
      it('Then the content expands with animation', () => {
        // Existing accordion toggle test — must still pass
      });
    });
  });

  describe('Given a Tooltip with ref-based content access', () => {
    describe('When hovering the trigger', () => {
      it('Then the tooltip is positioned and shown after delay', () => {
        // Existing tooltip hover test — must still pass
      });
    });
  });
});
```

The key acceptance criterion is: **all existing tests pass with zero behavioral changes.** This is a refactor, not a feature.

---

## Implementation Plan

### Phase 1: Popover + Tooltip (simplest cross-component ref sharing)

These two components have the clearest `document.getElementById()` → `ref()` migration path. Popover has 3 instances, Tooltip has 1. Both access a `content` element from non-owning components.

**Changes:**
- Add `contentRef: Ref<HTMLDivElement>` to popover context type
- Create ref in `PopoverRoot`, store in context
- Assign `ref={ctx.contentRef}` in `PopoverContent`
- Replace all `document.getElementById(ids.contentId)` with `ctx.contentRef.current`
- Same pattern for Tooltip

**Acceptance criteria:**
- All existing popover tests pass
- All existing tooltip tests pass
- No `document.getElementById` remains in either file
- `bun test && bun run typecheck && bunx biome check` clean

### Phase 2: Accordion + Select + Dropdown Menu + Date Picker

Accordion is the most complex (3 instances, accesses both content and trigger elements). Select has 2 instances (already uses `onMount` for event wiring — only the `getElementById` calls change). Dropdown menu and date-picker each have 1 instance.

**Changes:**
- Accordion: add `contentRef` and `triggerRef` per item (stored in item context). Clean up misleading "element may have been replaced reactively" comments — the element is stable (see Unknown #4).
- Select: add `contentRef` to select context, replace 2 `getElementById` lookups
- Dropdown: add `contentRef` to menu context
- Date-picker: add `contentRef` to picker context

**Acceptance criteria:**
- All existing accordion tests pass (including animation/expand/collapse)
- All existing select tests pass (including keyboard navigation in `onMount`)
- All existing dropdown-menu tests pass
- All existing date-picker tests pass
- No `document.getElementById` remains in any of the four files

### Phase 3: Context Menu + Menubar + Navigation Menu

These share similar patterns (menu content lookup). Navigation menu is the most complex with 2 instances across different sub-components.

**Changes:**
- Context menu: add `contentRef` to context, replace `shared.contentEl` ad-hoc pattern and 2 `getElementById` calls with proper `Ref<HTMLElement>`
- Menubar: add `rootRef` to bar context, replace 2 lookups. The `querySelector` calls within `getRootEl()` callers stay (child discovery).
- Navigation menu: add `contentRef` and `triggerRef` to **item context** (`NavigationMenuItemContextValue`). `NavMenuItem` creates the refs (it renders before both `NavMenuTrigger` and `NavMenuContent`). `NavMenuContent` assigns `ref={ctx.contentRef}`, `NavMenuTrigger` assigns `ref={ctx.triggerRef}`. Keydown handlers read `ctx.contentRef.current` and `ctx.triggerRef.current`. The `querySelector` calls within handlers stay (child discovery).

**Acceptance criteria:**
- All existing context-menu tests pass
- All existing menubar tests pass
- All existing navigation-menu tests pass
- No `document.getElementById` remains in any of the three files

### Phase 4: Validation + cleanup

- Run full test suite across all packages
- Run typecheck across all packages
- Verify no remaining `document.getElementById` calls in any `*-composed.tsx` file
- Verify all keyboard navigation tests still pass (these are the most sensitive to DOM access timing)

**Acceptance criteria:**
- `bun test` — all packages green
- `bun run typecheck` — clean
- `bun run lint` — clean
- `grep -r "document.getElementById" packages/ui-primitives/src/*-composed.tsx` returns 0 results

---

## Risk Assessment

**Low risk.** This is a mechanical refactoring:
- Pattern is well-established (`dialog-composed.tsx` already uses `ref` + context sharing)
- No public API changes — no component signatures change
- No behavioral changes — same null checks, same element access
- Comprehensive existing test coverage catches regressions
- Each phase is independently shippable

### Semantic difference: global DOM lookup vs. scoped ref

`document.getElementById()` searches the entire document. A `ref` is a direct pointer to the specific element it was assigned to. In theory, if an ID were accidentally set on a different element than expected, `getElementById` would find that wrong element while a `ref` would point to the correct one. In practice, all composed primitives generate unique IDs via `uniqueId()`, so this is not a realistic scenario. If such a case were discovered during migration, it would be a **pre-existing bug surfaced by the migration** — treat it as a bug fix, not a migration regression.

### Ref undefined in handler

The other risk is a `ref.current` being `undefined` in a handler that previously worked via `document.getElementById()`. This would manifest as a test failure (element not found → action not performed). The fix is always the same: ensure the ref is assigned in JSX before the handler runs.
