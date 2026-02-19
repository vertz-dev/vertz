import { effect } from '@vertz/ui';
import { popScope, pushScope, runCleanups } from '@vertz/ui/internals';
import type { Container } from 'pixi.js';

type DisposeFn = () => void;

/**
 * Conditionally renders a canvas display object based on a reactive condition.
 * When the condition is true, the factory creates a display object and adds it to parent.
 * When false, the display object is removed and destroyed.
 * An optional fallback factory is shown when the condition is false.
 *
 * Each branch is rendered in its own disposal scope so that effects created
 * inside branches are properly cleaned up when the condition changes.
 *
 * Canvas equivalent of @vertz/ui's DOM `__conditional()`.
 *
 * @param parent - The parent Container.
 * @param condition - Accessor returning a boolean.
 * @param factory - Creates the display object when condition is true.
 * @param fallbackFactory - Optional: creates a display object when condition is false.
 * @returns A dispose function that removes and destroys the current display object.
 */
export function canvasConditional(
  parent: Container,
  condition: () => boolean,
  factory: () => Container,
  fallbackFactory?: () => Container,
): DisposeFn {
  let current: Container | null = null;
  let branchCleanups: DisposeFn[] = [];
  let disposed = false;

  function removeCurrent() {
    if (current) {
      parent.removeChild(current);
      current = null;
    }
    runCleanups(branchCleanups); // jsxCanvas cleanup handles destroy
  }

  const disposeEffect = effect(() => {
    if (disposed) return;

    const shouldShow = condition();

    removeCurrent();

    if (shouldShow) {
      const scope = pushScope();
      current = factory();
      popScope();
      branchCleanups = scope;
      parent.addChild(current);
    } else if (fallbackFactory) {
      const scope = pushScope();
      current = fallbackFactory();
      popScope();
      branchCleanups = scope;
      parent.addChild(current);
    } else {
      branchCleanups = [];
    }
  });

  return () => {
    disposed = true;
    disposeEffect();
    removeCurrent();
  };
}
