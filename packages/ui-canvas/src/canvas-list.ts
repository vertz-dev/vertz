import { effect } from '@vertz/ui';
import { popScope, pushScope, runCleanups } from '@vertz/ui/internals';
import type { Container } from 'pixi.js';

type DisposeFn = () => void;

/**
 * Reactively manages a list of canvas children inside a parent Container.
 * When the items signal changes, children are added/removed/reordered.
 * Each item gets its own disposal scope for cleanup.
 *
 * Canvas equivalent of @vertz/ui's DOM `__list()`.
 *
 * @param parent - The parent Container to manage children on.
 * @param items - Accessor returning the current array of items.
 * @param renderFn - Factory that creates a display object for an item.
 * @param keyFn - Extracts a unique key from an item for identity tracking.
 * @returns A dispose function that removes and destroys all managed children.
 */
export function canvasList<T>(
  parent: Container,
  items: () => T[],
  renderFn: (item: T) => Container,
  keyFn: (item: T) => string | number,
): DisposeFn {
  const itemMap = new Map<string | number, { displayObject: Container; scope: DisposeFn[] }>();
  let disposed = false;

  const disposeEffect = effect(() => {
    if (disposed) return;

    const currentItems = items();
    const currentKeys = new Set(currentItems.map(keyFn));

    // Remove items whose keys are no longer present
    for (const [key, entry] of itemMap) {
      if (!currentKeys.has(key)) {
        parent.removeChild(entry.displayObject);
        runCleanups(entry.scope); // jsxCanvas cleanup handles destroy
        itemMap.delete(key);
      }
    }

    // Create display objects for new keys
    for (const item of currentItems) {
      const key = keyFn(item);
      if (!itemMap.has(key)) {
        const scope = pushScope();
        const displayObject = renderFn(item);
        popScope();
        parent.addChild(displayObject);
        itemMap.set(key, { displayObject, scope });
      }
    }

    // Reorder to match source array order
    for (let i = 0; i < currentItems.length; i++) {
      const key = keyFn(currentItems[i]);
      const entry = itemMap.get(key);
      if (entry && parent.getChildIndex(entry.displayObject) !== i) {
        parent.setChildIndex(entry.displayObject, i);
      }
    }
  });

  return () => {
    disposed = true;
    // Dispose the tracking effect first
    disposeEffect();
    // Clean up all managed children
    for (const [, entry] of itemMap) {
      parent.removeChild(entry.displayObject);
      runCleanups(entry.scope); // jsxCanvas cleanup handles destroy
    }
    itemMap.clear();
  };
}
