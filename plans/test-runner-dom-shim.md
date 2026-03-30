# Test Runner DOM Shim — Design Document

> "Performance is not optional. [...] If we're not the fastest, we find out why and we fix it." — Vertz Vision, Principle 7

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-30 | Initial draft |
| 2 | 2026-03-30 | Address DX, Product, and Technical review findings: add FormData, fix Proxy snapshot issue, add tag-to-constructor dispatch, expand innerHTML parser spec, add event dispatch edge cases, add missing API behavior tiers, expand E2E acceptance test, commit to single-file structure, add SSR shim guard |

---

## Executive Summary

Build a high-performance, built-in DOM environment for `vertz test` that enables component and integration tests to run without external dependencies (no JSDOM, no happy-dom, no browser). The DOM shim is pre-baked into the V8 startup snapshot for zero per-file initialization cost.

**Why this matters:** 180 test files (48% of the Vertz monorepo test suite) use real DOM APIs and currently only work under `bun test`. This is the last gap preventing `vertz test` from fully replacing Bun as the test runner. Beyond internal needs, this is a **user-facing feature** — Vertz developers get fast DOM-based component testing out of the box, with no setup or configuration.

**Scope:** A purpose-built DOM implementation optimized for component testing — not a full browser engine. It implements the APIs that tests actually use (audited across 1,120 test files) and stubs the rest.

---

## The Problem

### Current State

