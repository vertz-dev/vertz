import type { HoverCardElements, HoverCardOptions, HoverCardState } from '@vertz/ui-primitives';
import { HoverCard } from '@vertz/ui-primitives';

interface HoverCardStyleClasses {
  readonly content: string;
}

export function createThemedHoverCard(
  styles: HoverCardStyleClasses,
): (options?: HoverCardOptions) => HoverCardElements & { state: HoverCardState } {
  return function themedHoverCard(options?: HoverCardOptions) {
    const result = HoverCard.Root(options);
    result.content.classList.add(styles.content);
    return result;
  };
}
