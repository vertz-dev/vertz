/**
 * Composed List — compound component with context-based class distribution.
 * Sub-components: Item, DragHandle.
 *
 * Designed for use with plain .map() expressions inside children,
 * preserving VertzQL field selection while supporting animation and drag-sort.
 */

import type { ChildValue, ListAnimationHooks, Ref } from '@vertz/ui';
import { createContext, ListAnimationContext, onMount, ref, useContext } from '@vertz/ui';
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
        const el = node as HTMLElement;
        const rect = node.getBoundingClientRect();
        const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

        // Snapshot remaining items BEFORE taking the exiting item out of flow
        const remainingRects = new Map<string | number, DOMRect>();
        for (const [k, n] of itemNodes) {
          remainingRects.set(k, n.getBoundingClientRect());
        }

        // Animate the exiting item: fade out + collapse height in-place.
        // We keep the item in flow and animate its height to 0 so the items
        // below slide up smoothly at the same time.
        el.style.overflow = 'hidden';
        el.style.pointerEvents = 'none';
        el.style.borderBottomWidth = '0';
        node.setAttribute('data-presence', 'exit');

        if (!reducedMotion) {
          // Set explicit height so we can transition to 0
          el.style.height = `${rect.height}px`;
          el.style.transition = 'none';
          el.style.opacity = '1';

          // Force reflow then animate to collapsed
          void el.offsetHeight;
          el.style.transition =
            `height ${duration}ms ${easing}, opacity ${duration}ms ${easing}, ` +
            `padding ${duration}ms ${easing}`;
          el.style.height = '0';
          el.style.paddingTop = '0';
          el.style.paddingBottom = '0';
          el.style.opacity = '0';

          el.addEventListener('transitionend', () => done(), { once: true });

          // Safety timeout in case transitionend doesn't fire
          setTimeout(() => done(), duration + 50);
        } else {
          done();
        }

        return;
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
 * Create and manage a drop indicator line shown between items during drag.
 */
function createDropIndicator(): {
  show: (ulEl: HTMLElement, beforeItem: HTMLElement | null) => void;
  hide: () => void;
} {
  let indicator: HTMLElement | null = null;

  function getOrCreate(): HTMLElement {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.setAttribute('data-drop-indicator', '');
      indicator.style.height = '2px';
      indicator.style.background = 'var(--color-primary, #3b82f6)';
      indicator.style.borderRadius = '1px';
      indicator.style.position = 'absolute';
      indicator.style.left = '0';
      indicator.style.right = '0';
      indicator.style.pointerEvents = 'none';
      indicator.style.zIndex = '100';
    }
    return indicator;
  }

  return {
    show(ulEl: HTMLElement, beforeItem: HTMLElement | null) {
      const el = getOrCreate();
      if (!el.parentNode) ulEl.appendChild(el);

      if (beforeItem) {
        const ulRect = ulEl.getBoundingClientRect();
        const itemRect = beforeItem.getBoundingClientRect();
        el.style.top = `${itemRect.top - ulRect.top - 1}px`;
      } else {
        // After the last item
        const items = ulEl.querySelectorAll('[data-sortable-item]');
        if (items.length > 0) {
          const last = items[items.length - 1] as HTMLElement;
          const ulRect = ulEl.getBoundingClientRect();
          const lastRect = last.getBoundingClientRect();
          el.style.top = `${lastRect.bottom - ulRect.top - 1}px`;
        }
      }
    },
    hide() {
      indicator?.parentNode?.removeChild(indicator);
    },
  };
}

/**
 * Set up drag-and-sort event delegation on the list root element.
 * Uses pointerdown on [data-sortable] elements within the list.
 */
/**
 * Calculate which items should shift and in which direction during an animated drag.
 * Items between fromIndex and targetInsertionIndex shift by ±draggedHeight.
 */
function applyShiftTransforms(
  allItems: HTMLElement[],
  fromIndex: number,
  targetInsertionIndex: number,
  draggedHeight: number,
  animate: boolean | AnimateConfig,
): void {
  const { duration, easing } = resolveAnimateConfig(animate);

  for (let i = 0; i < allItems.length; i++) {
    if (i === fromIndex) continue; // Skip the dragged item itself

    let shift = 0;
    if (targetInsertionIndex > fromIndex) {
      // Dragging downward: items between (fromIndex, targetInsertionIndex) shift up
      if (i > fromIndex && i < targetInsertionIndex) {
        shift = -draggedHeight;
      }
    } else if (targetInsertionIndex < fromIndex) {
      // Dragging upward: items between [targetInsertionIndex, fromIndex) shift down
      if (i >= targetInsertionIndex && i < fromIndex) {
        shift = draggedHeight;
      }
    }

    const item = allItems[i]!;
    if (shift !== 0) {
      item.style.transition = `transform ${duration}ms ${easing}`;
      item.style.transform = `translateY(${shift}px)`;
    } else {
      item.style.transition = `transform ${duration}ms ${easing}`;
      item.style.transform = '';
    }
  }
}

