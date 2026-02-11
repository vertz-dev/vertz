import { effect } from '../runtime/signal';

/**
 * Create a reactive text node whose content updates automatically
 * when the reactive dependencies of `fn` change.
 *
 * This is a compiler output target — the compiler generates calls
 * to __text when it encounters reactive text interpolation in JSX.
 */
export function __text(fn: () => string): Text {
  const node = document.createTextNode('');
  effect(() => {
    node.data = fn();
  });
  return node;
}

/**
 * Create a DOM element with optional static properties.
 *
 * This is a compiler output target — the compiler generates calls
 * to __element for each JSX element.
 */
export function __element(tag: string, props?: Record<string, string>): HTMLElement {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}
