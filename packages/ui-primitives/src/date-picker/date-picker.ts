/**
 * DatePicker primitive - composes Popover + Calendar.
 * Trigger button opens a popover containing a calendar for date selection.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import type { CalendarOptions } from '../calendar/calendar';
import { Calendar } from '../calendar/calendar';
import { Popover } from '../popover/popover';

export interface DatePickerOptions {
  mode?: 'single' | 'range';
  defaultValue?: Date | { from: Date; to: Date };
  defaultMonth?: Date;
  minDate?: Date;
  maxDate?: Date;
  disabled?: (date: Date) => boolean;
  formatDate?: (date: Date) => string;
  placeholder?: string;
  onValueChange?: (value: Date | { from: Date; to: Date } | null) => void;
  onOpenChange?: (open: boolean) => void;
}

export interface DatePickerState {
  open: Signal<boolean>;
  value: Signal<Date | { from: Date; to: Date } | null>;
  displayMonth: Signal<Date>;
}

export interface DatePickerElements {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
  calendar: {
    root: HTMLDivElement;
    header: HTMLDivElement;
    title: HTMLDivElement;
    prevButton: HTMLButtonElement;
    nextButton: HTMLButtonElement;
    grid: HTMLTableElement;
  };
}

function defaultFormatDate(date: Date): string {
  return date.toLocaleDateString();
}

function formatRangeDisplay(value: { from: Date; to: Date }, fmt: (date: Date) => string): string {
  return `${fmt(value.from)} – ${fmt(value.to)}`;
}

export const DatePicker = {
  Root(options: DatePickerOptions = {}): DatePickerElements & {
    state: DatePickerState;
    show: () => void;
    hide: () => void;
  } {
    const {
      mode = 'single',
      defaultValue = null,
      minDate,
      maxDate,
      disabled,
      formatDate = defaultFormatDate,
      placeholder = 'Pick a date',
      onValueChange,
      onOpenChange,
    } = options;

    // Determine default month from explicit option, initial value, or today
    const defaultMonth =
      options.defaultMonth ??
      (defaultValue instanceof Date
        ? defaultValue
        : defaultValue && 'from' in defaultValue
          ? defaultValue.from
          : new Date());

    const calendarMode: CalendarOptions['mode'] = mode === 'range' ? 'range' : 'single';
    const calendarDefaultValue =
      defaultValue instanceof Date
        ? defaultValue
        : defaultValue && 'from' in defaultValue
          ? defaultValue
          : undefined;

    // Create popover
    const popover = Popover.Root({
      onOpenChange(open) {
        state.open.value = open;
        onOpenChange?.(open);
      },
    });

    // Create calendar inside popover content
    const calendarResult = Calendar.Root({
      mode: calendarMode,
      defaultValue: calendarDefaultValue,
      defaultMonth,
      minDate,
      maxDate,
      disabled,
      onValueChange(value) {
        if (mode === 'single' && value instanceof Date) {
          state.value.value = value;
          updateTriggerText();
          onValueChange?.(value);
          // Auto-close on single date selection
          hide();
        } else if (mode === 'range' && value && 'from' in (value as object)) {
          const range = value as { from: Date; to: Date };
          state.value.value = range;
          updateTriggerText();
          onValueChange?.(range);
          // Range mode: close when both dates are different (complete range)
          if (range.from && range.to && range.from.getTime() !== range.to.getTime()) {
            hide();
          }
        }
      },
    });

    popover.content.appendChild(calendarResult.root);

    // State
    const state: DatePickerState = {
      open: signal(false),
      value: signal<Date | { from: Date; to: Date } | null>(defaultValue),
      displayMonth: calendarResult.state.displayMonth,
    };

    function updateTriggerText(): void {
      const val = state.value.peek();
      if (val === null) {
        popover.trigger.textContent = placeholder;
        popover.trigger.setAttribute('data-placeholder', 'true');
      } else if (val instanceof Date) {
        popover.trigger.textContent = formatDate(val);
        popover.trigger.removeAttribute('data-placeholder');
      } else if ('from' in val) {
        popover.trigger.textContent = formatRangeDisplay(val, formatDate);
        popover.trigger.removeAttribute('data-placeholder');
      }
    }

    function show(): void {
      popover.trigger.click();
    }

    function hide(): void {
      if (state.open.peek()) {
        popover.trigger.click();
      }
    }

    // Initialize trigger text
    updateTriggerText();

    return {
      trigger: popover.trigger,
      content: popover.content,
      calendar: {
        root: calendarResult.root,
        header: calendarResult.header,
        title: calendarResult.title,
        prevButton: calendarResult.prevButton,
        nextButton: calendarResult.nextButton,
        grid: calendarResult.grid,
      },
      state,
      show,
      hide,
    };
  },
};
