import type {
  CollapsibleElements,
  CollapsibleOptions,
  CollapsibleState,
} from '@vertz/ui-primitives';
import { Collapsible } from '@vertz/ui-primitives';

interface CollapsibleStyleClasses {
  readonly content: string;
}

export function createThemedCollapsible(
  styles: CollapsibleStyleClasses,
): (options?: CollapsibleOptions) => CollapsibleElements & { state: CollapsibleState } {
  return function themedCollapsible(options?: CollapsibleOptions) {
    const result = Collapsible.Root(options);
    result.content.classList.add(styles.content);
    return result;
  };
}
