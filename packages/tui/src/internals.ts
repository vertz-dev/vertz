/**
 * Internals API — dual-usage pattern
 *
 * These functions (__element, __append, __child, __attr, etc.) serve two roles:
 *
 * 1. **Compiler output** — The Vertz compiler transforms `.tsx` files into calls
 *    to these functions. When users write JSX with `let` for state, the compiler
 *    emits `__element()`, `__append()`, `__child()`, etc. under the hood.
 *
 * 2. **Framework-internal components** — Components like Select, TextInput, and
 *    MultiSelect are pre-built JavaScript shipped in the `@vertz/tui` package.
 *    They never pass through the compiler, so they call `signal()` and these
 *    internals directly instead of using JSX + `let`.
 *
 * The runtime result is identical in both cases — the compiler simply automates
 * what framework components do by hand. Users should always write JSX with `let`
 * for state; the direct internals API is reserved for framework code that can't
 * go through the compiler.
 */

import type { DisposeFn } from '@vertz/ui';
import { _tryOnCleanup, domEffect, popScope, pushScope, runCleanups } from '@vertz/ui/internals';
import { defaultLayoutProps } from './layout/types';
import type {
  TuiChild,
  TuiConditionalNode,
  TuiElement,
  TuiListNode,
  TuiTextNode,
} from './tui-element';
import { isTuiElement } from './tui-element';

// --- Render scheduling ---

let renderCallback: (() => void) | null = null;
let renderScheduled = false;
let syncRender = false;

/** Set the render callback (called by tui.mount). */
export function setRenderCallback(cb: (() => void) | null): void {
  renderCallback = cb;
}

/** Enable synchronous rendering (for tests). */
export function setSyncRender(sync: boolean): void {
  syncRender = sync;
}

/** Schedule a render frame. Coalesces multiple calls via queueMicrotask. */
export function scheduleRender(): void {
  if (!renderCallback) return;
  if (syncRender) {
    renderCallback();
    return;
  }
  if (renderScheduled) return;
  renderScheduled = true;
  queueMicrotask(() => {
    renderScheduled = false;
    renderCallback?.();
  });
}

// --- Prop mapping ---

/** Apply a single prop key/value to a TuiElement, updating layoutProps and style. */
function applyProp(el: TuiElement, key: string, value: unknown): void {
  el.props[key] = value;

  switch (key) {
    case 'direction':
      if (value === 'row' || value === 'column') el.layoutProps.direction = value;
      break;
    case 'padding':
      if (typeof value === 'number') el.layoutProps.padding = value;
      break;
    case 'paddingX':
      if (typeof value === 'number') el.layoutProps.paddingX = value;
      break;
    case 'paddingY':
      if (typeof value === 'number') el.layoutProps.paddingY = value;
      break;
    case 'gap':
      if (typeof value === 'number') el.layoutProps.gap = value;
      break;
    case 'width':
      if (typeof value === 'number' || value === 'full') el.layoutProps.width = value;
      break;
    case 'height':
      if (typeof value === 'number') el.layoutProps.height = value;
      break;
    case 'grow':
      if (typeof value === 'number') el.layoutProps.grow = value;
      break;
    case 'align':
      if (value === 'start' || value === 'center' || value === 'end') el.layoutProps.align = value;
      break;
    case 'justify':
      if (value === 'start' || value === 'center' || value === 'end' || value === 'between') {
        el.layoutProps.justify = value;
      }
      break;
    case 'border':
      if (
        value === 'single' ||
        value === 'double' ||
        value === 'round' ||
        value === 'bold' ||
        value === 'none'
      ) {
        el.layoutProps.border = value;
      }
      break;
    case 'color':
      if (typeof value === 'string') el.style.color = value;
      break;
    case 'bgColor':
    case 'borderColor':
      if (typeof value === 'string') el.style.bgColor = value;
      break;
    case 'bold':
      el.style.bold = value === true ? true : undefined;
      break;
    case 'dim':
      el.style.dim = value === true ? true : undefined;
      break;
    case 'italic':
      el.style.italic = value === true ? true : undefined;
      break;
    case 'underline':
      el.style.underline = value === true ? true : undefined;
      break;
    case 'strikethrough':
      el.style.strikethrough = value === true ? true : undefined;
      break;
  }
}

// --- Element creation ---

/**
 * Create a persistent TuiElement.
 * Static props are passed as key-value pairs: __element('Box', 'direction', 'column')
 */
export function __element(tag: string, ...staticAttrs: unknown[]): TuiElement {
  const el: TuiElement = {
    _tuiElement: true,
    tag,
    props: {},
    style: {},
    layoutProps: defaultLayoutProps(),
    children: [],
    parent: null,
    dirty: false,
    box: { x: 0, y: 0, width: 0, height: 0 },
  };

  // Parse static attrs as key-value pairs
  for (let i = 0; i < staticAttrs.length; i += 2) {
    const key = staticAttrs[i] as string;
    const value = staticAttrs[i + 1];
    applyProp(el, key, value);
  }

  return el;
}

// --- Text nodes ---

/** Create a static text node. */
export function __staticText(text: string): TuiTextNode {
  return {
    _tuiText: true,
    text,
    style: {},
    dirty: false,
    box: { x: 0, y: 0, width: 0, height: 0 },
  };
}

