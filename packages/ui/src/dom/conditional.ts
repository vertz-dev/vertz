import { claimComment, claimText, getIsHydrating } from '../hydrate/hydration-context';
import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { domEffect } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';
import { getAdapter, isRenderNode } from './adapter';

/** A Node that also carries a dispose function for cleanup. */
export interface DisposableNode extends Node {
  dispose: DisposeFn;
}

/**
 * Remove all nodes between `start` and `end` (exclusive).
 * Both start and end must share the same parentNode.
 */
function clearBetween(start: Node, end: Node): void {
  let current = start.nextSibling;
  while (current && current !== end) {
    const next = current.nextSibling;
    current.parentNode?.removeChild(current);
    current = next;
  }
}

/**
 * Insert content before the end marker.
 * Handles: null/boolean (nothing), Node/DocumentFragment (insertBefore),
 * primitives (text node).
 * No-ops if endMarker is not yet attached to the DOM.
 */
function insertContentBefore(endMarker: Node, branchResult: unknown): void {
  if (branchResult == null || typeof branchResult === 'boolean') return;
  const parent = endMarker.parentNode;
  if (!parent) return;
  if (isRenderNode(branchResult)) {
    parent.insertBefore(branchResult as Node, endMarker);
    return;
  }
  const text = getAdapter().createTextNode(String(branchResult)) as unknown as Node;
  parent.insertBefore(text, endMarker);
}

/**
 * Append branch content to a DocumentFragment for initial assembly.
 * Handles: null/boolean (nothing), Node/DocumentFragment (appendChild),
 * primitives (text node).
 */
function appendBranchContent(fragment: DocumentFragment, branchResult: unknown): void {
  if (branchResult == null || typeof branchResult === 'boolean') return;
  if (isRenderNode(branchResult)) {
    fragment.appendChild(branchResult as Node);
    return;
  }
  fragment.appendChild(getAdapter().createTextNode(String(branchResult)) as unknown as Node);
}

/**
 * Normalize a branch result into a single replaceable Node.
 * Used by the hydration path only (Phase 2 will remove this).
 */
