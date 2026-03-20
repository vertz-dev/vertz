import { beginDeferringMounts, flushDeferredMounts } from '../component/lifecycle';
import { __append, __element, __enterChildren, __exitChildren } from '../dom/element';
import { endHydration, getIsHydrating, startHydration } from '../hydrate/hydration-context';
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
        // Capture hydration state before consuming it — needed by the
        // async callback to decide whether to re-enter hydration mode.
        const wasHydrating = isFirstHydrationRender;

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

        let asyncRoute = false;
        RouterContext.Provider(router, () => {
          const result = rootFactory();

          if (result instanceof Promise) {
            asyncRoute = true;
            // Pop the scope from pushScope() above — nothing useful was
            // captured since the component returned a Promise instead of
            // rendering synchronously.
            popScope();
            result.then((mod) => {
              if (gen !== renderGen) return;

              let node!: Node;
              pageCleanups = pushScope();

              if (wasHydrating) {
                // Re-enter hydration scoped to this container so the
                // lazy component claims SSR nodes via __element()
                // instead of creating new ones.
                // Wrap with beginDeferringMounts/flushDeferredMounts so
                // onMount in the lazy component runs after mini-hydration.
                beginDeferringMounts();
                startHydration(container);
                try {
                  RouterContext.Provider(router, () => {
                    node = (mod as { default: () => Node }).default();
                    __append(container, node);
                  });
                } finally {
                  endHydration();
                  flushDeferredMounts();
                }
                // Safety fallback: if the component's root wasn't claimed
                // (SSR/client tree mismatch), fall back to CSR append.
                if (!container.contains(node)) {
                  while (container.firstChild) {
                    container.removeChild(container.firstChild);
                  }
                  container.appendChild(node);
                }
              } else {
                // CSR: clear existing content and append the new component.
                while (container.firstChild) {
                  container.removeChild(container.firstChild);
                }
                RouterContext.Provider(router, () => {
                  node = (mod as { default: () => Node }).default();
                  container.appendChild(node);
                });
              }

              popScope();
            });
          } else {
            __append(container, result);
            // Safety fallback: if hydration suppressed __append and the node
            // wasn't claimed from SSR (mismatch), fall back to CSR append.
            // Guard on getIsHydrating() — outside hydration __append works
            // normally and contains() may not exist (SSR shim).
            if (getIsHydrating() && !container.contains(result)) {
              while (container.firstChild) {
                container.removeChild(container.firstChild);
              }
              container.appendChild(result);
            }
          }
        });

        prevLevels = levels;
        if (!asyncRoute) {
          popScope();
        }
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
 * During SSR:
 * - Pass 1: each route's factory is wrapped to register lazy Promises on invocation.
 *   When a lazy parent is detected, all its children in the matched chain are
 *   probed directly (they won't be reached via Outlet during Pass 1).
 * - Pass 2: pre-resolved sync factories from `ctx.resolvedComponents` are used.
 *   `ctx.resolvedComponents` is always set between passes (even if empty).
 */
function buildInsideOutFactory(
  matched: MatchedRoute[],
  levels: LevelState[],
  startAt: number,
  router: Router,
): () => Node | Promise<{ default: () => Node }> {
  const ssrCtx = getSSRContext();

  /**
   * Wrap a route's component for SSR lazy resolution.
   * @param routeIndex - index in the matched chain, used to probe children
   *   when this route turns out to be lazy.
   */
  const wrapForSSR = (
    route: CompiledRoute,
    routeIndex: number,
  ): (() => Node | Promise<{ default: () => Node }>) => {
    if (!ssrCtx) return route.component;

    // Pass 2: use pre-resolved sync factory
    const resolved = ssrCtx.resolvedComponents?.get(route);
    if (resolved) return resolved;

    // Pass 1: wrap to register lazy import on invocation.
    // If this route is lazy, also probe all children in the matched chain
    // (they won't be reached via Outlet since this parent returns a Promise).
    return () => {
      const result = route.component();
      if (result instanceof Promise) {
        if (!ssrCtx.pendingRouteComponents) {
          ssrCtx.pendingRouteComponents = new Map();
        }
        ssrCtx.pendingRouteComponents.set(route, result as Promise<{ default: () => Node }>);
        // Probe children behind this lazy parent
        for (let j = routeIndex + 1; j < matched.length; j++) {
          const childRoute = matched[j]!.route;
          if (!ssrCtx.pendingRouteComponents.has(childRoute)) {
            const childResult = childRoute.component();
            if (childResult instanceof Promise) {
              ssrCtx.pendingRouteComponents.set(
                childRoute,
                childResult as Promise<{ default: () => Node }>,
              );
            }
          }
        }
      }
      return result;
    };
  };

  // Start from the leaf and build upward to startAt
  let factory: () => Node | Promise<{ default: () => Node }> = wrapForSSR(
    matched[matched.length - 1]!.route,
    matched.length - 1,
  );

  for (let i = matched.length - 2; i >= startAt; i--) {
    const level = levels[i]!;
    const childFactory = factory;
    level.childSignal!.value = childFactory;
    const parentComponent = wrapForSSR(level.route, i);
    const cs = level.childSignal!;
    factory = () => {
      let result!: Node;
      OutletContext.Provider({ childComponent: cs, router }, () => {
        result = parentComponent() as Node;
      });
      return result;
    };
  }

  return factory;
}
