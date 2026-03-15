# Phase 1: Dialog + AlertDialog Composed Primitives

- **Author:** viniciusdacal
- **Reviewer:** claude-opus
- **Commits:** e55b53cc
- **Date:** 2026-03-14

## Changes

- `packages/ui-primitives/src/composed/scan-slots.ts` (new)
- `packages/ui-primitives/src/composed/__tests__/scan-slots.test.ts` (new)
- `packages/ui-primitives/src/composed/with-styles.ts` (new)
- `packages/ui-primitives/src/composed/__tests__/with-styles.test.ts` (new)
- `packages/ui-primitives/src/dialog/dialog-composed.ts` (new)
- `packages/ui-primitives/src/dialog/__tests__/dialog-composed.test.ts` (new)
- `packages/ui-primitives/src/dialog/dialog.tsx` (modified - added `description` element + `aria-describedby`)
- `packages/ui-primitives/src/dialog/__tests__/dialog.test.ts` (modified - test for description)
- `packages/ui-primitives/src/alert-dialog/alert-dialog-composed.ts` (new)
- `packages/ui-primitives/src/alert-dialog/__tests__/alert-dialog-composed.test.ts` (new)
- `packages/ui-primitives/src/index.ts` (modified - public exports)
- `packages/theme-shadcn/src/components/primitives/dialog.ts` (modified - migrated to withStyles)
- `packages/theme-shadcn/src/components/primitives/alert-dialog.ts` (modified - migrated to withStyles)
- `plans/composed-primitives.md` (new)

## CI Status

- [ ] `dagger call ci` passed at e55b53cc

## Review Checklist

- [ ] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases
- [ ] No security issues (injection, XSS, etc.)
- [ ] Public API changes match design doc

## Findings

### BLOCKER-1: Theme migration breaks return value contract

**File:** `packages/theme-shadcn/src/components/primitives/dialog.ts`

The old `createThemedDialog` returned the **user trigger element** directly (or the primitive trigger if none provided). The existing theme test at line 451-452 confirms this:

```ts
const result = Dialog({ children: [triggerSlot, contentSlot] });
expect(result).toBe(btn); // expects the user's button element back
```

The new implementation returns a **wrapper div** (`style="display: contents"`), not the trigger. This is a behavioral regression. Any consumer code that relied on the return value being the trigger element (e.g., storing a ref to it, appending it to a specific parent) will break.

The existing `themed-primitives.test.ts` was NOT updated, meaning these tests will fail:
- `"returns user trigger when Dialog.Trigger is provided"` (line 441)
- `"returns primitive trigger when no Dialog.Trigger is provided"` (line 455)

Similarly, the old AlertDialog tests expect `btn.getAttribute('data-state')` to reflect state changes on the **trigger itself** (lines 239-241, 262-264), because the old code set `aria-expanded` and `data-state` on the user trigger. The composed primitive does NOT propagate `data-state` or `aria-expanded` to the user trigger.

**Impact:** Breaking change in both Dialog and AlertDialog theme wrappers. Existing consumer code and existing theme tests will fail.

**Fix:** Either (a) update the composed primitives to propagate state attributes to the user trigger, or (b) update the theme tests and document the behavioral change. Option (a) is preferred for backward compatibility.

### BLOCKER-2: Missing portaling to `document.body`

**File:** `packages/ui-primitives/src/dialog/dialog-composed.ts` (line 216-218), `alert-dialog-composed.ts` (line 224-226)

The old themed Dialog and AlertDialog portaled overlay and content to `document.body`:

```ts
document.body.appendChild(primitive.overlay);
document.body.appendChild(primitive.content);
```

The new composed primitives append overlay and content to a **local wrapper div** instead. This is a significant behavior change:

1. The overlay will NOT cover the full viewport since it sits inside the component tree, not at the document root.
2. Stacking context issues: the dialog content may be clipped by parent overflow, z-index, or transform containers.
3. The existing theme tests (lines 361-365) query `document.querySelector('[data-dialog-overlay]')` without scoping to a container, but they work because the old code portaled to `document.body`. After migration, the overlay is inside the wrapper -- these queries may still find it, but in production the lack of portaling will cause visual bugs.

The design doc (section 8) acknowledges portal behavior but says composed primitives portal elements. The implementation does NOT portal.

**Fix:** Add portaling to `document.body` for overlay and content in both composed Dialog and AlertDialog, matching the old behavior and the design doc.

### BLOCKER-3: Missing `aria-haspopup` on user trigger

**File:** `packages/ui-primitives/src/dialog/dialog-composed.ts`, `alert-dialog-composed.ts`

