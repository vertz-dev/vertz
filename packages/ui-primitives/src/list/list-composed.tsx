/**
 * Composed List — compound component with context-based class distribution.
 * Sub-components: Item, DragHandle.
 *
 * Designed for use with plain .map() expressions inside children,
 * preserving VertzQL field selection while supporting animation and drag-sort.
 */

import type { ChildValue, ListAnimationHooks } from '@vertz/ui';
import { createContext, ListAnimationContext, useContext } from '@vertz/ui';
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
  return (
    <li
      class={cn(ctx.classes?.item, className ?? classProp)}
      data-sortable-item={ctx.sortable ? '' : undefined}
    >
      {children}
    </li>
  );
}

function ListDragHandle({ children, className, class: classProp }: SlotProps) {
  const ctx = useListContext('DragHandle');
  return (
    <div
      data-list-drag-handle=""
      data-sortable={ctx.sortable ? '' : undefined}
      class={cn(ctx.classes?.dragHandle, className ?? classProp)}
    >
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

/** Default animation config values. */
const DEFAULT_DURATION = 200;
const DEFAULT_EASING = 'ease-out';

function resolveAnimateConfig(animate: boolean | AnimateConfig): {
  duration: number;
  easing: string;
} {
  if (typeof animate === 'object') {
    return {
      duration: animate.duration ?? DEFAULT_DURATION,
      easing: animate.easing ?? DEFAULT_EASING,
    };
  }
  return { duration: DEFAULT_DURATION, easing: DEFAULT_EASING };
}

/**
 * Build FLIP animation hooks for the list.
 * These hooks are provided via ListAnimationContext and consumed by __listValue().
 */
function createAnimationHooks(animate: boolean | AnimateConfig): ListAnimationHooks {
  const { duration, easing } = resolveAnimateConfig(animate);
  const itemRects = new Map<string | number, DOMRect>();
  const itemNodes = new Map<string | number, Element>();

  return {
    onBeforeReconcile() {
      // Snapshot current rects for FLIP
      itemRects.clear();
      for (const [key, el] of itemNodes) {
        itemRects.set(key, el.getBoundingClientRect());
      }
    },

    onAfterReconcile() {
      // Respect prefers-reduced-motion
      if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

      // FLIP: animate items that moved
      for (const [key, el] of itemNodes) {
        const firstRect = itemRects.get(key);
        if (!firstRect) continue; // New item — handled by onItemEnter

        const lastRect = el.getBoundingClientRect();
        const deltaX = firstRect.left - lastRect.left;
        const deltaY = firstRect.top - lastRect.top;

        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;

        (el as HTMLElement).style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        (el as HTMLElement).style.transition = 'none';

        requestAnimationFrame(() => {
          (el as HTMLElement).style.transition = `transform ${duration}ms ${easing}`;
          (el as HTMLElement).style.transform = '';

          el.addEventListener(
            'transitionend',
            () => {
              (el as HTMLElement).style.transition = '';
              (el as HTMLElement).style.transform = '';
            },
            { once: true },
          );
        });
      }
    },

    onItemEnter(node, key) {
      if (node instanceof Element) {
        itemNodes.set(key, node);
        node.setAttribute('data-presence', 'enter');

        // Clear data-presence after CSS animation completes
        if ('offsetHeight' in node) {
          void (node as HTMLElement).offsetHeight; // force reflow
        }
        if (typeof node.getAnimations === 'function') {
          const anims = node.getAnimations();
          if (anims.length > 0) {
            Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => {
              if (itemNodes.get(key) === node) {
                node.removeAttribute('data-presence');
              }
            });
            return;
          }
        }
        node.removeAttribute('data-presence');
      }
    },

    onItemExit(node, key, done) {
      itemNodes.delete(key);
      itemRects.delete(key);

      if (node instanceof Element) {
        // Set explicit height for collapse animation
        const rect = node.getBoundingClientRect();
        (node as HTMLElement).style.height = `${rect.height}px`;
        (node as HTMLElement).style.overflow = 'hidden';
        node.setAttribute('data-presence', 'exit');

        // Wait for CSS animation, then call done() to remove from DOM
        if ('offsetHeight' in node) {
          void (node as HTMLElement).offsetHeight;
        }
        if (typeof node.getAnimations === 'function') {
          const anims = node.getAnimations();
          if (anims.length > 0) {
            Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => done());
            return;
          }
        }
      }
      done();
    },
  };
}

