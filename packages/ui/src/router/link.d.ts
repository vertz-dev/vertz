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
export declare function createLink(
  currentPath: ReadonlySignal<string>,
  navigate: (url: string) => void,
): (props: LinkProps) => HTMLAnchorElement;
//# sourceMappingURL=link.d.ts.map
