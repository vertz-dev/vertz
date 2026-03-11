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

import { useContext } from '../component/context';
import { __classList } from '../dom/attributes';
import { __append, __element, __enterChildren, __exitChildren, __staticText } from '../dom/element';
import { __on } from '../dom/events';
import type { ReadonlySignal } from '../runtime/signal-types';
import type { RouteConfigLike, RouteDefinitionMap } from './define-routes';
import type { RoutePaths } from './params';
import { RouterContext } from './router-context';

/** Dangerous URL schemes that must never appear in href attributes. */
const DANGEROUS_SCHEMES = ['javascript:', 'data:', 'vbscript:'];

/**
 * Validate that a URL is safe for use as an href attribute.
 * Blocks javascript:, data:, vbscript: schemes and protocol-relative URLs.
 */
function isSafeUrl(url: string): boolean {
  const normalized = url.replace(/\s/g, '').toLowerCase();
  if (normalized.startsWith('//')) return false;
  for (const scheme of DANGEROUS_SCHEMES) {
    if (normalized.startsWith(scheme)) return false;
  }
  return true;
}

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
  /** Text or content for the link. Accepts string, Node, or a thunk returning either. */
  children: string | Node | (() => string | Node);
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
    // Sanitize href to prevent XSS via javascript:, data:, vbscript: schemes
    const safeHref = isSafeUrl(href) ? href : '#';

    const handleClick = (event: Event) => {
      const mouseEvent = event as MouseEvent;
      // Allow modifier-key clicks to open in new tab
      if (mouseEvent.ctrlKey || mouseEvent.metaKey || mouseEvent.shiftKey || mouseEvent.altKey) {
        return;
      }
      mouseEvent.preventDefault();
      navigate(safeHref);
    };

    // Build static props for the anchor element
    const props: Record<string, string> = { href: safeHref };
    if (className) {
      props.class = className;
    }

    const el = __element('a', props) as HTMLAnchorElement;
    __on(el, 'click', handleClick as EventListener);

    __enterChildren(el);
    if (typeof children === 'function') {
      // Compiler thunk may return a Text node (__staticText) or a raw string
      const result = children();
      if (typeof result === 'string') {
        __append(el, __staticText(result));
      } else {
        __append(el, result as Node);
      }
    } else if (typeof children === 'string') {
      __append(el, __staticText(children));
    } else {
      __append(el, children);
    }
    __exitChildren();

    // Reactive active state — re-evaluates whenever currentPath changes.
    if (activeClass) {
      __classList(el, {
        [activeClass]: () => currentPath.value === safeHref,
      });
    }

    // Hover/focus prefetch — fires once per link instance.
    if (prefetch === 'hover' && factoryOptions?.onPrefetch) {
      let prefetched = false;
      const triggerPrefetch = () => {
        if (prefetched) return;
        prefetched = true;
        factoryOptions.onPrefetch?.(safeHref);
      };
      __on(el, 'mouseenter', triggerPrefetch);
      __on(el, 'focus', triggerPrefetch);
    }

    return el;
  };
}

/**
 * Context-based Link component for client-side navigation.
 *
 * Reads the router from `RouterContext` automatically — no manual wiring needed.
 * Just use `<Link href="/about">About</Link>` inside a router-provided tree.
 */
export function Link({ href, children, activeClass, className }: LinkProps): HTMLAnchorElement {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Link must be used within a RouterContext.Provider (via createRouter)');
  }

  const safeHref = isSafeUrl(href) ? href : '#';

  const handleClick = (event: Event) => {
    const mouseEvent = event as MouseEvent;
    if (mouseEvent.ctrlKey || mouseEvent.metaKey || mouseEvent.shiftKey || mouseEvent.altKey) {
      return;
    }
    mouseEvent.preventDefault();
    router.navigate({ to: safeHref });
  };

  const props: Record<string, string> = { href: safeHref };
  if (className) {
    props.class = className;
  }

  const el = __element('a', props) as HTMLAnchorElement;
  __on(el, 'click', handleClick as EventListener);

  __enterChildren(el);
  if (typeof children === 'function') {
    const result = children();
    if (typeof result === 'string') {
      __append(el, __staticText(result));
    } else {
      __append(el, result as Node);
    }
  } else if (typeof children === 'string') {
    __append(el, __staticText(children));
  } else {
    __append(el, children);
  }
  __exitChildren();

  if (activeClass) {
    __classList(el, {
      [activeClass]: () => {
        // Reading router.current triggers reactive tracking (auto-unwrapped by wrapSignalProps)
        void router.current;
        return typeof window !== 'undefined' ? window.location.pathname === safeHref : false;
      },
    });
  }

  return el;
}
