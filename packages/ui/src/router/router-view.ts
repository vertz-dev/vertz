import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { lifecycleEffect } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';
import { untrack } from '../runtime/tracking';
import type { Router } from './navigate';
import { RouterContext } from './router-context';

export interface RouterViewProps {
  router: Router;
  fallback?: () => Node;
}

/**
 * Temporary bridge: uses lifecycleEffect() directly instead of the now-deleted watch().
 * Will be rewritten as compiled JSX in Issue E (#670).
 */
export function RouterView({ router, fallback }: RouterViewProps): HTMLElement {
  const container = document.createElement('div');
  let renderGen = 0;
  let pageCleanups: DisposeFn[] = [];

  const dispose = lifecycleEffect(() => {
    const match = router.current.value;

    untrack(() => {
      // Run cleanup from the previous page before rendering the new one
      runCleanups(pageCleanups);

      const gen = ++renderGen;
      container.innerHTML = '';

      // Push a new scope to capture page-level cleanups (onMount → onCleanup)
      pageCleanups = pushScope();

      if (!match) {
        popScope();
        if (fallback) {
          container.appendChild(fallback());
        }
        return;
      }

      RouterContext.Provider(router, () => {
        const result = match.route.component();

        if (result instanceof Promise) {
          result.then((mod) => {
            if (gen !== renderGen) return;
            RouterContext.Provider(router, () => {
              const node = (mod as { default: () => Node }).default();
              container.appendChild(node);
            });
          });
        } else {
          container.appendChild(result);
        }
      });

      popScope();
    });
  });

  _tryOnCleanup(() => {
    runCleanups(pageCleanups);
    dispose();
  });

  return container;
}
