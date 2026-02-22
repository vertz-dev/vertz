import {
  claimElement,
  claimText,
  enterChildren,
  exitChildren,
  getIsHydrating,
} from '../hydrate/hydration-context';
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
  if (getIsHydrating()) {
    const claimed = claimText();
    if (claimed) {
      const node = claimed as DisposableText;
      node.dispose = effect(() => {
        node.data = fn();
      });
      return node;
    }
  }
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
export function __child(
  fn: () => Node | string | number | boolean | null | undefined,
): HTMLElement & {
  dispose: DisposeFn;
} {
  let wrapper: HTMLElement & { dispose: DisposeFn };

  if (getIsHydrating()) {
    const claimed = claimElement('span');
    if (claimed) {
      wrapper = claimed as HTMLElement & { dispose: DisposeFn };
      // Attach reactive effect to adopted wrapper — first run reads value
      // without clearing (SSR content is already correct)
      let isFirstRun = true;
      wrapper.dispose = effect(() => {
        const value = fn();

        if (isFirstRun) {
          isFirstRun = false;
          return;
        }

        // Clear previous content
        while (wrapper.firstChild) {
          wrapper.removeChild(wrapper.firstChild);
        }

        if (value == null || typeof value === 'boolean') {
          return;
        }

        if (value instanceof Node) {
          wrapper.appendChild(value);
          return;
        }

        const textValue = typeof value === 'string' ? value : String(value);
        wrapper.appendChild(document.createTextNode(textValue));
      });
      return wrapper;
    }
  }

  // CSR path: create new span wrapper
  wrapper = document.createElement('span') as HTMLElement & { dispose: DisposeFn };
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
export function __insert(
  parent: Node,
  value: Node | string | number | boolean | null | undefined,
): void {
  // Skip null, undefined, and booleans
  if (value == null || typeof value === 'boolean') {
    return;
  }

  if (getIsHydrating()) {
    // During hydration, nodes are already in place
    if (value instanceof Node) {
      return; // No-op — node already in DOM
    }
    // For string/number values, claim the existing text node
    claimText();
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
export function __element(tag: string, props?: Record<string, string>): HTMLElement {
  if (getIsHydrating()) {
    const claimed = claimElement(tag);
    if (claimed) {
      // Dev: check for ARIA mismatches
      if (props && typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
        for (const [key, value] of Object.entries(props)) {
          if (key === 'role' || key.startsWith('aria-')) {
            const actual = claimed.getAttribute(key);
            if (actual !== value) {
              console.warn(
                `[hydrate] ARIA mismatch on <${tag}>: ${key}="${actual}" (expected "${value}")`,
              );
            }
          }
        }
      }
      return claimed;
    }
  }
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}

/**
 * Append a child to a parent node.
 * During hydration, this is a no-op — the child is already in the DOM.
 * During CSR, delegates to appendChild.
 *
 * Compiler output target — replaces direct `parent.appendChild(child)`.
 */
export function __append(parent: Node, child: Node): void {
  if (getIsHydrating()) return;
  parent.appendChild(child);
}

/**
 * Create a static text node.
 * During hydration, claims an existing text node from the SSR output.
 * During CSR, creates a new text node.
 *
 * Compiler output target — replaces `document.createTextNode(str)`.
 */
export function __staticText(text: string): Text {
  if (getIsHydrating()) {
    const claimed = claimText();
    if (claimed) return claimed;
  }
  return document.createTextNode(text);
}

/**
 * Push the hydration cursor into an element's children.
 * Compiler output target — emitted around child construction.
 */
export function __enterChildren(el: Element): void {
  if (getIsHydrating()) {
    enterChildren(el);
  }
}

/**
 * Pop the hydration cursor back to the parent scope.
 * Compiler output target — emitted after all children are appended.
 */
export function __exitChildren(): void {
  if (getIsHydrating()) {
    exitChildren();
  }
}
