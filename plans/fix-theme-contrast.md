# Fix: Light/Dark Mode Contrast Issues in Themed Components

**Issue:** [#1689](https://github.com/vertz-dev/vertz/issues/1689)
**Type:** Bug fix (Tier 1 — internal)

## Problem

Several themed components have contrast issues in light and/or dark mode. The root causes are:

1. **Missing explicit `text:foreground` on dialog panels** — Dialog and AlertDialog set `bg:background` but don't set `text:foreground`. When `<dialog>` renders in the browser's top-layer via `showModal()`, text color inheritance from `<body>` can fail, resulting in browser-default black text on dark backgrounds.

2. **Missing explicit text colors on titles** — Dialog and AlertDialog titles have font styles but no color declaration. They rely on inheritance which breaks in the same top-layer scenario.

3. **Inconsistency across similar components** — Sheet and Drawer already correctly set `text:foreground` on their panels. Dialog and AlertDialog do not. Calendar, Carousel, and Menubar root elements also use `bg:background` without explicit text color.

## Audit Results

### Components with `bg:background` — Missing `text:foreground`

| Component | File | Line | Status |
|-----------|------|------|--------|
| Dialog panel | `styles/dialog.ts` | 48 | **Missing** — renders in top-layer |
| AlertDialog panel | `styles/alert-dialog.ts` | 48 | **Missing** — renders in top-layer |
| Dialog title | `styles/dialog.ts` | 100 | **Missing** — no color at all |
| AlertDialog title | `styles/alert-dialog.ts` | 90 | **Missing** — no color at all |
| Calendar root | `styles/calendar.ts` | 33 | Missing (normal flow) |
| Carousel buttons | `styles/carousel.ts` | 25, 47 | Missing (normal flow) |
| Menubar root | `styles/menubar.ts` | 24 | Missing (normal flow) |
| Pagination link | `styles/pagination.ts` | 86 | Missing (normal flow) |
| Date-picker trigger | `styles/date-picker.ts` | 29 | Missing (normal flow) |
| AlertDialog cancel | `styles/alert-dialog.ts` | 126 | Missing (inside dialog) |
| Outline button (base) | `styles/button.ts` | 56 | Missing (normal flow) |

### Components with `bg:background` + `text:foreground` — Already Correct

| Component | File |
|-----------|------|
| Sheet panels | `styles/sheet.ts` |
| Drawer panels | `styles/drawer.ts` |
| Toast root | `styles/toast.ts` |

### Components with `bg:popover` + `text:popover-foreground` — Already Correct

| Component | File |
|-----------|------|
| Select content | `styles/select.ts` |
| Dropdown content | `styles/dropdown-menu.ts` |
| Popover content | `styles/popover.ts` |
| Command root | `styles/command.ts` |
| Context menu content | `styles/context-menu.ts` |
| Hover card content | `styles/hover-card.ts` |
| Date-picker dropdown | `styles/date-picker.ts` |
| Navigation menu content | `styles/navigation-menu.ts` |
| Menubar content | `styles/menubar.ts` |

### Components with `bg:card` + `text:card-foreground` — Already Correct

| Component | File |
|-----------|------|
| Card root | `styles/card.ts` |
| Alert root | `styles/alert.ts` |

## Proposed Fix

### Rule: Every component that sets a background token must also set the corresponding foreground token.

This ensures text color is always explicit and never relies on inheritance — which is fragile for top-layer elements (`<dialog>`) and components rendered in isolated contexts.

### Changes

**Critical (top-layer rendering, dark mode broken):**

1. `dialog.ts` — Add `text:foreground` to `dialogPanel`
2. `dialog.ts` — Add `text:foreground` to `dialogTitle`
3. `alert-dialog.ts` — Add `text:foreground` to `alertDialogPanel`
4. `alert-dialog.ts` — Add `text:foreground` to `alertDialogTitle`

**Defensive (normal flow, but should be explicit for consistency):**

5. `calendar.ts` — Add `text:foreground` to calendar root
6. `carousel.ts` — Add `text:foreground` to carousel button elements
7. `menubar.ts` — Add `text:foreground` to menubar root
8. `date-picker.ts` — Add `text:foreground` to date-picker trigger
9. `alert-dialog.ts` — Add `text:foreground` to cancel button
10. `pagination.ts` — Add `text:foreground` to `paginationLinkActive`

**Button text color in dark mode (outline):**

11. `button.ts` — The outline variant relies on inherited text color. Add explicit `text:foreground` to the outline variant base for robustness, especially when used inside dialogs.

## Non-Goals

- **Token value changes** — The OKLCH palette values match shadcn/ui v4. We won't adjust `--color-secondary`, `--color-muted-foreground`, or other token values in this fix.
- **WCAG contrast ratio tooling** — Automated contrast checking is valuable but out of scope for this bug fix.
- **Visual distinction of secondary buttons** — The secondary button's light background (oklch 0.97) is intentionally subtle per shadcn design. If users need more visual distinction, they can customize via `buttonConfig` spread.

## Implementation Plan

### Phase 1: Fix dialog/alert-dialog text contrast

Add explicit text color declarations to Dialog and AlertDialog panels and titles. Write tests that verify the generated CSS includes the correct color properties.

**Acceptance criteria:**
- Dialog panel CSS output includes `text:foreground` (resolves to `var(--color-foreground)`)
- Dialog title CSS output includes `text:foreground`
- AlertDialog panel CSS output includes `text:foreground`
- AlertDialog title CSS output includes `text:foreground`
- AlertDialog cancel button CSS output includes `text:foreground`
- Existing tests still pass

### Phase 2: Fix remaining component text contrast

Add explicit text color to calendar, carousel, menubar, date-picker, and outline button variant. Write tests for each.

**Acceptance criteria:**
- Calendar root CSS output includes `text:foreground`
- Carousel button CSS output includes `text:foreground`
- Menubar root CSS output includes `text:foreground`
- Date-picker trigger CSS output includes `text:foreground`
- Pagination `linkActive` CSS output includes `text:foreground`
- Outline button base includes `text:foreground`
- All existing tests still pass
- Quality gates clean

## Notes

- Dialog/AlertDialog `description` blocks already use `text:muted-foreground` — no changes needed there.
- Button `ghost` already has `text:foreground` and `secondary` already has `text:secondary-foreground` — only `outline` is missing.
- When calendar is inside a date-picker dropdown, the dropdown already has `text:popover-foreground`. Adding `text:foreground` to calendar root is harmless (both resolve to the same value in zinc) but ensures correctness when calendar is used standalone.
