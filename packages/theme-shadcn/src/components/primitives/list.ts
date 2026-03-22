import type { ChildValue } from '@vertz/ui';
import type { AnimateConfig, ComposedListProps } from '@vertz/ui-primitives';
import { ComposedList, withStyles } from '@vertz/ui-primitives';

interface ListStyleClasses {
  readonly root: string;
  readonly item: string;
  readonly dragHandle: string;
}

// ── Props ──────────────────────────────────────────────────

export interface ListRootProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  animate?: boolean | AnimateConfig;
  sortable?: boolean;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

export interface ListSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedListComponent {
  (props: ListRootProps): HTMLElement;
  Item: (props: ListSlotProps) => HTMLElement;
  DragHandle: (props: ListSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedList(styles: ListStyleClasses): ThemedListComponent {
  const StyledList = withStyles(ComposedList, {
    root: styles.root,
    item: styles.item,
    dragHandle: styles.dragHandle,
  });

  function ListRoot({
    children,
    className,
    class: classProp,
    animate,
    sortable,
    onReorder,
  }: ListRootProps): HTMLElement {
    return StyledList({
      children,
      className: className ?? classProp,
      animate,
      sortable,
      onReorder,
    } as ComposedListProps);
  }

  return Object.assign(ListRoot, {
    Item: ComposedList.Item,
    DragHandle: ComposedList.DragHandle,
  });
}
