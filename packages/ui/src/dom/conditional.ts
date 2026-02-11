import { effect } from '../runtime/signal';

/**
 * Reactive conditional rendering.
 * When condFn() is true, renders trueFn(); otherwise renders falseFn().
 * Manages DOM insertion and cleanup automatically.
 *
 * Compiler output target for ternary expressions and if/else in JSX.
 *
 * Returns a DocumentFragment containing an anchor comment.
 * The rendered content is inserted after the anchor when it's in the DOM.
 */
export function __conditional(
  condFn: () => boolean,
  trueFn: () => Node,
  falseFn: () => Node,
): Node {
  // Use a comment node as a stable anchor/placeholder
  const anchor = document.createComment('conditional');
  let currentNode: Node | null = null;

  effect(() => {
    const show = condFn();
    const newNode = show ? trueFn() : falseFn();

    if (currentNode?.parentNode) {
      // Replace old node with new node
      currentNode.parentNode.replaceChild(newNode, currentNode);
    } else if (anchor.parentNode) {
      // First render after anchor is in the DOM: insert after anchor
      anchor.parentNode.insertBefore(newNode, anchor.nextSibling);
    }
    // If anchor is not in the DOM yet, newNode will be inserted by
    // the MutationObserver approach below or re-evaluation.

    currentNode = newNode;
  });

  // Return a fragment containing both anchor and initial rendered content
  const fragment = document.createDocumentFragment();
  fragment.appendChild(anchor);
  if (currentNode) {
    fragment.appendChild(currentNode);
  }
  return fragment;
}