function normalizeNode(branchResult: unknown): Node {
  if (branchResult == null || typeof branchResult === 'boolean') {
    return getAdapter().createComment('empty') as unknown as Node;
  }
  if (isRenderNode(branchResult)) {
    if ((branchResult as Node).nodeType === 11) {
      const wrap = getAdapter().createElement('span') as unknown as HTMLElement;
      wrap.style.display = 'contents';
      wrap.appendChild(branchResult as Node);
      return wrap;
    }
    return branchResult as Node;
  }
  return getAdapter().createTextNode(String(branchResult)) as unknown as Node;
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
 *
 * After the first hydration run, wraps all claimed nodes (anchor + content)
 * in a display:contents span. This ensures that when a parent conditional
 * re-evaluates and calls replaceChild, ALL nodes belonging to this
 * conditional are replaced — not just the anchor comment.
 *
 * Without wrapping, nested conditionals leave orphaned content nodes:
 * the parent replaces the inner anchor but the inner's content (e.g., an SVG)
 * stays in the DOM as a sibling, causing duplicate rendering. (#1553)
 */
function hydrateConditional(
  condFn: () => boolean,
  trueFn: () => Node | null,
  falseFn: () => Node | null,
): DisposableNode {
  // Claim the SSR comment anchor. If there's no matching SSR node, this
  // component wasn't server-rendered (e.g., route mismatch between SSR and
  // client). Fall back to CSR path which correctly builds the DOM from scratch.
  const claimed = claimComment();
  if (!claimed) {
    return csrConditional(condFn, trueFn, falseFn);
  }
  const anchor = claimed;
  let currentNode: Node | null = null;
  let branchCleanups: DisposeFn[] = [];
  // After wrapping, this holds the wrapper span (returned to the parent).
  let resultNode: Node = anchor as unknown as Node;

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

      // Determine which DOM node the branch produced (if any).
      let contentNode: Node | null = null;
      if (branchResult == null || typeof branchResult === 'boolean') {
        contentNode = null; // no content in DOM
      } else if (isRenderNode(branchResult)) {
        contentNode = branchResult;
      } else {
        // Branch returned a primitive (string/number). The SSR DOM contains
        // a text node with this value — claim it so the cursor advances past
        // it and we have a reference for future branch switches (replaceChild).
        const claimed = claimText();
        contentNode =
          claimed ?? (getAdapter().createTextNode(String(branchResult)) as unknown as Node);
      }

      // Wrap anchor (and content if present) in a display:contents span.
      // This ensures replaceChild on this node removes ALL our DOM content,
      // preventing orphaned siblings when nested conditionals re-evaluate.
      const anchorParent = (anchor as unknown as Node).parentNode;
      if (anchorParent) {
        const wrap = getAdapter().createElement('span') as unknown as HTMLElement;
        wrap.style.display = 'contents';
        anchorParent.insertBefore(wrap as unknown as Node, anchor);
        wrap.appendChild(anchor as unknown as Node);
        if (contentNode?.parentNode && contentNode.parentNode !== wrap) {
          wrap.appendChild(contentNode);
        }
        currentNode = wrap as unknown as Node;
        resultNode = wrap as unknown as Node;
      } else {
        currentNode = contentNode ?? (getAdapter().createComment('empty') as unknown as Node);
        resultNode = currentNode;
      }
      return;
    }

    // Subsequent runs: normal CSR branch switching
    runCleanups(branchCleanups);

    const scope = pushScope();
    const branchResult = show ? trueFn() : falseFn();
    popScope();
    branchCleanups = scope;

    const newNode = normalizeNode(branchResult);

    if (currentNode?.parentNode) {
      currentNode.parentNode.replaceChild(newNode, currentNode);
    } else if (anchor.parentNode) {
      anchor.parentNode.insertBefore(newNode, anchor.nextSibling);
    }

    currentNode = newNode;
  });
  popScope();

  const disposeFn = () => {
    runCleanups(branchCleanups);
    runCleanups(outerScope);
  };

  _tryOnCleanup(disposeFn);

  // Return the wrapper span (or anchor if wrapping wasn't possible).
  // domEffect runs synchronously, so resultNode is already set.
  const result: DisposableNode = Object.assign(resultNode, {
    dispose: disposeFn,
  });
  return result;
}

/**
 * CSR path for __conditional.
 * Uses comment end markers to define region boundaries instead of span wrappers.
 * Content is managed between <!--conditional--> and <!--/conditional--> markers.
 */
function csrConditional(
  condFn: () => boolean,
  trueFn: () => Node | null,
  falseFn: () => Node | null,
): DisposableNode {
  const anchor = getAdapter().createComment('conditional') as unknown as Comment;
  const endMarker = getAdapter().createComment('/conditional') as unknown as Comment;
  let branchCleanups: DisposeFn[] = [];
  let isFirstRun = true;
  // Stores branch result from first synchronous domEffect run for fragment assembly.
  let firstRunResult: unknown;

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

    if (isFirstRun) {
      isFirstRun = false;
      // Stash result — fragment is assembled after domEffect returns.
      // Uses appendChild (not insertBefore) to avoid SSR shim sync issue.
      firstRunResult = branchResult;
      return;
    }

    // Subsequent runs: clear region between markers and insert new content
    clearBetween(anchor, endMarker);
    insertContentBefore(endMarker, branchResult);
  });
  popScope();

  const disposeFn = () => {
    // Run cleanups for the currently active branch
    runCleanups(branchCleanups);
    // Dispose the outer scope (stops the effect)
    runCleanups(outerScope);
  };

  // Register the full disposer with any active parent scope (if one exists).
  _tryOnCleanup(disposeFn);

  // Build fragment in order: anchor → content → endMarker.
  // Uses appendChild to keep SSR shim's children array in sync.
  const fragment = getAdapter().createDocumentFragment() as unknown as DocumentFragment;
  fragment.appendChild(anchor);
  appendBranchContent(fragment, firstRunResult);
  fragment.appendChild(endMarker);

  // Attach dispose to the fragment for lifecycle management
  const result: DisposableNode = Object.assign(fragment, { dispose: disposeFn });
  return result;
}
