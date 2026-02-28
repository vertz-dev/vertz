import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
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

const focusRing: Record<string, (string | RawDeclaration)[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      property: 'outline',
      value: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { property: 'outline-offset', value: '2px' },
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
        '&': [
          { property: 'height', value: '1.75rem' },
          { property: 'width', value: '1.75rem' },
        ],
      },
    ],
    calendarGrid: [
      {
        '&': [
          { property: 'width', value: '100%' },
          { property: 'border-collapse', value: 'collapse' },
        ],
      },
    ],
    calendarHeadCell: [
      'text:muted-foreground',
      'text:xs',
      'font:medium',
      {
        '&': [
          { property: 'width', value: '2rem' },
          { property: 'text-align', value: 'center' },
        ],
      },
    ],
    calendarCell: [
      {
        '&': [
          { property: 'text-align', value: 'center' },
          { property: 'padding', value: '0' },
        ],
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
        '&': [
          { property: 'height', value: '2rem' },
          { property: 'width', value: '2rem' },
        ],
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
