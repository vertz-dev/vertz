import { effect } from '../runtime/signal';
import type { Signal } from '../runtime/signal-types';

/**
 * Keyed list reconciliation.
 * Efficiently updates a container's children when the items signal changes.
 * Reuses existing DOM nodes based on key identity — no virtual DOM.
 *
 * Compiler output target for .map() / for-each expressions in JSX.
 *
 * @param container - The parent DOM element
 * @param items - A signal containing the array of items
 * @param keyFn - Extracts a unique key from each item
 * @param renderFn - Creates a DOM node for an item (called once per key)
 */
export function __list<T>(
  container: HTMLElement,
  items: Signal<T[]>,
  keyFn: (item: T) => string | number,
  renderFn: (item: T) => Node,
): void {
  // Map from key to the rendered DOM node
  const nodeMap = new Map<string | number, Node>();

  // Initial render
  const initialItems = items.peek();
  for (const item of initialItems) {
    const key = keyFn(item);
    const node = renderFn(item);
    nodeMap.set(key, node);
    container.appendChild(node);
  }

  // Reactive update
  effect(() => {
    const newItems = items.value;
    const newKeySet = new Set(newItems.map(keyFn));

    // Remove nodes whose keys are no longer present
    for (const [key, node] of nodeMap) {
      if (!newKeySet.has(key)) {
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
        node = renderFn(item);
        nodeMap.set(key, node);
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
}
