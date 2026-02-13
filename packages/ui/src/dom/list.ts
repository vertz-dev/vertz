import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { effect } from '../runtime/signal';
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
export function __list<T>(
  container: HTMLElement,
  items: Signal<T[]> | (() => T[]),
  keyFn: (item: T) => string | number,
  renderFn: (item: T) => Node,
): DisposeFn {
  // Normalize items access: compiler passes a getter `() => signal.value`,
  // while tests pass a raw Signal. Both work inside effect() for tracking.
  const getItems = typeof items === 'function' ? items : () => items.value;

  // Map from key to the rendered DOM node
  const nodeMap = new Map<string | number, Node>();
  // Map from key to the disposal scope for that item's reactive children
  const scopeMap = new Map<string | number, DisposeFn[]>();

  // Wrap the outer effect in its own scope so that any parent disposal scope
  // (e.g., __conditional) captures the outerScope — not the raw effect dispose.
  // This ensures parent disposal triggers our full cleanup (scopeMap + effect).
  const outerScope = pushScope();
  effect(() => {
    const newItems = getItems();
    const newKeySet = new Set(newItems.map(keyFn));

    // Remove nodes whose keys are no longer present — dispose their scopes first
    for (const [key, node] of nodeMap) {
      if (!newKeySet.has(key)) {
        const scope = scopeMap.get(key);
        if (scope) {
          runCleanups(scope);
          scopeMap.delete(key);
        }
        node.parentNode?.removeChild(node);
        nodeMap.delete(key);
      }
    }

    // Create nodes for new keys and build the desired order
    const desiredNodes: Node[] = [];
    for (const item of newItems) {
      const key = keyFn(item);
      let node = nodeMap.get(key);
      if (!node) {
        // Wrap renderFn in a disposal scope to capture any effects/computeds
        const scope = pushScope();
        node = renderFn(item);
        popScope();
        nodeMap.set(key, node);
        scopeMap.set(key, scope);
      }
      desiredNodes.push(node);
    }

    // Reconcile: reorder children to match desired order
    // This minimizes DOM operations by only moving nodes that are out of place
    for (const [i, desiredNode] of desiredNodes.entries()) {
      const currentChild = container.childNodes[i];
      if (currentChild !== desiredNode) {
        container.insertBefore(desiredNode, currentChild ?? null);
      }
    }
  });
  popScope();

  const wrapper = () => {
    // Dispose all remaining item scopes before stopping the outer effect
    for (const scope of scopeMap.values()) {
      runCleanups(scope);
    }
    scopeMap.clear();
    runCleanups(outerScope);
  };

  // Register the full wrapper (not the raw effect dispose) with any active parent scope
  _tryOnCleanup(wrapper);

  return wrapper;
}
