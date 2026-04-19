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

import type { Ref } from '../component/refs';
import type { FormValues } from '../dom/form-on-change';
import { styleObjectToString } from '../dom/style';
import { isSVGTag, normalizeSVGAttr, SVG_NS } from '../dom/svg-tags';
import type { TrustedHTML } from '../trusted-html';
import type { CSSProperties } from './css-properties';

/**
 * JSX namespace - required for TypeScript's react-jsx mode
 * to understand intrinsic element types and component types.
 */
export namespace JSX {
  /**
   * The return type of JSX expressions
   */
  export type Element = HTMLElement | SVGElement | DocumentFragment;

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
    className?: string;
    style?: string | CSSProperties;
    /**
     * Inject raw HTML as the element's content. The string is inserted
     * WITHOUT escaping — callers are responsible for ensuring the value
     * is trusted markup. Use `trusted(html)` from `@vertz/ui` to mark a
     * string as trusted.
     *
     * Mutually exclusive with `children`. Not valid on void elements
     * (`<img>`, `<br>`, `<input>`, etc.).
     */
    innerHTML?: string | TrustedHTML | null;
  }

  /**
   * HTML attributes for void elements — elements that cannot have
   * children or innerHTML (e.g. `<img>`, `<br>`, `<input>`).
   */
  export interface VoidHTMLAttributes {
    [key: string]: unknown;
    className?: string;
    style?: string | CSSProperties;
    /** Void elements cannot have children. */
    children?: never;
    /** Void elements cannot have innerHTML. */
    innerHTML?: never;
  }

  /**
   * Enhanced form-level change handler. Receives all current form values.
   * Respects per-input `debounce` props for timing control.
   * This is NOT the native DOM `change` event — the compiler transforms
   * `<form onChange={handler}>` into `__formOnChange(el, handler)`.
   */
  export interface FormHTMLAttributes extends HTMLAttributes {
    onChange?: (values: FormValues) => void;
  }

  /** Attributes for `<input>` elements with debounce support.
   * `<input>` is a void element — it cannot have children or innerHTML. */
  export interface InputHTMLAttributes extends VoidHTMLAttributes {
    /** Debounce delay in ms for the form-level onChange callback.
     * Only effective inside a `<form onChange={...}>`. */
    debounce?: number;
  }

  /** Attributes for `<textarea>` elements with debounce support. */
  export interface TextareaHTMLAttributes extends HTMLAttributes {
    /** Debounce delay in ms for the form-level onChange callback.
     * Only effective inside a `<form onChange={...}>`. */
    debounce?: number;
  }

  /** Attributes for `<select>` elements with debounce support. */
  export interface SelectHTMLAttributes extends HTMLAttributes {
    /** Debounce delay in ms for the form-level onChange callback.
     * Only effective inside a `<form onChange={...}>`. */
    debounce?: number;
  }

  /**
   * Attributes available on ALL JSX elements (intrinsic and components).
   * `key` is used by the compiler's __list() transform for efficient list rendering.
   */
  export interface IntrinsicAttributes {
    key?: string | number;
    ref?: Ref<unknown> | ((el: Element) => void);
  }

  /**
   * Intrinsic elements - maps tag names to their element types.
   * For the jsx() function, we use HTMLElementTagNameMap directly in overloads.
   * Specific entries provide narrower types for form-related elements;
   * the catch-all covers all other HTML elements.
   */
  export interface IntrinsicElements {
    form: FormHTMLAttributes;
    input: InputHTMLAttributes;
    textarea: TextareaHTMLAttributes;
    select: SelectHTMLAttributes;
    // Void elements — cannot have children or innerHTML
    img: VoidHTMLAttributes;
    br: VoidHTMLAttributes;
    hr: VoidHTMLAttributes;
    area: VoidHTMLAttributes;
    base: VoidHTMLAttributes;
    col: VoidHTMLAttributes;
    embed: VoidHTMLAttributes;
    link: VoidHTMLAttributes;
    meta: VoidHTMLAttributes;
    source: VoidHTMLAttributes;
    track: VoidHTMLAttributes;
    wbr: VoidHTMLAttributes;
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

/**
 * IDL properties where setAttribute doesn't control the displayed state —
 * only direct property assignment (el.prop = value) works correctly.
 * Must be set AFTER children are appended (select.value needs options in DOM).
 *
 * `defaultValue` / `defaultChecked` have no HTML content attribute, so they
 * must go through this path or they are silently dropped. See #2820.
 */
const IDL_PROPS: Record<string, ReadonlySet<string>> = {
  input: new Set(['value', 'checked', 'defaultValue', 'defaultChecked']),
  select: new Set(['value']),
  textarea: new Set(['value', 'defaultValue']),
};

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
  const { children, ref: refProp, innerHTML, ...attrs } = props || {};
  const svg = isSVGTag(tag);
  const element = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);

  // Collect IDL properties to set after children are appended
  const idlSet = typeof tag === 'string' ? IDL_PROPS[tag] : undefined;
  const deferredIdl: [string, unknown][] = [];

  // Apply attributes
  // Resolve className vs class: className takes precedence when both are present
  const resolvedClass = attrs.className ?? attrs.class;
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className' || key === 'class') {
      // className/class → DOM class attribute; skip if already handled or null
      if (key === 'class' && attrs.className != null) continue; // className wins
      if (resolvedClass != null) {
        element.setAttribute('class', String(resolvedClass));
      }
      continue;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      // Event handler — addEventListener
      const eventName = key.slice(2).toLowerCase();
      element.addEventListener(eventName, value as EventListener);
    } else if (key === 'style' && value != null) {
      element.setAttribute(
        'style',
        typeof value === 'object' && !Array.isArray(value)
          ? styleObjectToString(value as Record<string, string | number>)
          : String(value),
      );
    } else if (idlSet?.has(key) && value != null && value !== false) {
      // IDL property — defer until after children (select.value needs options in DOM)
      deferredIdl.push([key, value]);
    } else if (value === true) {
      // Boolean attribute (e.g. disabled)
      element.setAttribute(key, '');
    } else if (value != null && value !== false) {
      // SVG attribute normalization (camelCase → hyphenated)
      const attrName = svg ? normalizeSVGAttr(key) : key;
      element.setAttribute(attrName, String(value));
    }
  }

  if (innerHTML !== undefined) {
    const hasChildren =
      children != null &&
      children !== false &&
      children !== true &&
      !(Array.isArray(children) && children.length === 0);
    if (hasChildren) {
      const tagName = typeof tag === 'string' ? tag : 'Component';
      throw new Error(
        `<${tagName}> has both 'innerHTML={…}' and children. ` +
          `innerHTML replaces children — remove one.`,
      );
    }
    element.innerHTML = innerHTML == null ? '' : String(innerHTML);
  } else {
    applyChildren(element, children);
  }

  // Set IDL properties after children are in the DOM
  for (const [key, value] of deferredIdl) {
    Reflect.set(element, key, value);
  }

  // Assign ref after element is fully constructed with children
  if (refProp != null) {
    if (typeof refProp === 'function') {
      (refProp as (el: Element) => void)(element);
    } else if (typeof refProp === 'object' && 'current' in (refProp as object)) {
      (refProp as Ref<Element>).current = element;
    }
  }

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
