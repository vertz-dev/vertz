/**
 * Composed Calendar — declarative JSX component with date grid, month navigation,
 * and class distribution. Supports single, range, and multiple selection modes.
 */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MONTH_OPTIONS = MONTH_NAMES.map((name, index) => ({ name, index }));

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface CalendarClasses {
  root?: string;
  header?: string;
  title?: string;
  navButton?: string;
  grid?: string;
  headCell?: string;
  cell?: string;
  dayButton?: string;
  monthSelect?: string;
  yearSelect?: string;
}

export type CalendarClassKey = keyof CalendarClasses;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ComposedCalendarProps {
  classes?: CalendarClasses;
  mode?: 'single' | 'range' | 'multiple';
  defaultValue?: Date | Date[] | { from: Date; to: Date };
  defaultMonth?: Date;
  minDate?: Date;
  maxDate?: Date;
  disabled?: (date: Date) => boolean;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onValueChange?: (value: Date | Date[] | { from: Date; to: Date } | null) => void;
  onMonthChange?: (month: Date) => void;
  /**
   * Controls how the calendar header navigation is rendered.
   * - 'buttons' (default): prev/next arrow buttons only
   * - 'dropdown': month + year <select> elements, no arrow buttons
   * - 'dropdown-buttons': month + year <select> elements AND arrow buttons
   */
  captionLayout?: 'buttons' | 'dropdown' | 'dropdown-buttons';
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSelectedDate(date: Date, val: Date | Date[] | { from: Date; to: Date } | null): boolean {
  if (val === null) return false;
  if (val instanceof Date) return isSameDay(val, date);
  if (Array.isArray(val)) return val.some((d) => isSameDay(d, date));
  if ('from' in val && 'to' in val) {
    return isSameDay(val.from, date) || isSameDay(val.to, date);
  }
  return false;
}

function isInRangeDate(date: Date, val: Date | Date[] | { from: Date; to: Date } | null): boolean {
  if (val === null || !('from' in (val as object))) return false;
  const range = val as { from: Date; to: Date };
  return date > range.from && date < range.to;
}

function isDateDisabledCheck(
  date: Date,
  minDate?: Date,
  maxDate?: Date,
  disabled?: (date: Date) => boolean,
): boolean {
  if (disabled?.(date)) return true;
  if (minDate && date < minDate && !isSameDay(date, minDate)) return true;
  if (maxDate && date > maxDate && !isSameDay(date, maxDate)) return true;
  return false;
}

function computeYearRange(now: Date, minDate?: Date, maxDate?: Date): number[] {
  const minYear = minDate ? minDate.getFullYear() : now.getFullYear() - 100;
  const maxYear = maxDate ? maxDate.getFullYear() : now.getFullYear() + 10;
  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    years.push(y);
  }
  return years;
}

function isMonthDisabled(month: number, year: number, minDate?: Date, maxDate?: Date): boolean {
  if (minDate && year === minDate.getFullYear() && month < minDate.getMonth()) return true;
  if (maxDate && year === maxDate.getFullYear() && month > maxDate.getMonth()) return true;
  return false;
}

