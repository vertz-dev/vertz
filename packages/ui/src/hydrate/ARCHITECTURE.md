# Hydration Architecture

## How It Works

Tolerant hydration walks existing SSR DOM nodes instead of creating new ones.
A **global cursor** tracks position in the tree. Compiler output functions
(`__element`, `__staticText`, etc.) call **claim functions** that advance the
cursor and return matching nodes.

```
mount(App)
  │
  ├─ root has children? ─── no ──→ CSR: create from scratch
  │          │
  │         yes
  │          │
  ├─ startHydration(root)       // cursor = root.firstChild
  ├─ App()                      // compiler output runs in hydration mode
  ├─ endHydration()             // reset cursor
  └─ return MountHandle
```

## Cursor State

```
Global state:
  isHydrating: boolean          // hydration mode active?
  currentNode: Node | null      // cursor position (current sibling)
  cursorStack: (Node | null)[]  // saved positions for nested elements
```

## Cursor Movement Rules

Every compiler output function either **advances** the cursor, **ignores** it,
or **manipulates the stack**:

| Function                   | During Hydration                                                                                            | Cursor Effect                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `__element(tag)`           | `claimElement(tag)` → returns matching element                                                              | **Advances** to nextSibling                        |
| `__staticText(text)`       | `claimText()` → returns text node                                                                           | **Advances** to nextSibling                        |
| `__text(fn)`               | `claimText()` + `deferredDomEffect` (deferred until `endHydration` flush)                                   | **Advances** to nextSibling                        |
| `__child(fn)`              | `claimComment('child')` anchor + end marker + **pause** hydration + CSR render between markers + **resume** | **Advances** past markers; inner content is CSR    |
| `__insert(parent, value)`  | **Resolves** functions/arrays, claims text for primitives                                                   | **Advances** only for text claims                  |
| `__append(parent, child)`  | **No-op** (child already in DOM)                                                                            | None                                               |
| `__enterChildren(el)`      | `enterChildren(el)`                                                                                         | **Pushes** cursor to stack, cursor = el.firstChild |
| `__exitChildren()`         | `exitChildren()`                                                                                            | **Pops** cursor from stack                         |
| `__on(el, event, handler)` | `addEventListener` (same as CSR)                                                                            | None                                               |
| `__attr(el, name, fn)`     | `deferredDomEffect` (deferred until `endHydration` flush)                                                   | None                                               |
| `__conditional(...)`       | `claimComment()` + run active branch                                                                        | **Advances** past anchor + branch nodes            |
| `__list(...)`              | First run: claim all item nodes via renderFn                                                                | **Advances** past all items                        |

## Claim Functions

### claimElement(tag)

Scans forward through siblings looking for `<TAG>`. Skips:

- Non-matching elements (browser extensions, mismatches)
- Text nodes (whitespace between elements)

Returns `null` if no match → fallback to `createElement`.

### claimText()

Scans forward for a text node. **Stops at element nodes** without consuming
them — this prevents stealing an element that a subsequent `claimElement()`
expects (the "Counter hydration bug" fix).

### claimComment()

Scans forward for a comment node. Used by `__conditional` anchors.

## How Children-as-Function Works

Layout components receive children as a function prop:

```
// Compiled output:
DashboardLayout({ children: () => PageContent() })

// Inside DashboardLayout:
__insert(contentDiv, children)  // children is () => PageContent()
```

During hydration, `__insert` **must call the function** so that the inner
component tree (`PageContent`) runs and claims its SSR nodes. If the function
is not called, no `__element`/`__on` calls execute, and event handlers are
never attached.

This was the root cause of #842.

## The \_\_child Pause/Resume Pattern

`__child(() => expr)` wraps reactive expressions. During hydration:

1. Claims the `<!--child-->` anchor comment and `<!--/child-->` end marker from SSR
2. **Clears** content between markers (JSX in callbacks isn't hydration-aware)
3. **Pauses** hydration (`isHydrating = false`, cursor preserved)
4. Runs `fn()` via CSR path → inserts fresh DOM between markers
5. **Resumes** hydration (`isHydrating = true`)
6. Parent-level cursor continues from the end marker's next sibling

This means content inside `__child` is always CSR-rendered, even during
hydration. The comment markers are adopted from SSR.

## Typical Element Lifecycle

```
SSR HTML: <div><h1>Hello</h1><button>Click</button></div>

Client execution during hydration:

  __element('div')          → claimElement('DIV') → returns SSR <div>
  __enterChildren(div)      → push cursor, cursor = <h1>
    __element('h1')         → claimElement('H1') → returns SSR <h1>, cursor = <button>
    __enterChildren(h1)     → push cursor, cursor = text("Hello")
      __staticText('Hello') → claimText() → returns SSR text, cursor = null
    __exitChildren()        → pop cursor, cursor = <button>
    __append(div, h1)       → no-op
    __element('button')     → claimElement('BUTTON') → returns SSR <button>, cursor = null
    __on(button, 'click', handler) → addEventListener on SSR button ✓
    __enterChildren(button) → push cursor, cursor = text("Click")
      __staticText('Click') → claimText() → returns SSR text, cursor = null
    __exitChildren()        → pop cursor, cursor = null
    __append(div, button)   → no-op
  __exitChildren()          → pop cursor, cursor = null

Result: Same DOM references, event handlers attached.
```

## Debugging Hydration Issues

### Enable browser debug mode

Set `window.__VERTZ_HYDRATION_DEBUG__ = true` before mount() to get
cursor movement logs in the browser console. This bypasses the
`typeof process !== "undefined"` guard that silences logs in browsers.

### Common symptoms and causes

| Symptom                     | Likely Cause                                    |
| --------------------------- | ----------------------------------------------- |
| Event handlers not attached | Element not claimed (cursor skipped past it)    |
| Duplicate DOM nodes         | `__append` running in CSR mode during hydration |
| Wrong element adopted       | Tag mismatch in SSR vs client                   |
| Content flash on load       | Hydration failed, fell back to CSR              |
| Effects from hydration leak | Scope not cleaned up after hydration error      |

### Tracing cursor position

If a claim fails, the cursor was not where expected. Check:

1. Did a previous `__child` or `__text` consume too many/few nodes?
2. Did `__insert` skip a function/array value without resolving it?
3. Did `__enterChildren`/`__exitChildren` pairs get mismatched?
4. Did the SSR HTML structure match what the client expects?
