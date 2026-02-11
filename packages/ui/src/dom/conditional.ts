import { effect } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';

/** A Node that also carries a dispose function for cleanup. */
export interface DisposableNode extends Node {
  dispose: DisposeFn;
}

/**
 * Reactive conditional rendering.
 * When condFn() is true, renders trueFn(); otherwise renders falseFn().
 * Manages DOM insertion and cleanup automatically.
 *
 * Compiler output target for ternary expressions and if/else in JSX.
 *
 * Returns a Node (DocumentFragment) with a `dispose` property attached.
 */
export function __conditional(
  condFn: () => boolean,
  trueFn: () => Node,
  falseFn: () => Node,
): DisposableNode {
  // Use a comment node as a stable anchor/placeholder
  const anchor = document.createComment('conditional');
  let currentNode: Node | null = null;

  const dispose = effect(() => {
    const show = condFn();
    const newNode = show ? trueFn() : falseFn();

    if (currentNode?.parentNode) {
      // Replace old node with new node
      currentNode.parentNode.replaceChild(newNode, currentNode);
    } else if (anchor.parentNode) {
      // First render after anchor is in the DOM: insert after anchor
      anchor.parentNode.insertBefore(newNode, anchor.nextSibling);
    }

    currentNode = newNode;
  });

  // Return a fragment containing both anchor and initial rendered content
  const fragment = document.createDocumentFragment();
  fragment.appendChild(anchor);
  if (currentNode) {
    fragment.appendChild(currentNode);
  }

  // Attach dispose to the fragment for lifecycle management
  const result: DisposableNode = Object.assign(fragment, { dispose });
  return result;
}
