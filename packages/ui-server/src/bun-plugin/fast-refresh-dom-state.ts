/**
 * DOM state snapshot/restore utilities for fast refresh.
 *
 * Captures transient DOM state (form values, focus, scroll positions) before
 * a component is replaced, and restores it to the new DOM tree after replacement.
 *
 * Separated from fast-refresh-runtime.ts so it can be tested without
 * import.meta.hot (which only exists in Bun's dev server environment).
 */

// ── Types ────────────────────────────────────────────────────────

/** Captured form field value keyed by name attribute. */
export interface FormFieldSnapshot {
  value: string;
  checked: boolean;
  selectedIndex: number;
  type: string;
}

/** Captured focus state. */
export interface FocusSnapshot {
  /** The name or id used to locate the element in the new tree. */
  matchKey: string;
  /** Whether matchKey is a name or id attribute. */
  matchBy: 'name' | 'id';
  /** Selection start for input/textarea. -1 if not applicable. */
  selectionStart: number;
  /** Selection end for input/textarea. -1 if not applicable. */
  selectionEnd: number;
}

/** Captured scroll position for a single element. */
export interface ScrollSnapshot {
  /** Key to locate the element: id value or tagName.className */
  matchKey: string;
  matchBy: 'id' | 'selector';
  scrollTop: number;
  scrollLeft: number;
}

/** Complete DOM state snapshot for a component tree. */
export interface DOMStateSnapshot {
  formFields: Map<string, FormFieldSnapshot>;
  focus: FocusSnapshot | null;
  scrollPositions: ScrollSnapshot[];
}

// ── Capture ──────────────────────────────────────────────────────

/**
 * Capture transient DOM state from a component's element tree.
 * Returns a snapshot that can be applied to a new tree via restoreDOMState.
 */
export function captureDOMState(element: Element): DOMStateSnapshot {
  return {
    formFields: captureFormFields(element),
    focus: captureFocus(element),
    scrollPositions: captureScrollPositions(element),
  };
}

/**
 * Derive a stable key for matching an input between old and new DOM trees.
 * Tries: name → id → placeholder → positional fallback (tagName:index).
 */
function formFieldKey(el: Element, index: number): string {
  const name = el.getAttribute('name');
  if (name) return `name:${name}`;

  const id = el.getAttribute('id');
  if (id) return `id:${id}`;

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return `placeholder:${placeholder}`;

  // Positional fallback: tagName + index among siblings of same type
  return `pos:${el.tagName.toLowerCase()}:${index}`;
}

function captureFormFields(element: Element): Map<string, FormFieldSnapshot> {
  const fields = new Map<string, FormFieldSnapshot>();
  const inputs = element.querySelectorAll('input, textarea, select');

  for (let i = 0; i < inputs.length; i++) {
    const el = inputs[i]!;
    const type = (el as HTMLInputElement).type ?? '';

    // Skip file inputs — browser security prevents restoring their value
    if (type === 'file') continue;

    const key = formFieldKey(el, i);
    fields.set(key, {
      value: (el as HTMLInputElement | HTMLTextAreaElement).value ?? '',
      checked: (el as HTMLInputElement).checked ?? false,
      selectedIndex: (el as HTMLSelectElement).selectedIndex ?? -1,
      type,
    });
  }

  return fields;
}

function captureFocus(element: Element): FocusSnapshot | null {
  const active = element.ownerDocument?.activeElement;
  if (!active) return null;

  // Check if the focused element is inside our component tree
  if (!element.contains(active)) return null;

  const name = active.getAttribute('name');
  const id = active.getAttribute('id');

  const matchKey = name ?? id;
  if (!matchKey) return null;

  let selectionStart = -1;
  let selectionEnd = -1;

  const inputLike = active as HTMLInputElement;
  if ('selectionStart' in active && inputLike.selectionStart != null) {
    selectionStart = inputLike.selectionStart;
    selectionEnd = inputLike.selectionEnd ?? selectionStart;
  }

  return {
    matchKey,
    matchBy: name ? 'name' : 'id',
    selectionStart,
    selectionEnd,
  };
}

function captureScrollPositions(element: Element): ScrollSnapshot[] {
  const positions: ScrollSnapshot[] = [];

  walkElements(element, (el) => {
    if (el.scrollTop === 0 && el.scrollLeft === 0) return;

    const id = el.getAttribute('id');
    if (id) {
      positions.push({
        matchKey: id,
        matchBy: 'id',
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
      });
      return;
    }

    // Fall back to tagName + className combination
    const selector = `${el.tagName.toLowerCase()}.${el.className}`;
    if (el.className) {
      positions.push({
        matchKey: selector,
        matchBy: 'selector',
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
      });
    }
  });

  return positions;
}

// ── Restore ──────────────────────────────────────────────────────

/**
 * Restore previously captured DOM state to a new component tree.
 */
export function restoreDOMState(newElement: Element, snapshot: DOMStateSnapshot): void {
  restoreFormFields(newElement, snapshot.formFields);
  restoreFocus(newElement, snapshot.focus);
  restoreScrollPositions(newElement, snapshot.scrollPositions);
}

function restoreFormFields(element: Element, fields: Map<string, FormFieldSnapshot>): void {
  if (fields.size === 0) return;

  const inputs = element.querySelectorAll('input, textarea, select');

  for (let i = 0; i < inputs.length; i++) {
    const el = inputs[i]!;
    const key = formFieldKey(el, i);
    const saved = fields.get(key);
    if (!saved) continue;

    // Skip file inputs
    if (saved.type === 'file') continue;

    const input = el as HTMLInputElement;

    if (el.tagName === 'SELECT') {
      (el as HTMLSelectElement).selectedIndex = saved.selectedIndex;
    } else if (saved.type === 'checkbox' || saved.type === 'radio') {
      input.checked = saved.checked;
    } else {
      input.value = saved.value;
    }
  }
}

function restoreFocus(element: Element, focus: FocusSnapshot | null): void {
  if (!focus) return;

  const target =
    focus.matchBy === 'name'
      ? element.querySelector(`[name="${focus.matchKey}"]`)
      : element.querySelector(`#${focus.matchKey}`);

  if (!target) return;

  // Skip if element is not focusable (disabled)
  if ((target as HTMLInputElement).disabled) return;

  if (typeof (target as HTMLElement).focus === 'function') {
    (target as HTMLElement).focus();
  }

  if (
    focus.selectionStart >= 0 &&
    'setSelectionRange' in target &&
    typeof (target as HTMLInputElement).setSelectionRange === 'function'
  ) {
    try {
      (target as HTMLInputElement).setSelectionRange(focus.selectionStart, focus.selectionEnd);
    } catch (_) {
      // Some input types don't support setSelectionRange
    }
  }
}

function restoreScrollPositions(element: Element, positions: ScrollSnapshot[]): void {
  for (const pos of positions) {
    let target: Element | null = null;

    if (pos.matchBy === 'id') {
      target = element.querySelector(`#${pos.matchKey}`);
    } else {
      // selector format: "tagname.classname"
      target = element.querySelector(pos.matchKey);
    }

    if (!target) continue;

    target.scrollTop = pos.scrollTop;
    target.scrollLeft = pos.scrollLeft;
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function walkElements(root: Element, callback: (el: Element) => void): void {
  callback(root);
  const children = root.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child) walkElements(child, callback);
  }
}
