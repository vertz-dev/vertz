import type { PopoverElements, PopoverOptions, PopoverState } from '@vertz/ui-primitives';
import { Popover } from '@vertz/ui-primitives';

interface PopoverStyleClasses {
  readonly content: string;
}

export function createThemedPopover(
  styles: PopoverStyleClasses,
): (options?: PopoverOptions) => PopoverElements & { state: PopoverState } {
  return function themedPopover(options?: PopoverOptions) {
    const result = Popover.Root(options);
    result.content.classList.add(styles.content);
    return result;
  };
}