/**
 * Create a reactive text node. Sets up an effect that updates the text
 * when dependencies change.
 */
export function __child(fn: () => string | number | null | undefined | boolean): TuiTextNode {
  const node: TuiTextNode = {
    _tuiText: true,
    text: '',
    style: {},
    dirty: false,
    box: { x: 0, y: 0, width: 0, height: 0 },
  };

  domEffect(() => {
    const value = fn();
    if (value == null || typeof value === 'boolean') {
      node.text = '';
    } else {
      node.text = String(value);
    }
    node.dirty = true;
    scheduleRender();
  });

  return node;
}

// --- Tree building ---

/** Append a child to a parent element. */
export function __append(parent: TuiElement, child: TuiChild): void {
  parent.children.push(child);
  if (isTuiElement(child)) {
    child.parent = parent;
  }
}

/** Insert a static child (element, text, or primitive). */
export function __insert(
  parent: TuiElement,
  value: TuiElement | TuiTextNode | string | number | null | undefined | boolean,
): void {
  if (value == null || typeof value === 'boolean') return;

  if (typeof value === 'object') {
    __append(parent, value);
    return;
  }

  const textNode = __staticText(String(value));
  __append(parent, textNode);
}

// --- Parent stack (for __enterChildren / __exitChildren) ---

// These are used by the compiler to manage nested element construction.
// In TUI, they're simpler than DOM since there's no hydration.
const _parentStack: TuiElement[] = [];

/** Enter children context for an element. */
export function __enterChildren(_parent: TuiElement): void {
  _parentStack.push(_parent);
}

/** Exit children context. */
export function __exitChildren(): void {
  _parentStack.pop();
}

// --- Reactive attributes ---

/**
 * Set a reactive attribute on an element. Creates an effect that
 * updates the prop (and layout/style) when dependencies change.
 */
export function __attr(el: TuiElement, key: string, fn: () => unknown): void {
  domEffect(() => {
    const value = fn();
    applyProp(el, key, value);
    el.dirty = true;
    scheduleRender();
  });
}

// --- Events ---

/** Event binding — no-op for TUI (no element-level events). */
export function __on(_el: TuiElement, _event: string, _handler: (...args: never) => unknown): void {
  // TUI has no element events. Keyboard input is handled via useKeyboard().
}

// --- Conditional rendering ---

/**
 * Reactive conditional rendering. Swaps between true/false branches
 * based on a reactive condition. Each branch gets its own disposal scope.
 * Follows the same pattern as canvasConditional.
 */
export function __conditional(
  condFn: () => unknown,
  trueFn: () => TuiElement | TuiTextNode,
  falseFn?: () => TuiElement | TuiTextNode,
): TuiConditionalNode {
  const node: TuiConditionalNode = {
    _tuiConditional: true,
    current: null,
    dirty: false,
  };

  let branchCleanups: DisposeFn[] = [];

  domEffect(() => {
    // Clean up previous branch
    runCleanups(branchCleanups);

    if (condFn()) {
      const scope = pushScope();
      node.current = trueFn();
      popScope();
      branchCleanups = scope;
    } else if (falseFn) {
      const scope = pushScope();
      node.current = falseFn();
      popScope();
      branchCleanups = scope;
    } else {
      node.current = null;
      branchCleanups = [];
    }

    node.dirty = true;
    scheduleRender();
  });

  // Register cleanup for current branch when parent scope disposes
  _tryOnCleanup(() => {
    runCleanups(branchCleanups);
  });

  return node;
}

// --- List rendering ---

/**
 * Reactive list rendering. Manages keyed items with per-item disposal scopes.
 * Follows the same pattern as canvasList.
 */
export function __list<T>(
  _parent: TuiElement,
  items: () => T[],
  keyFn: (item: T) => string | number,
  renderFn: (item: T) => TuiElement,
): TuiListNode {
  const node: TuiListNode = {
    _tuiList: true,
    items: [],
    dirty: false,
  };

  const itemMap = new Map<string | number, { element: TuiElement; scope: DisposeFn[] }>();

  domEffect(() => {
    const currentItems = items();
    const currentKeys = new Set(currentItems.map(keyFn));

    // Remove stale items
    for (const [key, entry] of itemMap) {
      if (!currentKeys.has(key)) {
        runCleanups(entry.scope);
        itemMap.delete(key);
      }
    }

    // Create new items
    for (const item of currentItems) {
      const key = keyFn(item);
      if (!itemMap.has(key)) {
        const scope = pushScope();
        const element = renderFn(item);
        popScope();
        itemMap.set(key, { element, scope });
      }
    }

    // Rebuild items array in source order
    node.items = currentItems.map((item) => {
      const key = keyFn(item);
      const entry = itemMap.get(key);
      return entry?.element as TuiElement;
    });

    node.dirty = true;
    scheduleRender();
  });

  // Register cleanup for all item scopes when parent scope disposes
  _tryOnCleanup(() => {
    for (const [, entry] of itemMap) {
      runCleanups(entry.scope);
    }
    itemMap.clear();
  });

  return node;
}
