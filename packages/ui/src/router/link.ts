/**
 * Link component for client-side navigation.
 *
 * Creates `<a>` elements that intercept clicks for SPA navigation
 * and support active state styling.
 */

import type { ReadonlySignal } from '../runtime/signal-types';

/** Props for the Link component. */
export interface LinkProps {
  /** The target URL path. */
  href: string;
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

    // Active state
    if (props.activeClass && currentPath.value === props.href) {
      el.classList.add(props.activeClass);
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