The old themed Dialog set `aria-haspopup="dialog"` and `aria-controls` on the user trigger element. The composed primitives wire click handlers to the user trigger but do NOT set these ARIA attributes. This is an a11y regression.

Without `aria-haspopup`, screen readers cannot announce that the button opens a dialog. Without `aria-controls`, the programmatic link between trigger and dialog content is lost.

**Fix:** Add `aria-haspopup="dialog"` and `aria-controls={content.id}` to the user trigger in both composed components. Also add `aria-expanded` state syncing.

### BLOCKER-4: No `.test-d.ts` type flow tests

**Rule:** `.claude/rules/tdd.md` requires: "Every phase with generic type parameters MUST include .test-d.ts tests."

The design doc explicitly specifies type tests (section "Type Flow Map" and "Type tests (.test-d.ts)"):
- Correct class map accepted
- `@ts-expect-error` on unknown class keys
- `@ts-expect-error` on missing required keys
- Cross-component key rejection (Dialog keys on Tabs, etc.)

`withStyles()` uses generics (`C extends ComposedPrimitive`) and `ClassesOf<C>` type inference. There are zero `.test-d.ts` files. This is a hard requirement per the project rules.

**Fix:** Add `packages/ui-primitives/src/composed/__tests__/with-styles.test-d.ts` with positive and negative type tests.

### SHOULD-FIX-1: `scanSlots` deviates from design doc API

**File:** `packages/ui-primitives/src/composed/scan-slots.ts`

The design doc specifies `scanSlots` with a `config` parameter to distinguish single vs. multiple slots:

```ts
scanSlots(nodes, { trigger: 'single', content: 'single' });
```

The implementation takes only `nodes` and always returns `SlotEntry[]` per slot name. The design doc's `config` parameter was explicitly called out as important for future composed primitives (Tabs needs multiple triggers/contents).

While the current implementation works for Dialog/AlertDialog (which only use single slots), Phase 2 will need the `config` parameter or a different approach. This isn't blocking Phase 1, but diverging from the design doc without documenting the deviation is a process violation.

**Fix:** Either implement the `config` parameter now, or update the design doc with an explicit note about the deviation and why `SlotEntry[]` is sufficient.

### SHOULD-FIX-2: `innerHTML` usage for SVG icons in DialogClose

**File:** `packages/ui-primitives/src/dialog/dialog-composed.ts` (line 128)

```ts
el.innerHTML = '<svg width="15" height="15" ...>';
```

While this specific SVG string is static and safe, `innerHTML` is flagged by the project's security conventions. The theme's `dialog.ts` also uses `innerHTML` for the same purpose (line 59-60), so this is a pre-existing pattern. However, since this is a new file, it would be better to use DOM APIs:

```ts
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
// ... set attributes and paths
```

This is a NIT in practice since the string is a compile-time constant, but worth noting for consistency if the project later adds CSP headers that block inline HTML.

### SHOULD-FIX-3: `withStyles` copies properties using `Object.getOwnPropertyNames` but skips `__classKeys`

**File:** `packages/ui-primitives/src/composed/with-styles.ts` (lines 58-62)

The property copying loop filters `length`, `name`, and `prototype` but does NOT filter `__classKeys`. The `__classKeys` property is a phantom type brand that should never exist at runtime (the interface uses `?` optional), but if someone accidentally sets it, it would leak through.

The `StyledPrimitive` type definition correctly omits `__classKeys` (line 38), but the runtime doesn't match the type -- it copies whatever properties exist.

**Fix:** Add `'__classKeys'` to the skip list, or document that `__classKeys` is phantom-only and never set at runtime.

### SHOULD-FIX-4: Dialog close button gets `classes.close` applied twice

**File:** `packages/theme-shadcn/src/components/primitives/dialog.ts` (lines 55-57, 62)

In `createThemedDialog`, the `closeIcon` is created with `closeIcon.className = styles.close` (line 57). Then `withStyles` pre-binds `close: styles.close` into the classes. When the composed Dialog creates its own DialogClose (the fallback SVG close button), it reads `classes.close` from context and applies it.

But the `closeIcon` prop bypasses the DialogClose sub-component entirely -- the composed Dialog appends it directly to the content panel (line 212 of dialog-composed.ts). The `classes.close` applied via context only affects DialogClose elements, not the `closeIcon` prop. So in the theme case, the `closeIcon` has `styles.close` manually set, and the DialogClose class goes unused.

However, if a user provides both a `closeIcon` AND uses `<Dialog.Close>` inside the content, the `Dialog.Close` will get `classes.close` AND the `closeIcon` will get `styles.close`. Both will render inside the content panel. There's no deduplication.

