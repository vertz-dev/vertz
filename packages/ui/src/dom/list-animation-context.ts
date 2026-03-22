import type { Context } from '../component/context';
import { createContext } from '../component/context';

/**
 * Lifecycle hooks for list animation (enter/exit/reorder).
 *
 * Provided by `<List animate>` via ListAnimationContext.
 * Consumed by `__listValue()` during reconciliation.
 */
export interface ListAnimationHooks {
  /** Called before reconciliation starts. Use to snapshot element rects for FLIP. */
  onBeforeReconcile: () => void;
  /** Called after reconciliation finishes. Use to play FLIP animations. */
  onAfterReconcile: () => void;
  /** Called when a new item enters (after first render). */
  onItemEnter: (node: Node, key: string | number) => void;
  /** Called when an item exits. Must call `done()` when animation finishes so the node can be removed. */
  onItemExit: (node: Node, key: string | number, done: () => void) => void;
}

/**
 * Context for list animation hooks.
 *
 * When provided, `__listValue()` calls these hooks during reconciliation
 * to enable enter/exit animations and FLIP reordering.
 *
 * When not provided, `__listValue()` behaves as a plain keyed list.
 */
export const ListAnimationContext: Context<ListAnimationHooks | undefined> = createContext<
  ListAnimationHooks | undefined
>(undefined, '@vertz/ui::ListAnimationContext');
