/**
 * Composed List — compound component with context-based class distribution.
 * Sub-components: Item, DragHandle.
 *
 * Designed for use with plain .map() expressions inside children,
 * preserving VertzQL field selection while supporting animation and drag-sort.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface ListClasses {
  root?: string;
  item?: string;
  dragHandle?: string;
}

export type ListClassKey = keyof ListClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ListContextValue {
  classes?: ListClasses;
  animate: boolean | AnimateConfig;
  sortable: boolean;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

export interface AnimateConfig {
  duration?: number;
  easing?: string;
}

const ListContext = createContext<ListContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::ListContext',
);

function useListContext(subComponent: string): ListContextValue {
  const ctx = useContext(ListContext);
  if (!ctx) {
    throw new Error(`List.${subComponent} must be used inside a <List> component`);
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ListItem({ children, className, class: classProp }: SlotProps) {
  const ctx = useListContext('Item');
  return <li class={cn(ctx.classes?.item, className ?? classProp)}>{children}</li>;
}

function ListDragHandle({ children, className, class: classProp }: SlotProps) {
  const ctx = useListContext('DragHandle');
  return (
    <div data-list-drag-handle="" class={cn(ctx.classes?.dragHandle, className ?? classProp)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface ComposedListProps {
  children?: ChildValue;
  classes?: ListClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  animate?: boolean | AnimateConfig;
  sortable?: boolean;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

function ComposedListRoot({
  children,
  classes,
  className,
  class: classProp,
  animate = false,
  sortable = false,
  onReorder,
}: ComposedListProps) {
  const ctx: ListContextValue = {
    classes,
    animate,
    sortable,
    onReorder,
  };

  return (
    <ListContext.Provider value={ctx}>
      <ul class={cn(classes?.root, className ?? classProp)}>{children}</ul>
    </ListContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedList = Object.assign(ComposedListRoot, {
  Item: ListItem,
  DragHandle: ListDragHandle,
}) as ((props: ComposedListProps) => HTMLElement) & {
  __classKeys?: ListClassKey;
  Item: (props: SlotProps) => HTMLElement;
  DragHandle: (props: SlotProps) => HTMLElement;
};
