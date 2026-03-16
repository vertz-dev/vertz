# Phase 2: Context-Based Self-Wiring Implementation

- **Author:** claude
- **Reviewer:** claude (adversarial)
- **Date:** 2026-03-16

## Changes

- `packages/ui-primitives/src/tooltip/tooltip-composed.tsx` (modified)
- `packages/ui-primitives/src/tooltip/__tests__/tooltip-composed.test.ts` (modified)
- `packages/ui-primitives/src/popover/popover-composed.tsx` (modified)
- `packages/ui-primitives/src/popover/__tests__/popover-composed.test.ts` (modified)
- `packages/ui-primitives/src/dialog/dialog-composed.tsx` (modified)
- `packages/ui-primitives/src/dialog/__tests__/dialog-composed.test.ts` (modified)
- `packages/ui-primitives/src/alert-dialog/alert-dialog-composed.tsx` (modified)
- `packages/ui-primitives/src/alert-dialog/__tests__/alert-dialog-composed.test.ts` (modified)
- `packages/ui-primitives/src/sheet/sheet-composed.tsx` (modified)
- `packages/ui-primitives/src/sheet/__tests__/sheet-composed.test.ts` (modified)
- `packages/ui-primitives/src/tabs/tabs-composed.tsx` (modified)
- `packages/ui-primitives/src/tabs/__tests__/tabs-composed.test.ts` (modified)
- `packages/ui-primitives/src/accordion/accordion-composed.tsx` (modified)
- `packages/ui-primitives/src/accordion/__tests__/accordion-composed.test.ts` (modified)
- `packages/ui-primitives/src/radio/radio-composed.tsx` (modified)
- `packages/ui-primitives/src/radio/__tests__/radio-composed.test.ts` (modified)
- `packages/ui-primitives/src/select/select-composed.tsx` (modified)
- `packages/ui-primitives/src/select/__tests__/select-composed.test.ts` (modified)
- `packages/ui-primitives/src/dropdown-menu/dropdown-menu-composed.tsx` (modified)
- `packages/ui-primitives/src/dropdown-menu/__tests__/dropdown-menu-composed.test.ts` (modified)
- `packages/ui-primitives/src/index.ts` (modified -- removed `scanSlots`/`ScanResult`/`SlotEntry` exports)

## CI Status

- [x] All 127 composed primitive tests pass (0 failures, 228 expect() calls)

## Review Checklist

- [x] Context error handling -- all sub-components throw with clear messages when used outside their root
- [x] ARIA compliance -- aria-haspopup, aria-expanded, aria-controls, data-state correctly applied where needed
- [x] Event cleanup -- `_tryOnCleanup` used for all manually added event listeners (Popover, Dialog, AlertDialog, Sheet, DropdownMenu triggers and content delegation handlers)
- [x] Class application -- CSS classes correctly composed (merging component-level + instance-level via filter/join pattern)
- [x] Children resolution -- `resolveChildren()` called correctly in all sub-components
- [x] Context value completeness -- context values include all fields needed by sub-components
- [x] Group override pattern -- Select and DropdownMenu correctly use `_createItem` override via nested `Provider` calls
- [x] Type safety -- no `as any`, no `@ts-ignore`, proper TypeScript throughout
- [x] HMR stable IDs -- all `createContext()` calls use `@vertz/ui-primitives::` prefix convention
- [x] Coding conventions -- single quotes, semicolons, trailing commas, 2-space indent throughout
- [ ] Duplicate sub-component detection -- **NOT IMPLEMENTED** (see Blockers)
- [ ] `scanSlots` cleanup -- Phase 5 files (`scan-slots.ts`, `scan-slots.test.ts`) still exist (expected, per design doc phasing)

## Review Summary

The refactoring is well-executed overall. All 10 composed primitives have been cleanly converted from `scanSlots` to context-based self-wiring. The code follows consistent patterns across related component groups. Context stable IDs follow convention. Event cleanup is handled properly. Test coverage is solid for both happy paths and error paths.

However, the review identifies several findings ranging from a missing design doc requirement to potential edge-case bugs and missing test coverage.

## Findings

### Blockers (must fix before merge)

**B1: Duplicate sub-component detection is not implemented (all 10 components)**

The design doc explicitly states:

> A `claimed` boolean flag on the context value detects duplicate Content/Trigger sub-components in dev mode [...] This is a hard requirement, not optional. Without it, duplicate sub-components produce silent, broken behavior.

