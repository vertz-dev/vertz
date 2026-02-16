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
  // Tag is a string → create a DOM element
  const { children, ...attrs } = props || {};
  const element = document.createElement(tag);
  // Apply attributes
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof value === 'function') {
      // Event handler — addEventListener
      const eventName = key.slice(2).toLowerCase();
      element.addEventListener(eventName, value);
    } else if (key === 'class' && value != null) {
      element.className = String(value);
    } else if (key === 'style' && value != null) {
      element.setAttribute('style', String(value));
    } else if (value === true) {
      // Boolean attribute (e.g. checked, disabled)
      element.setAttribute(key, '');
    } else if (value != null && value !== false) {
      // All other attributes
      element.setAttribute(key, String(value));
    }
  }
  // Apply children
  applyChildren(element, children);
  return element;
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
//# sourceMappingURL=index.js.map
