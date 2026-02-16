/**
 * Server-side JSX runtime for SSR.
 *
 * Produces VNode trees compatible with @vertz/ui-server's renderToStream.
 * Used only during SSR; the client uses the DOM-based jsx-runtime.ts.
 *
 * This runtime is swapped in by Vite's ssrLoadModule during server-side
 * module transformation.
 */
/**
 * Normalize children into a flat array of VNodes and strings.
 *
 * Filters out null, undefined, true, false.
 * Flattens nested arrays.
 * Converts numbers and other primitives to strings.
 */
function normalizeChildren(children) {
  if (children == null || children === false || children === true) {
    return [];
  }
  if (Array.isArray(children)) {
    return children.flatMap(normalizeChildren);
  }
  // VNode or RawHtml object
  if (typeof children === 'object' && ('tag' in children || '__raw' in children)) {
    return [children];
  }
  // Convert primitives to strings
  return [String(children)];
}
/**
 * JSX factory function for server-side rendering.
 *
 * When tag is a function (component), calls it with props.
 * When tag is a string (HTML element), creates a VNode.
 */
export function jsx(tag, props) {
  // Component function — call it with props and return its result
  if (typeof tag === 'function') {
    return tag(props);
  }
  const { children, ...attrs } = props || {};
  // Filter props to only include serializable attributes
  const serializableAttrs = {};
  for (const [key, value] of Object.entries(attrs)) {
    // Skip event handlers (onXxx functions) — they don't work in SSR
    if (key.startsWith('on') && typeof value === 'function') {
      continue;
    }
    // Handle class attribute
    if (key === 'class' && value != null) {
      serializableAttrs.class = String(value);
      continue;
    }
    // Handle style attribute
    if (key === 'style' && value != null) {
      serializableAttrs.style = String(value);
      continue;
    }
    // Handle boolean attributes
    if (value === true) {
      serializableAttrs[key] = ''; // Boolean attribute (e.g., checked, disabled)
      continue;
    }
    // Skip false and null/undefined
    if (value === false || value == null) {
      continue;
    }
    // All other attributes — convert to string
    serializableAttrs[key] = String(value);
  }
  return {
    tag,
    attrs: serializableAttrs,
    children: normalizeChildren(children),
  };
}
/**
 * JSX factory for elements with multiple children.
 * In the automatic runtime, this is used when there are multiple children.
 * For our implementation, it's the same as jsx().
 */
export const jsxs = jsx;
/**
 * JSX development mode factory (used with @jsxImportSource in tsconfig).
 * Same as jsx() for our implementation.
 */
export const jsxDEV = jsx;
/**
 * Fragment component — a virtual container for multiple children.
 * The @vertz/ui-server renderer will unwrap fragments during serialization.
 */
export function Fragment(props) {
  return {
    tag: 'fragment',
    attrs: {},
    children: normalizeChildren(props?.children),
  };
}
//# sourceMappingURL=index.js.map
