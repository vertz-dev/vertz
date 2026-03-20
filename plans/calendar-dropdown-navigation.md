# Calendar Month/Year Quick-Select Dropdowns

**Issue:** #1576
**Status:** Design
**Author:** asuncion

---

## API Surface

### ComposedCalendar — new prop

```tsx
import { ComposedCalendar } from '@vertz/ui-primitives';

// Default — current behavior, arrows only
<ComposedCalendar mode="single" />

// Dropdown only — month + year selects, no arrows
<ComposedCalendar
  mode="single"
  captionLayout="dropdown"
  minDate={new Date(1926, 0, 1)}
  maxDate={new Date(2026, 11, 31)}
/>

// Dropdown + arrows — selects AND prev/next arrows
<ComposedCalendar
  mode="single"
  captionLayout="dropdown-buttons"
  minDate={new Date(2020, 0, 1)}
  maxDate={new Date(2030, 11, 31)}
/>
```

### Props addition

```tsx
export interface ComposedCalendarProps {
  // ... existing props ...

  /**
   * Controls how the calendar header navigation is rendered.
   * - 'buttons' (default): prev/next arrow buttons only
   * - 'dropdown': month + year <select> elements, no arrow buttons
   * - 'dropdown-buttons': month + year <select> elements AND arrow buttons
   *
   * When using 'dropdown' or 'dropdown-buttons', the year range is derived
   * from minDate/maxDate. If neither is set, defaults to currentYear-100
   * to currentYear+10 (suitable for birthdate pickers).
   *
   * The onMonthChange callback fires whenever the displayed month changes,
   * including when only the year is changed via the dropdown.
   */
  captionLayout?: 'buttons' | 'dropdown' | 'dropdown-buttons';
}
```

### CalendarClasses — new slots

```tsx
export interface CalendarClasses {
  root?: string;
  header?: string;
  title?: string;
  navButton?: string;
  grid?: string;
  headCell?: string;
  cell?: string;
  dayButton?: string;
  // New:
  monthSelect?: string;
  yearSelect?: string;
}
```

### Themed Calendar — prop forwarding

```tsx
import { Calendar } from '@vertz/ui/components';

// Themed wrapper forwards captionLayout
<Calendar
  mode="single"
  captionLayout="dropdown"
  minDate={new Date(1926, 0, 1)}
  maxDate={new Date(2026, 11, 31)}
/>
```

---

## Design Decisions

### Native `<select>` over composed Select primitive

The dropdowns use native `<select>` elements, not the composed Select primitive from `@vertz/ui-primitives`. Rationale:

1. **Accessibility for free** — native `<select>` has built-in keyboard navigation (arrow keys, type-ahead, Enter/Space) without custom ARIA implementation.
2. **Compact size** — calendar header is spatially constrained. The composed Select with floating popover is too heavy for this context.
3. **Consistency with shadcn** — shadcn/react-day-picker uses native `<select>` for the same reason.
4. **Simplicity** — no floating position logic, no portal, no click-outside handling.

Theme styles the native `<select>` via the `monthSelect` and `yearSelect` class slots.

### `<select>` value binding — framework limitation and workaround

