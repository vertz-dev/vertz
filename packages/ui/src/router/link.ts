/**
 * Link component for client-side navigation.
 *
 * Creates `<a>` elements that intercept clicks for SPA navigation
 * and support active state styling.
 */

import { effect } from '../runtime/signal';
import type { ReadonlySignal } from '../runtime/signal-types';
import type { RouteConfigLike, RouteDefinitionMap } from './define-routes';
import type { RoutePaths } from './params';

/**
 * Props for the Link component.
 *
 * Generic over the route map `T`. Defaults to `RouteDefinitionMap` (string
 * index signature) for backward compatibility — unparameterized `LinkProps`
 * accepts any string href.
 */
export interface LinkProps<T extends Record<string, RouteConfigLike> = RouteDefinitionMap> {
  /** The target URL path. */
  href: RoutePaths<T>;
  /** Text or content for the link. */
  children: string;
  /** Class applied when the link's href matches the current path. */
  activeClass?: string;
  /** Static class name for the anchor element. */
  className?: string;
}

/**
 * Create a Link component factory bound to the router's state.
 *
 * @param currentPath - Reactive signal of the current URL path
 * @param navigate - Navigation function from the router
 * @returns A Link component function
 */
export function createLink(
  currentPath: ReadonlySignal<string>,
  navigate: (url: string) => void,
): (props: LinkProps) => HTMLAnchorElement {
  return function Link(props: LinkProps): HTMLAnchorElement {
    const el = document.createElement('a');
    el.setAttribute('href', props.href);
    el.textContent = props.children;

    if (props.className) {
      el.classList.add(props.className);
    }

    // Reactive active state — re-evaluates whenever currentPath changes
    if (props.activeClass) {
      const activeClass = props.activeClass;
      effect(() => {
        if (currentPath.value === props.href) {
          el.classList.add(activeClass);
        } else {
          el.classList.remove(activeClass);
        }
      });
    }

    // Intercept clicks for SPA navigation
    el.addEventListener('click', (event: MouseEvent) => {
      // Allow modifier-key clicks to open in new tab
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
      }

      event.preventDefault();
      navigate(props.href);
    });

    return el;
  };
}
