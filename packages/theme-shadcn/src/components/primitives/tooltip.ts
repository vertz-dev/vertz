import type { TooltipElements, TooltipOptions, TooltipState } from '@vertz/ui-primitives';
import { Tooltip } from '@vertz/ui-primitives';

interface TooltipStyleClasses {
  readonly content: string;
}

export function createThemedTooltip(
  styles: TooltipStyleClasses,
): (options?: TooltipOptions) => TooltipElements & { state: TooltipState } {
  return function themedTooltip(options?: TooltipOptions) {
    const result = Tooltip.Root(options);
    result.content.classList.add(styles.content);
    return result;
  };
}
