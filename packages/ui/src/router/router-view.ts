import { __append, __element, __enterChildren, __exitChildren } from '../dom/element';
import { getIsHydrating } from '../hydrate/hydration-context';
import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { domEffect } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';
import { untrack } from '../runtime/tracking';
import type { Router } from './navigate';
import { RouterContext } from './router-context';

export interface RouterViewProps {
  router: Router;
  fallback?: () => Node;
}

/**
 * Renders the matched route's component inside a container div.
 *
 * Handles sync and async (lazy-loaded) components, stale resolution guards,
 * page cleanup on navigation, and RouterContext propagation.
 *
 * Uses __element() so the container is claimed from SSR during hydration.
 * On the first hydration render, children are already in the DOM — the
 * domEffect runs the component factory (to attach reactivity/event handlers)
 * but skips clearing the container.
 */
export function RouterView({ router, fallback }: RouterViewProps): HTMLElement {
  const container = __element('div');
  // Track whether the first render is during hydration — if so, don't
  // clear the container (SSR children are already in the DOM).
  let isFirstHydrationRender = getIsHydrating();
  let renderGen = 0;
  let pageCleanups: DisposeFn[] = [];

  // Enter children scope for the container — during hydration this sets
  // the cursor to container.firstChild so the page component's own
  // __element() calls can claim SSR nodes inside.
  __enterChildren(container);

  const dispose = domEffect(() => {
    const match = router.current.value;

    untrack(() => {
      // Run cleanup from the previous page before rendering the new one
      runCleanups(pageCleanups);

      const gen = ++renderGen;

      if (isFirstHydrationRender) {
        // During hydration, SSR content is already in the container.
        // Don't clear it — just run the component factory to attach
        // reactivity and event handlers to the adopted SSR nodes.
        isFirstHydrationRender = false;
      } else {
        // Subsequent navigations: clear previous page content
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }

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
          __append(container, result);
        }
      });

      popScope();
    });
  });

  __exitChildren();

  _tryOnCleanup(() => {
    runCleanups(pageCleanups);
    dispose();
  });

  return container;
}
