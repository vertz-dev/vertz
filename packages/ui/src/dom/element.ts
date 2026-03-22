import {
  claimComment,
  claimElement,
  claimText,
  enterChildren,
  exitChildren,
  getIsHydrating,
  pauseHydration,
  resumeHydration,
} from '../hydrate/hydration-context';
import { popScope, pushScope, runCleanups } from '../runtime/disposal';
import { deferredDomEffect, domEffect } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';
import { getAdapter, isRenderNode } from './adapter';
import { isSVGTag, normalizeSVGAttr, SVG_NS } from './svg-tags';

const MAX_THUNK_DEPTH = 100;

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
      node.dispose = deferredDomEffect(() => {
        node.data = fn();
      });
      return node;
    }
  }
  const node = getAdapter().createTextNode('') as DisposableText;
  node.dispose = domEffect(() => {
    node.data = fn();
  });
  return node;
}

/** A Node that also carries a dispose function for cleanup. */
export interface DisposableChild extends Node {
  dispose: DisposeFn;
}

/**
 * Resolve a value (thunks, arrays, nodes, primitives) and insert each
 * produced node as a sibling after an anchor, tracking them in the
 * managed array. Insertion order is preserved by inserting after the
 * last managed node (or the anchor if none yet).
 */
function resolveAndInsertAfter(anchor: Node, value: unknown, managed: Node[], depth = 0): void {
  if (depth >= MAX_THUNK_DEPTH) {
    throw new Error(
      'resolveAndInsertAfter: max recursion depth exceeded — possible circular thunk',
    );
  }
  if (value == null || typeof value === 'boolean') return;
  if (typeof value === 'function') {
    resolveAndInsertAfter(anchor, (value as () => unknown)(), managed, depth + 1);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      resolveAndInsertAfter(anchor, item, managed, depth);
    }
    return;
  }
  // Leaf: node or primitive
  const node = isRenderNode(value)
    ? (value as Node)
    : (getAdapter().createTextNode(
        typeof value === 'string' ? value : String(value),
      ) as unknown as Node);
  // Insert after the last managed node, or after the anchor if none yet
  const insertAfter = (managed.length > 0 ? managed[managed.length - 1] : anchor) as Node;
  insertAfter.parentNode!.insertBefore(node, insertAfter.nextSibling);
  managed.push(node);
}

/**
 * Shared reactive effect logic for __child (both CSR and hydration paths).
 * Manages content as siblings after a comment anchor, tracking nodes
 * in the managed array for cleanup.
 */
function childEffect(
  anchor: Node,
  fn: () => Node | string | number | boolean | null | undefined,
  managed: Node[],
  childCleanups: { value: DisposeFn[] },
): DisposeFn {
  return domEffect(() => {
    // Dispose nested effects (e.g., __conditional domEffects) from the
    // previous fn() evaluation. Without this, old conditionals' effects
    // stay alive and produce orphaned/duplicate DOM nodes.
    runCleanups(childCleanups.value);

    const scope = pushScope();
    const value = fn();
    popScope();
    childCleanups.value = scope;

    // Stable-node optimization: if fn() returns the same Node reference
    // that's already the sole managed node, skip DOM work.
    // Critical for queryMatch, which returns a cached wrapper.
    if (managed.length === 1 && isRenderNode(value) && managed[0] === value) {
      return;
    }

    // Text-in-place optimization: update existing text node data directly
    // instead of removing + creating a new Text node.
    if (
      managed.length === 1 &&
      managed[0]!.nodeType === 3 &&
      !isRenderNode(value) &&
      value != null &&
      typeof value !== 'boolean' &&
      typeof value !== 'function'
    ) {
      const text = typeof value === 'string' ? value : String(value);
      (managed[0] as Text).data = text;
      return;
    }

    // Remove old managed nodes
    for (const node of managed) {
      node.parentNode?.removeChild(node);
    }
    managed.length = 0;

    // Resolve and insert new content after anchor.
    // Handles thunks, arrays, nodes, and primitives.
    resolveAndInsertAfter(anchor, value, managed);
  });
}

/**
 * Create a reactive child node that updates when dependencies change.
 * Unlike __text(), this handles both Node values (appended directly)
 * and primitives (converted to text nodes).
 *
 * This prevents HTMLElements from being stringified to "[object HTMLElement]"
 * when used as JSX expression children like {someElement}.
 *
 * Uses a comment anchor (<!--child-->) with sibling-based content management.
 * Content nodes are inserted after the anchor and tracked for cleanup.
 * Returns a DocumentFragment (CSR) or the claimed comment (hydration),
 * with a `dispose` property for lifecycle management.
 */