No composed component implements this. If a developer renders two `<Dialog.Content>` inside a single `<Dialog>`, both will call `resolveChildren()` and `appendChild()` on the same `dialog.content` element, resulting in double-appended children with no warning. For components like Tooltip and Popover where Content returns the primitive element directly, the second Content would also return the same element -- creating a DOM tree where the same element appears in two places (undefined behavior).

This was explicitly called a "hard requirement" in the design doc. It should be implemented for at least `Trigger` and `Content` sub-components across all components that use the "return primitive elements" pattern (Tooltip, Popover, Dialog, AlertDialog, Sheet, DropdownMenu).

**B2: Dialog/AlertDialog/Sheet Content returns only `dialog.content`, but overlay is positioned incorrectly**

In `dialog-composed.tsx`, the root component renders:
```tsx
return (
  <div style="display: contents">
    {...resolvedNodes}
    {dialog.overlay}
    {dialog.content}
  </div>
);
```

And `DialogContent` returns just `dialog.content`:
```tsx
return dialog.content;
```

This means `dialog.content` is placed in the DOM tree in two locations: once as a child of the root wrapper (via `{dialog.content}` in the root's JSX) and once as the return value of `DialogContent` (which is part of `resolvedNodes`). A DOM element can only have one parent, so the last insertion wins. Since the root renders `{...resolvedNodes}` BEFORE `{dialog.overlay}{dialog.content}`, the final DOM order is: resolvedNodes first (including the Content sub-component's return, which places `dialog.content` somewhere in the resolved tree), then `dialog.overlay`, then `dialog.content` is moved again to the end.

Actually, upon closer inspection this is intentional -- the `resolvedNodes` include the trigger but NOT `dialog.content` as a separate node, because `DialogContent` returns `dialog.content` from the primitive, and then the root also appends `{dialog.overlay}{dialog.content}`. The DOM will ultimately place `dialog.content` at the root level (last insertion wins since an element can only be in one parent), which is the correct behavior for modal dialog layering. However, this relies on the implicit DOM re-parenting behavior of `appendChild` and is fragile.

After further analysis: the sub-component `DialogContent` returns `dialog.content`. This becomes part of `resolvedNodes` during the `Provider(() => resolveChildren(children))` call. Then the root's JSX also renders `{dialog.content}`. Since a DOM node can only have one parent, the second insertion (in the root's JSX) effectively moves it. This means the content is correctly positioned at the end of the root wrapper. **Downgrading to should-fix** -- the code works but the double-inclusion is confusing. A comment explaining this would help.

### Should-Fix (fix if reasonable)

**S1: Tooltip composed does not set `aria-controls` on the trigger**

Popover, Dialog, AlertDialog, Sheet, and DropdownMenu all set `aria-controls` on the user trigger pointing to the content element's ID. Tooltip's composed trigger does NOT. The Tooltip primitive's internal trigger does set `aria-describedby` (via the primitive), but the composed layer's trigger only populates children into the primitive trigger -- it doesn't add `aria-controls` or `aria-describedby` to the user trigger element.

This means the user's button inside `<Tooltip.Trigger>` has no ARIA linkage to the tooltip content. The primitive's wrapper span has `aria-describedby`, but the actual interactive element the user provides does not. This is a minor accessibility gap but inconsistent with the other composed triggers.

**S2: RadioGroup keyboard navigation skips disabled items incorrectly**

In `radio-composed.tsx` line 172:
```tsx
if (nextRef?.current && !nextRef.current.hasAttribute('aria-disabled')) {
  selectItem(itemValues[nextIdx] ?? '', nextIdx);
}
```

If the next item is disabled, the keyboard navigation does nothing -- it doesn't skip to the next non-disabled item. The user presses Arrow Down, hits a disabled item, and focus stays on the current item. Standard radio group behavior (WAI-ARIA) should skip disabled items and continue to the next enabled one.

**S3: Dialog/AlertDialog Content double-includes `dialog.content` in the DOM tree**

As discussed in B2, `DialogContent` returns `dialog.content`, which is part of `resolvedNodes`. The root also renders `{dialog.content}` explicitly. While DOM re-parenting ensures correct final positioning, this is confusing and fragile. Consider either:
- Having `DialogContent` return a no-op span (the root already places `dialog.content` at the correct position), or
- Removing `{dialog.content}` from the root's JSX (since Content already returns it).

