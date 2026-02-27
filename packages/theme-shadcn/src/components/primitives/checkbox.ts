import type { CheckboxElements, CheckboxOptions, CheckboxState } from '@vertz/ui-primitives';
import { Checkbox } from '@vertz/ui-primitives';

interface CheckboxStyleClasses {
  readonly root: string;
}

export function createThemedCheckbox(
  styles: CheckboxStyleClasses,
): (options?: CheckboxOptions) => CheckboxElements & { state: CheckboxState } {
  return function themedCheckbox(options?: CheckboxOptions) {
    const result = Checkbox.Root(options);
    result.root.classList.add(styles.root);
    return result;
  };
}
