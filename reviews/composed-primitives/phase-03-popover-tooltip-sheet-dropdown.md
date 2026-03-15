# Phase 3: Popover, Tooltip, Sheet, DropdownMenu Composed Primitives

- **Author:** implementation agent
- **Reviewer:** adversarial reviewer
- **Date:** 2026-03-14

## Changes

- `packages/ui-primitives/src/popover/popover-composed.ts` (new)
- `packages/ui-primitives/src/tooltip/tooltip-composed.ts` (new)
- `packages/ui-primitives/src/sheet/sheet-composed.ts` (new)
- `packages/ui-primitives/src/dropdown-menu/dropdown-menu-composed.ts` (new)
- `packages/ui-primitives/src/popover/__tests__/popover-composed.test.ts` (new)
- `packages/ui-primitives/src/tooltip/__tests__/tooltip-composed.test.ts` (new)
- `packages/ui-primitives/src/sheet/__tests__/sheet-composed.test.ts` (new)
- `packages/ui-primitives/src/dropdown-menu/__tests__/dropdown-menu-composed.test.ts` (new)
- `packages/theme-shadcn/src/components/primitives/popover.ts` (modified)
- `packages/theme-shadcn/src/components/primitives/tooltip.ts` (modified)
- `packages/theme-shadcn/src/components/primitives/sheet.ts` (modified)
- `packages/theme-shadcn/src/components/primitives/dropdown-menu.ts` (modified)
- `packages/theme-shadcn/src/__tests__/themed-primitives.test.ts` (modified)
- `packages/theme-shadcn/src/__tests__/sheet.test.ts` (modified)
- `packages/ui-primitives/src/index.ts` (modified)

## Findings

### Finding 1 — Popover trigger delegates to hidden primitive trigger instead of calling show/hide directly

**Severity: SHOULD-FIX**

**File:** `packages/ui-primitives/src/popover/popover-composed.ts`, lines 111-113

The Popover composed primitive wires the user trigger with:

```ts
userTrigger.addEventListener('click', () => {
  popover.trigger.click();
});
```

This delegates the click to the hidden `Popover.Root` trigger button. Contrast with the Dialog and Sheet composed primitives, which call `dialog.show()` / `dialog.hide()` directly and check `state.open.peek()`. The Popover primitive does not expose `show()`/`hide()` methods on its return value (only `state`, `trigger`, `content`), so the click delegation makes sense mechanically.

However, this introduces an indirection: the user trigger clicks the hidden `popover.trigger`, which internally toggles. The problem is that ARIA sync happens via `onOpenChange`, which fires from within the primitive's open/close functions. This works, but it is a different pattern from Dialog and Sheet composed primitives that check state and call show/hide explicitly.

**Risk:** If the low-level Popover primitive changes its trigger behavior or adds preventative logic, the delegation pattern could silently break. The DropdownMenu composed primitive uses the same delegation pattern (line 162: `menu.trigger.click()`), making this a consistent choice within Phase 3, but inconsistent with Phase 1 (Dialog/Sheet).

**Recommendation:** Either:
1. Add `show()`/`hide()` methods to `Popover.Root` return value (like Sheet has), then use direct calls for consistency with Dialog/Sheet, OR
2. Accept the delegation pattern and document it as intentional for primitives that don't expose show/hide.

---

### Finding 2 — DropdownMenu MutationObserver is never disconnected

**Severity: BLOCKER**

**File:** `packages/ui-primitives/src/dropdown-menu/dropdown-menu-composed.ts`, lines 166-171

```ts
const observer = new MutationObserver(() => {
  const isOpen = menu.trigger.getAttribute('aria-expanded') === 'true';
  userTrigger.setAttribute('aria-expanded', String(isOpen));
  userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
});
observer.observe(menu.trigger, { attributes: true, attributeFilter: ['aria-expanded'] });
```