**S4: Select and DropdownMenu `_createItem` pattern uses context override instead of dual context**

The design doc specifies a dual-context pattern (`SelectContext` + `SelectGroupContext`) where `Select.Item` checks for `SelectGroupContext` first. The implementation instead overrides `_createItem` on the same `SelectContext` via a nested `Provider`. This works but has a subtle difference: the nested Provider replaces the entire context value, not just the item factory. If the group's Provider accidentally omits a field from the parent context, sub-components inside the group would get `undefined` for that field.

In the Select implementation, the group re-provides `{ select, classes, _createItem: ... }` which correctly passes through `select` and `classes`. In the DropdownMenu implementation, the group re-provides `{ menu, classes, _registerTrigger, _createItem: ... }` which also correctly passes through all fields. So this works today, but adding a new field to the context in the future would require updating both the root AND all group overrides. A dedicated `SelectGroupContext` as designed would be more maintainable.

**S5: Tooltip composed test calls components as functions, not JSX**

All tests call composed components as functions (e.g., `ComposedTooltip({ children: ... })`). This is fine for unit tests -- however, test descriptions reference "scanned slots" terminology in one place:
- `radio-composed.test.ts` line 18: `"Then creates a radiogroup with items from scanned slots"` -- this references the old `scanSlots` pattern.

**S6: `onOpenChange` is stored in context but also passed to the primitive in Popover/Dialog/AlertDialog**

In `popover-composed.tsx`, the context value includes `onOpenChange` as a field:
```tsx
const ctxValue: PopoverContextValue = {
  popover,
  classes,
  onOpenChange,  // <-- stored in context
  ...
};
```

But no sub-component reads `onOpenChange` from context. It's only used by the `Popover.Root({ onOpenChange: ... })` call. The context field is dead code. Same pattern in Dialog and AlertDialog contexts. Consider removing the unused field from the context value to avoid confusion.

### Notes (informational, no action needed)

**N1: `scanSlots` and related test files still exist**

`packages/ui-primitives/src/composed/scan-slots.ts` and its test file still exist. The `scanSlots` export has been removed from `index.ts` and no composed component imports it. This is expected -- the design doc puts cleanup in Phase 5, which depends on all component refactors being complete. No action needed now, but should be cleaned up before merge to main.

**N2: Consistent use of `display: contents` wrappers**

All trigger sub-components (Popover, Dialog, AlertDialog, Sheet, DropdownMenu) wrap resolved children in `<span style="display: contents">`. The Tooltip composed root and Popover composed root wrap resolved nodes in `<div style="display: contents">`. This is consistent within component types and aligns with the design doc's explicit non-goal of not removing these wrappers.

**N3: Tabs and Accordion return primitive-owned elements directly from sub-components**

The design doc mentions that Tabs/Accordion/Select/Menu sub-components should return no-op spans because the primitive auto-appends elements. The actual implementation has `TabsTrigger` return `trigger` (the primitive element) and `TabsContent` return `panel` (the primitive element). This works because the primitive's `Tab()` method already appends trigger to `tabs.list` and panel to `tabs.root` -- the returned elements are already in the DOM. The return value is effectively ignored by the caller since the elements are already placed. The design doc's guidance was conservative; the implementation is pragmatically correct.

**N4: AlertDialog correctly blocks Escape and overlay dismiss**

The AlertDialog composed component correctly delegates to `AlertDialog.Root` which blocks Escape key closing and overlay click dismissal. The trigger only opens (never closes on click), which is the correct AlertDialog behavior. Tests verify both of these behaviors (lines 88-114 in the test file).

**N5: Test coverage is strong**

All components have tests for:
- Basic rendering (structure, ARIA roles)
- User interaction (click, keyboard)
- Class application (theme classes, per-instance classes, merged classes)
- Error paths (sub-components outside root throw)
- Event cleanup (disposal scope tests for components with event listeners)
- Callback propagation (onOpenChange, onValueChange, onAction, onSelect)

The BDD-style `describe/it` structure is followed consistently.

## Verdict

**Changes Requested**

The implementation is solid and well-tested, but the missing duplicate sub-component detection (B1) is a design doc hard requirement that should be addressed before merge. The should-fix items (S1-S6) are lower priority but S2 (disabled radio item skip) and S3 (double content inclusion) should ideally be addressed. S5 (stale test description) is a trivial fix.
