# Dev Server Architecture

## 1. System Overview

Three execution contexts participate in the dev experience. Bun's internal
dev bundler is opaque -- we interact with it through `build.onLoad` plugins
and by parsing its HTML output. When the plugin filter does not match a file,
Bun uses its native JSX pipeline, which has fundamentally different semantics
(see section 6).

```
 Server process (Bun runtime)                    Browser
 ============================                    =======

 bun-dev-server.ts                               hydration (mount)
 ├── Bun.serve({ routes, fetch })                HMR client (Bun built-in)
 ├── Vertz Bun plugin (build.onLoad)             Error overlay WebSocket
 ├── SSR render (two-pass)                       Fast Refresh runtime
 ├── File watcher (src/)                         Build error loader
 ├── Error channel (WebSocket)                   Reload guard
 └── Source map resolver
                    │
                    ▼
  Bun's internal dev bundler (BLACK BOX)
  ├── /_bun/* routes (compiled client modules)
  ├── HMR WebSocket (module updates, CSS reload)
  ├── Module compilation (JSX, TS, bundling)
  └── Hash-based URLs: /_bun/client/<hash>.js
```

Key boundary: the server discovers the bundled client URL (`/_bun/client/<hash>.js`)
and HMR bootstrap snippet by self-fetching the `/__vertz_hmr` shell route and
parsing the HTML Bun returns. This is the only integration point with Bun's
opaque dev bundler.

## 2. Request Flow

HTTP requests arrive at `Bun.serve()` and are routed through a priority chain.
Routes defined in the `routes` object take precedence; the `fetch` handler
catches everything else.

```
HTTP Request
  │
  ├─ routes (exact match, Bun handles)
  │   ├── /__vertz_hmr ──────────────── HMR shell HTML (initializes Bun's HMR)
  │   ├── /api/openapi.json ─────────── OpenAPI spec (if configured)
  │   └── /api/* ────────────────────── API handler (if configured)
  │
  └─ fetch (fallback handler)
      │
      ├── /__vertz_errors ───────────── WebSocket upgrade → error channel
      │     Browser connects here for build/runtime error reporting.
      │     Messages: { type: 'error' | 'clear' | 'connected' }
      │     Client can send: { type: 'resolve-stack', stack, message }
      │
      ├── /_bun/* ───────────────────── Pass through to Bun's dev bundler
      │     Returns `undefined` so Bun's internal handler serves compiled
      │     client modules, HMR WebSocket, source maps.
      │
      ├── /__vertz_build_check ──────── Build status check
      │     Client loader fetches this when it detects Bun's reload stub.
      │     Returns currentError if available, else runs Bun.build() to
      │     reproduce the error, else falls back to last console.error.
      │
      ├── /__vertz_diagnostics ────── Server health check (JSON)
      │     Returns a snapshot of server state: plugin config, processed
      │     files, SSR reload status, HMR assets, errors, WS clients.
      │
      ├── /api/* ────────────────────── API handler (fallback for non-route match)
      │     Matches paths in skipSSRPaths (default: ['/api/']).
      │
      ├── X-Vertz-Nav: 1 ───────────── Nav pre-fetch (SSE stream)
      │     Client-side navigation triggers query discovery (Pass 1 only).
      │     Streams SSE events as queries resolve. No Pass 2 render.
      │
      ├── static files ─────────────── public/ directory, then project root
      │     Only for non-root, non-HTML paths. Checks public/ first.
      │
      ├── non-HTML requests ─────────── 404 (skip SSR)
      │     Requests without Accept: text/html that don't match above.
      │
      └── SSR render ────────────────── Full two-pass SSR
            Patches globalThis.fetch for API interception during SSR.
            Returns HTML with inline CSS, SSR data, and script tags.
            On error: returns empty shell with client script (CSR fallback).
```

## 3. Plugin Pipeline

The Vertz Bun plugin (`createVertzBunPlugin`) processes `.tsx` files through
`build.onLoad`. Each stage builds on the previous, and order matters.

### Stage 1: Hydration Transform

Adds hydration IDs to JSX elements so the client-side hydration system can
match SSR-rendered DOM nodes to their component counterparts.

Uses `HydrationTransformer` from `@vertz/ui-compiler` operating on a
`MagicString` instance with a ts-morph `SourceFile` for AST access.

### Stage 2: Context Stable IDs (Fast Refresh only)

Injects a `__stableId` argument into `createContext()` calls. The ID format
is `relFilePath::varName` (e.g., `src/contexts/settings.tsx::SettingsContext`).

