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
 * - Fragment           — document fragment
 */

type Tag = string | ((props: any) => any);

function applyChildren(parent: Node, children: any): void {
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

export function jsx(tag: Tag, props: Record<string, any>): any {
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
      const event = key[2].toLowerCase() + key.slice(3);
      el.addEventListener(event, value as EventListener);
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

export const jsxs = jsx;

export function Fragment(props: { children?: any }): DocumentFragment {
  const frag = document.createDocumentFragment();
  applyChildren(frag, props?.children);
  return frag;
}

export const jsxDEV = jsx;
