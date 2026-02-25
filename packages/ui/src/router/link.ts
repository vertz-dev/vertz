/**
 * Link component for client-side navigation.
 *
 * Creates `<a>` elements that intercept clicks for SPA navigation
 * and support active state styling.
 *
 * Uses __element/__on/__enterChildren/__exitChildren/__append/__staticText
 * so that during hydration it claims existing SSR anchor nodes instead
 * of creating new elements.
 */

import { __classList } from '../dom/attributes';
import { __append, __element, __enterChildren, __exitChildren, __staticText } from '../dom/element';
import { __on } from '../dom/events';
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
  /** Prefetch strategy. 'hover' triggers server pre-fetch on mouseenter/focus. */
  prefetch?: 'hover';
}

/** Options for createLink(). */
export interface LinkFactoryOptions {
  /** Callback fired when a link wants to prefetch its target URL. */
  onPrefetch?: (url: string) => void;
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
  factoryOptions?: LinkFactoryOptions,
): (props: LinkProps) => HTMLAnchorElement {
  return function Link({
    href,
    children,
    activeClass,
    className,
    prefetch,
  }: LinkProps): HTMLAnchorElement {
    const handleClick = (event: Event) => {
      const mouseEvent = event as MouseEvent;
      // Allow modifier-key clicks to open in new tab
      if (mouseEvent.ctrlKey || mouseEvent.metaKey || mouseEvent.shiftKey || mouseEvent.altKey) {
        return;
      }
      mouseEvent.preventDefault();
      navigate(href);
    };

    // Build static props for the anchor element
    const props: Record<string, string> = { href };
    if (className) {
      props.class = className;
    }

    const el = __element('a', props) as HTMLAnchorElement;
    __on(el, 'click', handleClick as EventListener);

    __enterChildren(el);
    __append(el, __staticText(children));
    __exitChildren();

    // Reactive active state — re-evaluates whenever currentPath changes.
    if (activeClass) {
      __classList(el, {
        [activeClass]: () => currentPath.value === href,
      });
    }

    // Hover/focus prefetch — fires once per link instance.
    if (prefetch === 'hover' && factoryOptions?.onPrefetch) {
      let prefetched = false;
      const triggerPrefetch = () => {
        if (prefetched) return;
        prefetched = true;
        factoryOptions.onPrefetch?.(href);
      };
      __on(el, 'mouseenter', triggerPrefetch);
      __on(el, 'focus', triggerPrefetch);
    }

    return el;
  };
}
