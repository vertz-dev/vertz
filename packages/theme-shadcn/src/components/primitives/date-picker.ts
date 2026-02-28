import type { DatePickerElements, DatePickerOptions, DatePickerState } from '@vertz/ui-primitives';
import { DatePicker } from '@vertz/ui-primitives';

interface DatePickerStyleClasses {
  readonly trigger: string;
  readonly content: string;
}

export function createThemedDatePicker(styles: DatePickerStyleClasses): (
  options?: DatePickerOptions,
) => DatePickerElements & {
  state: DatePickerState;
  show: () => void;
  hide: () => void;
} {
  return function themedDatePicker(options?: DatePickerOptions) {
    const result = DatePicker.Root(options);
    result.trigger.classList.add(styles.trigger);
    result.content.classList.add(styles.content);
    return result;
  };
}
