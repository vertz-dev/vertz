import type { DisposeFn, Signal } from '../runtime/signal-types';
/**
 * Keyed list reconciliation.
 * Efficiently updates a container's children when the items signal changes.
 * Reuses existing DOM nodes based on key identity — no virtual DOM.
 *
 * Compiler output target for .map() / for-each expressions in JSX.
 *
 * @param container - The parent DOM element
 * @param items - A signal or getter function containing the array of items.
 *   The compiler generates `() => signal.value` as a getter; the runtime
 *   also accepts a raw Signal for direct use in tests.
 * @param keyFn - Extracts a unique key from each item
 * @param renderFn - Creates a DOM node for an item (called once per key)
 * @returns A dispose function to stop the reactive list reconciliation
 */
export declare function __list<T>(
  container: HTMLElement,
  items: Signal<T[]> | (() => T[]),
  keyFn: (item: T) => string | number,
  renderFn: (item: T) => Node,
): DisposeFn;
//# sourceMappingURL=list.d.ts.map
