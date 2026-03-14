import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';

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

export interface CalendarOptions extends ElementAttrs {
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

export interface CalendarState {
  value: Signal<Date | Date[] | { from: Date; to: Date } | null>;
  focusedDate: Signal<Date>;
  displayMonth: Signal<Date>;
}

export interface CalendarElements {
  root: HTMLDivElement;
  header: HTMLDivElement;
  title: HTMLDivElement;
  prevButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  grid: HTMLTableElement;
}

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

function CalendarRoot(options: CalendarOptions = {}): CalendarElements & { state: CalendarState } {
  const {
    mode: modeOpt,
    defaultValue,
    defaultMonth: defaultMonthOpt,
    minDate,
    maxDate,
    disabled,
    weekStartsOn: weekStartsOnOpt,
    onValueChange,
    onMonthChange,
    ...attrs
  } = options;
  const now = new Date();
  const defaultMonth = defaultMonthOpt ?? now;
  const weekStartsOn = weekStartsOnOpt ?? 0;
  const mode = modeOpt ?? 'single';

  const state: CalendarState = {
    value: signal<Date | Date[] | { from: Date; to: Date } | null>(defaultValue ?? null),
    focusedDate: signal(defaultMonth),
    displayMonth: signal(defaultMonth),
  };

  function updateTitle(): void {
    const month = state.displayMonth.peek();
    title.textContent = `${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`;
  }

  function isDateDisabled(date: Date): boolean {
    if (disabled?.(date)) return true;
    if (minDate && date < minDate && !isSameDay(date, minDate)) {
      return true;
    }
    if (maxDate && date > maxDate && !isSameDay(date, maxDate)) {
      return true;
    }
    return false;
  }

  function isSelected(date: Date): boolean {
    const val = state.value.peek();
    if (val === null) return false;
    if (val instanceof Date) return isSameDay(val, date);
    if (Array.isArray(val)) return val.some((d) => isSameDay(d, date));
    if ('from' in val && 'to' in val) {
      return isSameDay(val.from, date) || isSameDay(val.to, date);
    }
    return false;
  }

  function isInRange(date: Date): boolean {
    const val = state.value.peek();
    if (val === null || !('from' in (val as object))) return false;
    const range = val as { from: Date; to: Date };
    return date > range.from && date < range.to;
  }

  function selectDate(date: Date): void {
    if (isDateDisabled(date)) return;

    if (mode === 'single') {
      state.value.value = date;
    } else if (mode === 'multiple') {
      const current = (state.value.peek() as Date[] | null) ?? [];
      const existing = current.findIndex((d) => isSameDay(d, date));
      if (existing >= 0) {
        const next = [...current];
        next.splice(existing, 1);
        state.value.value = next;
      } else {
        state.value.value = [...current, date];
      }
    } else if (mode === 'range') {
      const current = state.value.peek() as { from: Date; to: Date } | null;
      if (!current || ('to' in current && current.to)) {
        state.value.value = { from: date, to: date };
      } else {
        if (date < current.from) {
          state.value.value = { from: date, to: current.from };
        } else {
          state.value.value = { from: current.from, to: date };
        }
      }
    }

    onValueChange?.(state.value.peek());
  }

  function buildGrid(): void {
    grid.innerHTML = '';
    const display = state.displayMonth.peek();
    const year = display.getFullYear();
    const month = display.getMonth();
    const daysInMonth = getDaysInMonth(year, month);

    // Header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (let i = 0; i < 7; i++) {
      const dayIndex = (weekStartsOn + i) % 7;
      const th = document.createElement('th');
      th.setAttribute('scope', 'col');
      th.textContent = DAY_NAMES[dayIndex] ?? '';
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    grid.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = firstDay.getDay();
    const offset = (firstDayOfWeek - weekStartsOn + 7) % 7;

    const startDate = addDays(firstDay, -offset);
    let currentDate = startDate;

    const totalCells = offset + daysInMonth;
    const totalRows = Math.ceil(totalCells / 7);

    for (let row = 0; row < totalRows; row++) {
      const tr = document.createElement('tr');
      for (let col = 0; col < 7; col++) {
        const td = document.createElement('td');
        td.setAttribute('role', 'gridcell');

        const btn = document.createElement('button');
        btn.setAttribute('type', 'button');

        const cellDate = new Date(currentDate);
        btn.textContent = String(cellDate.getDate());
        btn.setAttribute('data-date', cellDate.toISOString().split('T')[0] ?? '');

        const isOutside = cellDate.getMonth() !== month;
        if (isOutside) {
          btn.setAttribute('data-outside-month', 'true');
        }

        if (isSameDay(cellDate, now)) {
          btn.setAttribute('data-today', 'true');
        }

        if (isDateDisabled(cellDate)) {
          btn.setAttribute('aria-disabled', 'true');
        }

        if (isSelected(cellDate)) {
          btn.setAttribute('aria-selected', 'true');
        }

        if (mode === 'range') {
          const val = state.value.peek() as { from: Date; to: Date } | null;
          if (val && 'from' in val) {
            if (isSameDay(cellDate, val.from)) {
              btn.setAttribute('data-range-start', 'true');
            }
            if (isSameDay(cellDate, val.to)) {
              btn.setAttribute('data-range-end', 'true');
            }
            if (isInRange(cellDate)) {
              btn.setAttribute('data-in-range', 'true');
            }
          }
        }

        btn.addEventListener('click', () => {
          selectDate(cellDate);
          rebuildGrid();
        });

        td.appendChild(btn);
        tr.appendChild(td);
        currentDate = addDays(currentDate, 1);
      }
      tbody.appendChild(tr);
    }

    grid.appendChild(tbody);
  }

  function rebuildGrid(): void {
    updateTitle();
    buildGrid();
  }

  function navigateMonth(delta: number): void {
    state.displayMonth.value = addMonths(state.displayMonth.peek(), delta);
    onMonthChange?.(state.displayMonth.peek());
    rebuildGrid();
  }

  const title = (<div />) as HTMLDivElement;

  const prevButton = (
    <button type="button" onClick={() => navigateMonth(-1)} />
  ) as HTMLButtonElement;

  const nextButton = (
    <button type="button" onClick={() => navigateMonth(1)} />
  ) as HTMLButtonElement;

  const header = (
    <div>
      {prevButton}
      {title}
      {nextButton}
    </div>
  ) as HTMLDivElement;

  const grid = (
    <table
      role="grid"
      onKeydown={(event: KeyboardEvent) => {
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
          rebuildGrid();
          return;
        }

        if (next) {
          state.focusedDate.value = next;
          if (
            next.getMonth() !== state.displayMonth.peek().getMonth() ||
            next.getFullYear() !== state.displayMonth.peek().getFullYear()
          ) {
            state.displayMonth.value = new Date(next.getFullYear(), next.getMonth(), 1);
            onMonthChange?.(state.displayMonth.peek());
            rebuildGrid();
          }
          const dateKey = next.toISOString().split('T')[0];
          const btn = grid.querySelector(`button[data-date="${dateKey}"]`) as HTMLElement | null;
          btn?.focus();
        }
      }}
    />
  ) as HTMLTableElement;

  updateTitle();
  buildGrid();

  const root = (
    <div>
      {header}
      {grid}
    </div>
  ) as HTMLDivElement;

  applyAttrs(root, attrs);

  return { root, header, title, prevButton, nextButton, grid, state };
}

export const Calendar: {
  Root: (options?: CalendarOptions) => CalendarElements & { state: CalendarState };
} = {
  Root: CalendarRoot,
};
