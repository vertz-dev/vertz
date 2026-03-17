import type { ChildValue } from '@vertz/ui';
import { ComposedScrollArea } from '@vertz/ui-primitives';

interface ScrollAreaStyleClasses {
  readonly root: string;
  readonly viewport: string;
  readonly scrollbar: string;
  readonly thumb: string;
}

// -- Props ------------------------------------------------------------------

export interface ScrollAreaRootProps {
  orientation?: 'vertical' | 'horizontal' | 'both';
  children?: ChildValue;
}

// -- Component type ---------------------------------------------------------

export type ThemedScrollAreaComponent = (props: ScrollAreaRootProps) => HTMLElement;

// -- Factory ----------------------------------------------------------------

export function createThemedScrollArea(styles: ScrollAreaStyleClasses): ThemedScrollAreaComponent {
  function ScrollAreaRoot({ children, orientation }: ScrollAreaRootProps): HTMLElement {
    return ComposedScrollArea({
      children,
      orientation,
      classes: {
        root: styles.root,
        viewport: styles.viewport,
        scrollbar: styles.scrollbar,
        thumb: styles.thumb,
      },
    });
  }

  return ScrollAreaRoot as ThemedScrollAreaComponent;
}
