import type { ChildValue } from '@vertz/ui';
import type { CalendarClasses } from '@vertz/ui-primitives';
import { ComposedDatePicker } from '@vertz/ui-primitives';

interface DatePickerStyleClasses {
  readonly trigger: string;
  readonly content: string;
}

// -- Props ----------------------------------------------------------

export interface DatePickerRootProps {
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
  children?: ChildValue;
}

export interface DatePickerSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// -- Component type -------------------------------------------------

export interface ThemedDatePickerComponent {
  (props: DatePickerRootProps): HTMLElement;
  Trigger: (props: DatePickerSlotProps) => HTMLElement;
  Content: (props: DatePickerSlotProps) => HTMLElement;
}

// -- Factory --------------------------------------------------------

export function createThemedDatePicker(
  styles: DatePickerStyleClasses,
  calendarClasses?: CalendarClasses,
): ThemedDatePickerComponent {
  function DatePickerRoot({
    children,
    mode,
    defaultValue,
    defaultMonth,
    minDate,
    maxDate,
    disabled,
    formatDate,
    placeholder,
    onValueChange,
    onOpenChange,
  }: DatePickerRootProps): HTMLElement {
    return ComposedDatePicker({
      children,
      mode,
      defaultValue,
      defaultMonth,
      minDate,
      maxDate,
      disabled,
      formatDate,
      placeholder,
      onValueChange,
      onOpenChange,
      classes: {
        trigger: styles.trigger,
        content: styles.content,
        calendar: calendarClasses,
      },
    });
  }

  return Object.assign(DatePickerRoot, {
    Trigger: ComposedDatePicker.Trigger,
    Content: ComposedDatePicker.Content,
  }) as ThemedDatePickerComponent;
}
