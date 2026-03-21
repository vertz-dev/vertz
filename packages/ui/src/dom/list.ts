import { getIsHydrating } from '../hydrate/hydration-context';
import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { domEffect, signal } from '../runtime/signal';
import type { DisposeFn, Signal } from '../runtime/signal-types';

/**
 * Create a reactive proxy over an item signal.
 * Property accesses read from `itemSignal.value`, so any domEffect
 * that reads through the proxy automatically subscribes to the signal.
 * When `itemSignal.value` is updated, those effects re-run.
 *
 * The initial value is used as the Proxy target to preserve `instanceof`
 * checks and `Array.isArray()`. The `getPrototypeOf` trap reads from
 * the live signal value so `instanceof` stays correct after updates.
 *
 * Note: `Array.isArray()` checks the target's internal [[Class]] slot,
 * which is fixed at proxy creation time. If an item changes from array
 * to non-array (or vice versa) for the same key, `Array.isArray` will
 * be stale. In practice, __list items maintain stable types per key.
 */
function createItemProxy<T>(itemSignal: Signal<T>): T {
  const initial = itemSignal.peek();
  if (typeof initial !== 'object' || initial == null) {
    // Primitives and null can't be proxied — return the value directly.
    // These items won't get reactive updates on key reuse.
    return initial;
  }
  return new Proxy(initial as object, {
    get(_target, prop, receiver) {
      const current = itemSignal.value;
      if (current == null) return undefined;
      const value = Reflect.get(current as object, prop, receiver);
      if (typeof value === 'function') {
        return value.bind(current);
      }
      return value;
    },
    set() {
      // Items are read-only through the proxy — mutations go through the signal.
      return false;
    },
    has(_target, prop) {
      const current = itemSignal.value;
      if (current == null) return false;
      return Reflect.has(current as object, prop);
    },
    ownKeys() {
      const current = itemSignal.value;
      if (current == null) return [];
      return Reflect.ownKeys(current as object);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const current = itemSignal.value;
      if (current == null) return undefined;
      return Reflect.getOwnPropertyDescriptor(current as object, prop);
    },
    getPrototypeOf() {
      const current = itemSignal.value;
      if (current == null) return null;
      return Object.getPrototypeOf(current);
    },
  }) as T;
}

/**
 * Keyed list reconciliation.
 * Efficiently updates a container's children when the items signal changes.
 * Reuses existing DOM nodes based on key identity — no virtual DOM.
 *
 * Each item is wrapped in a reactive proxy backed by a signal. When the item
 * at an existing key changes (e.g., after refetch), the signal updates and
 * any reactive bindings inside the node (domEffect, __child) re-run
 * automatically — without re-creating the DOM node.
 *
 * Compiler output target for .map() / for-each expressions in JSX.
 *
 * @param container - The parent DOM element
 * @param items - A signal or getter function containing the array of items.
 *   The compiler generates `() => signal.value` as a getter; the runtime
 *   also accepts a raw Signal for direct use in tests.
 * @param keyFn - Extracts a unique key from each item (receives item and index).
 *   Pass `null` for unkeyed lists — triggers full-replacement mode (safe but slower).
 * @param renderFn - Creates a DOM node for an item (called once per key)
 * @returns A dispose function to stop the reactive list reconciliation
 */