This ensures that when Bun re-evaluates a module during HMR, `createContext()`
returns the existing context object from the global registry instead of
creating a new one. Without this, `ContextScope` Map keys lose identity
across HMR cycles, breaking `useContext()` lookups.

Only runs when `fastRefresh` is enabled. SSR builds skip this -- the server
does not need HMR-stable context identity.

### Stage 3: Compile (Reactive + JSX Transforms)

The core Vertz compiler pass via `compile()` from `@vertz/ui-compiler`.
Transforms reactive `let` declarations into signals, inserts `.value` unwraps,
and converts JSX to `__element`/`__append`/`__on` calls.

Operates on the hydration-transformed code (not the original source), so
hydration IDs are already present in the AST.

The `target` option controls output: `'dom'` (default) or `'tui'`.

### Stage 4: Source Map Chain

Chains the hydration transform source map with the compile source map using
`@ampproject/remapping`. This produces a single source map that traces from
the final compiled output back to the original source file.

Without chaining, debugger breakpoints and error locations would point to the
hydration-transformed intermediate code instead of the developer's source.

### Stage 5: CSS Extraction

Extracts `css()` and `variants()` calls from the **original** source (not the
compiled output) using `CSSExtractor` from `@vertz/ui-compiler`.

In HMR mode, extracted CSS is written to a sidecar `.css` file at
`.vertz/css/<hash>.css`, and an `import '<path>.css'` line is prepended to the
module output. Bun's built-in CSS HMR detects changes to these files and
hot-swaps stylesheets without a page reload.

The `fileExtractions` map tracks all extractions for production dead CSS
elimination. The `cssSidecarMap` tracks source-to-sidecar mappings for debugging.

### Stage 6: Fast Refresh Wrappers (Fast Refresh only)

Uses `ComponentAnalyzer` from `@vertz/ui-compiler` to detect exported function
components in the source file. For each detected component, generates:

- **Preamble**: accesses the Fast Refresh runtime from `globalThis` (NOT via
  import -- see section on why this matters).
- **Wrapper**: replaces each component function with a version that captures
  disposal scope, context scope, and signal refs, then calls `__$refreshTrack`.
- **Epilogue**: calls `__$refreshReg` (register factory) and `__$refreshPerform`
  (trigger DOM replacement for dirty modules).

The runtime is accessed via `globalThis[Symbol.for('vertz:fast-refresh')]`.
This prevents component modules from importing `@vertz/ui/internals`, which
would add the runtime to the import graph. If it were in the import graph,
editing a component would cause Bun to try updating `@vertz/ui/dist` chunks,
which do not self-accept, triggering a full page reload.

### Stage 7: HMR Accept

Appends `import.meta.hot.accept();` to the module. This tells Bun's HMR system
that the module handles its own updates (self-accepting). Without this, Bun
propagates the update up the import graph until it reaches a module that accepts,
or the root (causing a full page reload).

The call MUST be written directly -- Bun statically analyzes for this exact
pattern. Optional chaining (`import.meta.hot?.accept()`) or variable indirection
breaks detection.

### Stage 8: Assembly

Concatenates all pieces into the final module output:

1. CSS import line (if CSS was extracted)
2. Fast Refresh preamble (if FR enabled and components detected)
3. Compiled code (from stage 3)
4. Fast Refresh epilogue (wrappers + perform call)
5. `import.meta.hot.accept()` (if HMR enabled)
6. Inline base64 source map (from stage 4)

Returns `{ contents, loader: 'tsx' }` so Bun processes the output as TSX
(allowing any remaining TS syntax to be stripped).

### SSR vs Client Mode

The plugin is instantiated twice:

| Setting                    | Server (SSR) | Client (HMR)                  |
| -------------------------- | ------------ | ----------------------------- |
| `hmr`                      | `false`      | `true` (default)              |
| `fastRefresh`              | `false`      | `true` (default, follows hmr) |
| Context stable IDs         | skipped      | injected                      |
| FR wrappers                | skipped      | injected                      |
| `import.meta.hot.accept()` | skipped      | appended                      |
| CSS sidecar files          | not written  | written to `.vertz/css/`      |

### Critical: Filter Matching Behavior

The plugin filter defaults to `/\.tsx$/`. Bun matches this regex against the
**full module specifier**, including query strings. When the server reloads the
SSR module with a cache-bust (`import('./src/app.tsx?t=1709...')`), the query
string `?t=...` causes the specifier to be `./src/app.tsx?t=1709...`, which
does NOT match `/\.tsx$/`.

