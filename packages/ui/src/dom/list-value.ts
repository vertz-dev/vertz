import { useContext } from '../component/context';
import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { domEffect, signal } from '../runtime/signal';
import type { DisposeFn, Signal } from '../runtime/signal-types';
import type { DisposableNode } from './conditional';
import type { ListAnimationHooks } from './list-animation-context';
import { ListAnimationContext } from './list-animation-context';

/** Deduplicate the "no key" warning — fire once per application, not per list. */
let unkeyedListValueWarned = false;

/**
 * @internal Reset the warning flag — for tests only.
 */
export function _resetUnkeyedListValueWarning(): void {
  unkeyedListValueWarned = false;
}

/**
 * Create a reactive proxy over an item signal.
 * Property accesses read from `itemSignal.value`, so any domEffect
 * that reads through the proxy automatically subscribes to the signal.
 */
function createItemProxy<T>(itemSignal: Signal<T>): T {
  const initial = itemSignal.peek();
  if (typeof initial !== 'object' || initial == null) {
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
 * Keyed list reconciliation that returns a DisposableNode (DocumentFragment).
 *
 * Unlike `__list()` which appends to an existing container element,
 * `__listValue()` manages items between comment markers in a DocumentFragment.
 * This makes it suitable for use in component children thunks where there is
 * no parent element variable at compile time.
 *
 * Compiler output target for .map() expressions in component children JSX.
 *
 * @param items - A signal or getter function containing the array of items
 * @param keyFn - Extracts a unique key from each item. Pass null for unkeyed mode.
 * @param renderFn - Creates a DOM node for an item (called once per key).
 *   Receives the item and its index in the array. Note: for keyed lists,
 *   the index is the position at creation time and is NOT updated when
 *   items reorder — use a key-based approach for stable ordering display.
 * @returns A DisposableNode (DocumentFragment with dispose method)
 */
export function __listValue<T>(
  items: Signal<T[]> | (() => T[]),
  keyFn: ((item: T, index: number) => string | number) | null,
  renderFn: (item: T, index: number) => Node,
): DisposableNode {
  const getItems = typeof items === 'function' ? items : () => items.value;

  const startMarker = document.createComment('lv-s');
  const endMarker = document.createComment('lv-e');
  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  const nodeMap = new Map<string | number, Node>();
  const scopeMap = new Map<string | number, DisposeFn[]>();
  const itemSignalMap = new Map<string | number, Signal<T>>();
  const exitingNodes = new Set<Node>();
  const exitingKeyMap = new Map<string | number, Node>();
  const keyGeneration = new Map<string | number, number>();

  // Read animation hooks from context (synchronous — runs during component init)
  const animHooks: ListAnimationHooks | undefined = useContext(ListAnimationContext);

  let isFirstRun = true;

  if (!keyFn && !unkeyedListValueWarned) {
    unkeyedListValueWarned = true;
    console.warn(
      '[vertz] .map() without a key prop uses full-replacement mode (slower). ' +
        'Add a key prop to list items for efficient updates: ' +
        '{items.map(item => <Item key={item.id} />)}',
    );
  }

  const outerScope = pushScope();
  try {
    domEffect(() => {
      const newItems = getItems() ?? [];

      // Unkeyed mode: full replacement (no animation support)
      if (!keyFn) {
        for (const scope of scopeMap.values()) {
          runCleanups(scope);
        }
        scopeMap.clear();

        for (const node of nodeMap.values()) {
          node.parentNode?.removeChild(node);
        }
        nodeMap.clear();
        itemSignalMap.clear();

        for (const [i, item] of newItems.entries()) {
          const scope = pushScope();
          const node = renderFn(item, i);
          popScope();
          endMarker.parentNode?.insertBefore(node, endMarker);
          nodeMap.set(i, node);
          scopeMap.set(i, scope);
        }
        return;
      }

      // First render — no animations
      if (isFirstRun) {
        isFirstRun = false;
        for (const [i, item] of newItems.entries()) {
          const key = keyFn(item, i);
          const itemSig = signal(item);
          const proxy = createItemProxy(itemSig);
          const scope = pushScope();
          const node = renderFn(proxy as T, i);
          popScope();
          nodeMap.set(key, node);
          scopeMap.set(key, scope);
          itemSignalMap.set(key, itemSig);
          endMarker.parentNode?.insertBefore(node, endMarker);
        }
        return;
      }

      // Subsequent updates — animation hooks active
      animHooks?.onBeforeReconcile();

      const newKeySet = new Set(newItems.map((item, i) => keyFn(item, i)));

      // --- Exit: remove nodes whose keys are no longer present ---
      for (const [key, node] of nodeMap) {
        if (!newKeySet.has(key)) {
          const scope = scopeMap.get(key);
          if (scope) {
            runCleanups(scope);
            scopeMap.delete(key);
          }
          nodeMap.delete(key);
          itemSignalMap.delete(key);

          if (animHooks) {
            const gen = (keyGeneration.get(key) ?? 0) + 1;
            keyGeneration.set(key, gen);
            exitingNodes.add(node);
            exitingKeyMap.set(key, node);

            animHooks.onItemExit(node, key, () => {
              if (keyGeneration.get(key) === gen) {
                node.parentNode?.removeChild(node);
                exitingNodes.delete(node);
                exitingKeyMap.delete(key);
              }
            });
          } else {
            node.parentNode?.removeChild(node);
          }
        }
      }

      // --- Enter/reuse: current items ---
      const desiredNodes: Node[] = [];
      const enterEntries: Array<{ node: Node; key: string | number }> = [];
      for (const [i, item] of newItems.entries()) {
        const key = keyFn(item, i);
        let node = nodeMap.get(key);
        if (!node) {
          // Force-remove old exiting node for this key (re-add case)
          const oldExiting = exitingKeyMap.get(key);
          if (oldExiting) {
            oldExiting.parentNode?.removeChild(oldExiting);
            exitingNodes.delete(oldExiting);
            exitingKeyMap.delete(key);
          }

          // Bump generation to invalidate stale exit callbacks
          const gen = (keyGeneration.get(key) ?? 0) + 1;
          keyGeneration.set(key, gen);

          const itemSig = signal(item);
          const proxy = createItemProxy(itemSig);
          const scope = pushScope();
          node = renderFn(proxy as T, i);
          popScope();
          nodeMap.set(key, node);
          scopeMap.set(key, scope);
          itemSignalMap.set(key, itemSig);

          enterEntries.push({ node, key });
        } else {
          const itemSig = itemSignalMap.get(key);
          if (itemSig) {
            itemSig.value = item;
          }
        }
        desiredNodes.push(node);
      }

      // --- Reconcile: reorder active nodes, skip exiting nodes ---
      const parent = startMarker.parentNode;
      if (parent) {
        let cursor: ChildNode | null = startMarker.nextSibling;
        for (const desired of desiredNodes) {
          while (cursor && cursor !== endMarker && exitingNodes.has(cursor as Node)) {
            cursor = cursor.nextSibling;
          }
          if (cursor === endMarker) {
            parent.insertBefore(desired, endMarker);
          } else if (cursor === desired) {
            cursor = cursor.nextSibling;
          } else {
            parent.insertBefore(desired, cursor);
          }
        }
      }

      // --- Notify animation hooks for enter items ---
      if (animHooks) {
        for (const { node, key } of enterEntries) {
          animHooks.onItemEnter(node, key);
        }
      }

      animHooks?.onAfterReconcile();
    });
  } finally {
    popScope();
  }

  const dispose: DisposeFn = () => {
    for (const scope of scopeMap.values()) {
      runCleanups(scope);
    }
    scopeMap.clear();

    // Force-remove exiting nodes
    for (const node of exitingNodes) {
      node.parentNode?.removeChild(node);
    }
    exitingNodes.clear();
    exitingKeyMap.clear();

    runCleanups(outerScope);
  };

  _tryOnCleanup(dispose);

  return Object.assign(fragment, { dispose }) as DisposableNode;
}