export function __child(
  fn: () => Node | string | number | boolean | null | undefined,
): DisposableChild {
  if (getIsHydrating()) {
    const claimed = claimComment();
    if (claimed) {
      const anchor = claimed as unknown as Node;
      const managed: Node[] = [];
      const childCleanups = { value: [] as DisposeFn[] };

      // Clear SSR content after the comment anchor — it will be re-rendered
      // via CSR below. JSX inside callbacks (e.g., queryMatch handlers) is not
      // hydration-aware, so attempting to hydrate would create detached DOM
      // nodes with dead event handlers. See #826.
      // Stop at the next <!--child--> comment (sibling __child boundary) but
      // remove other comments (e.g., <!-- conditional -->) which are content.
      let sibling = anchor.nextSibling;
      while (sibling) {
        if (sibling.nodeType === 8 && (sibling as Comment).data.trim() === 'child') {
          break;
        }
        const next = sibling.nextSibling;
        sibling.parentNode?.removeChild(sibling);
        sibling = next;
      }

      // Pause hydration so fn() creates fresh DOM via CSR path.
      // domEffect runs synchronously on first call, so this completes
      // before any browser paint — no visual flash.
      pauseHydration();
      try {
        const dispose = childEffect(
          anchor,
          ((originalFn) => () => {
            // Pause hydration on every re-run, not just the first.
            // When a signal change triggers a re-run while hydration is still
            // active (e.g., router outlet switching routes before endHydration),
            // child components must render via CSR.
            const needsPause = getIsHydrating();
            if (needsPause) pauseHydration();
            try {
              return originalFn();
            } finally {
              if (needsPause) resumeHydration();
            }
          })(fn),
          managed,
          childCleanups,
        );

        const result = Object.assign(anchor, {
          dispose: () => {
            runCleanups(childCleanups.value);
            dispose();
          },
        }) as DisposableChild;
        return result;
      } finally {
        resumeHydration();
      }
    }
  }

  // CSR path: create comment anchor inside a DocumentFragment
  const anchor = getAdapter().createComment('child') as unknown as Node;
  const fragment = getAdapter().createDocumentFragment() as unknown as DocumentFragment;
  fragment.appendChild(anchor);

  const managed: Node[] = [];
  const childCleanups = { value: [] as DisposeFn[] };

  const dispose = childEffect(anchor, fn, managed, childCleanups);

  const result = Object.assign(fragment, {
    dispose: () => {
      runCleanups(childCleanups.value);
      dispose();
    },
  }) as unknown as DisposableChild;

  return result;
}

/**
 * Resolve a value that may be a thunk (function), nested thunks, or arrays
 * into leaf values, then insert each leaf. Resolution is unconditional —
 * functions and arrays are always unwrapped regardless of hydration state.
 * Only leaf insertion (node or text) branches on hydration.
 *
 * This structure makes the #842 bug class (function values silently skipped
 * during hydration) structurally impossible.
 */
function resolveAndInsert(parent: Node, value: unknown, depth = 0): void {
  if (depth >= MAX_THUNK_DEPTH) {
    throw new Error('__insert: max recursion depth exceeded — possible circular thunk');
  }
  if (value == null || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'function') {
    resolveAndInsert(parent, (value as () => unknown)(), depth + 1);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      resolveAndInsert(parent, item, depth);
    }
    return;
  }
  insertLeaf(parent, value);
}

/**
 * Insert a resolved leaf value (node or text) into a parent.
 * During hydration, nodes are already in the DOM (no-op) and text nodes
 * are claimed from SSR output. During CSR, nodes are appended and text
 * nodes are created.
 */
function insertLeaf(parent: Node, value: unknown): void {
  if (getIsHydrating()) {
    if (isRenderNode(value)) {
      return; // No-op — node already in DOM
    }
    // For string/number values, claim the existing text node
    claimText();
    return;
  }

  // CSR path
  if (isRenderNode(value)) {
    parent.appendChild(value as Node);
    return;
  }
  const text = typeof value === 'string' ? value : String(value);
  parent.appendChild(getAdapter().createTextNode(text) as unknown as Node);
}

/**
 * Insert a static (non-reactive) child value into a parent node.
 * This is used for static JSX expression children to avoid the performance
 * overhead of effect() when reactivity isn't needed.
 *
 * Functions and arrays are resolved unconditionally before branching on
 * hydration state, ensuring all inner __element/__on calls execute
 * regardless of mode.
 */
export function __insert(
  parent: Node,
  value: Node | string | number | boolean | null | undefined | (() => unknown) | unknown[],
): void {
  if (value == null || typeof value === 'boolean') {
    return;
  }
  resolveAndInsert(parent, value);
}

/**
 * Create a DOM element with optional static properties.
 *
 * This is a compiler output target — the compiler generates calls
 * to __element for each JSX element.
 */
export function __element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, string>,
): HTMLElementTagNameMap[K];
export function __element(tag: string, props?: Record<string, string>): Element;
export function __element(tag: string, props?: Record<string, string>): Element {
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
  const adapter = getAdapter();
  const svg = isSVGTag(tag);
  const el = svg ? adapter.createElementNS(SVG_NS, tag) : adapter.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      const attrName = svg ? normalizeSVGAttr(key) : key;
      el.setAttribute(attrName, value);
    }
  }
  // RenderElement → Element: adapter returns RenderElement but callers expect DOM Element.
  // This is safe because the DOM adapter creates real DOM elements.
  return el as unknown as Element;
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
  return getAdapter().createTextNode(text) as unknown as Text;
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