function setupDragSort(
  ulEl: HTMLElement,
  getSortable: () => boolean,
  getOnReorder: () => ((fromIndex: number, toIndex: number) => void) | undefined,
  getAnimate: () => boolean | AnimateConfig,
): void {
  const dropIndicator = createDropIndicator();

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

    const animate = getAnimate();
    const useAnimatedShift = !!animate;

    // Capture starting pointer position for translate
    const startY = e.clientY;

    // Mark as dragging
    draggedItem.setAttribute('data-dragging', '');

    // Get all sortable items and find the dragged index
    const allItems = [...ulEl.querySelectorAll('[data-sortable-item]')] as HTMLElement[];
    const fromIndex = allItems.indexOf(draggedItem);
    if (fromIndex === -1) return;

    // Snapshot item rects at drag start — used for all calculations during drag
    const snapshotRects = allItems.map((item) => item.getBoundingClientRect());
    const draggedHeight = snapshotRects[fromIndex]!.height;

    // Set will-change hint on all items for GPU compositing
    if (useAnimatedShift) {
      for (const item of allItems) {
        item.style.willChange = 'transform';
      }
    }

    /**
     * Calculate insertion index from snapshotted rects (not live DOM).
     */
    function calcInsertionFromSnapshot(clientY: number): number {
      if (snapshotRects.length === 0) return 0;
      for (let i = 0; i < snapshotRects.length; i++) {
        const rect = snapshotRects[i]!;
        const midY = rect.top + rect.height / 2;
        if (clientY <= midY) return i;
      }
      return snapshotRects.length;
    }

    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();

      // Translate the dragged item to follow the pointer
      const deltaY = moveEvent.clientY - startY;
      draggedItem.style.transform = `translateY(${deltaY}px)`;
      draggedItem.style.transition = 'none';

      const targetInsertionIndex = calcInsertionFromSnapshot(moveEvent.clientY);

      if (useAnimatedShift) {
        // Animated: shift non-dragged items with transforms
        applyShiftTransforms(allItems, fromIndex, targetInsertionIndex, draggedHeight, animate);
      } else {
        // Non-animated fallback: show drop indicator line
        const indicatorTarget =
          (targetInsertionIndex < allItems.length ? allItems[targetInsertionIndex] : null) ?? null;

        if (indicatorTarget !== draggedItem) {
          dropIndicator.show(ulEl, indicatorTarget);
        } else {
          dropIndicator.hide();
        }
      }
    };

    const onUp = (upEvent: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);

      // Clean up visual state on dragged item
      draggedItem.removeAttribute('data-dragging');
      draggedItem.style.transform = '';
      draggedItem.style.transition = '';

      if (useAnimatedShift) {
        // Clear all shift transforms instantly (transition: none prevents snap-back)
        for (const item of allItems) {
          item.style.transition = 'none';
          item.style.transform = '';
          item.style.willChange = '';
        }
      }

      dropIndicator.hide();

      // Calculate destination index (insertion-before → destination-after-removal)
      const insertionIndex = calcInsertionFromSnapshot(upEvent.clientY);
      const destIndex = insertionIndex > fromIndex ? insertionIndex - 1 : insertionIndex;

      if (fromIndex !== destIndex) {
        getOnReorder()?.(fromIndex, destIndex);
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
  const ulRef: Ref<HTMLUListElement> = ref();

  // Set up drag-and-sort after mount when the ref is available
  if (sortable) {
    onMount(() => {
      const ul = ulRef.current;
      if (ul) {
        setupDragSort(
          ul,
          () => sortable,
          () => onReorder,
          () => animate,
        );
      }
    });
  }

  return (
    <ListContext.Provider value={ctx}>
      <ListAnimationContext.Provider value={animHooks}>
        <ul ref={ulRef} class={cn(classes?.root, className ?? classProp)}>
          {children}
        </ul>
      </ListAnimationContext.Provider>
    </ListContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

/**
 * Reorder an array by moving an item from one index to another.
 * Returns a new array without mutating the original.
 */
function reorder<T>(arr: readonly T[], from: number, to: number): T[] {
  const result = [...arr];
  // Safe: callers guarantee 0 <= from < arr.length
  const moved = result.splice(from, 1)[0] as T;
  result.splice(to, 0, moved);
  return result;
}

export const ComposedList = Object.assign(ComposedListRoot, {
  Item: ListItem,
  DragHandle: ListDragHandle,
  reorder,
}) as ((props: ComposedListProps) => HTMLElement) & {
  __classKeys?: ListClassKey;
  Item: (props: SlotProps) => HTMLElement;
  DragHandle: (props: SlotProps) => HTMLElement;
  reorder: <T>(arr: readonly T[], from: number, to: number) => T[];
};
