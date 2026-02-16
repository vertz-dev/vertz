import { effect } from '../runtime/signal';
/**
 * Create a reactive text node whose content updates automatically
 * when the reactive dependencies of `fn` change.
 *
 * This is a compiler output target — the compiler generates calls
 * to __text when it encounters reactive text interpolation in JSX.
 *
 * Returns a Text node with a `dispose` property for cleanup.
 */
export function __text(fn) {
  const node = document.createTextNode('');
  node.dispose = effect(() => {
    node.data = fn();
  });
  return node;
}
/**
 * Create a reactive child node that updates when dependencies change.
 * Unlike __text(), this handles both Node values (appended directly)
 * and primitives (converted to text nodes).
 *
 * This prevents HTMLElements from being stringified to "[object HTMLElement]"
 * when used as JSX expression children like {someElement}.
 *
 * Returns a wrapper element with `display: contents` and a `dispose` property.
 */
export function __child(fn) {
  // Use a span with display:contents so it doesn't affect layout
  const wrapper = document.createElement('span');
  wrapper.style.display = 'contents';
  wrapper.dispose = effect(() => {
    const value = fn();
    // Clear previous content
    while (wrapper.firstChild) {
      wrapper.removeChild(wrapper.firstChild);
    }
    // Skip null, undefined, and booleans (consistent with __insert)
    if (value == null || typeof value === 'boolean') {
      return;
    }
    // If it's a Node, append it directly
    if (value instanceof Node) {
      wrapper.appendChild(value);
      return;
    }
    // Otherwise create a text node
    const textValue = typeof value === 'string' ? value : String(value);
    wrapper.appendChild(document.createTextNode(textValue));
  });
  return wrapper;
}
/**
 * Insert a static (non-reactive) child value into a parent node.
 * This is used for static JSX expression children to avoid the performance
 * overhead of effect() when reactivity isn't needed.
 *
 * Handles Node values (appended directly), primitives (converted to text),
 * and nullish/boolean values (skipped).
 */
export function __insert(parent, value) {
  // Skip null, undefined, and booleans
  if (value == null || typeof value === 'boolean') {
    return;
  }
  // If it's a Node, append it directly
  if (value instanceof Node) {
    parent.appendChild(value);
    return;
  }
  // Otherwise create a text node
  const textValue = typeof value === 'string' ? value : String(value);
  parent.appendChild(document.createTextNode(textValue));
}
/**
 * Create a DOM element with optional static properties.
 *
 * This is a compiler output target — the compiler generates calls
 * to __element for each JSX element.
 */
export function __element(tag, props) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}
//# sourceMappingURL=element.js.map