This is why SSR module reload uses a `.ts` wrapper file -- the wrapper's import
of the actual `.tsx` entry goes through Bun's normal resolution (no query
string), matching the plugin filter correctly.

## 4. SSR Render Pipeline (Two-Pass)

`ssrRenderToString()` performs server-side rendering with query pre-fetching.
All renders are serialized through a mutex (`renderLock`) because the SSR
pipeline depends on global mutable state.

```
ssrRenderToString(module, url)
  │
  ├── withRenderLock()              Serialize concurrent renders
  │
  ├── ssrStorage.run(store)         AsyncLocalStorage for per-request state
  │
  ├── Setup globals
  │   ├── __SSR_URL__ = url         Router reads this for initial route
  │   ├── installDomShim()          Fake document/window for DOM operations
  │   ├── __VERTZ_CLEAR_QUERY_CACHE__()   Prevent stale cache hits
  │   └── __VERTZ_SSR_SYNC_ROUTER__(url)  Sync module-level routers
  │
  ├── Pass 1: Discovery
  │   ├── createApp()               Run the app factory
  │   │   └── query() calls register SSR queries in ssrStorage
  │   ├── Await queries             Promise.allSettled with per-query timeouts
  │   │   ├── Resolved → resolve(data), push to resolvedQueries
  │   │   └── Timeout → skip (client will fetch)
  │   └── Clear query store         Prevent double-registration in Pass 2
  │
  ├── Pass 2: Render
  │   ├── createApp()               Run again with pre-fetched data available
  │   ├── toVNode(app)              Convert DOM tree to virtual nodes
  │   ├── renderToStream(vnode)     Stream-render to HTML string
  │   └── collectCSS(theme, module) Gather theme + global + component CSS
  │
  ├── Serialize SSR data
  │   └── resolvedQueries → JSON for window.__VERTZ_SSR_DATA__
  │
  └── Cleanup (finally)
      ├── clearGlobalSSRTimeout()
      ├── removeDomShim()
      └── delete __SSR_URL__
```

### Global State Dependencies

The following globals must be set before rendering and cleaned up after:

| Global                        | Purpose                                             |
| ----------------------------- | --------------------------------------------------- |
| `__SSR_URL__`                 | Current request URL for router matching             |
| `document` / `window`         | DOM shim for component createElement calls          |
| `__VERTZ_CLEAR_QUERY_CACHE__` | Clears stale query cache from previous renders      |
| `__VERTZ_SSR_SYNC_ROUTER__`   | Syncs routers created at import time to current URL |

These globals cannot be isolated per-request, which is why the render lock
exists. Concurrent SSR requests race on this state.

### CSS Collection

CSS is collected from three sources (deduplicated):

1. **Theme CSS** -- compiled from `module.theme` via `compileTheme()`
2. **Global styles** -- `module.styles` array (resets, body styles)
3. **Component CSS** -- from `module.getInjectedCSS()` (bundled `@vertz/ui`
   instance) or fallback from DOM shim's `document.head` style elements

## 5. File Watcher Flow

A `fs.watch` on `src/` (recursive) detects file changes and triggers a
multi-step refresh pipeline with 100ms debounce.

```
File saved
  │
  ├── Debounce (100ms)              Coalesce rapid saves
  │
  ├── Track: lastChangedFile        For runtime error context
  ├── Reset: lastBroadcastedError   Allow re-broadcast on next error
  ├── Invalidate source map cache   Bundle hashes change on every edit
  │
  ├── Re-discover HMR assets        Self-fetch /__vertz_hmr, parse new hash
  │
  ├── Proactive build check         Bun.build() with throw: false
  │   ├── Build failed → broadcastError('build', errors)
  │   └── Build succeeded:
  │       ├── Poll for hash update   Up to 5 retries, 200ms apart
  │       │   Bun's dev bundler may not have updated its hash yet.
  │       │   Re-discover HMR assets until hash changes or timeout.
  │       └── clearErrorForFileChange()  No grace period
  │
  ├── Clear require.cache           All keys starting with srcDir or entryPath
  │                                 Forces full dependency tree re-evaluation
  │
  └── Re-import SSR module          import(`${entryPath}?t=${Date.now()}`)
      ├── Success → ssrMod = freshMod
      └── Failure (stale cache race):
          ├── Wait 500ms            Let Bun's module graph settle
          ├── Clear require.cache again
          ├── Retry import
          ├── Success → ssrMod = freshMod
          └── Failure → broadcastError('ssr', error)
                        Keep using old module (last known good)
```

