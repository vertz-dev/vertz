/**
 * Hydration context — cursor-based DOM walker for tolerant hydration.
 *
 * During hydration, the framework walks existing SSR nodes instead of
 * creating new ones. A global cursor tracks the current position in the
 * DOM tree. Claim functions advance the cursor and return matching nodes.
 *
 * Foreign nodes (browser extensions, ad blockers) are gracefully skipped.
 */

let isHydrating = false;
let currentNode: Node | null = null;
const cursorStack: (Node | null)[] = [];

/**
 * Begin hydration mode. Sets the cursor to the first child of `root`.
 */
export function startHydration(root: Element): void {
  if (isHydrating) {
    throw new Error(
      '[hydrate] startHydration() called while hydration is already active. ' +
        'Concurrent hydration is not supported.',
    );
  }
  isHydrating = true;
  currentNode = root.firstChild;
  cursorStack.length = 0;
}

/**
 * End hydration mode. Resets all state.
 */
export function endHydration(): void {
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    if (currentNode) {
      console.debug(
        '[hydrate] Hydration ended with unclaimed nodes remaining. ' +
          'This may indicate SSR/client tree mismatch or browser extension nodes.',
      );
    }
    if (cursorStack.length > 0) {
      console.debug(
        `[hydrate] Hydration ended with unbalanced cursor stack (depth: ${cursorStack.length}). ` +
          'Check that __enterChildren/__exitChildren calls are paired.',
      );
    }
  }
  isHydrating = false;
  currentNode = null;
  cursorStack.length = 0;
}

/**
 * Returns whether hydration is currently active.
 */
export function getIsHydrating(): boolean {
  return isHydrating;
}

/**
 * Temporarily pause hydration mode without losing cursor state.
 * Used by __child() to force CSR rendering for reactive insert children
 * while keeping the parent-level cursor intact.
 */
export function pauseHydration(): void {
  isHydrating = false;
}

/**
 * Resume hydration mode after a pause.
 * Must only be called after pauseHydration().
 */
export function resumeHydration(): void {
  isHydrating = true;
}

/**
 * Claim an element node matching `tag` at the current cursor position.
 * Skips non-matching nodes (browser extensions, whitespace text).
 * Returns null if no matching node is found among remaining siblings.
 */
export function claimElement(tag: string): HTMLElement | null {
  const upperTag = tag.toUpperCase();

  while (currentNode) {
    // Match: element with the expected tag
    if (currentNode.nodeType === Node.ELEMENT_NODE) {
      const el = currentNode as HTMLElement;
      if (el.tagName === upperTag) {
        currentNode = el.nextSibling;
        return el;
      }
      // Non-matching element — skip (browser extension or SSR mismatch)
      if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.debug(
          `[hydrate] Skipping non-matching node: <${el.tagName.toLowerCase()}> (expected <${tag}>)`,
        );
      }
    }

    // Skip text nodes (whitespace between elements)
    currentNode = currentNode.nextSibling;
  }

  // No match found
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[hydrate] Expected <${tag}> but no matching SSR node found. Creating new element.`,
    );
  }
  return null;
}

/**
 * Claim a text node at the current cursor position.
 * Skips element nodes to find the next text node.
 * Returns null if no text node is found among remaining siblings.
 */
export function claimText(): Text | null {
  while (currentNode) {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      const text = currentNode as Text;
      currentNode = text.nextSibling;
      return text;
    }

    // Skip non-text nodes
    currentNode = currentNode.nextSibling;
  }

  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn('[hydrate] Expected text node but no matching SSR node found.');
  }
  return null;
}

/**
 * Claim a comment node at the current cursor position.
 * Used for `__conditional` anchors (`<!-- conditional -->`).
 * Returns null if no comment node is found among remaining siblings.
 */
export function claimComment(): Comment | null {
  while (currentNode) {
    if (currentNode.nodeType === Node.COMMENT_NODE) {
      const comment = currentNode as Comment;
      currentNode = comment.nextSibling;
      return comment;
    }

    // Skip non-comment nodes
    currentNode = currentNode.nextSibling;
  }

  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn('[hydrate] Expected comment node but no matching SSR node found.');
  }
  return null;
}

/**
 * Push the current cursor onto the stack and set cursor to the first
 * child of `el`. Called by compiler-emitted `__enterChildren(el)`.
 */
export function enterChildren(el: Element): void {
  cursorStack.push(currentNode);
  currentNode = el.firstChild;
}

/**
 * Pop the cursor from the stack, restoring the parent's position.
 * Called by compiler-emitted `__exitChildren()`.
 */
export function exitChildren(): void {
  if (cursorStack.length === 0) {
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.warn(
        '[hydrate] exitChildren() called with empty stack. ' +
          'This likely means __exitChildren was called without a matching __enterChildren.',
      );
    }
    currentNode = null;
    return;
  }
  currentNode = cursorStack.pop() ?? null;
}
