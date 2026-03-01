/**
 * Outlet component for rendering nested route children.
 *
 * The Outlet renders the child route's component in a layout's slot.
 * It reads from a shared OutletContext that RouterView populates
 * when rendering nested routes.
 */

import { type Context, createContext, useContext } from '../component/context';
import { __append, __element, __enterChildren, __exitChildren } from '../dom/element';
import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { domEffect } from '../runtime/signal';
import type { DisposeFn, Signal } from '../runtime/signal-types';
import { untrack } from '../runtime/tracking';
import type { Router } from './navigate';
import { RouterContext } from './router-context';

/** Context value for the Outlet. */
export interface OutletContextValue {
  /** Reactive child component factory (may return async module). */
  childComponent: Signal<(() => Node | Promise<{ default: () => Node }>) | undefined>;
  /** Router instance for restoring context in async resolution. */
  router: Router;
}

/** Shared context used by RouterView and Outlet. */
export const OutletContext: Context<OutletContextValue> = createContext<OutletContextValue>();

/**
 * Outlet component — renders the nested child route.
 *
 * Must be called inside a layout component rendered by RouterView.
 * Reads from OutletContext to determine which child to render.
 */
export function Outlet(): Node {
  const ctx = useContext(OutletContext);

  if (!ctx) {
    return document.createComment('outlet:empty');
  }

  const container = __element('div');
  let childCleanups: DisposeFn[] = [];
  let renderGen = 0;

  __enterChildren(container);

  const dispose = domEffect(() => {
    const factory = ctx.childComponent;

    untrack(() => {
      runCleanups(childCleanups);

      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      const gen = ++renderGen;
      childCleanups = pushScope();

      if (factory) {
        const result = factory();
        if (result instanceof Promise) {
          // Capture the router for context restoration in the async callback.
          const router = ctx.router;
          popScope();
          result.then((mod) => {
            // Guard against stale resolution from rapid navigation.
            if (gen !== renderGen) return;
            // Re-enter a disposal scope so the async component's
            // cleanups are captured and run on the next swap.
            childCleanups = pushScope();
            RouterContext.Provider(router, () => {
              const node = (mod as { default: () => Node }).default();
              __append(container, node);
            });
            popScope();
          });
        } else {
          __append(container, result);
          popScope();
        }
      } else {
        popScope();
      }
    });
  });

  __exitChildren();

  _tryOnCleanup(() => {
    runCleanups(childCleanups);
    dispose();
  });

  return container;
}
