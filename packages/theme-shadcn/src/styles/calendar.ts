import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css } from '@vertz/ui';

type CalendarBlocks = {
  root: StyleEntry[];
  header: StyleEntry[];
  title: StyleEntry[];
  navButton: StyleEntry[];
  grid: StyleEntry[];
  headCell: StyleEntry[];
  cell: StyleEntry[];
  dayButton: StyleEntry[];
  monthSelect: StyleEntry[];
  yearSelect: StyleEntry[];
};

const focusRing: Record<string, StyleValue[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { 'outline-offset': '2px' },
  ],
};

/** Create calendar css() styles. */
export function createCalendarStyles(): CSSOutput<CalendarBlocks> {
  const s = css({
    /* root: bg-background p-2, --cell-size = 1.75rem (spacing-7) */
    calendarRoot: [
      'w:fit',
      'bg:background',
      'text:foreground',
      'rounded:lg',
      'border:1',
      'border:border',
      {
        '&': {
          padding: '0.5rem',
        },
      },
    ],
    /* header: relative, flex, items-center, justify-between, h = --cell-size */
    calendarHeader: [
      'flex',
      'items:center',
      'justify:between',
      {
        '&': {
          position: 'relative',
          height: '1.75rem',
          width: '100%',
        },
        /* dropdown-only mode: center the selects */
        '&[data-caption-layout="dropdown"]': {
          'justify-content': 'center',
          gap: '0.25rem',
        },
        /* dropdown-buttons mode: space between with gap */
        '&[data-caption-layout="dropdown-buttons"]': {
          gap: '0.25rem',
        },
      },
    ],
    /* month_caption: flex h-(--cell-size) w-full items-center justify-center px-(--cell-size) */
    calendarTitle: [
      'text:sm',
      'font:medium',
      {
        '&': {
          position: 'absolute',
          inset: '0',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'pointer-events': 'none',
          'user-select': 'none',
        },
      },
    ],
    /* nav buttons: ghost variant + size-(--cell-size) = 1.75rem, p-0 */
    calendarNavButton: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:lg',
      'bg:transparent',
      'cursor:pointer',
      'transition:all',
      { '&:hover': ['bg:muted', 'text:foreground'] },
      focusRing,
      {
        '&': {
          height: '1.75rem',
          width: '1.75rem',
          padding: '0',
          border: '1px solid transparent',
          'user-select': 'none',
          'z-index': '1',
        },
        '& svg:not([class*="size-"])': {
          width: '1rem',
          height: '1rem',
        },
      },
      { '&[aria-disabled="true"]': ['opacity:0.5'] },
    ],
    /* table: w-full border-collapse */
    calendarGrid: [
      {
        '&': {
          width: '100%',
          'border-collapse': 'collapse',
        },
      },
    ],
    /* weekday: text-[0.8rem] font-normal text-muted-foreground select-none */
    calendarHeadCell: [
      'text:muted-foreground',
      'font:normal',
      {
        '&': {
          width: '1.75rem',
          'text-align': 'center',
          'font-size': '0.8rem',
          'user-select': 'none',
        },
      },
    ],
    /* day: aspect-square p-0 text-center select-none */
    calendarCell: [
      {
        '&': {
          'text-align': 'center',
          padding: '0',
          'user-select': 'none',
        },
      },
    ],
    /* DayButton: ghost variant, size=icon (size-8 = 2rem), font-normal, border-0 */
    calendarDayButton: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:lg',
      'text:sm',
      'font:normal',
      'bg:transparent',
      'cursor:pointer',
      'transition:all',
      focusRing,
      {
        '&': {
          height: '1.75rem',
          width: '1.75rem',
          border: '1px solid transparent',
          padding: '0',
        },
      },
      { '&:hover': ['bg:muted', 'text:foreground'] },
      /* selected single: bg-primary text-primary-foreground */
      { '&[aria-selected="true"]': ['bg:primary', 'text:primary-foreground'] },
      /* today: bg-muted text-foreground (not selected) */
      {
        '&[data-today="true"]': ['bg:muted', 'text:foreground'],
      },
      /* today + selected: primary wins */
      {
        '&[data-today="true"][aria-selected="true"]': ['bg:primary', 'text:primary-foreground'],
      },
      /* disabled: text-muted-foreground opacity-50 */
      {
        '&[aria-disabled="true"]': ['text:muted-foreground', 'opacity:0.5', 'pointer-events-none'],
      },
      /* outside: text-muted-foreground */
      {
        '&[data-outside-month="true"]': ['text:muted-foreground'],
      },
      /* range middle: bg-muted text-foreground rounded-none */
      { '&[data-in-range="true"]': ['bg:muted', 'text:foreground'] },
    ],
    /* month/year dropdown selects */
    calendarMonthSelect: [
      'text:sm',
      'font:medium',
      'bg:transparent',
      'cursor:pointer',
      focusRing,
      {
        '&': {
          border: 'none',
          'padding-inline': '0.25rem',
          appearance: 'auto',
        },
      },
    ],
    calendarYearSelect: [
      'text:sm',
      'font:medium',
      'bg:transparent',
      'cursor:pointer',
      focusRing,
      {
        '&': {
          border: 'none',
          'padding-inline': '0.25rem',
          appearance: 'auto',
        },
      },
    ],
  });
  return {
    root: s.calendarRoot,
    header: s.calendarHeader,
    title: s.calendarTitle,
    navButton: s.calendarNavButton,
    grid: s.calendarGrid,
    headCell: s.calendarHeadCell,
    cell: s.calendarCell,
    dayButton: s.calendarDayButton,
    monthSelect: s.calendarMonthSelect,
    yearSelect: s.calendarYearSelect,
    css: s.css,
  } as CSSOutput<CalendarBlocks>;
}
