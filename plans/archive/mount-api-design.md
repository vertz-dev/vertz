# Design Doc: mount() + SSR Rendering API

> **Status:** Draft — awaiting CTO review
> **Author:** mike (VP Eng)
> **Issue:** TBD
> **Packages:** `@vertz/ui`, `@vertz/ui-server`

## Problem

Both demo apps have ~30 lines of identical boilerplate to mount an app:
- Manual SSR detection (`typeof __SSR_URL__`)
- Manual theme CSS generation and `<style>` injection
- Manual global styles injection
- Manual root element lookup, clearing, and appending
- Manual `buildThemeCss()` function duplicated across apps

This is framework code that every app will need. It should be one line.

## Goals

1. **`mount()`** — Client-side: mount a component, inject styles, handle hydration
2. **`renderToHTML()`** — Server-side: render full HTML document with same config
3. **Scoped hydration with tolerance** — No browser extension mismatch errors
4. **Shared config** — Same theme/styles config works on client and server
5. **No breaking changes** to existing APIs

## Non-Goals

- Replacing the existing `hydrate()` per-component system (it stays)
- Full framework router integration (mount doesn't own routing)
- Build tooling changes (Vite plugin stays as-is)

---

## API Design

### Client: `mount()`

```tsx
import { mount } from '@vertz/ui'
import { App } from './app'
import { theme } from './theme'
import { globalStyles } from './styles'

mount(App, '#app', {
  theme,                          // optional — auto-compiles and injects CSS vars
  styles: [globalStyles.css],     // optional — global CSS strings to inject
  hydration: 'replace',            // 'replace' (default) | false  (v0.2: 'tolerant' | 'strict')
  registry: {                     // optional — component registry for per-component hydration
    Counter: () => import('./counter'),
  },
  onMount: (root) => {},          // optional — callback after mount
})
```

**Return value:**
```tsx
const app = mount(App, '#app', options)
// app.unmount()  — cleanup
// app.root       — root HTMLElement
```

### Server: `renderToHTML()`

```tsx
import { renderToHTML } from '@vertz/ui-server'
import { App } from './app'
import { theme } from './theme'

const html = await renderToHTML(App, {
  url: req.url,
  theme,
  styles: [globalStyles.css],
  head: {
    title: 'My App',
    meta: [{ name: 'description', content: '...' }],
    links: [{ rel: 'icon', href: '/favicon.ico' }],
  },
  container: '#app',              // default '#app' — where the app renders in the body
  streaming: false,               // true for streaming SSR (uses renderToStream internally)
})
```

**Note:** `renderToHTML()` wraps the existing `renderPage()` with a simpler API. `renderPage()` and `renderToStream()` remain available for advanced use cases.

### Shared Config Type

```tsx
interface AppConfig {
  theme?: ThemeDefinition
  styles?: string[]
}

// Used by both mount() and renderToHTML()
```

---

## mount() Behavior

### 1. Style Injection (runs first)

```
if (options.theme) {
  const { css } = compileTheme(options.theme)  // already exists in @vertz/ui
  injectCSS(css)                                // already exists, deduplicates
}

for (const css of options.styles ?? []) {
  injectCSS(css)                                // already deduplicates
}
```

Uses existing `compileTheme()` and `injectCSS()` — no new code needed here.

### 2. Root Resolution

```
const root = typeof selector === 'string'
  ? document.querySelector(selector)
  : selector  // also accept HTMLElement directly

if (!root) throw new Error(`mount(): root element "${selector}" not found`)
```

### 3. Hydration Modes

#### `'tolerant'` (default) — Scoped hydration with tolerance

- Only diff inside the root container
- Extra DOM nodes not in the component tree are **ignored** (browser extensions, injected scripts)
- Missing nodes are re-created
- Attribute mismatches on existing nodes are patched silently
- Dev mode: `console.warn` for mismatches (helps debugging real issues)
- Prod mode: silent

```
// Pseudocode
for each child in root:
  if child matches expected vnode:
    patch attributes, recurse into children
  else if child is extra (not in vnode tree):
    skip — leave it alone (browser extension, etc.)
  else if child is missing:
    create and insert
```

#### `'strict'`

- Standard hydration — mismatches throw errors
- For apps that need guaranteed consistency

#### `'replace'`

- Skip hydration entirely
- Clear root, re-render from scratch
- Simplest, no mismatch possible, but loses SSR perf

#### `false`

- No SSR expected — always fresh render
- Equivalent to current demo behavior

### 4. Mount Flow

```
if (root has SSR content AND hydration !== false) {
  // Hydrate
  hydrateRoot(root, App, options)
} else {
  // Fresh mount
  root.textContent = ''  // clear (textContent is faster than innerHTML)
  const app = App()
  root.appendChild(app)
}

// Per-component hydration (if registry provided)
if (options.registry) {
  hydrate(options.registry)  // existing API
}

options.onMount?.(root)
```

### 5. SSR Content Detection

Instead of checking `__SSR_URL__`, mount() checks if the root element has content:

```
const hasSSRContent = root.hasChildNodes() && root.querySelector('[data-v-id]') !== null
```

This is more reliable — checks for actual hydration markers rather than a global flag.

---

## renderToHTML() Behavior

### 1. Setup

```
installDomShim()
globalThis.__SSR_URL__ = options.url
```

### 2. Style Collection

```
const themeCss = options.theme ? compileTheme(options.theme).css : ''
const allStyles = [themeCss, ...options.styles ?? []]
```

### 3. Render

```
// Uses existing renderPage() internally
const html = await renderPage(App, {
  head: {
    ...options.head,
    styles: allStyles,  // injected as <style> tags in <head>
  },
  container: options.container ?? '#app',
})
```

### 4. Cleanup

```
removeDomShim()
delete globalThis.__SSR_URL__
```

---

## Implementation Plan

### Phase 1: `mount()` client-side (no hydration)
**Sub-tasks:**
1. **mount function + types** — create `packages/ui/src/mount.ts`, export from index
2. **style injection integration** — wire compileTheme + injectCSS
3. **root resolution + fresh mount** — querySelector, clear, append
4. **unmount + cleanup** — return handle with unmount()
5. **tests** — mount into jsdom, verify styles injected, verify cleanup

**Estimated:** 3 sub-tasks, ~20 min agent work

### Phase 2: `mount()` with hydration
**Sub-tasks:**
1. **SSR content detection** — check for hydration markers
2. **'replace' mode** — clear and re-render (simplest)
3. **'tolerant' mode** — scoped diff with extra-node tolerance
4. **'strict' mode** — standard hydration
5. **tests** — each mode with simulated SSR content + extra nodes

**Estimated:** 4 sub-tasks, ~40 min agent work

### Phase 3: `renderToHTML()` server-side
**Sub-tasks:**
1. **renderToHTML wrapper** — wrap existing renderPage with simpler API
2. **shared config** — theme + styles compilation
3. **tests** — verify full HTML output with theme, styles, meta

**Estimated:** 2 sub-tasks, ~15 min agent work

### Phase 4: Demo migration
**Sub-tasks:**
1. **entity-todo** — replace manual mount code with mount()
2. **task-manager** — replace manual mount code with mount()
3. **verify** — both apps work identically

**Estimated:** 2 sub-tasks, ~10 min agent work

---

## Migration

### Before (current demo)
```tsx
const isSSR = typeof (globalThis as any).__SSR_URL__ !== 'undefined';

if (!isSSR) {
  function buildThemeCss(theme) { /* 20 lines */ }
  
  const themeStyleEl = document.createElement('style');
  themeStyleEl.textContent = buildThemeCss(todoTheme);
  document.head.appendChild(themeStyleEl);

  const globalStyles = globalCss({ /* ... */ });
  const globalStyleEl = document.createElement('style');
  globalStyleEl.textContent = globalStyles.css;
  document.head.appendChild(globalStyleEl);

  const app = App();
  const root = document.getElementById('app');
  if (root) {
    if (root.hasChildNodes()) root.innerHTML = '';
    root.appendChild(app);
  }
}
```

### After
```tsx
import { mount, globalCss } from '@vertz/ui'
import { App } from './app'
import { todoTheme } from './styles/theme'

const globalStyles = globalCss({ /* ... */ })

mount(App, '#app', {
  theme: todoTheme,
  styles: [globalStyles.css],
})
```

~30 lines → 4 lines.

---

## Review Feedback (Incorporated)

### Critical: Tolerant hydration descoped from v0.1
Both Tech Lead and Devil's Advocate reviews identified that `'tolerant'` hydration requires tree diffing / vdom reconciliation that doesn't exist in our architecture. Our hydration is marker-based (per-component), not tree-based. Building a reconciler is R&D work, not implementation.

**v0.1 ships:** `'replace'` (default) and `false` modes only.
**v0.2 (immediately post-demo):** `'tolerant'` and `'strict'` hydration. This is P0 post-announcement — `'replace'` causes a flash of empty content that's unacceptable for production apps.

### Component signature
App components are `() => HTMLElement`, not `(props, el) => void`. mount() handles both patterns:
- Root app: `const app = App(); root.appendChild(app)`
- Registry components (hydrate): `component(props, el)`

### SSR detection
Use `__SSR_URL__` global as source of truth (set by server), not marker scanning. Markers require compilation and aren't present on static SSR content.

### renderToHTML return type
Returns `Promise<string>` — extracts HTML body from the Response object that `renderPage()` returns.

### Unmount cleanup
Clears root via `textContent = ''`. Does NOT remove shared styles (they're deduped globally via `injectCSS`). Component signal disposal happens automatically when DOM nodes are removed (effects track their DOM).

## Open Questions

1. **Should theme injection use `<style>` or CSS `adoptedStyleSheets`?** `adoptedStyleSheets` is more performant but less compatible. Proposal: `<style>` for v0.1, optimize later.

2. **Should `mount()` own the `<html>` document or just the container?** Proposal: just the container. The full document is `renderToHTML()`'s concern.

---

## DX Review (josh)

> **Status:** Approved with suggestions
> **Reviewer:** josh (DX Advocate)

### Summary

Solid API design that achieves the goal of reducing boilerplate from ~30 lines to ~4. The developer experience is significantly improved.

### Checklist Results

| Item | Status | Notes |
|------|--------|-------|
| `mount()` simple for hello world | ✅ | Only 2 required args (`App`, `#app`). All options optional. |
| Hydration mode names clear | ⚠️ | Clear enough, but consider a quick reference table in docs. |
| Migration compelling | ✅ | 30 → 4 lines is a huge win. |
| LLM can generate correct code | ✅ | Type-safe, sensible defaults. Minimal call `mount(App, '#app')` works. |
| Error messages specified | ⚠️ | Root not found is specified. Add errors for: invalid selector, theme compilation failure. |
| Naming concerns | ✅ | `mount` is good—distinct from `render`, action-oriented. |
| Client/server consistency | ✅ | Shared `AppConfig` type, consistent theme/styles structure. |

### Suggestions

1. **Add error messages section** — Specify errors for:
   - `mount(): root element "${selector}" not found` ✅ (already in doc)
   - Invalid selector (not string or HTMLElement)
   - Theme compilation failure

2. **Add zero-options hello world** — Show `mount(App, '#app')` works without any options to demonstrate true minimal case.

3. **Hydration modes quick ref** — Consider a 1-line-per-mode table in the README:
   ```
   tolerant  — Hydrate, ignore extra DOM (browser extensions)
   strict    — Hydrate, throw on mismatches
   replace   — Skip hydration, re-render fresh
   false     — No SSR expected, always fresh render
   ```

4. **Minor typo** — "doesn't know our internals" appears twice in review criteria above.

### Verdict

**Approved** — Ready to proceed. The suggestions are nice-to-haves, not blockers.
