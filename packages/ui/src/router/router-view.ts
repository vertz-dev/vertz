import { __append, __element, __enterChildren, __exitChildren } from '../dom/element';
import { getIsHydrating } from '../hydrate/hydration-context';
import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { domEffect, signal } from '../runtime/signal';
import type { DisposeFn, Signal } from '../runtime/signal-types';
import { untrack } from '../runtime/tracking';
import { getSSRContext } from '../ssr/ssr-render-context';
import type { CompiledRoute, MatchedRoute } from './define-routes';
import type { Router } from './navigate';
import { OutletContext } from './outlet';
import { RouterContext } from './router-context';

/** Per-level state for matched chain diffing. */
interface LevelState {
  route: CompiledRoute;
  childSignal?: Signal<(() => Node | Promise<{ default: () => Node }>) | undefined>;
}

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

  // Per-level state from previous render, used for matched chain diffing.
  let prevLevels: LevelState[] = [];

  // Enter children scope for the container — during hydration this sets
  // the cursor to container.firstChild so the page component's own
  // __element() calls can claim SSR nodes inside.
  __enterChildren(container);

  const dispose = domEffect(() => {
    const match = router.current.value;

    untrack(() => {
      const gen = ++renderGen;
      const newMatched: MatchedRoute[] = match?.matched ?? [];

      // Find the divergence index — first index where old and new routes differ
      const minLen = Math.min(prevLevels.length, newMatched.length);
      let divergeAt = 0;
      for (divergeAt = 0; divergeAt < minLen; divergeAt++) {
        if (prevLevels[divergeAt]!.route !== newMatched[divergeAt]!.route) break;
      }

      // Check if the full chain is identical (no change needed)
      if (
        prevLevels.length > 0 &&
        divergeAt === prevLevels.length &&
        divergeAt === newMatched.length
      ) {
        return;
      }

      // If divergence is at index > 0, we can reuse parent layouts
      // and just update the childSignal at the divergence point
      if (divergeAt > 0 && newMatched.length > 0) {
        // Build the new inside-out chain from divergeAt onward
        const newLevels = buildLevels(newMatched);

        // Get the new child factory starting from the divergence point
        const newChildFactory = buildInsideOutFactory(newMatched, newLevels, divergeAt, router);

        // Update the parent's childSignal to swap in the new subtree
        const parentLevel = prevLevels[divergeAt - 1]!;
        if (parentLevel.childSignal) {
          parentLevel.childSignal.value = newChildFactory;
        }

        // Preserve parent levels, update from divergence point onward
        prevLevels = [...prevLevels.slice(0, divergeAt), ...newLevels.slice(divergeAt)];
        return;
      }

      // Full re-render: divergence at 0 or transition from/to no match
      runCleanups(pageCleanups);

      const doRender = () => {
        if (!isFirstHydrationRender) {
          while (container.firstChild) {
            container.removeChild(container.firstChild);
          }
        }
        isFirstHydrationRender = false;

        pageCleanups = pushScope();

        if (!match) {
          prevLevels = [];
          if (fallback) {
            container.appendChild(fallback());
          }
          popScope();
          return;
        }

        // Build the full inside-out chain
        const levels = buildLevels(newMatched);
        const rootFactory = buildInsideOutFactory(newMatched, levels, 0, router);

        RouterContext.Provider(router, () => {
          const result = rootFactory();

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

        prevLevels = levels;
        popScope();
      };

      doRender();
    });
  });

  __exitChildren();

  _tryOnCleanup(() => {
    runCleanups(pageCleanups);
    dispose();
  });

  return container;
}

/**
 * Build LevelState entries for a matched chain.
 * Each non-leaf level gets a childSignal.
 */
function buildLevels(matched: MatchedRoute[]): LevelState[] {
  return matched.map((m, i) => ({
    childSignal:
      i < matched.length - 1
        ? signal<(() => Node | Promise<{ default: () => Node }>) | undefined>(undefined)
        : undefined,
    route: m.route,
  }));
}

/**
 * Build the inside-out component factory chain starting from `startAt` index.
 * Returns the factory for the component at `startAt` (which wraps all descendants).
 *
 * During SSR Pass 1, lazy (async) leaf components are called and their Promises
 * registered into `ctx.pendingRouteComponents` for resolution between passes.
 * During SSR Pass 2, pre-resolved sync factories from `ctx.resolvedComponents`
 * are used instead of calling `route.component` again.
 */
function buildInsideOutFactory(
  matched: MatchedRoute[],
  levels: LevelState[],
  startAt: number,
  router: Router,
): () => Node | Promise<{ default: () => Node }> {
  const ssrCtx = getSSRContext();

  // Resolve the leaf factory — may be swapped with a pre-resolved sync factory during SSR Pass 2
  const leafRoute = matched[matched.length - 1]!.route;
  let factory: () => Node | Promise<{ default: () => Node }> = leafRoute.component;

  if (ssrCtx) {
    // SSR Pass 2: use pre-resolved sync factory if available
    const resolved = ssrCtx.resolvedComponents?.get(leafRoute);
    if (resolved) {
      factory = resolved;
    } else {
      // SSR Pass 1: call component to discover if it's async, register the Promise
      const result = leafRoute.component();
      if (result instanceof Promise) {
        if (!ssrCtx.pendingRouteComponents) {
          ssrCtx.pendingRouteComponents = new Map();
        }
        ssrCtx.pendingRouteComponents.set(leafRoute, result as Promise<{ default: () => Node }>);
      }
    }
  }

  for (let i = matched.length - 2; i >= startAt; i--) {
    const level = levels[i]!;
    const childFactory = factory;
    level.childSignal!.value = childFactory;
    const parentRoute = level.route;
    const cs = level.childSignal!;
    factory = () => {
      let result!: Node;
      OutletContext.Provider({ childComponent: cs, router }, () => {
        result = parentRoute.component() as Node;
      });
      return result;
    };
  }

  return factory;
}