export function __list<T>(
  container: HTMLElement,
  items: Signal<T[]> | (() => T[]),
  keyFn: ((item: T, index: number) => string | number) | null,
  renderFn: (item: T) => Node,
): DisposeFn {
  // Normalize items access: compiler passes a getter `() => signal.value`,
  // while tests pass a raw Signal. Both work inside effect() for tracking.
  const getItems = typeof items === 'function' ? items : () => items.value;

  // Map from key to the rendered DOM node
  const nodeMap = new Map<string | number, Node>();
  // Map from key to the disposal scope for that item's reactive children
  const scopeMap = new Map<string | number, DisposeFn[]>();
  // Map from key to the item signal — updated when the item at a key changes,
  // triggering reactive bindings inside the node via the proxy.
  const itemSignalMap = new Map<string | number, Signal<T>>();

  if (!keyFn) {
    console.warn(
      '[vertz] .map() without a key prop uses full-replacement mode (slower). ' +
        'Add a key prop to list items for efficient updates: ' +
        '{items.map(item => <Item key={item.id} />)}',
    );
  }

  const isHydrationRun = getIsHydrating();

  // Record how many children the container already has before list items.
  // The compiler may have appended static children (e.g., a title div) via
  // __append before calling __list. The reconciliation loop must skip these
  // so it only reorders list-managed nodes.
  //
  // During hydration, we can't read the offset yet (SSR nodes include both
  // static children and list items). We compute it after the hydration run
  // claims exactly the list items, leaving the difference as the offset.
  let startOffset = isHydrationRun ? -1 : container.childNodes.length;

  // Wrap the outer effect in its own scope so that any parent disposal scope
  // (e.g., __conditional) captures the outerScope — not the raw effect dispose.
  // This ensures parent disposal triggers our full cleanup (scopeMap + effect).
  const outerScope = pushScope();
  let isFirstRun = true;
  domEffect(() => {
    const newItems = getItems() ?? [];

    if (isFirstRun && isHydrationRun) {
      isFirstRun = false;
      // During hydration: call renderFn for each item to claim SSR nodes
      // and populate nodeMap/scopeMap. Skip DOM reconciliation — nodes
      // are already in the correct order.
      for (const [i, item] of newItems.entries()) {
        const key = keyFn ? keyFn(item, i) : i;
        const itemSig = signal(item);
        const proxy = createItemProxy(itemSig);
        const scope = pushScope();
        const node = renderFn(proxy);
        popScope();
        nodeMap.set(key, node);
        scopeMap.set(key, scope);
        itemSignalMap.set(key, itemSig);
      }
      // Compute offset: total children minus list-managed children
      startOffset = container.childNodes.length - nodeMap.size;
      return;
    }
    isFirstRun = false;

    // Unkeyed mode: full replacement — dispose all existing nodes,
    // create all new ones. Safe default when no key prop is provided.
    if (!keyFn) {
      // Dispose all existing item scopes
      for (const scope of scopeMap.values()) {
        runCleanups(scope);
      }
      scopeMap.clear();
      // Remove all existing list-managed nodes from DOM
      for (const node of nodeMap.values()) {
        node.parentNode?.removeChild(node);
      }
      nodeMap.clear();
      itemSignalMap.clear();

      // Create fresh nodes for all items
      for (const item of newItems) {
        const scope = pushScope();
        const node = renderFn(item);
        popScope();
        container.appendChild(node);
        // Use a unique counter as internal map key for cleanup tracking
        const internalKey = nodeMap.size;
        nodeMap.set(internalKey, node);
        scopeMap.set(internalKey, scope);
      }
      return;
    }

    const newKeySet = new Set(newItems.map((item, i) => keyFn(item, i)));

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
        itemSignalMap.delete(key);
      }
    }

    // Create nodes for new keys and build the desired order.
    // For existing keys, update the item signal so reactive bindings
    // inside the node see the latest item data.
    const desiredNodes: Node[] = [];
    for (const [i, item] of newItems.entries()) {
      const key = keyFn(item, i);
      let node = nodeMap.get(key);
      if (!node) {
        // New key — create node with a reactive item proxy
        const itemSig = signal(item);
        const proxy = createItemProxy(itemSig);
        const scope = pushScope();
        node = renderFn(proxy);
        popScope();
        nodeMap.set(key, node);
        scopeMap.set(key, scope);
        itemSignalMap.set(key, itemSig);
      } else {
        // Existing key — update the item signal to trigger reactive bindings
        const itemSig = itemSignalMap.get(key);
        if (itemSig) {
          itemSig.value = item;
        }
      }
      desiredNodes.push(node);
    }

    // Reconcile: reorder children to match desired order.
    // Use startOffset to skip pre-existing non-list children so they
    // stay in their original positions (e.g., a title div before the list).
    for (const [i, desiredNode] of desiredNodes.entries()) {
      const currentChild = container.childNodes[startOffset + i];
      if (currentChild !== desiredNode) {
        container.insertBefore(desiredNode, currentChild ?? null);
      }
    }

    // Fix up <select> elements: some DOM implementations (happy-dom) lose
    // option.selected IDL state when options are inserted sequentially.
    // Re-apply from the selected attribute which __prop mirrors.
    if (container.tagName === 'SELECT') {
      const selected = container.querySelector('option[selected]') as HTMLOptionElement | null;
      if (selected) {
        Reflect.set(container, 'value', selected.value);
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