The Vertz compiler binds JSX attributes via `setAttribute()`, which does **not** work for `<select value={...}>` (the `value` attribute doesn't control which option is displayed — only the `value` DOM property does).

**Workaround:** Use the `selected` attribute on individual `<option>` elements:

```tsx
<select aria-label="Select month" class={classes?.monthSelect} onChange={handleMonthChange}>
  {MONTH_NAMES.map((name, i) => (
    <option value={String(i)} selected={i === displayMonth.getMonth()} disabled={isMonthDisabled(i)}>
      {name}
    </option>
  ))}
</select>
```

This works because:
1. The `<option>` list is inside a reactive scope (depends on `displayMonth`). When `displayMonth` changes, the compiler re-evaluates the map and creates fresh `<option>` elements with the correct `selected` attribute at creation time.
2. The `onChange` handler reads `event.target.value` (DOM property) for user interaction — this always works.
3. No `ref()` or imperative property assignment needed.

**Future framework enhancement:** Add `__prop()` for IDL properties (`value`, `checked`, `selectedIndex`) on form elements. Tracked in #1583. Out of scope for this issue.

### Year range defaults

| Condition | Year range |
|---|---|
| Both `minDate` and `maxDate` provided | `minDate.year` to `maxDate.year` |
| Only `minDate` provided | `minDate.year` to `current year + 10` |
| Only `maxDate` provided | `maxDate.year - 100` to `maxDate.year` |
| Neither provided | `current year - 100` to `current year + 10` |

The ±100/+10 defaults support birthdate pickers (common use case for dropdown navigation) while keeping the list manageable.

### Month disabling at year boundaries

When `minDate` or `maxDate` is set, months outside the valid range are disabled in the month `<select>` for the currently displayed year:

- If displaying year 2024 and `minDate` is March 2024: Jan and Feb are disabled.
- If displaying year 2026 and `maxDate` is September 2026: Oct, Nov, Dec are disabled.
- If `minDate` and `maxDate` are in the same year (e.g., March–September 2024): both lower and upper boundaries apply — Jan, Feb, Oct, Nov, Dec are all disabled, and the year select has only one option.

### Arrow button clamping in `dropdown-buttons` mode

In `dropdown-buttons` mode, arrow buttons are disabled at the year range boundaries to prevent navigating outside the dropdown's range. If `displayMonth` is January of the minimum year, the "Previous month" button is disabled. If `displayMonth` is December of the maximum year, the "Next month" button is disabled. This uses `aria-disabled="true"` (consistent with existing disabled date behavior) and the click handler becomes a no-op.

### Header layout per captionLayout

```
captionLayout="buttons" (default):
┌────────────────────────────┐
│ [◀]   January 2026   [▶]  │
└────────────────────────────┘

captionLayout="dropdown":
┌────────────────────────────┐
│   [January ▾] [2026 ▾]    │
└────────────────────────────┘

captionLayout="dropdown-buttons":
┌────────────────────────────┐
│ [◀] [January ▾] [2026 ▾] [▶] │
└────────────────────────────┘
```

---

## Manifesto Alignment

- **One way to do things** — `captionLayout` prop with 3 clear values. No alternative API, no render props, no children-based composition for the header.
- **If it builds, it works** — `captionLayout` is a string union type. TypeScript catches invalid values at compile time.
- **AI agents are first-class users** — LLM sees one prop name with three self-documenting values. The shadcn pattern is well-known, so LLMs will predict usage correctly.
- **Production-ready by default** — month disabling at boundaries and year range clamping work automatically from existing `minDate`/`maxDate` props. No extra config needed.

---

## Non-Goals

- **Custom month/year formatting** — no `formatMonth`/`formatYear` callbacks. English month names are hardcoded (same as existing title). Localization is a separate feature.
- **Controlled `displayMonth`** — the calendar remains uncontrolled with `defaultMonth`. Controlled mode is a separate feature.
- **Multiple months** — showing 2+ months side by side (e.g., range pickers) is out of scope.
- **Virtualized year list** — 100+ years in a native `<select>` scrolls fine. No virtual scroll needed.
- **DatePicker integration** — forwarding `captionLayout` through the composed and themed DatePicker is important (birthdates are the primary use case) but is a separate follow-up issue to keep this PR focused on the Calendar primitive.

---

## Unknowns

None identified. The pattern is well-established (shadcn, react-day-picker) and the implementation is self-contained within the calendar header.

---

## Type Flow Map

```
captionLayout: 'buttons' | 'dropdown' | 'dropdown-buttons'
  └─ ComposedCalendarProps.captionLayout
       └─ ComposedCalendarRoot parameter destructuring
            └─ Conditional rendering in JSX (header section)

CalendarClasses.monthSelect / yearSelect: string | undefined
  └─ ComposedCalendarProps.classes
       └─ Applied to <select> elements via class={classes?.monthSelect}

CalendarRootProps.captionLayout (themed wrapper)
  └─ createThemedCalendar → withStyles → ComposedCalendar
       └─ Same flow as above
```

No generics involved — all concrete types. No `.test-d.ts` needed since there are no generic type parameters to verify.

---

## E2E Acceptance Test

```tsx
describe('Feature: Calendar dropdown navigation', () => {
  describe('Given captionLayout="dropdown"', () => {
    describe('When rendered', () => {
      it('Then renders month and year <select> elements', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
        });
        const monthSelect = root.querySelector('select[aria-label="Select month"]');
        const yearSelect = root.querySelector('select[aria-label="Select year"]');
        expect(monthSelect).not.toBeNull();
        expect(yearSelect).not.toBeNull();
      });

      it('Then does NOT render prev/next arrow buttons', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
        });
        const prevBtn = root.querySelector('button[aria-label="Previous month"]');
        const nextBtn = root.querySelector('button[aria-label="Next month"]');
        expect(prevBtn).toBeNull();
        expect(nextBtn).toBeNull();
      });
    });

    describe('When selecting a month from the dropdown', () => {
      it('Then updates the displayed month and fires onMonthChange', () => {
        const onMonthChange = vi.fn();
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
          onMonthChange,
        });
        container.appendChild(root);
        const monthSelect = root.querySelector('select[aria-label="Select month"]') as HTMLSelectElement;
        monthSelect.value = '0'; // January
        monthSelect.dispatchEvent(new Event('change'));
        expect(onMonthChange).toHaveBeenCalledTimes(1);
        const val = onMonthChange.mock.calls[0][0] as Date;
        expect(val.getMonth()).toBe(0);
        expect(val.getFullYear()).toBe(2024);
      });
    });

    describe('When minDate/maxDate constrain the range', () => {
      it('Then year select only contains years within range', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
          minDate: new Date(2020, 0, 1),
          maxDate: new Date(2026, 11, 31),
        });
        const yearSelect = root.querySelector('select[aria-label="Select year"]') as HTMLSelectElement;
        const years = Array.from(yearSelect.options).map((o) => Number(o.value));
        expect(years[0]).toBe(2020);
        expect(years[years.length - 1]).toBe(2026);
      });

      it('Then month select disables months before minDate in boundary year', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2020, 5, 1),
          minDate: new Date(2020, 2, 1), // March 2020
          maxDate: new Date(2026, 11, 31),
        });
        container.appendChild(root);
        const monthSelect = root.querySelector('select[aria-label="Select month"]') as HTMLSelectElement;
        const janOption = monthSelect.querySelector('option[value="0"]') as HTMLOptionElement;
        const febOption = monthSelect.querySelector('option[value="1"]') as HTMLOptionElement;
        const marOption = monthSelect.querySelector('option[value="2"]') as HTMLOptionElement;
        expect(janOption.disabled).toBe(true);
        expect(febOption.disabled).toBe(true);
        expect(marOption.disabled).toBe(false);
      });

      it('Then month select disables months after maxDate in boundary year', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2026, 5, 1),
          minDate: new Date(2020, 0, 1),
          maxDate: new Date(2026, 8, 30), // September 2026
        });
        container.appendChild(root);
        const monthSelect = root.querySelector('select[aria-label="Select month"]') as HTMLSelectElement;
        const sepOption = monthSelect.querySelector('option[value="8"]') as HTMLOptionElement;
        const octOption = monthSelect.querySelector('option[value="9"]') as HTMLOptionElement;
        expect(sepOption.disabled).toBe(false);
        expect(octOption.disabled).toBe(true);
      });

      it('Then single-year range disables months from both ends', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown',
          defaultMonth: new Date(2024, 5, 1),
          minDate: new Date(2024, 2, 1),  // March 2024
          maxDate: new Date(2024, 8, 30), // September 2024
        });
        container.appendChild(root);
        const yearSelect = root.querySelector('select[aria-label="Select year"]') as HTMLSelectElement;
        expect(yearSelect.options.length).toBe(1);
        expect(yearSelect.options[0]?.value).toBe('2024');
        const monthSelect = root.querySelector('select[aria-label="Select month"]') as HTMLSelectElement;
        expect((monthSelect.querySelector('option[value="1"]') as HTMLOptionElement).disabled).toBe(true);
        expect((monthSelect.querySelector('option[value="2"]') as HTMLOptionElement).disabled).toBe(false);
        expect((monthSelect.querySelector('option[value="8"]') as HTMLOptionElement).disabled).toBe(false);
        expect((monthSelect.querySelector('option[value="9"]') as HTMLOptionElement).disabled).toBe(true);
      });
    });
  });

  describe('Given captionLayout="dropdown-buttons"', () => {
    describe('When rendered', () => {
      it('Then renders both selects AND prev/next arrow buttons', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown-buttons',
          defaultMonth: new Date(2024, 5, 1),
        });
        expect(root.querySelector('select[aria-label="Select month"]')).not.toBeNull();
        expect(root.querySelector('select[aria-label="Select year"]')).not.toBeNull();
        expect(root.querySelector('button[aria-label="Previous month"]')).not.toBeNull();
        expect(root.querySelector('button[aria-label="Next month"]')).not.toBeNull();
      });
    });

    describe('When at the boundary of the year range', () => {
      it('Then prev button is disabled at minimum month/year', () => {
        const root = ComposedCalendar({
          captionLayout: 'dropdown-buttons',
          defaultMonth: new Date(2020, 0, 1), // January 2020
          minDate: new Date(2020, 0, 1),
          maxDate: new Date(2026, 11, 31),
        });
        container.appendChild(root);
        const prevBtn = root.querySelector('button[aria-label="Previous month"]');
        expect(prevBtn?.getAttribute('aria-disabled')).toBe('true');
      });
    });
  });

  describe('Given captionLayout="buttons" (default)', () => {
    describe('When rendered', () => {
      it('Then renders arrow buttons and title text, no selects', () => {
        const root = ComposedCalendar({
          defaultMonth: new Date(2024, 5, 1),
        });
        expect(root.querySelector('select')).toBeNull();
        expect(root.querySelector('button[aria-label="Previous month"]')).not.toBeNull();
      });
    });
  });

  // @ts-expect-error — invalid captionLayout value rejected at compile time
  <ComposedCalendar captionLayout="invalid" />
});
```

---

## Implementation Plan

### Phase 1: Core primitive implementation + tests

**Scope:** `packages/ui-primitives/src/calendar/calendar-composed.tsx` and tests

**Changes:**
1. Add `captionLayout` to `ComposedCalendarProps`
2. Add `monthSelect` and `yearSelect` to `CalendarClasses`
3. Implement year range computation helper
4. Implement month disabling logic for boundary years
5. Conditional header rendering based on `captionLayout`
6. Wire `<select>` change handlers to update `displayMonth` and fire `onMonthChange`
7. Disable nav buttons at range boundaries in `dropdown-buttons` mode

**Implementation notes:**
- Year range and month-disabled arrays must be `const` declarations (derived values) so the compiler wraps them in `computed()` for caching.
- Use `selected` attribute on `<option>` elements (not `<select value={...}>`) per the framework limitation documented above.
- The `onChange` handler must validate the selected month isn't disabled before updating `displayMonth`.

**Acceptance criteria:**
```typescript
describe('Feature: Calendar dropdown navigation — Phase 1', () => {
  describe('Given captionLayout="dropdown"', () => {
    describe('When rendered', () => {
      it('Then renders month <select> with aria-label="Select month"', () => {})
      it('Then renders year <select> with aria-label="Select year"', () => {})
      it('Then does NOT render prev/next arrow buttons', () => {})
      it('Then month select shows current month as selected', () => {})
      it('Then year select shows current year as selected', () => {})
      it('Then applies monthSelect class to month <select>', () => {})
      it('Then applies yearSelect class to year <select>', () => {})
    })
    describe('When selecting a different month', () => {
      it('Then updates the calendar grid to show the new month', () => {})
      it('Then fires onMonthChange with the new Date', () => {})
    })
    describe('When selecting a different year', () => {
      it('Then updates the calendar grid to show the new year', () => {})
      it('Then fires onMonthChange with the new Date', () => {})
    })
    describe('When minDate and maxDate are provided', () => {
      it('Then year select only contains years within range', () => {})
      it('Then months before minDate are disabled in boundary year', () => {})
      it('Then months after maxDate are disabled in boundary year', () => {})
    })
    describe('When minDate and maxDate are in the same year', () => {
      it('Then year select contains only that year', () => {})
      it('Then months before minDate AND after maxDate are both disabled', () => {})
    })
    describe('When no minDate/maxDate', () => {
      it('Then year range defaults to current year -100 to +10', () => {})
    })
    describe('When selecting a disabled month option', () => {
      it('Then displayMonth does NOT change', () => {})
    })
  })
  describe('Given captionLayout="dropdown-buttons"', () => {
    describe('When rendered', () => {
      it('Then renders both selects AND prev/next arrow buttons', () => {})
    })
    describe('When clicking prev/next with dropdown-buttons', () => {
      it('Then updates both the grid and the select values', () => {})
    })
    describe('When at the boundary of the year range', () => {
      it('Then prev button is disabled at min year/month', () => {})
      it('Then next button is disabled at max year/month', () => {})
    })
  })
  describe('Given captionLayout="buttons" (default)', () => {
    describe('When rendered', () => {
      it('Then renders arrow buttons and title, no <select> elements', () => {})
    })
  })
})
```

### Phase 2: Theme styles + themed wrapper + catalog demo

**Scope:** `packages/theme-shadcn/`, `examples/component-catalog/`

**Changes:**
1. Add `monthSelect` and `yearSelect` style blocks to `createCalendarStyles()`
2. Add `monthSelect` and `yearSelect` to `CalendarStyleClasses` in themed calendar
3. Forward `captionLayout` through `CalendarRootProps` and `createThemedCalendar`
4. Update component catalog demo with dropdown layout examples

**Acceptance criteria:**
```typescript
describe('Feature: Calendar dropdown theme + demo — Phase 2', () => {
  describe('Given themed Calendar with captionLayout="dropdown"', () => {
    describe('When rendered', () => {
      it('Then applies theme styles to month and year selects', () => {})
      it('Then captionLayout prop is forwarded from themed wrapper', () => {})
    })
  })
})
```

- [ ] Component catalog demo shows all 3 caption layouts
- [ ] Demo includes a birthdate picker example (year range 1926–2026)

### Follow-up: DatePicker integration (separate issue)

After this PR merges, create a follow-up issue to forward `captionLayout` through:
1. `ComposedDatePickerProps` → `_buildCalendar()` → `ComposedCalendar`
2. `DatePickerRootProps` → `createThemedDatePicker`

Birthdates inside a DatePicker popover are the primary use case for dropdown navigation.