The Vertz test runner (`vertz test`, shipped in #2108, optimized in #2119) provides:
- Full test harness: `describe`, `it`, `expect`, `mock`, `spyOn`, hooks, timers
- V8 startup snapshot for fast isolate creation
- Module compilation cache for fast subsequent runs
- Per-file isolation via fresh V8 isolates

But it only has **identity-only DOM class stubs** — empty classes like `class HTMLElement extends Element {}` that satisfy `instanceof` checks but have zero DOM behavior. No `document`, no `window`, no event dispatch, no tree operations.

### What Tests Need

Audited across 180 DOM-dependent test files:

| API Category | Usage Count | Criticality |
|---|---|---|
| `document.createElement()` | ~1,600 | Blocking |
| `element.querySelector/querySelectorAll` | ~1,100 | Blocking |
| `element.getAttribute/setAttribute` | ~1,200 | Blocking |
| `element.textContent` | ~600 | Blocking |
| `element.dispatchEvent()` | ~400 | Blocking |
| `element.click()` | ~450 | Blocking |
| `element.appendChild/removeChild` | ~1,400 | Blocking |
| `element.innerHTML` | ~400 | High |
| `input.value/checked` | ~150 | High |
| `element.classList.*` | ~200 | High |
| `document.createTreeWalker` | ~10 | Critical (test utilities) |
| `window.history.*` | ~50 | Medium |
| `HTMLDialogElement.showModal/close` | ~70 | Medium |

### Existing Assets

Two DOM shims already exist in the codebase:

1. **TypeScript SSR shim** (`packages/ui-server/src/dom-shim/`) — 773 lines. Implements `SSRElement` with full attribute management, IDL property reflection, Proxy-based `style` and `dataset`, tree operations. **Missing:** querySelector, events, TreeWalker.

2. **Rust-embedded JS shim** (`native/vertz-runtime/src/ssr/dom_shim.rs`) — Similar to TS shim, embedded as JS string constant. Used for SSR in the native runtime. **Missing:** same gaps.

Neither shim supports events, querying, or TreeWalker — the three critical gaps for test support.

---

## Proposed Architecture

### Single JS Module, Pre-Baked into V8 Snapshot

The DOM shim is a single self-contained JavaScript file (~2,500-3,000 lines) embedded as a Rust string constant (matching the existing `DOM_SHIM_JS` pattern in `dom_shim.rs`). It:

1. Defines the full class hierarchy (`EventTarget` → `Node` → `Element` → `HTMLElement` → specific elements)
2. Implements tree operations, attribute management, events, querying, and TreeWalker
3. Creates `document` and `window` globals
4. Is executed during V8 snapshot creation (alongside bootstrap JS and test harness)
5. Costs **zero per-file time** at test runtime — everything is in the snapshot

```
Snapshot creation (one-time, LazyLock):
  1. Execute bootstrap JS (existing)
  2. Execute async context polyfill (existing)
  3. Execute DOM shim JS  ← NEW
  4. Execute test harness JS (existing)
  5. Serialize V8 heap → snapshot blob

Per test file (restore from snapshot):
  1. Create JsRuntime from snapshot          ← ~1.4ms (measured)
  2. Re-register native V8 functions         ← ~0.2ms
  3. Load and run test file                  ← unchanged
  4. document.body is ALREADY available      ← zero cost
```

### Design Principles

1. **Test-optimized, not browser-complete.** We implement what tests use. `window.scroll()` is a no-op. `element.getBoundingClientRect()` returns a zero rect. This is explicit and documented.

2. **Correct event semantics.** Event dispatch, bubbling, capturing, `preventDefault()`, `stopPropagation()` — these must work correctly because tests assert on them. This is the hardest part and the highest value.

3. **Fast querySelector.** Not a full CSS engine — but supports the selectors tests actually use: tag, `.class`, `#id`, `[attr]`, `[attr="value"]`, `[data-testid="..."]`, `:not()`, combinators (` `, `>`). This covers 99% of test queries.

4. **Fresh DOM per file.** Each test file starts with a clean `document.body` (empty children). Since each file gets a fresh V8 isolate from snapshot, DOM state is automatically isolated.

5. **Pre-baked in snapshot.** The class definitions, prototypes, and `document`/`window` objects are serialized into the V8 snapshot. Restoring from snapshot gives you a working DOM immediately — no JS parsing, no class creation overhead.

---

## API Surface

### Classes (Global Constructors)

```javascript
// Event system (foundation — everything dispatches events)
class EventTarget {
  addEventListener(type, listener, options?)
  removeEventListener(type, listener, options?)
  dispatchEvent(event): boolean
}

// Node hierarchy
class Node extends EventTarget {
  // Constants
  static ELEMENT_NODE = 1
  static TEXT_NODE = 3
  static COMMENT_NODE = 8
  static DOCUMENT_NODE = 9
  static DOCUMENT_FRAGMENT_NODE = 11

  // Tree traversal (read-only)
  parentNode, parentElement, childNodes, children
  firstChild, lastChild, nextSibling, previousSibling
  firstElementChild, lastElementChild
  nextElementSibling, previousElementSibling
  ownerDocument, isConnected

  // Tree mutation
  appendChild(child), removeChild(child)
  insertBefore(newNode, refNode), replaceChild(newNode, oldNode)
  remove(), replaceWith(...nodes)
  append(...nodes), prepend(...nodes)
  cloneNode(deep?), contains(node)
  hasChildNodes()

  // Content
  textContent (getter/setter)
  nodeType, nodeName
}

// Element — the workhorse
class Element extends Node {
  tagName, localName, id, className

  // Attributes
  setAttribute(name, value), getAttribute(name)
  removeAttribute(name), hasAttribute(name)
  toggleAttribute(name, force?)

  // Class management
  classList: { add, remove, toggle, contains, entries, forEach, length }

  // Content
  innerHTML (getter/setter)
  outerHTML (getter)
  textContent (getter/setter)

  // Style — class-based, NOT Proxy (V8 snapshots cannot reliably serialize Proxy objects)
  style: StyleMap (class with get/set methods, camelCase → kebab-case, back-ref to element)

  // Dataset — class-based, NOT Proxy (same snapshot constraint)
  dataset: DatasetMap (class with get/set methods, camelCase → data-* attributes, back-ref to element)

  // Query
  querySelector(selector), querySelectorAll(selector)
  matches(selector), closest(selector)
  getElementsByTagName(tag), getElementsByClassName(cls)

  // Interaction
  click(), focus(), blur()
  scrollIntoView() // no-op

  // Layout stubs (return zero/configurable values)
  getBoundingClientRect() → { top: 0, left: 0, ... }
  offsetWidth, offsetHeight, offsetTop, offsetLeft
  clientWidth, clientHeight
  scrollTop, scrollLeft, scrollWidth, scrollHeight
}

// HTMLElement — adds dataset, style, contentEditable
class HTMLElement extends Element {
  hidden, tabIndex, title, lang, dir
  contentEditable
}

// Specific element types (add specialized properties)
class HTMLInputElement extends HTMLElement {
  value, checked, disabled, type, name, placeholder, readOnly
  select(), setSelectionRange() // no-ops
}
class HTMLTextAreaElement extends HTMLElement { value, rows, cols, disabled, name, placeholder }
class HTMLSelectElement extends HTMLElement { value, selectedIndex, disabled, name, options }
class HTMLOptionElement extends HTMLElement { value, selected, text, label }
class HTMLButtonElement extends HTMLElement { disabled, type, name, value }
class HTMLFormElement extends HTMLElement { elements (getter → querySelectorAll('input,select,textarea,button')), submit(), reset() }
class HTMLAnchorElement extends HTMLElement { href, target, rel }
class HTMLImageElement extends HTMLElement { src, alt, width, height, naturalWidth, naturalHeight }
class HTMLDialogElement extends HTMLElement { open, returnValue, showModal(), close(returnValue?) }
class HTMLLabelElement extends HTMLElement { htmlFor }
class HTMLTemplateElement extends HTMLElement { content: DocumentFragment }
// ... other element types as needed (span, div, etc. — inherit from HTMLElement)

// Text and friends
class Text extends Node { data, nodeValue, wholeText }
class Comment extends Node { data, nodeValue }
class DocumentFragment extends Node {
  querySelector(), querySelectorAll()
  getElementById()
  innerHTML (getter/setter), textContent (getter/setter)
}
```

### Event System

```javascript
class Event {
  constructor(type, options?)
  type, target, currentTarget
  bubbles, cancelable, composed, defaultPrevented
  eventPhase, timeStamp, isTrusted
  preventDefault(), stopPropagation(), stopImmediatePropagation()
}

class CustomEvent extends Event {
  constructor(type, options?)
  detail
}

class MouseEvent extends Event {
  constructor(type, options?)
  button, buttons, clientX, clientY, screenX, screenY
  altKey, ctrlKey, metaKey, shiftKey
  relatedTarget
}

class KeyboardEvent extends Event {
  constructor(type, options?)
  key, code, location
  altKey, ctrlKey, metaKey, shiftKey, repeat, isComposing
}

class FocusEvent extends Event {
  constructor(type, options?)
  relatedTarget
}

class InputEvent extends Event {
  constructor(type, options?)
  data, inputType, isComposing
}
```

**Event property notes:**
- `event.target` and `event.currentTarget` are implemented as simple writable properties (not frozen getters). Tests commonly use `Object.defineProperty(event, 'target', { value: ... })` to set target on manually-created events. This must work.
- `event.currentTarget` is set per-phase during dispatch and reset to `null` after dispatch completes.
- `event.eventPhase` transitions: `NONE(0)` → `CAPTURING_PHASE(1)` → `AT_TARGET(2)` → `BUBBLING_PHASE(3)` → `NONE(0)`.

### addEventListener Options

`addEventListener(type, listener, options?)` supports:

| Option | Supported | Behavior |
|---|---|---|
| `capture: true` | Yes | Registers listener for capture phase |
| `once: true` | Yes | Removes listener after first invocation |
| `passive: true` | No-op | Stored but ignored (no scroll behavior in test DOM) |
| `signal: AbortSignal` | No-op | Not implemented; listener must be removed manually |

The third argument can also be a boolean (legacy `useCapture` form): `addEventListener('click', fn, true)`.

### FormData

```javascript
class FormData {
  constructor(formElement?)  // If formElement provided, collects named inputs
  get(name), getAll(name)
  set(name, value), append(name, value)
  has(name), delete(name)
  entries(), keys(), values(), forEach(cb)
  [Symbol.iterator]()       // Iterates entries
}
```

When constructed with an `HTMLFormElement`, walks the form's descendant `input`, `select`, `textarea` elements with a `name` attribute and collects their `value` (or `checked` state for checkboxes/radios).

### MemoryStorage (localStorage / sessionStorage)

```javascript
class MemoryStorage {
  getItem(key), setItem(key, value)
  removeItem(key), clear()
  key(index)
  length (getter)
}
```

Full `Storage` interface backed by a plain `Map`. Each `window` gets its own instances.

### Document Object

```javascript
// globalThis.document
const document = {
  nodeType: 9,
  documentElement: <html>,
  head: <head>,
  body: <body>,

  // Creation — uses TAG_MAP dispatch table for correct subclass
  // TAG_MAP = { input: HTMLInputElement, select: HTMLSelectElement, form: HTMLFormElement, ... }
  // createElement('input') returns `new HTMLInputElement('input')`, not generic HTMLElement
  // Unknown tags return `new HTMLElement(tagName)`
  createElement(tagName): Element,
  createTextNode(text): Text,
  createComment(text): Comment,
  createDocumentFragment(): DocumentFragment,
  createTreeWalker(root, whatToShow, filter?): TreeWalker,
  createEvent(type): Event,  // legacy

  // Query
  querySelector(selector), querySelectorAll(selector),
  getElementById(id), getElementsByTagName(tag), getElementsByClassName(cls),

  // Focus tracking
  activeElement: Element | null,

  // Event dispatch
  addEventListener(), removeEventListener(), dispatchEvent(),

  // Stubs
  cookie: '',
  adoptedStyleSheets: [],
}
```

### Window Object

```javascript
// globalThis.window (and globalThis properties)
const window = {
  document,
  location: { pathname: '/', search: '', hash: '', href: 'http://localhost/', ... },
  history: { pushState(state, title, url), replaceState(state, title, url), back(), forward(), length: 1 },
  navigator: { userAgent: 'VertzTest/1.0', language: 'en-US', ... },

  // Events
  addEventListener(), removeEventListener(), dispatchEvent(),

  // Animation — fires via setTimeout(cb, 0) for integration with test timer mocking
  requestAnimationFrame(cb) → id,   // implemented as setTimeout(cb, 0)
  cancelAnimationFrame(id),          // implemented as clearTimeout(id)

  // Layout stubs
  getComputedStyle(el) → reads el.style as read-only proxy (inline styles "flow through", no cascade),
  matchMedia(query) → { matches: false, addEventListener: noop, removeEventListener: noop },
  scrollTo(), scroll(),
  innerWidth: 1024, innerHeight: 768,

  // Storage
  localStorage: MemoryStorage,
  sessionStorage: MemoryStorage,

  // User-assignable properties
  __VERTZ_SESSION__: undefined,  // SSR hydration
  __VERTZ_ACCESS_SET__: undefined,
}
```

### TreeWalker & NodeFilter

```javascript
class TreeWalker {
  constructor(root, whatToShow, filter?)
  root, currentNode, whatToShow, filter
  nextNode(), previousNode()
  firstChild(), lastChild()
  nextSibling(), previousSibling()
  parentNode()
}

const NodeFilter = {
  SHOW_ALL: 0xFFFFFFFF,
  SHOW_ELEMENT: 0x1,
  SHOW_TEXT: 0x4,
  SHOW_COMMENT: 0x80,
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,
}
```

### Observer Stubs

```javascript
class IntersectionObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
class MutationObserver { observe() {} disconnect() {} takeRecords() { return []; } }
```

### CSS Stubs

```javascript
class CSSStyleSheet { insertRule() {} deleteRule() {} cssRules = []; }
// document.adoptedStyleSheets works as a plain array
```

---

## CSS Selector Engine

A minimal selector engine that supports the selectors used in tests:

### Supported Selectors

| Selector | Example | Usage in Tests |
|---|---|---|
| Tag | `div`, `button` | Component type matching |
| Class | `.active`, `.hidden` | State checks |
| ID | `#app`, `#dialog-1` | Direct element lookup |
| Attribute presence | `[disabled]` | State checks |
| Attribute value | `[data-testid="foo"]` | Primary test query pattern |
| Attribute contains word | `[class~="active"]` | Rare but supported |
| Attribute starts with | `[href^="/tasks"]` | Link checks |
| Attribute ends with | `[src$=".png"]` | Image checks |
| Attribute contains | `[class*="btn"]` | Partial class match |
| Descendant | `div span` | Nested element query |
| Child | `div > span` | Direct child query |
| Adjacent sibling | `h2 + p` | Sibling query (rare) |
| General sibling | `h2 ~ p` | Sibling query (rare) |
| Comma (OR) | `input, textarea` | Multiple selectors |
| :not() | `:not(.hidden)` | Exclusion |
| :first-child | `:first-child` | Position (rare) |
| :last-child | `:last-child` | Position (rare) |
| Universal | `*` | All elements |

### Not Supported

Behavior depends on category:

| Selector | Category | Behavior |
|---|---|---|
| `:nth-child(n)`, `:nth-of-type(n)` | Recognized, unsupported | **Throws** `DOMShimError: ':nth-child()' selector not supported in vertz test. Use simpler selectors or element traversal.` |
| `:has()` | Recognized, unsupported | **Throws** with same pattern |
| `::before`, `::after` | Pseudo-elements | **Throws** `SyntaxError` (matches browser behavior — pseudo-elements are invalid in querySelector) |
| `:hover`, `:focus`, `:active` | Dynamic pseudo-classes | **Returns false/empty** (correct — no visual state in test DOM) |

### Implementation Approach

Parse selectors into a simple AST, then walk the DOM tree matching each node. The parser must handle compound selectors (`div.active[disabled]` = tag AND class AND attribute on same element). The selector engine is ~300-400 lines of JS (parsing ~150 lines, matching ~150 lines). Performance target: `querySelector` on a 1000-node tree < 0.1ms.

---

## Event Dispatch Semantics

Events follow the DOM spec for capture → target → bubble phases:

1. **Capture phase:** Walk from `document` → target's parent, fire capture listeners
2. **Target phase:** Fire listeners on the target element
3. **Bubble phase:** Walk from target's parent → `document`, fire bubble listeners
4. `stopPropagation()` stops further propagation
5. `stopImmediatePropagation()` stops remaining listeners on current target
6. `preventDefault()` sets `defaultPrevented = true`
7. `element.click()` creates and dispatches a `MouseEvent` with `{ bubbles: true, cancelable: true }`

### Edge Cases (Must Handle Correctly)

- **Listener removal during dispatch:** Snapshot the listener array at the start of each target's dispatch phase (`listeners.slice()`). Listeners removed during dispatch of the same event type on the same element do NOT fire.
- **Listener addition during dispatch:** Listeners added to the current target during dispatch do NOT fire in the current phase (they were not in the snapshot).
- **`once: true`:** Listener is automatically removed after its first invocation. Implemented by wrapping in a function that calls `removeEventListener` then the original handler.
- **`event.currentTarget`:** Set to the current element during each phase, reset to `null` after `dispatchEvent()` returns.
- **`event.eventPhase`:** Correctly transitions through `NONE(0)` → `CAPTURING_PHASE(1)` → `AT_TARGET(2)` → `BUBBLING_PHASE(3)` → `NONE(0)`.

### Focus Tracking

- `element.focus()` sets `document.activeElement` to the element
- `element.blur()` resets `document.activeElement` to `document.body`
- Focus events (`focus`, `blur`, `focusin`, `focusout`) are dispatched

---

## Manifesto Alignment

- **Principle 1 (Zero config):** DOM environment works out of the box with `vertz test`. No setup files, no `testEnvironment: 'jsdom'`.
- **Principle 2 (One way):** Single built-in DOM. No choice paralysis between JSDOM/happy-dom/linkedom.
- **Principle 5 (Ship the kitchen sink):** DOM is built into the binary, pre-baked in the snapshot.
- **Principle 7 (Performance):** Zero per-file cost (snapshot-baked). No JS parsing for DOM classes.

---

## Non-Goals

1. **Full browser compliance.** This is a test DOM, not a browser. Layout, CSSOM computation, navigation, iframes — not implemented.
2. **HTML parsing.** `innerHTML` setter does basic tag parsing for test assertions, not full HTML5 parser. `<div class="foo">text</div>` works; `<table>` auto-correction does not.
3. **CSS cascade / computed styles.** `getComputedStyle()` returns a stub. Tests that need computed styles should mock `getBoundingClientRect()` on specific elements.
4. **Network-triggered behavior.** `<img>` loading, `<script>` execution, `<link>` stylesheet fetching — none of these trigger side effects.
5. **Accessibility tree.** `aria-*` attributes are stored but no accessibility tree is computed.
6. **Shadow DOM.** Not implemented (Vertz components don't use shadow DOM).

---

## Missing API Behavior (Three Tiers)

When user code accesses a DOM API not fully implemented in the shim:

### Tier 1: Silent No-ops (return sensible defaults)

APIs where no-op behavior is correct and won't produce wrong test results:
- `scrollIntoView()`, `scrollTo()`, `scroll()` — no layout
- `requestAnimationFrame` — fires via `setTimeout(cb, 0)`
- `matchMedia()` — returns `{ matches: false }`
- `IntersectionObserver`, `ResizeObserver`, `MutationObserver` — observe/disconnect are no-ops
- `element.animate()` — returns `undefined`
- `passive` option on `addEventListener` — stored, ignored

### Tier 2: Stubs with First-Call Warning

APIs where the return value is a stub that might surprise developers. On first invocation per test file, log to stderr:
- `getComputedStyle(el)` — returns element's inline styles only. Warning: `[vertz:dom] getComputedStyle() returns inline styles only in test mode`
- `element.getBoundingClientRect()` — returns zero rect. Warning: `[vertz:dom] getBoundingClientRect() returns zero rect in test mode`

Warnings are suppressible with `globalThis.__VERTZ_DOM_QUIET = true`.

### Tier 3: Clear Throws

APIs where silent behavior would produce incorrect test results:
- Unsupported selectors (`:nth-child`, `:has()`) → `DOMShimError` with suggestion
- Pseudo-elements in `querySelector` → `SyntaxError` (matches browser)
- Any API that would return a fundamentally wrong value (not just zero/empty)

---

## SSR Shim Coexistence

The SSR DOM shim (`native/vertz-runtime/src/ssr/dom_shim.rs`) and the test DOM shim coexist in the runtime but must never both be active:

- **Test mode:** DOM shim is pre-baked in the V8 snapshot. The SSR shim's `load_dom_shim()` must NOT be called.
- **SSR mode:** SSR shim is loaded dynamically at runtime. The test DOM shim is not in the snapshot.

**Guard mechanism:** The test DOM shim sets `globalThis.__VERTZ_DOM_MODE = 'test'` during snapshot creation. The SSR shim's `load_dom_shim()` must check this flag and skip global overwrites if it's set:

```javascript
// In SSR dom_shim.rs JS:
if (globalThis.__VERTZ_DOM_MODE === 'test') return; // test DOM already active
```

This prevents SSR-related test imports from accidentally overwriting the full-featured test DOM with the limited SSR shim.

---

## Unknowns

1. **innerHTML parser complexity.** Setting `innerHTML` requires parsing HTML strings into **real DOM nodes** (not raw strings like the SSR shim). Tests query children of elements whose `innerHTML` was set (`el.innerHTML = '<h2>text</h2>'; el.querySelector('h2')`). Resolution: implement a stack-based tag parser (~300-400 lines) that produces real Element/Text nodes. Supported patterns:
   - Nested elements with attributes: `<div class="foo"><span>text</span></div>`
   - Self-closing/void elements: `<br>`, `<hr>`, `<img>`, `<input>`, `<meta>`, `<link>`
   - Text nodes between elements: `<p>Hello <strong>World</strong></p>`
   - HTML entities: `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&#NNN;`
   - Attribute quoting styles: `class="foo"`, `class='foo'`, `disabled` (boolean)
   - Raw text elements: `<script>` and `<style>` content is NOT parsed as HTML (content preserved as-is text node)
   - Empty string: `innerHTML = ''` clears all children (critical for test cleanup between `it()` blocks)
   - **NOT handled:** `<table>` auto-correction/foster parenting, implicit element closing, `<!DOCTYPE>`, XML namespaces

2. **Selector engine performance on deep trees.** Some tests create large component trees (100+ nodes). Resolution: the selector engine walks the tree once per query, which is O(n) where n is the number of nodes. For test-sized trees (< 1000 nodes), this is sub-millisecond.

3. **Event handler `this` binding.** In browsers, event handlers called with `addEventListener` receive `this` as the element. We need to ensure `.call(element, event)` semantics. Resolution: store handlers and bind correctly during dispatch.

---

## Type Flow Map

N/A — this is a JavaScript-only implementation embedded in the Rust runtime. No TypeScript generics involved.

---

## E2E Acceptance Test

From the developer's perspective, after this feature ships:

```typescript
// This test file runs under `vertz test` with zero configuration

import { describe, it, expect, mock } from '@vertz/test';

describe('TaskCard component', () => {
  it('renders task title', () => {
    const el = document.createElement('div');
    el.innerHTML = '<h2 class="title">My Task</h2><span data-testid="status">open</span>';
    document.body.appendChild(el);

    expect(el.querySelector('.title').textContent).toBe('My Task');
    expect(el.querySelector('[data-testid="status"]').textContent).toBe('open');

    el.remove();
  });

  it('handles click events', () => {
    const button = document.createElement('button');
    const handler = mock(() => {});
    button.addEventListener('click', handler);
    button.click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
    expect(handler.mock.calls[0][0].bubbles).toBe(true);
  });

  it('supports event bubbling', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    parent.appendChild(child);

    const parentHandler = mock(() => {});
    parent.addEventListener('click', parentHandler);
    child.click();

    expect(parentHandler).toHaveBeenCalledTimes(1);
    expect(parentHandler.mock.calls[0][0].target).toBe(child);
  });

  it('works with forms', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'title';
    input.value = 'New Task';
    form.appendChild(input);

    expect(form.querySelector('[name="title"]').value).toBe('New Task');
  });

  it('supports TreeWalker-based queries', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>Hello <strong>World</strong></p>';
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
    const elements = [];
    while (walker.nextNode()) elements.push(walker.currentNode.tagName);
    expect(elements).toEqual(['P', 'STRONG']);
  });

  it('returns null for unmatched selectors', () => {
    const el = document.createElement('div');
    expect(el.querySelector('.nonexistent')).toBeNull();
  });

  it('cleans up between tests via innerHTML', () => {
    document.body.innerHTML = '<div id="test">content</div>';
    expect(document.getElementById('test')).not.toBeNull();

    // Cleanup pattern used by afterEach
    document.body.innerHTML = '';
    expect(document.body.childNodes.length).toBe(0);
    expect(document.getElementById('test')).toBeNull();
  });

  it('supports hydration-style tests with body innerHTML', () => {
    // Pattern from hydrate.test.ts — set innerHTML then query
    document.body.innerHTML = `
      <div data-v-id="Counter" data-v-key="c1">
        <script type="application/json">{"initial":0}</script>
        <button>0</button>
      </div>
    `;

    const island = document.querySelector('[data-v-id="Counter"]');
    expect(island).not.toBeNull();
    expect(island.querySelector('button').textContent).toBe('0');

    const script = island.querySelector('script[type="application/json"]');
    expect(script.textContent).toBe('{"initial":0}');

    document.body.innerHTML = '';
  });

  it('supports FormData from form element', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'title';
    input.value = 'New Task';
    form.appendChild(input);

    const fd = new FormData(form);
    expect(fd.get('title')).toBe('New Task');
    expect(fd.has('title')).toBe(true);
  });

  it('instanceof checks work for specific element types', () => {
    const input = document.createElement('input');
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input).toBeInstanceOf(HTMLElement);
    expect(input).toBeInstanceOf(Element);

    const form = document.createElement('form');
    expect(form).toBeInstanceOf(HTMLFormElement);
  });

  it('supports closest() for ancestor queries', () => {
    document.body.innerHTML = '<div class="card"><span class="title">Hello</span></div>';
    const span = document.querySelector('.title');
    expect(span.closest('.card')).not.toBeNull();
    expect(span.closest('.card').tagName).toBe('DIV');
    expect(span.closest('.nonexistent')).toBeNull();
    document.body.innerHTML = '';
  });

  it('supports history.pushState and location', () => {
    window.history.pushState({}, '', '/tasks/123');
    expect(window.location.pathname).toBe('/tasks/123');
  });

  it('supports cloneNode(true)', () => {
    const div = document.createElement('div');
    div.innerHTML = '<span>child</span>';
    const clone = div.cloneNode(true);
    expect(clone.querySelector('span').textContent).toBe('child');
    // Mutation on clone doesn't affect original
    clone.querySelector('span').textContent = 'changed';
    expect(div.querySelector('span').textContent).toBe('child');
  });
});
```

---

## Implementation Plan

### Phase 1: Core DOM (Node tree + Attributes + Content)

Build the foundation: node hierarchy, tree operations, attribute management, text content.

**Acceptance Criteria:**
```typescript
describe('Phase 1: Core DOM', () => {
  describe('Given a fresh document', () => {
    describe('When creating elements', () => {
      it('Then document.createElement returns correct element types via TAG_MAP dispatch', () => {});
      it('Then createElement("input") returns HTMLInputElement instance', () => {});
      it('Then createElement("form") returns HTMLFormElement instance', () => {});
      it('Then createElement("unknown-tag") returns HTMLElement instance', () => {});
      it('Then elements have correct tagName and nodeType', () => {});
      it('Then instanceof checks work for the full hierarchy', () => {});
    });
  });

  describe('Given a parent element with children', () => {
    describe('When manipulating the tree', () => {
      it('Then appendChild adds child and updates parentNode', () => {});
      it('Then removeChild removes child and clears parentNode', () => {});
      it('Then insertBefore places child at correct position', () => {});
      it('Then replaceChild swaps children correctly', () => {});
      it('Then childNodes, firstChild, lastChild reflect tree state', () => {});
      it('Then nextSibling and previousSibling link siblings', () => {});
      it('Then children filters to element nodes only', () => {});
    });
  });

  describe('Given an element with attributes', () => {
    describe('When getting/setting attributes', () => {
      it('Then setAttribute/getAttribute roundtrip correctly', () => {});
      it('Then removeAttribute removes the attribute', () => {});
      it('Then classList.add/remove/toggle/contains work', () => {});
      it('Then className reflects classList state', () => {});
      it('Then dataset (DatasetMap class) maps to data-* attributes', () => {});
      it('Then style (StyleMap class) maps camelCase to kebab-case', () => {});
      it('Then style object is stable across accesses (const s = el.style; s.color = "red" works)', () => {});
      it('Then id getter/setter reflects attribute', () => {});
    });
  });

  describe('Given elements with text content', () => {
    describe('When reading/writing content', () => {
      it('Then textContent returns concatenated text of all descendants', () => {});
      it('Then setting textContent replaces all children with a text node', () => {});
      it('Then innerHTML serializes element tree to HTML string', () => {});
      it('Then setting innerHTML parses HTML and creates child nodes', () => {});
      it('Then setting innerHTML to empty string removes all children', () => {});
      it('Then innerHTML parses self-closing/void elements (br, input, img)', () => {});
      it('Then innerHTML parses HTML entities (&amp; &lt; &gt; &quot;)', () => {});
      it('Then innerHTML preserves script/style content as raw text', () => {});
      it('Then innerHTML → querySelector roundtrips correctly', () => {});
      it('Then cloneNode(true) creates independent deep copy', () => {});
    });
  });

  describe('Given input elements', () => {
    describe('When accessing IDL properties', () => {
      it('Then value, checked, disabled are writable', () => {});
      it('Then type, name, placeholder reflect attributes', () => {});
    });
  });
});
```

### Phase 2: Event System

Full event dispatch with capture/bubble phases, `stopPropagation`, `preventDefault`.

**Acceptance Criteria:**
```typescript
describe('Phase 2: Event System', () => {
  describe('Given an element with an event listener', () => {
    describe('When dispatching an event', () => {
      it('Then the listener is called with the event object', () => {});
      it('Then event.target is the dispatching element', () => {});
      it('Then event.currentTarget is the listening element', () => {});
    });
  });

  describe('Given a nested element tree with listeners', () => {
    describe('When dispatching a bubbling event on a child', () => {
      it('Then parent listeners fire after child (bubble phase)', () => {});
      it('Then capture listeners fire before target', () => {});
      it('Then stopPropagation prevents further propagation', () => {});
      it('Then stopImmediatePropagation prevents remaining listeners on same target', () => {});
      it('Then non-bubbling events do not reach parent', () => {});
    });
  });

  describe('Given various event constructors', () => {
    describe('When creating events', () => {
      it('Then MouseEvent has button, clientX, clientY, modifier keys', () => {});
      it('Then KeyboardEvent has key, code, modifier keys', () => {});
      it('Then CustomEvent has detail', () => {});
      it('Then Event has type, bubbles, cancelable', () => {});
    });
  });

  describe('Given an element', () => {
    describe('When calling element.click()', () => {
      it('Then dispatches MouseEvent with bubbles:true', () => {});
      it('Then event propagates to ancestors', () => {});
    });
  });

  describe('Given event dispatch edge cases', () => {
    describe('When a listener removes another listener during dispatch', () => {
      it('Then the removed listener does NOT fire (snapshot semantics)', () => {});
    });
    describe('When a listener adds another listener during dispatch', () => {
      it('Then the added listener does NOT fire in current phase', () => {});
    });
    describe('When dispatch completes', () => {
      it('Then event.currentTarget is null', () => {});
      it('Then event.eventPhase is NONE (0)', () => {});
    });
  });

  describe('Given addEventListener options', () => {
    describe('When using once: true', () => {
      it('Then listener fires exactly once then is auto-removed', () => {});
    });
    describe('When using capture: true (object form)', () => {
      it('Then listener fires in capture phase', () => {});
    });
    describe('When using boolean third arg (legacy useCapture)', () => {
      it('Then addEventListener("click", fn, true) registers capture listener', () => {});
    });
  });

  describe('Given event.target override pattern', () => {
    describe('When using Object.defineProperty on event.target', () => {
      it('Then the override works (event properties are configurable)', () => {});
    });
  });

  describe('Given document.activeElement tracking', () => {
    describe('When calling focus/blur', () => {
      it('Then focus() sets document.activeElement', () => {});
      it('Then blur() resets to document.body', () => {});
    });
  });

  describe('Given FormData', () => {
    describe('When constructing from a form element', () => {
      it('Then collects named input values', () => {});
      it('Then collects select and textarea values', () => {});
      it('Then get/has/set/append/delete work', () => {});
      it('Then entries() is iterable', () => {});
    });
  });
});
```

### Phase 3: Selector Engine + TreeWalker

CSS selector matching and TreeWalker for DOM traversal.

**Acceptance Criteria:**
```typescript
describe('Phase 3: Selector Engine + TreeWalker', () => {
  describe('Given a DOM tree with various elements', () => {
    describe('When querying with querySelector', () => {
      it('Then tag selectors match (div, button, input)', () => {});
      it('Then class selectors match (.active, .hidden)', () => {});
      it('Then ID selectors match (#app)', () => {});
      it('Then attribute selectors match ([data-testid="foo"])', () => {});
      it('Then attribute presence selectors match ([disabled])', () => {});
      it('Then descendant combinators match (div span)', () => {});
      it('Then child combinators match (div > span)', () => {});
      it('Then comma-separated selectors match (input, textarea)', () => {});
      it('Then :not() pseudo-class works', () => {});
      it('Then :first-child and :last-child work', () => {});
      it('Then querySelectorAll returns all matches', () => {});
      it('Then querySelector returns first match or null', () => {});
    });
  });

  describe('Given document.querySelector/querySelectorAll', () => {
    describe('When querying the full document', () => {
      it('Then searches document.documentElement subtree', () => {});
      it('Then getElementById returns element by id attribute', () => {});
    });
  });

  describe('Given element.matches()', () => {
    describe('When testing selectors against an element', () => {
      it('Then returns true for matching selectors', () => {});
      it('Then returns false for non-matching selectors', () => {});
    });
  });

  describe('Given element.closest()', () => {
    describe('When searching ancestors', () => {
      it('Then returns closest ancestor matching selector', () => {});
      it('Then returns the element itself if it matches', () => {});
      it('Then returns null if no ancestor matches', () => {});
    });
  });

  describe('Given compound selectors', () => {
    describe('When using multiple conditions on same element', () => {
      it('Then div.active matches div with class active', () => {});
      it('Then input[type="text"][name="foo"] matches correctly', () => {});
    });
  });

  describe('Given unsupported selectors', () => {
    describe('When using :nth-child or :has()', () => {
      it('Then throws DOMShimError with helpful message', () => {});
    });
  });

  describe('Given document.createTreeWalker', () => {
    describe('When walking with SHOW_ELEMENT', () => {
      it('Then nextNode visits element nodes in tree order', () => {});
      it('Then skips text and comment nodes', () => {});
    });
    describe('When walking with SHOW_TEXT', () => {
      it('Then nextNode visits text nodes only', () => {});
    });
  });
});
```

### Phase 4: Window + Document + Remaining APIs

Complete the `window` and `document` globals, add `HTMLDialogElement`, observer stubs, `requestAnimationFrame`, storage, and `getComputedStyle`.

**Acceptance Criteria:**
```typescript
describe('Phase 4: Window + Document + Remaining APIs', () => {
  describe('Given window.history', () => {
    it('Then pushState/replaceState update location', () => {});
    it('Then popstate events can be dispatched', () => {});
  });

  describe('Given window.location', () => {
    it('Then pathname, search, hash are readable', () => {});
    it('Then pushState updates pathname, search, hash correctly', () => {});
  });

  describe('Given HTMLDialogElement', () => {
    it('Then showModal() sets open=true', () => {});
    it('Then close() sets open=false and sets returnValue', () => {});
  });

  describe('Given observer stubs', () => {
    it('Then IntersectionObserver, ResizeObserver, MutationObserver constructors exist', () => {});
    it('Then observe/unobserve/disconnect are callable no-ops', () => {});
  });

  describe('Given requestAnimationFrame', () => {
    it('Then fires callback via setTimeout(cb, 0)', () => {});
    it('Then cancelAnimationFrame prevents callback', () => {});
  });

  describe('Given localStorage/sessionStorage', () => {
    it('Then setItem/getItem/removeItem/clear work', () => {});
    it('Then length and key(index) work', () => {});
  });

  describe('Given getComputedStyle', () => {
    it('Then returns inline style values from the element', () => {});
    it('Then logs warning on first call per file', () => {});
  });

  describe('Given document.body reset between test files', () => {
    it('Then each test file starts with empty document.body', () => {});
    it('Then globals are fresh per isolate (snapshot restore)', () => {});
  });
});
```

### Phase 5: Snapshot Integration + E2E Validation

Pre-bake the DOM shim into the V8 snapshot. Run all 180 DOM-dependent test files. Triage and fix failures (likely surfacing edge cases in earlier phases). Benchmark.

**Acceptance Criteria:**
- DOM shim baked into V8 snapshot alongside existing bootstrap JS, async context, and test harness
- `globalThis.__VERTZ_DOM_MODE = 'test'` is set (SSR shim guard)
- All 180 DOM-dependent test files pass under `vertz test`
- Zero regression in non-DOM test files
- Per-file overhead does not increase (DOM is snapshot-baked)
- `vertz test` benchmark at 100 files shows no regression vs pre-DOM-shim
- Example app test suites pass under `vertz test` (dogfooding beyond monorepo)

---

## Performance Budget

| Metric | Target | Rationale |
|---|---|---|
| Snapshot size increase | < 500KB | DOM shim JS is ~2500-3000 lines, compresses well in V8 snapshot |
| Per-file DOM initialization | 0ms | Pre-baked in snapshot |
| querySelector on 100-node tree | < 0.05ms | Simple tree walk |
| dispatchEvent with 5-level bubble | < 0.01ms | Array iteration |
| innerHTML parse (50 chars) | < 0.1ms | Stack-based tag parser |

---

## File Structure

Single-file approach (matching the existing `DOM_SHIM_JS` pattern in `dom_shim.rs`):

```
native/vertz-runtime/src/test/
  dom_shim.rs          # New: Rust module exposing TEST_DOM_SHIM_JS constant
                       # Contains the full DOM shim as a single r#"..."# string
                       # Sections within the file (via comments):
                       #   1. StyleMap + DatasetMap (class-based, no Proxy)
                       #   2. EventTarget, Event, MouseEvent, KeyboardEvent, etc.
                       #   3. Node, Element, HTMLElement, specific element types
                       #   4. TAG_MAP dispatch table for createElement
                       #   5. CSS selector parser + matcher
                       #   6. TreeWalker + NodeFilter
                       #   7. innerHTML stack-based parser
                       #   8. FormData
                       #   9. document + window objects
                       #   10. Observer stubs, MemoryStorage, globals
  snapshot.rs          # Modified: includes TEST_DOM_SHIM_JS in snapshot creation
```

If the file exceeds ~3000 lines, split into two `const` strings executed sequentially in `create_test_snapshot()`.

---

## Risks

1. **innerHTML parser edge cases.** A stack-based parser won't handle all HTML5 edge cases (auto-closing, foster parenting, etc.). Mitigation: document limitations explicitly, provide `document.createElement` as the recommended alternative for complex structures. The parser handles the patterns audited from actual test files.

2. **Selector engine coverage.** Some niche selectors may not be supported. Mitigation: the audit shows 99% of test selectors are basic (tag, class, id, attribute, descendant). Unsupported selectors **throw** with a clear `DOMShimError` message (not silent empty results).

3. **Event handler `this` binding.** Must match browser behavior (handler called with `this` as the element for `addEventListener`-registered handlers). Mitigation: explicit `.call(currentTarget, event)` in dispatch loop.

4. **Snapshot size.** Adding ~2500-3000 lines of JS to the snapshot increases its size. Mitigation: V8 snapshots compress efficiently; measure actual impact and add CI assertion.

5. **V8 snapshot + Proxy.** Proxy objects may not serialize correctly in V8 snapshots. Mitigation: **eliminated** — the design uses class-based `StyleMap` and `DatasetMap` instead of Proxy. No Proxy objects in the snapshotted heap.

6. **SSR shim global collision.** If test code imports SSR modules that call `load_dom_shim()`, it would overwrite test DOM globals. Mitigation: `__VERTZ_DOM_MODE` guard flag checked by SSR shim.

---

## Future Work

Items explicitly out of scope for this design, but tracked as potential additions:

1. **Shadow DOM.** Basic `attachShadow()` / `shadowRoot` support. Trigger: users report shadow DOM as a blocker for testing web components.
2. **`:nth-child(n)` / `:nth-of-type(n)` selectors.** Add if test coverage demands it.
3. **DOM compatibility documentation page.** List supported/unsupported APIs in `packages/docs/`.
4. **Migration guide from `bun:test`.** Confirm the existing `codemod.rs` handles `bun:test` → `@vertz/test` import rewriting; document gaps.
