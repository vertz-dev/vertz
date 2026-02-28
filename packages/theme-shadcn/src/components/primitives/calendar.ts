import type { CalendarElements, CalendarOptions, CalendarState } from '@vertz/ui-primitives';
import { Calendar } from '@vertz/ui-primitives';

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

export function createThemedCalendar(
  styles: CalendarStyleClasses,
): (options?: CalendarOptions) => CalendarElements & { state: CalendarState } {
  return function themedCalendar(options?: CalendarOptions) {
    const result = Calendar.Root(options);
    result.root.classList.add(styles.root);
    result.header.classList.add(styles.header);
    result.title.classList.add(styles.title);
    result.prevButton.classList.add(styles.navButton);
    result.nextButton.classList.add(styles.navButton);
    result.grid.classList.add(styles.grid);
    for (const th of result.grid.querySelectorAll('th')) {
      th.classList.add(styles.headCell);
    }
    for (const td of result.grid.querySelectorAll('td')) {
      td.classList.add(styles.cell);
    }
    for (const btn of result.grid.querySelectorAll('button')) {
      btn.classList.add(styles.dayButton);
    }
    return result;
  };
}
