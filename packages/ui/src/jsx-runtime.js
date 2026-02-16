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
/**
 * Apply children to a parent node, recursively handling arrays
 */
function applyChildren(parent, children) {
  if (children == null || children === false || children === true) return;
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
 * JSX factory function for client-side rendering.
 *
 * When tag is a function (component), calls it with props.
 * When tag is a string (HTML element), creates a DOM element.
 */
export function jsx(tag, props) {
  // Component call — pass props through to the function
  if (typeof tag === 'function') {
    return tag(props);
  }
  // HTML element
  const el = document.createElement(tag);
  const { children, ...attrs } = props || {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && key.length > 2 && typeof value === 'function') {
      // Event handler: onClick → click, onKeyDown → keydown
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value);
    } else if (key === 'class') {
      if (value != null) el.setAttribute('class', String(value));
    } else if (key === 'style' && typeof value === 'string') {
      el.setAttribute('style', value);
    } else if (value === true) {
      // Boolean attribute (e.g., selected, disabled)
      el.setAttribute(key, '');
    } else if (value !== false && value != null) {
      el.setAttribute(key, String(value));
    }
  }
  applyChildren(el, children);
  return el;
}
/**
 * JSX factory for elements with multiple children.
 * In the automatic runtime, this is used when there are multiple children.
 * For our implementation, it's the same as jsx().
 */
export const jsxs = jsx;
/**
 * Fragment component — a DocumentFragment container for multiple children.
 */
export function Fragment(props) {
  const frag = document.createDocumentFragment();
  applyChildren(frag, props?.children);
  return frag;
}
/**
 * JSX development mode factory (used with @jsxImportSource in tsconfig).
 * Same as jsx() for our implementation.
 */
export const jsxDEV = jsx;
//# sourceMappingURL=jsx-runtime.js.map
