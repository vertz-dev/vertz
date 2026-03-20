# DatePicker `captionLayout` Prop Forwarding

**Issue:** #1586
**Status:** Design

## Summary

Forward the existing `captionLayout` prop from `ComposedCalendar` through the `ComposedDatePicker` and themed `DatePicker` component chain. This enables birthdate picker use cases where dropdown month/year navigation is needed.

## API Surface

```tsx
import { DatePicker } from '@vertz/ui/components';

// Current — captionLayout not accepted
<DatePicker minDate={new Date(1926, 0, 1)} maxDate={new Date(2026, 11, 31)} />

// After — captionLayout forwarded to inner Calendar
<DatePicker
  captionLayout="dropdown"
  minDate={new Date(1926, 0, 1)}
  maxDate={new Date(2026, 11, 31)}
/>

// @ts-expect-error — invalid layout value
<DatePicker captionLayout="invalid" />
```

The type is reused from `ComposedCalendarProps`:

```ts
captionLayout?: 'buttons' | 'dropdown' | 'dropdown-buttons';
```

## Manifesto Alignment

- **Progressive disclosure**: `captionLayout` defaults to `'buttons'` (existing behavior). Users only specify it when they need dropdown navigation.
- **Composition**: The prop passes through the existing composition chain (themed → composed → calendar) without adding new concepts.

## Non-Goals

- Adding new `captionLayout` values beyond what `ComposedCalendar` already supports.
- Changing any Calendar rendering behavior — this is purely prop forwarding.

## Unknowns

None identified. The `captionLayout` prop already works in `ComposedCalendar`. This is mechanical forwarding.

## POC Results

Not applicable — no uncertainty to validate.

## Type Flow Map

```
DatePickerRootProps.captionLayout          (theme-shadcn)
  → createThemedDatePicker() destructures it
    → ComposedDatePickerProps.captionLayout (ui-primitives)
      → ComposedDatePickerRoot destructures it
        → _buildCalendar() receives it via props
          → ComposedCalendarProps.captionLayout (already exists)
```

No new generics. The type is a literal union `'buttons' | 'dropdown' | 'dropdown-buttons'` at every level.

## E2E Acceptance Test

```ts
describe('Given a ComposedDatePicker with captionLayout="dropdown"', () => {
  describe('When rendered', () => {
    it('Then the calendar header contains <select> elements for month and year', () => {
      const root = ComposedDatePicker({
        captionLayout: 'dropdown',
        minDate: new Date(1926, 0, 1),
        maxDate: new Date(2026, 11, 31),
      });
      container.appendChild(root);
      const selects = root.querySelectorAll('select');
      expect(selects.length).toBe(2); // month + year
    });
  });
});
```

## Implementation Plan

Single phase — 6 touch points across 2 files:

### `packages/ui-primitives/src/date-picker/date-picker-composed.tsx`

1. **Add `captionLayout` to `ComposedDatePickerProps`** (line ~191) — add the optional prop with type from `ComposedCalendarProps`
2. **Destructure `captionLayout` in `ComposedDatePickerRoot`** (line ~206) — add to the function parameter destructure so it's available as a local variable
3. **Add `captionLayout` to the `_buildCalendar()` call site** (line ~304) — add `captionLayout` to the object literal `{ mode, defaultValue, ..., captionLayout }`
4. **Forward `captionLayout` inside `_buildCalendar()`** (line ~175) — add `captionLayout: props.captionLayout` to the `ComposedCalendar()` call

### `packages/theme-shadcn/src/components/primitives/date-picker.tsx`

5. **Add `captionLayout` to `DatePickerRootProps`** (line ~12) — add the optional prop
6. **Destructure AND forward in `DatePickerRoot`** (line ~47) — add `captionLayout` to both the destructure and the `ComposedDatePicker()` call object

> **Why explicit sub-steps?** Both files use manual prop enumeration (not spread). TypeScript won't warn if an optional prop is accepted but never forwarded — the bug is silent at compile time.

### Tests (TDD)

1. RED: `ComposedDatePicker` with `captionLayout="dropdown"` → calendar renders `<select>` elements
2. GREEN: Apply touch points 1–4
3. RED: Themed `DatePicker` with `captionLayout="dropdown"` → calendar renders `<select>` elements
4. GREEN: Apply touch points 5–6

### Quality Gates

- `bun test` (ui-primitives, theme-shadcn)
- `bun run typecheck` (ui-primitives, theme-shadcn)
- `bunx biome check --write` on changed files