The `MutationObserver` is created and started, but **never disconnected**. There is no cleanup mechanism. Unlike event listeners attached to elements (which are GC'd when the element is removed from the DOM), a `MutationObserver` holds a strong reference to the callback closure and the observed node. As long as `menu.trigger` is alive in memory (it is appended to `wrapper` indirectly, or at minimum retained by the `menu` object), this observer will not be collected.

In a long-lived SPA where dropdown menus are created and destroyed repeatedly, this leaks observers and their closures.

**Contrast:** The Popover and Sheet composed primitives do NOT use MutationObserver. They sync ARIA via the `onOpenChange` callback, which is the correct approach. The DropdownMenu should do the same.

**Why the DropdownMenu uses MutationObserver instead:** The `Menu.Root` primitive does not accept an `onOpenChange` callback in its `MenuOptions`. It only has `onSelect`. So the composed primitive cannot get open/close notifications the same way Popover and Sheet do. The MutationObserver is a workaround for this missing API.

**Recommendation:** Either:
1. Add an `onOpenChange` callback to `MenuOptions` / `Menu.Root` and use it (preferred, consistent with other primitives), OR
2. At minimum, store the observer and disconnect it when the wrapper is removed from the DOM (e.g., via another MutationObserver on the parent, or a dispose pattern). However, option 1 is much cleaner.

---

### Finding 3 — Popover composed primitive does not use context for class distribution

**Severity: SHOULD-FIX**

**File:** `packages/ui-primitives/src/popover/popover-composed.ts`

The Popover composed primitive does NOT use `createContext` / `useContext` for distributing classes to sub-components like Title/Description. This is consistent with the fact that Popover only has two sub-components (Trigger, Content) and no nested content elements that need class distribution.

However, comparing with Dialog and Sheet (which use `DialogClassesContext` and `SheetClassesContext` respectively), if Popover is later extended with Title/Description/Header sub-components, the context pattern would need to be retroactively added.

This is architecturally acceptable for now, since Popover's scope is simpler. **No action needed** unless the scope grows.

**Severity reclassified:** NOTE

---

### Finding 4 — Tooltip composed primitive does not set ARIA attributes on the user trigger

**Severity: SHOULD-FIX**

**File:** `packages/ui-primitives/src/tooltip/tooltip-composed.ts`, lines 88-93

The Tooltip composed primitive moves user-provided trigger children into the low-level `tooltip.trigger` (a `<span>` element). Unlike Popover, Sheet, and DropdownMenu composed primitives, it does **not** extract the user's actual trigger element (e.g., the `<button>`) and set ARIA attributes on it.

The low-level `Tooltip.Root` already sets `aria-describedby` on the trigger `<span>` wrapper, which is correct per WAI-ARIA tooltip pattern. But the user's actual button ends up **inside** the trigger span, and does not itself have `aria-describedby`.

This is arguably correct behavior (the trigger span wraps the button, and screen readers will find the `aria-describedby` on the span). But it's a different pattern from the other three composed primitives in this phase, which all extract the user's button and wire ARIA directly on it.

**Impact:** Minimal. The tooltip pattern is fundamentally different from disclosure/menu patterns. Tooltips don't have `aria-expanded` or `aria-haspopup` -- they use `aria-describedby`, which the low-level primitive handles.

---

### Finding 5 — Sheet `withStyles` is called per-render, not per-factory

**Severity: SHOULD-FIX**

**File:** `packages/theme-shadcn/src/components/primitives/sheet.ts`, lines 52-64

```ts
function SheetRoot({ children, side, onOpenChange }: SheetRootProps): HTMLElement {
  const resolvedSide = side ?? 'right';
  const panelClass = styles[PANEL_CLASS_MAP[resolvedSide]];

  const Styled = withStyles(ComposedSheet, {
    overlay: styles.overlay,
    content: panelClass,
    title: styles.title,
    description: styles.description,
    close: styles.close,
  });

  return Styled({ children, side: resolvedSide, onOpenChange } as ComposedSheetProps);
}
```

`withStyles()` is called **inside** `SheetRoot()`, meaning every time a Sheet is rendered, a new `Styled` function is created. This is necessary because `panelClass` depends on the `side` prop, which is only known at render time. Contrast with Popover, Tooltip, and DropdownMenu, which all call `withStyles()` once at factory time (in `createThemedPopover`, etc.).

The overhead is minimal (creating a thin wrapper function + `Object.assign` for sub-component properties), but it creates unnecessary garbage on each render.

**Recommendation:** Consider an alternative approach: always pass all four panel classes and let the composed primitive pick the right one based on `side`. Or, call the composed primitive directly without `withStyles`:

```ts
return ComposedSheet({
  children,
  side: resolvedSide,
  onOpenChange,
  classes: {
    overlay: styles.overlay,
    content: panelClass,
    title: styles.title,
    description: styles.description,
    close: styles.close,
  },
});
```

This avoids the `withStyles` overhead entirely while achieving the same result. The `withStyles` utility is designed for static class binding at factory time; using it dynamically defeats its purpose.

---

### Finding 6 — Theme factories use `as ComposedXProps` casts

**Severity: SHOULD-FIX**

**Files:**
- `packages/theme-shadcn/src/components/primitives/popover.ts`, line 37
- `packages/theme-shadcn/src/components/primitives/tooltip.ts`, line 37
- `packages/theme-shadcn/src/components/primitives/sheet.ts`, line 64
- `packages/theme-shadcn/src/components/primitives/dropdown-menu.ts`, line 68

All four theme factories cast props when calling the styled/composed primitive:

```ts
return StyledPopover({ children, onOpenChange } as ComposedPopoverProps);
return StyledTooltip({ children, delay } as ComposedTooltipProps);
return Styled({ children, side: resolvedSide, onOpenChange } as ComposedSheetProps);
return Styled({ children, onSelect } as ComposedDropdownMenuProps);
```

The `as` casts are needed because `StyledPrimitive<C>` accepts `Omit<Parameters<C>[0], 'classes'>`, which should already match. The cast suggests the types don't line up naturally, possibly because `StyledPrimitive` uses `Omit<Parameters<C>[0], 'classes'>` which loses named property types when `ComposedPrimitive` has `[key: string]: unknown` in its index signature.

This isn't `as any`, so it's not a policy violation, but it weakens type checking. If someone adds a required prop to `ComposedPopoverProps` but forgets to pass it in the theme factory, the cast would silently hide the error.

**Recommendation:** Investigate whether the `StyledPrimitive` type can be refined to avoid these casts, or at minimum add a comment explaining why the cast is needed.

---

### Finding 7 — DropdownMenu `processMenuSlots` groupFactory type is overly complex and potentially incorrect

**Severity: SHOULD-FIX**

**File:** `packages/ui-primitives/src/dropdown-menu/dropdown-menu-composed.ts`, lines 185-187

```ts
function processMenuSlots(
  nodes: HTMLElement[],
  menu: ReturnType<typeof Menu.Root>,
  classes: DropdownMenuClasses | undefined,
  groupFactory?: ReturnType<typeof Menu.Root>['Group'] extends (label: string) => infer R
    ? R
    : never,
): void {
```

The type of `groupFactory` uses a conditional type to extract the return type of `Menu.Root.Group()`. This is:
```ts
{ el: HTMLDivElement; Item: (value: string, label?: string) => HTMLDivElement }
```

While functional, this is unnecessarily complex. The type could be simplified to a named interface or inline type:

```ts
groupFactory?: { el: HTMLDivElement; Item: (value: string, label?: string) => HTMLDivElement }
```

Or better, extract it as a type from the Menu module.

**Impact:** Readability only, no runtime issue.

---

### Finding 8 — No test for DropdownMenu `onSelect` callback

**Severity: SHOULD-FIX**

**File:** `packages/ui-primitives/src/dropdown-menu/__tests__/dropdown-menu-composed.test.ts`

The test file covers: rendering, classes, ARIA attributes, groups, separators, and labels. But there is **no test that verifies the `onSelect` callback fires when an item is clicked**.

This is a critical behavioral feature of the DropdownMenu. The `ComposedDropdownMenuProps` interface exposes `onSelect`, and the composed primitive passes it to `Menu.Root({ onSelect })`. But without a test, there's no verification that user item clicks propagate through the slot scanning, item processing, and callback chain correctly.

**Recommendation:** Add a test:
```ts
describe('Given a DropdownMenu with onSelect', () => {
  it('Then calls onSelect when an item is clicked', () => {
    const selected: string[] = [];
    // ... create menu with onSelect: (v) => selected.push(v)
    // ... click an item
    // expect(selected).toEqual(['edit']);
  });
});
```

---

### Finding 9 — No test for Popover close behavior (clicking outside, Escape key)

**Severity: SHOULD-FIX**

**File:** `packages/ui-primitives/src/popover/__tests__/popover-composed.test.ts`

The Popover test covers: rendering, opening on click, classes, onOpenChange, and ARIA attributes. But there are no tests for:

1. **Closing the popover** (toggling via trigger click)
2. **Escape key** dismissal (the low-level `Popover.Root` handles this, but the composed primitive should verify it flows through)
3. **aria-expanded sync** after open/close cycle (verifying it goes from 'false' -> 'true' -> 'false')

By contrast, the Sheet test includes a close-via-Close-button test. The Popover should test at minimum the toggle behavior.

---

### Finding 10 — No test for Tooltip delay prop passthrough

**Severity: NOTE**

**File:** `packages/ui-primitives/src/tooltip/__tests__/tooltip-composed.test.ts`

The tooltip composed primitive accepts a `delay` prop and passes it to `Tooltip.Root({ delay })`. There is no test verifying this passthrough. Given that the delay is handled by `setTimeout` in the low-level primitive, testing it would require either: mocking timers, or verifying the tooltip doesn't show immediately. This is a low-risk gap since the passthrough is trivial.

---

### Finding 11 — Sheet composed primitive: `resolvedNodes` variable initialization pattern

**Severity: NOTE**

**File:** `packages/ui-primitives/src/sheet/sheet-composed.ts`, lines 131-134

```ts
let resolvedNodes: Node[];
SheetClassesContext.Provider(classes, () => {
  resolvedNodes = resolveChildren(children);
});
```

The `resolvedNodes` variable is declared with `let` and assigned inside the `Provider` callback. It's then used on line 137 with `resolvedNodes!` (non-null assertion). This is the same pattern used in `ComposedDialog` and `ComposedAlertDialog`, so it's consistent. The non-null assertion is safe because `Provider` executes the callback synchronously.

This is an established pattern in the codebase — no action needed.

---

### Finding 12 — Popover composed does not include overlay element

**Severity: NOTE**

**File:** `packages/ui-primitives/src/popover/popover-composed.ts`

The low-level `Popover.Root` does not create an overlay element (unlike Dialog and Sheet). The composed Popover correctly does not attempt to add one. The `PopoverClasses` interface only has `content` as a key, which is correct.

The popover dismiss-on-click-outside behavior is handled by the low-level primitive's `createDismiss` utility (when `positioning` is provided). Since the composed primitive does not pass `positioning` to `Popover.Root`, dismiss-on-click-outside is NOT wired up.

**Wait** -- this is actually significant. Let me re-check.

Looking at `popover-composed.ts` line 87-95:
```ts
const popover = Popover.Root({
  onOpenChange: (isOpen) => { ... },
});
```

No `positioning` option is passed. In the low-level `Popover.Root`, the dismiss handler is only created when `positioning` is present (lines 51-58 of `popover.tsx`). This means the composed Popover has **no click-outside dismiss behavior**.

This might be intentional (the theme layer or consumer is expected to handle positioning separately), but it means the composed popover, once opened, can only be closed by clicking the trigger again. There is no Escape key handling either, because that is also inside the content's `onKeydown` handler -- actually, the Escape handler IS always wired (lines 103-108 of `popover.tsx`), so Escape works regardless of `positioning`.

**Summary:** Click-outside dismiss does not work in the composed Popover. Escape key does. This may be by design (positioning is a layout concern for the theme layer), but it should be documented.

---

### Finding 13 — DropdownMenu composed primitive uses `Menu.Root` directly, not `DropdownMenu.Root`

**Severity: SHOULD-FIX**

**File:** `packages/ui-primitives/src/dropdown-menu/dropdown-menu-composed.ts`, line 10 and line 139

```ts
import { Menu } from '../menu/menu';
// ...
const menu = Menu.Root({ onSelect });
```

The composed DropdownMenu uses `Menu.Root` directly instead of `DropdownMenu.Root`. The low-level `DropdownMenu.Root` is a thin wrapper that adds `positioning: { placement: 'bottom-start' }` as a default.

By using `Menu.Root` directly, the composed DropdownMenu:
1. Does NOT get default `bottom-start` positioning
2. Does NOT get the `createFloatingPosition` / `createDismiss` behavior that comes with positioning

This means:
- The dropdown menu does not float/position relative to its trigger
- There is no click-outside dismiss from the `createDismiss` utility

The low-level `Menu.Root` does add a `mousedown` listener for click-outside when `positioning` is not provided (lines 76-77 of `menu.tsx`), so click-outside DOES work. But floating positioning does not.

**Recommendation:** Use `DropdownMenu.Root` instead of `Menu.Root` to get the default positioning behavior, OR intentionally pass positioning options through the composed primitive's props.

---

### Finding 14 — Content class merging inconsistency in DropdownMenu

**Severity: NOTE**

**File:** `packages/ui-primitives/src/dropdown-menu/dropdown-menu-composed.ts`, lines 142-144

```ts
if (classes?.content) {
  menu.content.className = classes.content;
}
```

The DropdownMenu only applies `classes.content` to the menu content. It does NOT merge with a per-instance class from the Content slot marker. Contrast with Popover, Sheet, and Tooltip:

```ts
// Popover, Tooltip, Sheet pattern:
const contentInstanceClass = contentEntry?.attrs.class;
const contentClassCombined = [classes?.content, contentInstanceClass].filter(Boolean).join(' ');
if (contentClassCombined) {
  popover.content.className = contentClassCombined;
}
```

If a consumer uses `<DropdownMenu.Content class="extra-class">`, the per-instance class is ignored at the content level.

**Impact:** Low. The Content sub-component in DropdownMenu is a structural container, and per-instance classes on it are less common. But this is an inconsistency with the other three composed primitives.

---

### Finding 15 — Theme-shadcn tests for DropdownMenu don't test item click / onSelect

**Severity: NOTE**

**File:** `packages/theme-shadcn/src/__tests__/themed-primitives.test.ts`, lines 582-661

The themed DropdownMenu tests verify: sub-component existence, slot markers (data-slot, data-value, data-label), and ARIA attributes on trigger. But they do not test:
- Clicking an item fires `onSelect`
- Theme classes applied to items inside the menu
- Opening/closing the menu via trigger click

The themed test coverage is thinner than the Popover and Sheet tests, which include open/close interaction tests.

---

## Summary

| # | Severity | Component | Issue |
|---|----------|-----------|-------|
| 1 | SHOULD-FIX | Popover | Trigger delegates to hidden button instead of direct show/hide |
| 2 | BLOCKER | DropdownMenu | MutationObserver is never disconnected -- memory leak |
| 3 | NOTE | Popover | No context for class distribution (acceptable for current scope) |
| 4 | SHOULD-FIX | Tooltip | Different ARIA wiring pattern from other 3 (acceptable per tooltip spec) |
| 5 | SHOULD-FIX | Sheet theme | `withStyles` called per-render instead of per-factory |
| 6 | SHOULD-FIX | All themes | `as ComposedXProps` casts weaken type checking |
| 7 | SHOULD-FIX | DropdownMenu | `processMenuSlots` groupFactory type is needlessly complex |
| 8 | SHOULD-FIX | DropdownMenu tests | No test for `onSelect` callback |
| 9 | SHOULD-FIX | Popover tests | No test for close behavior or toggle cycle |
| 10 | NOTE | Tooltip tests | No test for delay prop passthrough |
| 11 | NOTE | Sheet | `resolvedNodes!` pattern is consistent with codebase |
| 12 | NOTE | Popover | No click-outside dismiss (may be by design) |
| 13 | SHOULD-FIX | DropdownMenu | Uses `Menu.Root` instead of `DropdownMenu.Root` -- misses default positioning |
| 14 | NOTE | DropdownMenu | Content class merging doesn't include per-instance class |
| 15 | NOTE | DropdownMenu theme tests | Missing interaction tests |

## Blockers

1. **Finding 2** — The MutationObserver in `dropdown-menu-composed.ts` is never disconnected. This is a memory leak in long-lived SPAs. Must fix before merge. The recommended fix is to add `onOpenChange` to `MenuOptions` / `Menu.Root` (consistent with Popover, Sheet, Dialog primitives), then use it for ARIA sync instead of MutationObserver.

## Resolution

_Pending author response._
