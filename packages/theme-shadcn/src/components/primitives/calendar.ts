import type { ComposedCalendarProps } from '@vertz/ui-primitives';
import { ComposedCalendar, withStyles } from '@vertz/ui-primitives';

interface CalendarStyleClasses {
  readonly root: string;
  readonly header: string;
  readonly title: string;
  readonly navButton: string;
  readonly grid: string;
  readonly headCell: string;
  readonly cell: string;
  readonly dayButton: string;
}

// ── Props ──────────────────────────────────────────────────

export interface CalendarRootProps {
  mode?: ComposedCalendarProps['mode'];
  defaultValue?: ComposedCalendarProps['defaultValue'];
  defaultMonth?: Date;
  minDate?: Date;
  maxDate?: Date;
  disabled?: (date: Date) => boolean;
  weekStartsOn?: ComposedCalendarProps['weekStartsOn'];
  onValueChange?: ComposedCalendarProps['onValueChange'];
  onMonthChange?: (month: Date) => void;
}

// ── Component type ─────────────────────────────────────────

export type ThemedCalendarComponent = (props: CalendarRootProps) => HTMLElement;

// ── Factory ────────────────────────────────────────────────

export function createThemedCalendar(styles: CalendarStyleClasses): ThemedCalendarComponent {
  const StyledCalendar = withStyles(ComposedCalendar, {
    root: styles.root,
    header: styles.header,
    title: styles.title,
    navButton: styles.navButton,
    grid: styles.grid,
    headCell: styles.headCell,
    cell: styles.cell,
    dayButton: styles.dayButton,
  });

  return function CalendarRoot(props: CalendarRootProps): HTMLElement {
    return StyledCalendar(props);
  };
}
