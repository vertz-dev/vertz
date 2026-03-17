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

  // Grid rows — derived from displayMonth (reactive)
  const rows = computeGridRows(displayMonth, weekStartsOn);

  return (
    <div class={classes?.root}>
      <div class={classes?.header}>
        <button type="button" class={classes?.navButton} onClick={() => navigateMonth(-1)} />
        <div class={classes?.title}>{titleText}</div>
        <button type="button" class={classes?.navButton} onClick={() => navigateMonth(1)} />
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
              {rowDates.map((cellDate) => {
                const dateStr = formatDate(cellDate);
                const isOutside = cellDate.getMonth() !== displayMonth.getMonth();
                const isToday = isSameDay(cellDate, now);
                const isDisabled = isDateDisabledCheck(cellDate, minDate, maxDate, disabled);
                const selected = isSelectedDate(cellDate, value);
                const rangeVal = value as { from: Date; to: Date } | null;
                const isRangeStart =
                  mode === 'range' &&
                  rangeVal &&
                  'from' in rangeVal &&
                  isSameDay(cellDate, rangeVal.from);
                const isRangeEnd =
                  mode === 'range' &&
                  rangeVal &&
                  'to' in rangeVal &&
                  isSameDay(cellDate, rangeVal.to);
                const inRange = mode === 'range' && isInRangeDate(cellDate, value);

                return (
                  <td role="gridcell" class={classes?.cell}>
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
                      onClick={() => selectDate(cellDate)}
                    >
                      {cellDate.getDate()}
                    </button>
                  </td>
                );
              })}
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
