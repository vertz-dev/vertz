import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
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
  let branchCleanups: DisposeFn[] = [];

  // Wrap the outer effect in its own scope so that any parent disposal scope
  // captures the outerScope — not the raw effect dispose.
  const outerScope = pushScope();
  effect(() => {
    const show = condFn();

    // Run cleanups for the previous branch before creating the new one
    runCleanups(branchCleanups);

    // Push a new disposal scope to capture cleanups from the branch function
    const scope = pushScope();
    const newNode = show ? trueFn() : falseFn();
    popScope();
    branchCleanups = scope;

    if (currentNode?.parentNode) {
      // Replace old node with new node
      currentNode.parentNode.replaceChild(newNode, currentNode);
    } else if (anchor.parentNode) {
      // First render after anchor is in the DOM: insert after anchor
      anchor.parentNode.insertBefore(newNode, anchor.nextSibling);
    }

    currentNode = newNode;
  });
  popScope();

  const wrapper = () => {
    // Run cleanups for the currently active branch
    runCleanups(branchCleanups);
    // Dispose the outer scope (stops the effect)
    runCleanups(outerScope);
  };

  // Register the full wrapper with any active parent scope (if one exists).
  // When __conditional is called at the top level, no parent scope exists — that's fine,
  // the caller is responsible for calling dispose() manually.
  _tryOnCleanup(wrapper);

  // Return a fragment containing both anchor and initial rendered content
  const fragment = document.createDocumentFragment();
  fragment.appendChild(anchor);
  if (currentNode) {
    fragment.appendChild(currentNode);
  }

  // Attach dispose to the fragment for lifecycle management
  const result: DisposableNode = Object.assign(fragment, { dispose: wrapper });
  return result;
}
