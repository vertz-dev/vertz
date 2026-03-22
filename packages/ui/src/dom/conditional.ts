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
 * Claims the existing comment anchor and end marker from SSR,
 * then attaches reactive effect for future branch switches.
 *
 * Uses <!--conditional-->...<!--/conditional--> end markers to define
 * the region boundary. On branch switches, clearBetween removes all
 * content between markers and insertContentBefore inserts the new branch.
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
  const anchor = claimed as unknown as Node;
  let branchCleanups: DisposeFn[] = [];
  let endMarker: Node | null = null;
  let isFirstRun = true;
  // Flag set if end marker is missing — checked after domEffect returns
  let needsCsrFallback = false;

  const outerScope = pushScope();

  // First run: evaluate condition and call the active branch to claim SSR nodes
  domEffect(() => {
    const show = condFn();

    if (isFirstRun) {
      isFirstRun = false;
      // The branch function claims its SSR nodes via the hydration path
      const scope = pushScope();
      const branchResult = show ? trueFn() : falseFn();
      popScope();
      branchCleanups = scope;

      // Claim text node for primitive branches so cursor advances past it
      if (
        branchResult != null &&
        !isRenderNode(branchResult) &&
        typeof branchResult !== 'boolean'
      ) {
        claimText();
      }

      // Claim the end marker comment.
      // Phase 1 guarantees <!--/conditional--> is always in SSR output.
      const claimedEnd = claimComment();
      if (!claimedEnd) {
        // SSR mismatch: end marker missing. Signal CSR fallback.
        needsCsrFallback = true;
        return;
      }
      endMarker = claimedEnd as unknown as Node;
      return;
    }

    // Subsequent runs: clear and re-render between markers
    runCleanups(branchCleanups);
    clearBetween(anchor, endMarker!);

    const scope = pushScope();
    const branchResult = show ? trueFn() : falseFn();
    popScope();
    branchCleanups = scope;

    insertContentBefore(endMarker!, branchResult);
  });
  popScope();

  // domEffect ran synchronously. If end marker was missing, clean up
  // this hydration attempt and fall back to CSR.
  if (needsCsrFallback) {
    runCleanups(branchCleanups);
    runCleanups(outerScope);
    return csrConditional(condFn, trueFn, falseFn);
  }

  const disposeFn = () => {
    runCleanups(branchCleanups);
    runCleanups(outerScope);
  };

  _tryOnCleanup(disposeFn);

  // Return the anchor — it's already in the DOM from SSR.
  const result: DisposableNode = Object.assign(anchor, {
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
  firstRunResult = undefined;
  fragment.appendChild(endMarker);

  // Attach dispose to the fragment for lifecycle management
  const result: DisposableNode = Object.assign(fragment, { dispose: disposeFn });
  return result;
}