// ---------------------------------------------------------------------------
// Drag-and-sort
// ---------------------------------------------------------------------------

/**
 * Find the containing `[data-sortable-item]` element from an event target.
 */
function findSortableItem(target: EventTarget | null, root: Element): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const item = target.closest('[data-sortable-item]');
  if (item instanceof HTMLElement && root.contains(item)) return item;
  return null;
}

/**
 * Calculate the insertion index based on pointer Y position and item midpoints.
 */
function calcInsertionIndex(items: HTMLElement[], clientY: number): number {
  if (items.length === 0) return 0;
  for (const [i, item] of items.entries()) {
    const rect = item.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY <= midY) return i;
  }
  return items.length - 1;
}

/**
 * Set up drag-and-sort event delegation on the list root element.
 * Uses pointerdown on [data-sortable] elements within the list.
 */
function setupDragSort(
  ulEl: HTMLElement,
  getSortable: () => boolean,
  getOnReorder: () => ((fromIndex: number, toIndex: number) => void) | undefined,
): void {
  ulEl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!getSortable()) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Check if drag was initiated from a drag handle or directly on an item
    const hasHandles = ulEl.querySelector('[data-list-drag-handle][data-sortable]') !== null;
    if (hasHandles) {
      // When handles exist, only allow drag from handle elements
      const handle = target.closest('[data-list-drag-handle][data-sortable]');
      if (!handle || !ulEl.contains(handle)) return;
    } else {
      // When no handles, allow drag from sortable items directly
      const item = target.closest('[data-sortable-item]');
      if (!item || !ulEl.contains(item)) return;
    }

    const draggedItem = findSortableItem(target, ulEl);
    if (!draggedItem) return;

    e.preventDefault();

    // Mark as dragging
    draggedItem.setAttribute('data-dragging', '');

    // Get all sortable items and find the dragged index
    const allItems = [...ulEl.querySelectorAll('[data-sortable-item]')] as HTMLElement[];
    const fromIndex = allItems.indexOf(draggedItem);
    if (fromIndex === -1) return;

    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
    };

    const onUp = (upEvent: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);

      draggedItem.removeAttribute('data-dragging');

      // Calculate destination index
      const currentItems = [...ulEl.querySelectorAll('[data-sortable-item]')] as HTMLElement[];
      const toIndex = calcInsertionIndex(currentItems, upEvent.clientY);

      if (fromIndex !== toIndex) {
        getOnReorder()?.(fromIndex, toIndex);
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
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

  const animHooks = animate ? createAnimationHooks(animate) : undefined;

  const root = (
    <ListContext.Provider value={ctx}>
      <ListAnimationContext.Provider value={animHooks}>
        <ul class={cn(classes?.root, className ?? classProp)}>{children}</ul>
      </ListAnimationContext.Provider>
    </ListContext.Provider>
  ) as HTMLElement;

  // Set up drag-and-sort if sortable
  if (sortable) {
    // The Provider JSX returns an HTMLElement (the <ul> itself),
    // so root is always the <ul>. querySelector is the fallback.
    const actualUl =
      root instanceof HTMLElement && root.tagName === 'UL' ? root : root.querySelector('ul');
    if (actualUl instanceof HTMLElement) {
      setupDragSort(
        actualUl,
        () => sortable,
        () => onReorder,
      );
    }
  }

  return root;
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
