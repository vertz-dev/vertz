/**
 * JSX runtime for @vertz/ui — used by Bun at test/dev time.
 *
 * At build time, the @vertz/ui-compiler transforms JSX into optimized
 * __element() / __on() / __text() / __attr() calls with compile-time
 * reactivity analysis. This runtime provides a simpler DOM-based
 * implementation for tests and development.
 *
 * Implements the "react-jsx" automatic runtime interface:
 * - jsx(type, props)  — single child
 * - jsxs(type, props) — multiple children
 * - Fragment          — document fragment
 */

import { isSVGTag, normalizeSVGAttr, SVG_NS } from '../dom/svg-tags';

/**
 * JSX namespace - required for TypeScript's react-jsx mode
 * to understand intrinsic element types and component types.
 */
export namespace JSX {
  /**
   * The return type of JSX expressions
   */
  export type Element = HTMLElement | SVGElement;

  /**
   * Component function type
   */
  export type JSXComponent = (props: Record<string, unknown>) => Element;

  /**
   * Base type for any HTML element attributes.
   * Allows string, number, boolean, or event handlers.
   */
  export interface HTMLAttributes {
    [key: string]: unknown;
    children?: unknown;
  }

  /**
   * Attributes available on ALL JSX elements (intrinsic and components).
   * `key` is used by the compiler's __list() transform for efficient list rendering.
   */
  export interface IntrinsicAttributes {
    key?: string | number;
  }

  /**
   * Intrinsic elements - maps tag names to their element types.
   * For the jsx() function, we use HTMLElementTagNameMap directly in overloads.
   * This provides a catch-all for any HTML element.
   */
  export interface IntrinsicElements {
    [key: string]: HTMLAttributes | undefined;
  }
}

type JSXComponentFn = (props: Record<string, unknown>) => JSX.Element;
type Tag = string | JSXComponentFn;

/**
 * Apply children to a parent node, recursively handling arrays
 */
function applyChildren(parent: Node, children: unknown): void {
  if (children == null || children === false || children === true) return;
  if (typeof children === 'function') {
    applyChildren(parent, (children as () => unknown)());
    return;
  }
  if (Array.isArray(children)) {
    for (const child of children) {
      applyChildren(parent, child);
    }
  } else if (children instanceof Node) {
    parent.appendChild(children);
  } else {
    parent.appendChild(document.createTextNode(String(children)));
  }
}

// Implementation
function jsxImpl(
  tag: Tag | typeof Fragment,
  props: Record<string, unknown> | null | undefined,
): Node | Node[] | null {
  // Component call — pass props through to the function
  if (typeof tag === 'function') {
    return tag(props || {});
  }

  // Tag is a string → create a DOM element
  const { children, ...attrs } = props || {};
  const svg = isSVGTag(tag);
  const element = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);

  // Apply attributes
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof value === 'function') {
      // Event handler — addEventListener
      const eventName = key.slice(2).toLowerCase();
      element.addEventListener(eventName, value as EventListener);
    } else if (key === 'class' && value != null) {
      // SVGElement.className is read-only (SVGAnimatedString), use setAttribute
      element.setAttribute('class', String(value));
    } else if (key === 'style' && value != null) {
      element.setAttribute('style', String(value));
    } else if (value === true) {
      // Boolean attribute (e.g. checked, disabled)
      element.setAttribute(key, '');
    } else if (value != null && value !== false) {
      // SVG attribute normalization (camelCase → hyphenated)
      const attrName = svg ? normalizeSVGAttr(key) : key;
      element.setAttribute(attrName, String(value));
    }
  }

  applyChildren(element, children);

  return element;
}

/**
 * JSX factory function for client-side rendering.
 *
 * When tag is a function (component), calls it with props.
 * When tag is a string (HTML element), creates a DOM element.
 */

// Overload 1: Intrinsic HTML elements - returns specific element type based on tag name
export function jsx<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> | null | undefined,
): HTMLElementTagNameMap[K];

// Overload 2: Custom elements (fallback for unknown string tags)
export function jsx(tag: string, props: Record<string, unknown> | null | undefined): HTMLElement;

// Overload 3: Function components - returns the component's return type
export function jsx<P extends Record<string, unknown>, R extends JSX.Element>(
  tag: (props: P) => R,
  props: P,
): R;

// Overload 4: Fragment
export function jsx(tag: typeof Fragment, props: { children?: unknown }): DocumentFragment;

// Implementation
export function jsx(
  tag: Tag | typeof Fragment,
  props: Record<string, unknown> | null | undefined,
): Node | Node[] | null {
  return jsxImpl(tag, props);
}

/**
 * JSX factory for elements with multiple children.
 * In the automatic runtime, this is used when there are multiple children.
 * For our implementation, it's the same as jsx().
 */
export function jsxs<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> | null | undefined,
): HTMLElementTagNameMap[K];
export function jsxs(tag: string, props: Record<string, unknown> | null | undefined): HTMLElement;
export function jsxs<P extends Record<string, unknown>, R extends JSX.Element>(
  tag: (props: P) => R,
  props: P,
): R;
export function jsxs(tag: typeof Fragment, props: { children?: unknown }): DocumentFragment;
export function jsxs(
  tag: Tag | typeof Fragment,
  props: Record<string, unknown> | null | undefined,
): Node | Node[] | null {
  return jsxImpl(tag, props);
}

/**
 * Fragment component — a DocumentFragment container for multiple children.
 */
export function Fragment(props: { children?: unknown }): DocumentFragment {
  const frag = document.createDocumentFragment();
  applyChildren(frag, props?.children);
  return frag;
}

/**
 * JSX development mode factory (used with @jsxImportSource in tsconfig).
 * Same as jsx() for our implementation.
 */
export function jsxDEV<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> | null | undefined,
): HTMLElementTagNameMap[K];
export function jsxDEV(tag: string, props: Record<string, unknown> | null | undefined): HTMLElement;
export function jsxDEV<P extends Record<string, unknown>, R extends JSX.Element>(
  tag: (props: P) => R,
  props: P,
): R;
export function jsxDEV(tag: typeof Fragment, props: { children?: unknown }): DocumentFragment;
export function jsxDEV(
  tag: Tag | typeof Fragment,
  props: Record<string, unknown> | null | undefined,
): Node | Node[] | null {
  return jsxImpl(tag, props);
}
