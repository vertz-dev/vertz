import type { ScrollAreaElements, ScrollAreaOptions, ScrollAreaState } from '@vertz/ui-primitives';
import { ScrollArea } from '@vertz/ui-primitives';

interface ScrollAreaStyleClasses {
  readonly root: string;
  readonly viewport: string;
  readonly scrollbar: string;
  readonly thumb: string;
}

export function createThemedScrollArea(
  styles: ScrollAreaStyleClasses,
): (
  options?: ScrollAreaOptions,
) => ScrollAreaElements & { state: ScrollAreaState; update: () => void } {
  return function themedScrollArea(options?: ScrollAreaOptions) {
    const result = ScrollArea.Root(options);
    result.root.classList.add(styles.root);
    result.viewport.classList.add(styles.viewport);
    result.scrollbarY.classList.add(styles.scrollbar);
    result.thumbY.classList.add(styles.thumb);
    result.scrollbarX.classList.add(styles.scrollbar);
    result.thumbX.classList.add(styles.thumb);
    return result;
  };
}
