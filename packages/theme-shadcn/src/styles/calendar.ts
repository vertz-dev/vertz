import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type CalendarBlocks = {
  root: StyleBlock;
  rootNoBorder: StyleBlock;
  header: StyleBlock;
  title: StyleBlock;
  navButton: StyleBlock;
  grid: StyleBlock;
  headCell: StyleBlock;
  cell: StyleBlock;
  dayButton: StyleBlock;
  monthSelect: StyleBlock;
  yearSelect: StyleBlock;
};

const focusRing: StyleBlock = {
  '&:focus-visible': {
    outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    outlineOffset: '2px',
  },
};

/** Create calendar css() styles. */
export function createCalendarStyles(): CSSOutput<CalendarBlocks> {
  const s = css({
    /* root: bg-background p-2, --cell-size = 1.75rem (spacing-7) */
    calendarRoot: {
      width: 'fit-content',
      backgroundColor: token.color.background,
      color: token.color.foreground,
      borderRadius: token.radius.lg,
      borderWidth: '1px',
      borderColor: token.color.border,
      '&': { padding: '0.5rem' },
    },
    /* root without border — used when calendar is embedded (e.g. inside DatePicker popover) */
    calendarRootNoBorder: {
      width: 'fit-content',
      backgroundColor: token.color.background,
      color: token.color.foreground,
      borderRadius: token.radius.md,
      '&': { padding: '0.5rem' },
    },
    /* header: relative, flex, items-center, justify-between, h = --cell-size */
    calendarHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      '&': { position: 'relative', height: '1.75rem', width: '100%' },
      '&[data-caption-layout="dropdown"]': { justifyContent: 'center', gap: '0.25rem' },
      '&[data-caption-layout="dropdown-buttons"]': { gap: '0.25rem' },
    },
    /* month_caption: flex h-(--cell-size) w-full items-center justify-center px-(--cell-size) */
    calendarTitle: {
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      '&': {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
      },
    },
    /* nav buttons: ghost variant + size-(--cell-size) = 1.75rem, p-0 */
    calendarNavButton: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: token.radius.lg,
      backgroundColor: 'transparent',
      cursor: 'pointer',
      transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      '&:hover': { backgroundColor: token.color.muted, color: token.color.foreground },
      ...focusRing,
      '&': {
        height: '1.75rem',
        width: '1.75rem',
        padding: '0',
        border: '1px solid transparent',
        userSelect: 'none',
        zIndex: '1',
      },
      '& svg:not([class*="size-"])': { width: '1rem', height: '1rem' },
      '&[aria-disabled="true"]': { opacity: '0.5' },
    },
    /* table: w-full border-collapse */
    calendarGrid: { '&': { width: '100%', borderCollapse: 'collapse' } },
    /* weekday: text-[0.8rem] font-normal text-muted-foreground select-none */
    calendarHeadCell: {
      color: token.color['muted-foreground'],
      fontWeight: token.font.weight.normal,
      '&': { width: '1.75rem', textAlign: 'center', fontSize: '0.8rem', userSelect: 'none' },
    },
    /* day: aspect-square p-0 text-center select-none */
    calendarCell: { '&': { textAlign: 'center', padding: '0', userSelect: 'none' } },
    /* DayButton: ghost variant, size=icon (size-8 = 2rem), font-normal, border-0 */
    calendarDayButton: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: token.radius.lg,
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.normal,
      backgroundColor: 'transparent',
      cursor: 'pointer',
      transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      ...focusRing,
      '&': { height: '1.75rem', width: '1.75rem', border: '1px solid transparent', padding: '0' },
      '&:hover': { backgroundColor: token.color.muted, color: token.color.foreground },
      '&[aria-selected="true"]': {
        backgroundColor: token.color.primary,
        color: token.color['primary-foreground'],
      },
      '&[data-today="true"]': { backgroundColor: token.color.muted, color: token.color.foreground },
      '&[data-today="true"][aria-selected="true"]': {
        backgroundColor: token.color.primary,
        color: token.color['primary-foreground'],
      },
      '&[aria-disabled="true"]': {
        color: token.color['muted-foreground'],
        opacity: '0.5',
        pointerEvents: 'none',
      },
      '&[data-outside-month="true"]': { color: token.color['muted-foreground'] },
      '&[data-in-range="true"]': {
        backgroundColor: token.color.muted,
        color: token.color.foreground,
      },
    },
    /* month/year dropdown selects */
    calendarMonthSelect: {
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      backgroundColor: 'transparent',
      cursor: 'pointer',
      ...focusRing,
      '&': { border: 'none', paddingInline: '0.25rem', appearance: 'auto' },
    },
    calendarYearSelect: {
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      backgroundColor: 'transparent',
      cursor: 'pointer',
      ...focusRing,
      '&': { border: 'none', paddingInline: '0.25rem', appearance: 'auto' },
    },
  });
  return {
    root: s.calendarRoot,
    rootNoBorder: s.calendarRootNoBorder,
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
