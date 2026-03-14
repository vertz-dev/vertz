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
    calendarRoot: ['p:3'],
    calendarHeader: ['flex', 'items:center', 'justify:between', 'py:2'],
    calendarTitle: ['text:sm', 'font:medium'],
    calendarNavButton: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'border:1',
      'border:input',
      'bg:transparent',
      'cursor:pointer',
      'transition:colors',
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
      focusRing,
      {
        '&': {
          height: '1.75rem',
          width: '1.75rem',
        },
      },
    ],
    calendarGrid: [
      {
        '&': {
          width: '100%',
          'border-collapse': 'collapse',
        },
      },
    ],
    calendarHeadCell: [
      'text:muted-foreground',
      'text:xs',
      'font:medium',
      {
        '&': {
          width: '2rem',
          'text-align': 'center',
        },
      },
    ],
    calendarCell: [
      {
        '&': {
          'text-align': 'center',
          padding: '0',
        },
      },
    ],
    calendarDayButton: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'text:sm',
      'bg:transparent',
      'cursor:pointer',
      'transition:colors',
      focusRing,
      {
        '&': {
          height: '2rem',
          width: '2rem',
        },
      },
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
      { '&[aria-selected="true"]': ['bg:primary', 'text:primary-foreground'] },
      { '&[data-today="true"]': ['border:1', 'border:accent'] },
      { '&[aria-disabled="true"]': ['opacity:0.5', 'pointer-events-none'] },
      { '&[data-outside-month="true"]': ['text:muted-foreground', 'opacity:0.5'] },
      { '&[data-in-range="true"]': ['bg:accent'] },
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
    css: s.css,
  } as CSSOutput<CalendarBlocks>;
}
