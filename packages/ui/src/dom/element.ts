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
 * Create a reactive child node that updates when dependencies change.
 * Unlike __text(), this handles both Node values (appended directly)
 * and primitives (converted to text nodes).
 *
 * This prevents HTMLElements from being stringified to "[object HTMLElement]"
 * when used as JSX expression children like {someElement}.
 *
 * Returns a wrapper element with `display: contents` and a `dispose` property.
 */
export function __child(fn: () => Node | string | number | null | undefined): HTMLElement & {
  dispose: DisposeFn;
} {
  // Use a span with display:contents so it doesn't affect layout
  const wrapper = document.createElement('span') as HTMLElement & { dispose: DisposeFn };
  wrapper.style.display = 'contents';

  wrapper.dispose = effect(() => {
    const value = fn();

    // Clear previous content
    while (wrapper.firstChild) {
      wrapper.removeChild(wrapper.firstChild);
    }

    // Handle null/undefined
    if (value == null) {
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
