import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { domEffect, signal } from '../runtime/signal';
import type { DisposeFn, Signal } from '../runtime/signal-types';
import { onAnimationsComplete } from './animation';

/**
 * Create a reactive proxy over an item signal.
 * Property accesses read from `itemSignal.value`, so any domEffect
 * that reads through the proxy automatically subscribes to the signal.
 */
function createItemProxy<T>(itemSignal: Signal<T>): T {
  if (typeof itemSignal.peek() !== 'object' || itemSignal.peek() == null) {
    return itemSignal.peek();
  }
  return new Proxy(
    {},
    {
      get(_target, prop, receiver) {
        const current = itemSignal.value;
        if (current == null) return undefined;
        const value = Reflect.get(current as object, prop, receiver);
        if (typeof value === 'function') {
          return value.bind(current);
        }
        return value;
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
    },
  ) as T;
}

/**
 * Keyed list reconciliation with enter/exit animations.
 * Items get `data-presence="enter"` when added (after first render)
 * and `data-presence="exit"` when removed (DOM removal deferred until
 * CSS animation completes).
 *
 * Uses comment markers (same as __conditional) instead of a wrapper element.
 *
 * @param startMarker - Start comment boundary
 * @param endMarker - End comment boundary
 * @param items - A signal or getter for the items array
 * @param keyFn - Extracts a unique key from each item
 * @param renderFn - Creates an HTMLElement for an item (called once per key)
 * @returns A dispose function to stop the reactive list
 */
export function listTransition<T>(
  startMarker: Comment,
  endMarker: Comment,
  items: Signal<T[]> | (() => T[]),
  keyFn: (item: T, index: number) => string | number,
  renderFn: (item: T) => HTMLElement | SVGElement,
): DisposeFn {
  const getItems = typeof items === 'function' ? items : () => items.value;

  const nodeMap = new Map<string | number, Element>();
  const scopeMap = new Map<string | number, DisposeFn[]>();
  const itemSignalMap = new Map<string | number, Signal<T>>();
  const exitingNodes = new Set<Element>();
  const exitingKeyMap = new Map<string | number, Element>();
  const keyGeneration = new Map<string | number, number>();

  let isFirstRun = true;

  const outerScope = pushScope();
  try {
    domEffect(() => {
      const newItems = getItems() ?? [];
      const newKeySet = new Set(newItems.map((item, i) => keyFn(item, i)));

      if (isFirstRun) {
        isFirstRun = false;
        for (const [i, item] of newItems.entries()) {
          const key = keyFn(item, i);
          const itemSig = signal(item);
          const proxy = createItemProxy(itemSig);
          const scope = pushScope();
          const node = renderFn(proxy as T);
          popScope();
          nodeMap.set(key, node);
          scopeMap.set(key, scope);
          itemSignalMap.set(key, itemSig);
          endMarker.parentNode?.insertBefore(node, endMarker);
        }
        return;
      }

      // --- Exit: items no longer present ---
      for (const [key, node] of nodeMap) {
        if (!newKeySet.has(key)) {
          const scope = scopeMap.get(key);
          if (scope) {
            runCleanups(scope);
            scopeMap.delete(key);
          }
          nodeMap.delete(key);
          itemSignalMap.delete(key);

          const gen = (keyGeneration.get(key) ?? 0) + 1;
          keyGeneration.set(key, gen);

          exitingNodes.add(node);
          exitingKeyMap.set(key, node);
          node.setAttribute('data-presence', 'exit');

          onAnimationsComplete(node, () => {
            if (keyGeneration.get(key) === gen) {
              node.parentNode?.removeChild(node);
              exitingNodes.delete(node);
              exitingKeyMap.delete(key);
            }
          });
        }
      }

      // --- Enter/reuse: current items ---
      const desiredNodes: Element[] = [];
      const enterNodes: Array<{ node: Element; key: string | number }> = [];
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
          node = renderFn(proxy as T);
          popScope();

          nodeMap.set(key, node);
          scopeMap.set(key, scope);
          itemSignalMap.set(key, itemSig);

          node.setAttribute('data-presence', 'enter');
          enterNodes.push({ node, key });
        } else {
          // Existing key — update the item signal to trigger reactive bindings
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
          while (cursor && cursor !== endMarker && exitingNodes.has(cursor as HTMLElement)) {
            cursor = cursor.nextSibling;
          }
          if (cursor === desired) {
            cursor = cursor.nextSibling;
          } else {
            parent.insertBefore(desired, cursor);
          }
        }
      }

      // --- Schedule enter animation cleanup AFTER nodes are in the DOM ---
      for (const { node: enterNode, key } of enterNodes) {
        onAnimationsComplete(enterNode, () => {
          if (nodeMap.get(key) === enterNode) {
            enterNode.removeAttribute('data-presence');
          }
        });
      }
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
  return dispose;
}
