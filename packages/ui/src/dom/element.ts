import { effect } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';

/** A Text node that also carries a dispose function for cleanup. */
export interface DisposableText extends Text {
  dispose: DisposeFn;
}

/**
 * Create a reactive text node whose content updates automatically
 * when the reactive dependencies of `fn` change.
 *
 * This is a compiler output target — the compiler generates calls
 * to __text when it encounters reactive text interpolation in JSX.
 *
 * Returns a Text node with a `dispose` property for cleanup.
 */
export function __text(fn: () => string): DisposableText {
  const node = document.createTextNode('') as DisposableText;
  node.dispose = effect(() => {
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