function computeGridRows(display: Date, weekStartsOn: number): Date[][] {
  const year = display.getFullYear();
  const month = display.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  const offset = (firstDayOfWeek - weekStartsOn + 7) % 7;
  const startDate = addDays(firstDay, -offset);
  const totalCells = offset + daysInMonth;
  const totalRows = Math.ceil(totalCells / 7);

  const rows: Date[][] = [];
  let current = startDate;
  for (let row = 0; row < totalRows; row++) {
    const rowDates: Date[] = [];
    for (let col = 0; col < 7; col++) {
      rowDates.push(new Date(current));
      current = addDays(current, 1);
    }
    rows.push(rowDates);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// DayCell — separate component so the compiler generates reactive getters
// for `value` and `displayMonth` props, making selection state update on click.
// ---------------------------------------------------------------------------

type CalendarValue = Date | Date[] | { from: Date; to: Date } | null;

interface DayCellProps {
  cellDate: Date;
  displayMonth: Date;
  now: Date;
  mode: 'single' | 'range' | 'multiple';
  value: CalendarValue;
  minDate?: Date;
  maxDate?: Date;
  disabled?: (date: Date) => boolean;
  classes?: CalendarClasses;
  onSelect: (date: Date) => void;
}

function DayCell({
  cellDate,
  displayMonth,
  now,
  mode,
  value,
  minDate,
  maxDate,
  disabled,
  classes,
  onSelect,
}: DayCellProps) {
  const dateStr = formatDate(cellDate);
  const isOutside = cellDate.getMonth() !== displayMonth.getMonth();
  const isToday = isSameDay(cellDate, now);
  const isDisabled = isDateDisabledCheck(cellDate, minDate, maxDate, disabled);
  const selected = isSelectedDate(cellDate, value);
  const rangeVal = value as { from: Date; to: Date } | null;
  const isRangeStart =
    mode === 'range' && rangeVal && 'from' in rangeVal && isSameDay(cellDate, rangeVal.from);
  const isRangeEnd =
    mode === 'range' && rangeVal && 'to' in rangeVal && isSameDay(cellDate, rangeVal.to);
  const inRange = mode === 'range' && isInRangeDate(cellDate, value);

  return (
    <button
      type="button"
      class={classes?.dayButton}
      data-date={dateStr}
      data-outside-month={isOutside ? 'true' : undefined}
      data-today={isToday ? 'true' : undefined}
      aria-disabled={isDisabled ? 'true' : undefined}
      aria-selected={selected ? 'true' : undefined}
      data-range-start={isRangeStart ? 'true' : undefined}
      data-range-end={isRangeEnd ? 'true' : undefined}
      data-in-range={inRange ? 'true' : undefined}
      onClick={() => onSelect(cellDate)}
    >
      {cellDate.getDate()}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ComposedCalendarRoot({
  classes,
  mode: modeProp = 'single',
  defaultValue,
  defaultMonth: defaultMonthProp,
  minDate,
  maxDate,
  disabled,
  weekStartsOn = 0,
  onValueChange,
  onMonthChange,
  captionLayout = 'buttons',
}: ComposedCalendarProps) {
  const now = new Date();
  const mode = modeProp;

  // Reactive state — compiler transforms `let` to signals
  let displayMonth = defaultMonthProp ?? now;
  let value: Date | Date[] | { from: Date; to: Date } | null = defaultValue ?? null;

  // Day headers (static — depends on weekStartsOn which is a prop, not reactive)
  const dayHeaders = Array.from({ length: 7 }, (_, i) => DAY_NAMES[(weekStartsOn + i) % 7] ?? '');

  // Selection logic
  function selectDate(date: Date): void {
    if (isDateDisabledCheck(date, minDate, maxDate, disabled)) return;

    if (mode === 'single') {
      value = date;
    } else if (mode === 'multiple') {
      const current = (value as Date[] | null) ?? [];
      const existing = current.findIndex((d) => isSameDay(d, date));
      if (existing >= 0) {
        const next = [...current];
        next.splice(existing, 1);
        value = next;
      } else {
        value = [...current, date];
      }
    } else if (mode === 'range') {
      const current = value as { from: Date; to: Date } | null;
      if (!current || ('to' in current && current.to)) {
        value = { from: date, to: date };
      } else {
        if (date < current.from) {
          value = { from: date, to: current.from };
        } else {
          value = { from: current.from, to: date };
        }
      }
    }

    onValueChange?.(value);
  }

  // Month navigation
  function navigateMonth(delta: number): void {
    displayMonth = addMonths(displayMonth, delta);
    onMonthChange?.(displayMonth);
  }

  // Keyboard handler
  function handleGridKeydown(event: KeyboardEvent): void {
    const gridEl = event.currentTarget as HTMLElement;
    const active = document.activeElement as HTMLElement | null;
    if (!active || active.tagName !== 'BUTTON') return;

    const dateStr = active.getAttribute('data-date');
    if (!dateStr) return;

    const focused = new Date(`${dateStr}T00:00:00`);
    let next: Date | null = null;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      next = addDays(focused, -1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      next = addDays(focused, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      next = addDays(focused, -7);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      next = addDays(focused, 7);
    } else if (event.key === 'Home') {
      event.preventDefault();
      const dayOfWeek = (focused.getDay() - weekStartsOn + 7) % 7;
      next = addDays(focused, -dayOfWeek);
    } else if (event.key === 'End') {
      event.preventDefault();
      const dayOfWeek = (focused.getDay() - weekStartsOn + 7) % 7;
      next = addDays(focused, 6 - dayOfWeek);
    } else if (event.key === 'PageUp') {
      event.preventDefault();
      next = event.shiftKey ? addMonths(focused, -12) : addMonths(focused, -1);
    } else if (event.key === 'PageDown') {
      event.preventDefault();
      next = event.shiftKey ? addMonths(focused, 12) : addMonths(focused, 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDate(focused);
      return;
    }

    if (next) {
      // In dropdown modes, clamp keyboard navigation to the year range
      if (showDropdowns) {
        const minYear = yearRange[0] ?? now.getFullYear();
        const maxYear = yearRange[yearRange.length - 1] ?? now.getFullYear();
        const minMo =
          minDate && next.getFullYear() === minDate.getFullYear() ? minDate.getMonth() : 0;
        const maxMo =
          maxDate && next.getFullYear() === maxDate.getFullYear() ? maxDate.getMonth() : 11;
        if (
          next.getFullYear() < minYear ||
          next.getFullYear() > maxYear ||
          (next.getFullYear() === minYear && next.getMonth() < minMo) ||
          (next.getFullYear() === maxYear && next.getMonth() > maxMo)
        ) {
          return; // Don't navigate outside the dropdown range
        }
      }

      const needsMonthChange =
        next.getMonth() !== displayMonth.getMonth() ||
        next.getFullYear() !== displayMonth.getFullYear();

      if (needsMonthChange) {
        displayMonth = new Date(next.getFullYear(), next.getMonth(), 1);
        onMonthChange?.(displayMonth);
      }

      const dateKey = formatDate(next);
      const focusBtn = () => {
        const btn = gridEl.querySelector(`button[data-date="${dateKey}"]`) as HTMLElement | null;
        btn?.focus();
      };
      // Grid DOM updates synchronously for same-month.
      // Cross-month may need a microtask for DOM reconciliation.
      if (needsMonthChange) {
        queueMicrotask(focusBtn);
      } else {
        focusBtn();
      }
    }
  }

  // Title text — derived from displayMonth (reactive)
  const titleText = `${MONTH_NAMES[displayMonth.getMonth()]} ${displayMonth.getFullYear()}`;

  // Dropdown state — derived values for computed() caching
  const showDropdowns = captionLayout === 'dropdown' || captionLayout === 'dropdown-buttons';
  const showButtons = captionLayout === 'buttons' || captionLayout === 'dropdown-buttons';
  const yearRange = showDropdowns ? computeYearRange(now, minDate, maxDate) : [];

  // Dropdown change handlers
  function handleMonthSelect(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newMonth = Number(target.value);
    if (isMonthDisabled(newMonth, displayMonth.getFullYear(), minDate, maxDate)) return;
    displayMonth = new Date(displayMonth.getFullYear(), newMonth, 1);
    onMonthChange?.(displayMonth);
  }

  function handleYearSelect(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newYear = Number(target.value);
    let month = displayMonth.getMonth();
    // Clamp month if it would be outside range for the new year
    if (isMonthDisabled(month, newYear, minDate, maxDate)) {
      if (minDate && newYear === minDate.getFullYear()) month = minDate.getMonth();
      else if (maxDate && newYear === maxDate.getFullYear()) month = maxDate.getMonth();
    }
    displayMonth = new Date(newYear, month, 1);
    onMonthChange?.(displayMonth);
  }

  // Nav button boundary clamping for dropdown modes — clamp to effective range
  const effectiveMinYear = showDropdowns ? (yearRange[0] ?? now.getFullYear()) : 0;
  const effectiveMaxYear = showDropdowns
    ? (yearRange[yearRange.length - 1] ?? now.getFullYear())
    : 9999;
  const effectiveMinMonth =
    minDate && effectiveMinYear === minDate.getFullYear() ? minDate.getMonth() : 0;
  const effectiveMaxMonth =
    maxDate && effectiveMaxYear === maxDate.getFullYear() ? maxDate.getMonth() : 11;
  const isAtMinBoundary =
    showDropdowns &&
    displayMonth.getFullYear() === effectiveMinYear &&
    displayMonth.getMonth() === effectiveMinMonth;
  const isAtMaxBoundary =
    showDropdowns &&
    displayMonth.getFullYear() === effectiveMaxYear &&
    displayMonth.getMonth() === effectiveMaxMonth;

  // Grid rows — derived from displayMonth (reactive)
  const rows = computeGridRows(displayMonth, weekStartsOn);

  const prevChevron = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
  const nextChevron = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );

  return (
    <div class={classes?.root}>
      <div class={classes?.header} data-caption-layout={captionLayout}>
        {showButtons && (
          <button
            type="button"
            class={classes?.navButton}
            aria-label="Previous month"
            aria-disabled={isAtMinBoundary ? 'true' : undefined}
            onClick={() => {
              if (!isAtMinBoundary) navigateMonth(-1);
            }}
          >
            {prevChevron}
          </button>
        )}
        {showDropdowns ? (
          <>
            <select
              aria-label="Select month"
              class={classes?.monthSelect}
              onChange={handleMonthSelect}
            >
              {MONTH_OPTIONS.map((mo) => (
                <option
                  value={String(mo.index)}
                  selected={mo.index === displayMonth.getMonth()}
                  disabled={isMonthDisabled(mo.index, displayMonth.getFullYear(), minDate, maxDate)}
                >
                  {mo.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Select year"
              class={classes?.yearSelect}
              onChange={handleYearSelect}
            >
              {yearRange.map((yr) => (
                <option value={String(yr)} selected={yr === displayMonth.getFullYear()}>
                  {yr}
                </option>
              ))}
            </select>
          </>
        ) : (
          <div class={classes?.title}>{titleText}</div>
        )}
        {showButtons && (
          <button
            type="button"
            class={classes?.navButton}
            aria-label="Next month"
            aria-disabled={isAtMaxBoundary ? 'true' : undefined}
            onClick={() => {
              if (!isAtMaxBoundary) navigateMonth(1);
            }}
          >
            {nextChevron}
          </button>
        )}
      </div>
      <table role="grid" class={classes?.grid} onKeydown={handleGridKeydown}>
        <thead>
          <tr>
            {dayHeaders.map((day) => (
              <th scope="col" class={classes?.headCell}>
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((rowDates) => (
            <tr>
              {rowDates.map((cellDate) => (
                <td role="gridcell" class={classes?.cell}>
                  <DayCell
                    cellDate={cellDate}
                    displayMonth={displayMonth}
                    now={now}
                    mode={mode}
                    value={value}
                    minDate={minDate}
                    maxDate={maxDate}
                    disabled={disabled}
                    classes={classes}
                    onSelect={selectDate}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedCalendar = ComposedCalendarRoot as ((
  props: ComposedCalendarProps,
) => HTMLElement) & {
  __classKeys?: CalendarClassKey;
};
