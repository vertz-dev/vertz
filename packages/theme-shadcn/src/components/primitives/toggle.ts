import type { ToggleElements, ToggleOptions, ToggleState } from '@vertz/ui-primitives';
import { Toggle } from '@vertz/ui-primitives';

interface ToggleStyleClasses {
  readonly root: string;
}

export function createThemedToggle(
  styles: ToggleStyleClasses,
): (options?: ToggleOptions) => ToggleElements & { state: ToggleState } {
  return function themedToggle(options?: ToggleOptions) {
    const result = Toggle.Root(options);
    result.root.classList.add(styles.root);
    return result;
  };
}
