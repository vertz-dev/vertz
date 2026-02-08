/**
 * Minimal DOM helper runtime for @vertz/ui POC.
 *
 * Validates: element creation, text binding, attribute binding,
 * event listeners, conditional rendering, and list reconciliation.
 */

import { effect } from './signal';

/** Create a DOM element */
export function element(tag: string): HTMLElement {
  return document.createElement(tag);
}

/** Create a text node that updates reactively */
export function text(fn: () => string): Text {
  const node = document.createTextNode('');
  effect(() => {
    node.textContent = fn();
  });
  return node;
}

/** Bind an attribute reactively */
export function attr(el: HTMLElement, name: string, fn: () => string | boolean | null): void {
  effect(() => {
    const value = fn();
    if (value === false || value === null) {
      el.removeAttribute(name);
    } else if (value === true) {
      el.setAttribute(name, '');
    } else {
      el.setAttribute(name, value);
    }
  });
}

/** Attach an event listener */
export function on(el: HTMLElement, event: string, handler: (e: Event) => void): () => void {
  el.addEventListener(event, handler);
  return () => {
    el.removeEventListener(event, handler);
  };
}

/**
 * Conditional rendering.
 *
 * Evaluates `condition` reactively. When truthy, renders `trueBranch`.
 * When falsy, renders `falseBranch` or a comment placeholder.
 *
 * On first call, returns the initially rendered node directly.
 * On subsequent condition changes, swaps the node in the DOM.
 *
 * Validates: lazy branch creation, branch switching, cleanup on switch.
 */
export function conditional(
  condition: () => boolean,
  trueBranch: () => Node,
  falseBranch?: () => Node,
): Node {
  let currentNode: Node | null = null;
  let firstNode: Node | null = null;

  effect(() => {
    const result = condition();
    const newNode = result
      ? trueBranch()
      : falseBranch
        ? falseBranch()
        : document.createComment('empty');

    if (currentNode === null) {
      // First run: just record the node; it will be returned by conditional()
      currentNode = newNode;
      firstNode = newNode;
    } else if (newNode !== currentNode) {
      if (currentNode.parentNode) {
        currentNode.parentNode.replaceChild(newNode, currentNode);
      }
      currentNode = newNode;
    }
  });

  // firstNode is guaranteed non-null because effect() runs synchronously
  return firstNode!;
}

/**
 * Keyed list reconciliation.
 *
 * Takes a reactive getter for the items array and a key extractor.
 * Renders each item via `renderItem`. Reconciles by key.
 *
 * Validates: insert, remove, reorder performance.
 */
export function list<T>(
  items: () => T[],
  keyFn: (item: T) => string | number,
  renderItem: (item: T, index: () => number) => Node,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const startAnchor = document.createComment('list-start');
  const endAnchor = document.createComment('list-end');
  fragment.appendChild(startAnchor);
  fragment.appendChild(endAnchor);

  let currentNodes = new Map<string | number, Node>();

  effect(() => {
    const newItems = items();
    const newKeys = newItems.map(keyFn);
    const newNodes = new Map<string | number, Node>();

    const parent = endAnchor.parentNode;
    if (!parent) return;

    // Create new nodes for items we haven't seen
    for (let i = 0; i < newItems.length; i++) {
      const key = newKeys[i]!;
      const item = newItems[i]!;
      if (currentNodes.has(key)) {
        newNodes.set(key, currentNodes.get(key)!);
      } else {
        const idx = i;
        newNodes.set(
          key,
          renderItem(item, () => idx),
        );
      }
    }

    // Remove nodes that are no longer in the list
    for (const [key, node] of currentNodes) {
      if (!newNodes.has(key) && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }

    // Insert/reorder nodes in correct order
    let insertBefore: Node = endAnchor;
    for (let i = newKeys.length - 1; i >= 0; i--) {
      const key = newKeys[i]!;
      const node = newNodes.get(key)!;
      if (node !== insertBefore.previousSibling) {
        parent.insertBefore(node, insertBefore);
      }
      insertBefore = node;
    }

    currentNodes = newNodes;
  });

  return fragment;
}