### Why require.cache clearing is needed

`import()` with a `?t=...` query string only busts the cache for the entry
module itself. Transitive dependencies (e.g., `mock-data.ts` imported by
`app.tsx`) remain cached. Clearing `require.cache` for all project source
files forces the entire dependency tree to be re-evaluated.

### Why the retry exists

There is a race condition between the file watcher (which fires immediately on
disk write) and Bun's internal dev bundler (which recompiles asynchronously).
The first `import()` may execute before Bun has finished recompiling, loading
stale bytecode. The 500ms delay gives Bun time to complete recompilation.

## 6. Native JSX vs Compiled JSX

This is one of the most important architectural boundaries to understand.

Bun's native JSX pipeline and Vertz's compiled JSX have fundamentally different
semantics for children:

```
// Source code:
<Provider value={ctx}>
  <App />
</Provider>

// Vertz compiled (plugin matched):
Provider({ value: ctx, children: () => App() })
//                      ^^^^^^^^
//                      Children are THUNKS (lazy, called inside Provider)

// Bun native (plugin did NOT match):
Provider({ value: ctx, children: App() })
//                                ^^^^
//                      Children are EAGERLY EVALUATED (called before Provider)
```

### Why this matters

The Vertz compiler wraps children in `() => ...` thunks so that they execute
**inside** the parent component's scope. This is critical for:

- **Context**: `useContext()` reads from a synchronous call stack. If children
  execute before `Provider` pushes its value onto the stack, `useContext()`
  finds nothing.
- **Reactivity**: getter-based reactive props rely on the child executing
  inside the parent's reactive scope.

When Bun's native pipeline processes a `.tsx` file (because the plugin filter
did not match), children are evaluated eagerly. `<App />` becomes `App()`,
which runs before `Provider()` receives its arguments.

### When does native JSX run?

The plugin filter is `/\.tsx$/`. Files that do not match include:

- `.ts` files (no JSX)
- `.tsx` files loaded with query strings (`?t=...`) -- the full specifier
  includes the query, breaking the regex match
- Files outside the plugin scope

The SSR module reload works around this by using a `.ts` wrapper that imports
the `.tsx` entry without a query string.

## 7. Context System (Provider/useContext)

### Stack-Based Synchronous Dispatch

Context uses a synchronous call-stack model. Each `Context` object holds a
`_stack` array. `Provider` pushes a value, runs children, then pops:

```
Provider(value, fn):
  ctx._stack.push(value)
  currentScope = new Map(parentScope)
  currentScope.set(ctx, value)
  try { fn() }            // children execute here, useContext sees the value
  finally { ctx._stack.pop() }

useContext(ctx):
  if (ctx._stack.length > 0)   → return top of stack (synchronous path)
  if (currentScope?.has(ctx))   → return from scope (async path)
  return ctx._default           → fallback
```

### Global Registry (HMR Stability)

`createContext()` accepts an optional `__stableId` parameter (injected by the
compiler, see plugin stage 2). When provided, the context object is stored in
a `globalThis` Map (`__VERTZ_CTX_REG__`).

On HMR re-evaluation, `createContext()` with the same ID returns the existing
object. This preserves object identity for `ContextScope` Map keys. Without
this, a re-evaluated module would create a new context object, and
`useContext()` would fail to find values stored under the old key.

### Signal Auto-Wrap via Getters

`Provider` calls `wrapSignalProps(value)` before pushing. This duck-type checks
each property for `.peek` (signal-like), and wraps matching properties in
getters:

```ts
// Input:  { theme: Signal<'light'>, setTheme: Function }
// Output: { get theme() { return signal.value }, setTheme: Function }
```

Consumers write `settings.theme` and the getter auto-unwraps the signal. This
hides the signal abstraction from context consumers.

### Scope Capture for Async Calls

`currentScope` is a `ContextScope` (Map) that tracks all active context values.
When `Provider` runs, it creates a new scope inheriting from the parent. The
reactive system captures this scope so that `useContext()` works inside async
callbacks (`watch`, `effect`) where the synchronous call stack is gone.

`getContextScope()` and `setContextScope()` allow the disposal/effect system
to save and restore context across async boundaries.

## 8. Key Footguns

### 1. Query string breaks plugin filter

