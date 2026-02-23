import { claimComment, getIsHydrating } from '../hydrate/hydration-context';
import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { domEffect } from '../runtime/signal';
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
 * Returns a DisposableNode: a DocumentFragment (CSR) or the claimed
 * comment anchor (hydration), with a `dispose` property attached.
 */
export function __conditional(
  condFn: () => boolean,
  trueFn: () => Node | null,
  falseFn: () => Node | null,
): DisposableNode {
  if (getIsHydrating()) {
    return hydrateConditional(condFn, trueFn, falseFn);
  }
  return csrConditional(condFn, trueFn, falseFn);
}

/**
 * Hydration path for __conditional.
 * Claims the existing comment anchor and branch content from SSR,
 * then attaches reactive effect for future branch switches.
 */
function hydrateConditional(
  condFn: () => boolean,
  trueFn: () => Node | null,
  falseFn: () => Node | null,
): DisposableNode {
  // Claim the SSR comment anchor
  const anchor = claimComment() ?? document.createComment('conditional');
  let currentNode: Node | null = null;
  let branchCleanups: DisposeFn[] = [];

  const outerScope = pushScope();

  // First run: evaluate condition and call the active branch to claim SSR nodes
  let isFirstRun = true;
  domEffect(() => {
    const show = condFn();

    if (isFirstRun) {
      isFirstRun = false;
      // The branch function claims its SSR nodes via the hydration path
      const scope = pushScope();
      const branchResult = show ? trueFn() : falseFn();
      popScope();
      branchCleanups = scope;

      // During hydration, the branch content is already in the DOM.
      // Just track the current node for future branch switches.
      if (branchResult == null || typeof branchResult === 'boolean') {
        currentNode = document.createComment('empty');
      } else if (branchResult instanceof Node) {
        currentNode = branchResult;
      } else {
        currentNode = document.createTextNode(String(branchResult));
      }
      return;
    }

    // Subsequent runs: normal CSR branch switching
    runCleanups(branchCleanups);

    const scope = pushScope();
    const branchResult = show ? trueFn() : falseFn();
    popScope();
    branchCleanups = scope;

    let newNode: Node;
    if (branchResult == null || typeof branchResult === 'boolean') {
      newNode = document.createComment('empty');
    } else if (branchResult instanceof Node) {
      newNode = branchResult;
    } else {
      newNode = document.createTextNode(String(branchResult));
    }

    if (currentNode?.parentNode) {
      currentNode.parentNode.replaceChild(newNode, currentNode);
    } else if (anchor.parentNode) {
      anchor.parentNode.insertBefore(newNode, anchor.nextSibling);
    }

    currentNode = newNode;
  });
  popScope();

  const wrapper = () => {
    runCleanups(branchCleanups);
    runCleanups(outerScope);
  };

  _tryOnCleanup(wrapper);

  // During hydration, anchor and content are already in the SSR DOM.
  // Do NOT move them into a fragment — that would rip them from the live tree.
  // Return the anchor as the result node (it's already in the DOM).
  const result: DisposableNode = Object.assign(anchor as Node, {
    dispose: wrapper,
  });
  return result;
}

/**
 * CSR path for __conditional (original behavior).
 */
function csrConditional(
  condFn: () => boolean,
  trueFn: () => Node | null,
  falseFn: () => Node | null,
): DisposableNode {
  // Use a comment node as a stable anchor/placeholder
  const anchor = document.createComment('conditional');
  let currentNode: Node | null = null;
  let branchCleanups: DisposeFn[] = [];

  // Wrap the outer effect in its own scope so that any parent disposal scope
  // captures the outerScope — not the raw effect dispose.
  const outerScope = pushScope();
  domEffect(() => {
    const show = condFn();

    // Run cleanups for the previous branch before creating the new one
    runCleanups(branchCleanups);

    // Push a new disposal scope to capture cleanups from the branch function
    const scope = pushScope();
    const branchResult = show ? trueFn() : falseFn();
    popScope();
    branchCleanups = scope;

    // Branch may return null (e.g. false-branch of {show && <el/>}).
    // Use a comment placeholder so replaceChild always has a valid Node.
    // Branches may also return primitives (strings, numbers) from ternary
    // expressions like {loading ? 'Loading...' : 'Done'} — convert to text nodes.
    let newNode: Node;
    if (branchResult == null || typeof branchResult === 'boolean') {
      newNode = document.createComment('empty');
    } else if (branchResult instanceof Node) {
      newNode = branchResult;
    } else {
      newNode = document.createTextNode(String(branchResult));
    }

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
