import { __element } from '../dom/element';
import { getSSRContext } from '../ssr/ssr-render-context';
import { onMount } from './lifecycle';

/**
 * Props for the Foreign component.
 *
 * `<Foreign>` renders a container element whose children are owned by
 * external (non-Vertz) code. During hydration, the container is claimed
 * but its children are not walked — external content is preserved.
 */
export interface ForeignProps {
  /**
   * HTML tag for the container element.
   * @default 'div'
   */
  tag?: keyof HTMLElementTagNameMap | keyof SVGElementTagNameMap;

  /**
   * Called when the container is ready for external DOM manipulation.
   * Runs after hydration is complete (post-hydration onMount timing).
   * Return a cleanup function for unmount.
   *
   * This is the sole way to access the container element.
   * For SVG tags, cast to the appropriate SVG element type.
   */
  onReady?: (container: HTMLElement | SVGElement) => (() => void) | void;

  /** Element id */
  id?: string;

  /** CSS class name */
  className?: string;

  /** Inline styles (camelCase object) */
  style?: Partial<CSSStyleDeclaration>;

  /**
   * Children are not supported. Foreign renders an empty container
   * whose children are managed by external code via onReady.
   */
  children?: never;
}

/**
 * Foreign component — renders an unmanaged subtree container.
 *
 * Claims the container element during hydration without entering its children.
 * External code owns the container's children via the `onReady` callback,
 * which fires in post-hydration `onMount` timing.
 *
 * Implemented as a hand-written `.ts` component (no JSX, no compiler transforms)
 * because it's a framework primitive that uses `__element()` directly.
 */
export function Foreign({ tag = 'div', onReady, id, className, style }: ForeignProps): Element {
  const el = __element(tag);
  // NO __enterChildren(el) — do not walk into children during hydration.
  // The cursor advances past this element, leaving its children untouched.

  if (id) el.id = id;
  // Use setAttribute for className — works for both HTML and SVG elements.
  // SVG elements have className as SVGAnimatedString, not a plain string.
  if (className) el.setAttribute('class', className);
  if (style) Object.assign((el as HTMLElement).style, style);

  // SSR safety: skip onReady during server-side rendering.
  if (onReady && !getSSRContext()) {
    onMount(() => onReady(el as HTMLElement | SVGElement));
  }

  return el;
}