This is confusing API design -- two paths to close, with overlapping styling concerns.

**Fix:** Consider removing the DialogClose sub-component's `data-slot="dialog-close"` click delegation when a `closeIcon` prop is provided, or document the intended relationship between `closeIcon` and `Dialog.Close`.

### SHOULD-FIX-5: AlertDialog `onAction` is called AND dialog closes -- but what if `onAction` is async?

**File:** `packages/ui-primitives/src/alert-dialog/alert-dialog-composed.ts` (lines 218-221)

```ts
if (actionTarget) {
  onAction?.();
  alertDialog.hide();
}
```

The dialog closes synchronously, regardless of whether `onAction` succeeds or fails. For destructive operations (delete, etc.), the user might expect the dialog to stay open until the action completes, or to show an error. This is a common UX pattern.

The design doc doesn't address async actions. The old themed AlertDialog had the same behavior (fire action, close immediately). However, since this is a new API, consider supporting `onAction` returning a Promise, where the dialog stays open until the promise resolves.

**Fix:** At minimum, document this as a known limitation. For a better UX, consider:
```ts
const result = onAction?.();
if (result instanceof Promise) {
  result.then(() => alertDialog.hide());
} else {
  alertDialog.hide();
}
```

### SHOULD-FIX-6: `ComposedPrimitive` interface accepts `[key: string]: unknown` -- breaks type safety

**File:** `packages/ui-primitives/src/composed/with-styles.ts` (line 22)

```ts
export interface ComposedPrimitive<K extends string = string> {
  (props: {
    children?: ChildValue;
    classes?: Partial<Record<K, string>>;
    [key: string]: unknown;  // <-- this
  }): HTMLElement;
  __classKeys?: K;
}
```

The index signature `[key: string]: unknown` means ANY property is accepted. This eliminates TypeScript's ability to catch typos in props. For example, `Dialog({ chldren: ... })` (typo) would silently compile.

**Fix:** Remove the index signature. If specific composed primitives need extra props (like `onOpenChange`, `closeIcon`), use a union or extend the interface per component.

### NIT-1: Inconsistent class application method: `className =` vs `classList.add()`

The old theme code used `classList.add(styles.panel)` which adds a single class token. The new code uses `className = styles.panel` which replaces all classes. When `styles.panel` contains spaces (e.g., Tailwind utility classes like `"bg-white rounded-lg p-4"`), `classList.add()` treats it as a single invalid token, while `className =` handles it correctly.

The new approach is actually correct for Tailwind/utility-first CSS. However, the existing theme tests use `classList.contains()` to verify classes:

```ts
expect(content.classList.contains(styles.panel)).toBe(true);
```

If `styles.panel = "bg-white rounded-lg"`, then `el.className = "bg-white rounded-lg"` sets two classes. `el.classList.contains("bg-white rounded-lg")` returns `false` because `contains` checks for a single token. The old code used `classList.add("bg-white rounded-lg")` which creates a single (invalid) token that `contains` would match.

This mismatch could cause theme test failures when multi-word class strings are used.

### NIT-2: `classes` prop is `Partial<Record<K, string>>` but `withStyles` requires full `Record<K, string>`

This is correct behavior -- `withStyles` should require all keys, while the `classes` prop on the composed component is optional per key. Just noting this is well-designed.

### NIT-3: Missing test for `closeIcon` prop on Dialog

The `ComposedDialogProps` interface includes `closeIcon?: HTMLElement`, but there is no test verifying this behavior. The theme migration relies on it (`createThemedDialog` passes a styled close button as `closeIcon`). Without a test, regressions could slip through.

### NIT-4: `description` class test missing in composed Dialog tests

The tests cover overlay, content, title, header, footer, and close classes, but not the `description` class. The `createDialogTree` helper creates a `DialogDescription` sub-component, so it would be simple to add a test verifying `description: 'test-description'` is applied.

## Summary

**Verdict: Changes Requested**

The architecture is sound -- context-based class distribution, slot scanning, and `withStyles` are well-designed patterns that will significantly reduce theme duplication. The code is clean and well-organized.

However, there are four blockers:

1. **Return value regression** -- the themed Dialog/AlertDialog no longer return the trigger element
2. **Missing portaling** -- overlay/content are not portaled to `document.body`
3. **Missing ARIA attributes** on user trigger (`aria-haspopup`, `aria-controls`, `aria-expanded`)
4. **Missing `.test-d.ts` type tests** for `withStyles` generics

Items 1-3 mean existing theme tests will fail and existing consumer behavior changes. Item 4 is a hard process requirement.

## Resolution

*Pending -- awaiting fixes for blockers.*