**Symptom:** SSR module reload produces native JSX instead of compiled JSX.
Provider/useContext stops working. Context values are `undefined`.

**Root cause:** `import('./src/app.tsx?t=123')` produces the specifier
`./src/app.tsx?t=123`. The plugin filter `/\.tsx$/` does not match because
the string ends with `?t=123`, not `.tsx`.

**Fix:** Use a `.ts` wrapper file for SSR module reload that imports the
`.tsx` entry without a query string. The wrapper gets the cache-bust; the
actual `.tsx` goes through normal resolution.

### 2. Fast Refresh runtime must NOT be imported by component modules

**Symptom:** Every file save causes a full page reload instead of component-
level HMR.

**Root cause:** If component modules `import` from the Fast Refresh runtime
(or `@vertz/ui/internals`), that module appears in Bun's import graph. When
a component file changes, Bun propagates the HMR update through the graph.
`@vertz/ui/dist` chunks do not self-accept, so the update propagates to the
root HTML, triggering a full reload.

**Fix:** The runtime exposes its API via `globalThis[Symbol.for('vertz:fast-refresh')]`.
Component modules access it through `const __$fr = globalThis[Symbol.for(...)]`
-- zero import dependencies.

### 3. Context identity lost on HMR without stable IDs

**Symptom:** After HMR update, `useContext()` returns `undefined` even though
`Provider` is active.

**Root cause:** Bundle re-evaluation creates a new `createContext()` object.
The old scope Map still has the old object as key. The new `useContext()` looks
up with the new object -- key mismatch.

**Fix:** The compiler injects `__stableId` into `createContext()` calls. The
global registry (`__VERTZ_CTX_REG__`) returns the same object across
re-evaluations, preserving Map key identity.

### 4. Eager children with native JSX breaks Provider

**Symptom:** `useContext()` returns `undefined` inside components rendered as
children of a `Provider`.

**Root cause:** The file was processed by Bun's native JSX pipeline instead
of the Vertz compiler. Native JSX evaluates children eagerly -- `App()` runs
before `Provider()` pushes its value onto the context stack.

**Fix:** Ensure the file matches the plugin filter (`/\.tsx$/`). Check that no
query strings are appended to the import specifier.

### 5. Stale SSR module after file change

**Symptom:** SSR output shows old content after saving a file.

**Root cause:** Race between file watcher and Bun's recompilation. The
`import()` call executes before Bun has finished recompiling, loading stale
bytecode from the module cache.

**Fix:** The file watcher already has retry logic (500ms delay + second
attempt). If the issue persists, the old module is kept as fallback and the
error is broadcast via WebSocket.

### 6. Concurrent SSR renders corrupt global state

**Symptom:** SSR responses contain wrong route content, mixed CSS, or crash
with "Cannot read property of null".

**Root cause:** The SSR pipeline depends on global mutable state (`document`,
`window`, `__SSR_URL__`, injected CSS set). Two concurrent renders race on
this state.

**Fix:** All SSR renders go through `withRenderLock()`, a promise-based mutex
that serializes execution. Only one render runs at a time.

### 7. Bun's reload stub causes infinite page reload

**Symptom:** Browser reloads in a tight loop. DevTools shows the JS bundle
contains `try{location.reload()}catch(_){}`.

**Root cause:** Bun's dev server serves a reload stub when client modules
fail to compile. The stub executes immediately, reloading the page, which
fetches the same stub.

**Fix:** Three layers of defense:

1. **Build error loader**: fetches the bundle URL before executing it. If the
   response is the reload stub, shows an error overlay instead of loading.
2. **Reload guard script**: tracks rapid reloads via sessionStorage. After 10
   reloads in < 100ms intervals, calls `window.stop()` and shows a fallback.
3. **location.reload override**: when an error overlay is active, `location.reload`
   is replaced with a no-op that sets `_needsReload`. The controlled reload
   only fires after the server confirms the fix (WS clear message).

### 8. Signal count change during HMR resets state

**Symptom:** After an HMR update, component state resets to initial values.
Console shows: `[vertz-hmr] Signal count changed in <Name> (N -> M). State reset.`

**Root cause:** Fast Refresh preserves signal state by position (like React
preserves hook state by call order). If the developer adds or removes a `let`
declaration (which becomes a signal), the position mapping breaks.

**Fix:** This is by design. When signal count changes, state cannot be safely
mapped, so it resets. The warning is intentional. If state preservation is
critical, avoid reordering `let` declarations.
