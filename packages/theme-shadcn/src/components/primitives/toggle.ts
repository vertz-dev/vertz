import type { ToggleOptions } from '@vertz/ui-primitives';
import { Toggle } from '@vertz/ui-primitives';

interface ToggleStyleClasses {
  readonly root: string;
}

export function createThemedToggle(
  styles: ToggleStyleClasses,
): (options?: ToggleOptions) => HTMLElement {
  return function themedToggle(options?: ToggleOptions) {
    const root = Toggle.Root(options);
    root.classList.add(styles.root);
    return root;
  };
}
