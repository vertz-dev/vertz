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

        el.setAttribute(
          'style',
          `transform: translate(${deltaX}px, ${deltaY}px); transition: none;`,
        );

        requestAnimationFrame(() => {
          (el as HTMLElement).style.transition = `transform ${duration}ms ${easing}`;
          (el as HTMLElement).style.transform = '';

          const onEnd = () => {
            (el as HTMLElement).style.transition = '';
            (el as HTMLElement).style.transform = '';
            el.removeEventListener('transitionend', onEnd);
          };
          el.addEventListener('transitionend', onEnd, { once: true });
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

  return (
    <ListContext.Provider value={ctx}>
      <ListAnimationContext.Provider value={animHooks}>
        <ul class={cn(classes?.root, className ?? classProp)}>{children}</ul>
      </ListAnimationContext.Provider>
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
