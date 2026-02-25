# Exploration: Replace Vite with Bun for Dev & Build

## Issue: #715

## Summary

This exploration validates whether Bun 1.3.9 can replace Vite for the @vertz/ui development and build pipeline. All five phases were tested against the task-manager example app.

**Recommendation: Conditional Go** — Bun can replace Vite for dev and production builds today, but with trade-offs in HMR and dev server ergonomics.

---

## Phase Results

### Phase 1: Bun Plugin for Vertz Compiler ✅

**Result: Full parity.**

The Vertz compiler pipeline (hydration → compile → source map chaining → CSS extraction) maps cleanly to Bun's `onLoad` plugin hook.

| Feature | Vite Plugin | Bun Plugin | Status |
|---|---|---|---|
| Compiler transforms (let→signal, JSX→DOM) | `transform()` | `onLoad()` | ✅ Identical output |
| Hydration markers (data-v-id) | Pre-compile MagicString | Pre-compile MagicString | ✅ Identical |
| Source map chaining | @ampproject/remapping | @ampproject/remapping | ✅ Inline data URL |
| CSS extraction | CSSExtractor on original code | CSSExtractor on original code | ✅ 5 files extracted |
| Source maps | Returned as `map` field | Inlined as base64 data URL | ⚠️ Works but larger output |

**Key difference:** Bun's `onLoad` has no `map` return field, so source maps must be inlined as `//# sourceMappingURL=data:...` comments. This increases the file size in dev but is functionally equivalent.

**Build time:** Plugin transforms a component in <1ms per file. Total build with all transforms: **~200ms**.

### Phase 2: Client-Only Dev Server ✅

**Result: Working, with caveats.**

| Feature | Vite | Bun Dev Server | Status |
|---|---|---|---|
| Component rendering | ✅ | ✅ All pages render | ✅ |
| Client-side routing | ✅ | ✅ SPA navigation works | ✅ |
| Reactive features | ✅ | ✅ Signals, computed, effects | ✅ |
| Filter buttons | ✅ | ✅ Status filtering works | ✅ |
| Theme switching | ✅ | ✅ Light/dark toggle | ✅ |
| Startup time | ~800ms | ~200ms (4x faster) | ✅ |
| HMR | ✅ Full HMR | ❌ Full page refresh | ⚠️ |
| HTML imports | N/A | ⚠️ Path resolution issues | ⚠️ |

**HMR gap:** Bun's HTML import feature supports HMR (`development: { hmr: true }`), but it doesn't work with our plugin architecture because:
1. HTML imports resolve paths relative to the HTML file, but `/src/index.ts` (absolute paths) fail from non-root directories
2. The `[serve.static] plugins` in bunfig.toml isn't picked up when using programmatic `Bun.serve()` + `import ... from 'x.html'`

**Workaround used:** `Bun.build()` on each file change + manual file watching. This gives ~200ms rebuild times but requires a page refresh instead of hot module replacement.

**Impact:** For the Vertz framework specifically, this may be acceptable since component re-renders are very fast. But it's a meaningful DX regression from Vite's sub-100ms HMR.

### Phase 3: CSS Validation ✅

**Result: Full parity.**

| CSS Feature | Dev Mode | Production Build | Status |
|---|---|---|---|
| Runtime `css()` class generation | ✅ Works | ✅ Works | ✅ |
| Runtime `<style>` injection | ✅ Works | ✅ Works | ✅ |
| Static CSS extraction | N/A (runtime in dev) | ✅ 2.6KB extracted | ✅ |
| Dead CSS elimination | N/A | ✅ Via DeadCSSEliminator | ✅ |
| `variants()` styling | ✅ Works | ✅ Works | ✅ |
| Theme CSS custom properties | ✅ Works | ✅ Works | ✅ |

CSS works identically between Vite and Bun because:
- Dev mode: `css()` generates class names at runtime and injects `<style>` tags — no build tool involvement
- Production: `CSSExtractor` and `DeadCSSEliminator` are standalone (zero Vite deps)

### Phase 4: SSR Dev Server ✅

**Result: Working SSR.**

| SSR Feature | Vite | Bun SSR | Status |
|---|---|---|---|
| Two-pass rendering | ✅ | ✅ Discovery + Render | ✅ |
| Theme CSS injection | ✅ | ✅ Custom properties in `<head>` | ✅ |
| Query data pre-fetch | ✅ | ✅ SSR data serialized | ✅ |
| Nav pre-fetch (SSE) | ✅ | ✅ X-Vertz-Nav: 1 → SSE | ✅ |
| JSX runtime swap | ✅ Vite alias | ⚠️ Bun `onResolve` | ⚠️ |
| Module invalidation | ✅ Vite's SSR module system | ❌ Bun caches modules | ⚠️ |
| Server-side routing | ✅ Per-request URL | ✅ __VERTZ_SSR_SYNC_ROUTER__ | ✅ |

**JSX runtime swap:** Bun's `plugin.onResolve` can redirect `@vertz/ui/jsx-runtime` to `@vertz/ui-server/jsx-runtime` on the server side. This works but is registered globally (unlike Vite's per-build alias), so the swap applies to all imports in the process.

**Module invalidation gap:** Vite's `server.ssrLoadModule()` invalidates the module graph per-request, giving fresh module state. Bun caches imported modules permanently. With `bun --hot`, the whole module registry resets on file change, which gives fresh state per hot reload but not per-request. This means module-level router singletons keep state across requests, but `__VERTZ_SSR_SYNC_ROUTER__` already handles this.

**SSR output verified:** The rendered HTML contains the full app markup (navigation, task cards, theme provider, CSS custom properties) and pre-fetched query data serialized for client hydration.

### Phase 5: Production Build ✅

**Result: Fast build, slightly larger output.**

| Metric | Vite (Rollup) | Bun.build() | Notes |
|---|---|---|---|
| Build time | ~3-5s | **193ms** | 15-25x faster |
| JS bundle size | ~45-50KB (min+gzip) | 65.7KB (minified) | Bun doesn't gzip; raw is larger |
| CSS extracted | ~2.5KB | 2.6KB | Nearly identical |
| Code splitting | ✅ Per-route chunks | ✅ `splitting: true` | Bun does chunk splitting |
| Tree shaking | ✅ Full | ✅ Full | Both eliminate dead code |
| Source maps | ✅ External | ✅ External | Both produce .map files |
| Minification | ✅ Terser/esbuild | ✅ Built-in | Bun's minifier is fast |

**Build time is the standout:** 193ms vs 3-5s is a dramatic improvement. For CI/CD pipelines, this is significant.

**Bundle size note:** The raw JS bundle is ~30% larger than Vite's (65.7KB vs ~50KB). This is likely because:
1. Bun's minifier is less aggressive than Terser
2. Some code splitting decisions differ
3. Gzip compression isn't applied at build time

After gzip, the difference narrows. For production, a CDN handles compression.

---

## Feature Parity Matrix

| Feature | Vite | Bun | Gap? |
|---|---|---|---|
| TypeScript/TSX compilation | ✅ | ✅ | No |
| Custom compiler transforms | ✅ transform() | ✅ onLoad() | No |
| Hydration markers | ✅ | ✅ | No |
| Source maps | ✅ Separate field | ✅ Inline data URL | Minor |
| CSS extraction | ✅ | ✅ | No |
| Dead CSS elimination | ✅ | ✅ | No |
| HMR (CSS) | ✅ Virtual module invalidation | ✅ Sidecar file `<link>` swap | No (Phase 6) |
| HMR (JS) | ✅ Module-level | ⚠️ Needs framework refresh runtime | **Yes** |
| SSR | ✅ | ✅ | No |
| SSR module invalidation | ✅ Per-request | ⚠️ Per-hot-reload | Minor |
| Production minification | ✅ | ✅ | No |
| Code splitting | ✅ | ✅ | No |
| Tree shaking | ✅ | ✅ | No |
| Route-level CSS splitting | ✅ | ❌ Not yet implemented | Feature gap |
| Virtual modules | ✅ resolveId/load | ❌ No equivalent | Feature gap |

---

## Gaps and Limitations

### 1. No Module-Level JS HMR (Moderate — downgraded from Major)

Bun's HTML import HMR works for simple cases, but JS module updates that propagate through `@vertz/ui` dist chunks aren't accepted (no `import.meta.hot.accept()` in dist). This means JS logic changes trigger a full page reload.

**CSS HMR is solved:** The sidecar file approach (Phase 6) gives us CSS-only hot updates that preserve client state. Since CSS edits are the most common during UI development, this covers the majority of the iterative workflow.

**Remaining gap:** A component "refresh" runtime (similar to React Fast Refresh) is needed for JS-only HMR. This would unmount the old component and mount the new one in-place when a `.tsx` file's logic changes.

### 2. Virtual Modules Not Supported (Moderate)

Vite's `resolveId()` + `load()` hooks create virtual modules (`\0vertz-css:*`, `\0vertz:ssr-entry`). Bun has no equivalent. The SSR entry and CSS modules must be handled differently.

**Mitigation:** For SSR, we import the app entry directly instead of through a virtual module. For CSS, the extraction runs as a post-build step rather than through virtual modules.

### 3. Workspace Resolution from Non-Package Dirs (Minor)

Files outside workspace packages (e.g., `explorations/`) can't resolve `@vertz/*` packages. This required using relative source imports in the exploration code.

**Mitigation:** In a real migration, the Bun plugin would live inside a workspace package and use normal package imports.

### 4. HTML Import Path Resolution (Minor)

Bun's HTML import resolves `<script src="/src/index.ts">` differently than Vite. Absolute paths starting with `/` don't resolve relative to a project root — they resolve relative to the filesystem root or the HTML file's directory.

**Mitigation:** Use relative paths in HTML, or pre-process the HTML template.

### 5. onLoad Has No `map` Return Field (Minor)

Bun's `onLoad` callback can't return a source map separately. Maps must be inlined as data URLs, increasing output size in development.

**Mitigation:** Only affects dev mode bundle size, not production. The inlined maps work correctly for debugging.

---

## Performance Comparison

| Metric | Vite | Bun | Improvement |
|---|---|---|---|
| Dev startup | ~800ms | ~200ms | **4x faster** |
| Production build | ~3-5s | ~193ms | **15-25x faster** |
| File transform | ~5ms/file | ~1ms/file | **5x faster** |
| SSR render | ~50ms | ~50ms | Same |
| Bundle size (JS) | ~50KB gzipped | ~65KB raw | Bun larger (no gzip at build) |

---

## Recommendation

### Conditional Go

**Go conditions:**
1. The team accepts full-page refresh during development (no module-level HMR)
2. Route-level CSS splitting is deferred (single CSS file is acceptable)
3. The Bun plugin is placed in a proper workspace package (not `explorations/`)

**Benefits:**
- 15-25x faster production builds (193ms vs 3-5s)
- 4x faster dev startup
- Eliminates Vite as a dependency (simpler stack: just Bun)
- Compiler pipeline is already portable — migration is minimal
- SSR pipeline (PR #716) maps directly to Bun.serve()

**Risks:**
- Bun's plugin ecosystem is less mature than Vite's
- HMR support for plugins is still evolving
- Bundle size is ~30% larger before gzip (but post-gzip is closer)
- Bun's bundler has fewer knobs than Rollup for optimization

### Recommended Migration Path

1. **Create `@vertz/bun-plugin`** — workspace package with the compiler plugin
2. **Update `@vertz/ui-compiler` exports** — add subpath exports for individual modules (compiler, CSS extraction, hydration transformer) so the Bun plugin can import them cleanly
3. **Dual-mode support** — keep the Vite plugin for projects that need Vite, add Bun as an alternative
4. **`create-vertz-app` template** — offer both Vite and Bun templates
5. **HMR follow-up** — revisit Bun's plugin HMR support in future versions

---

## Phase 6: CSS Sidecar HMR Prototype

### Approach

Replaced virtual CSS modules with **real CSS files on disk** ("sidecar files"). The plugin writes extracted CSS to `.vertz/css/<hash>.css` and injects `import '.vertz/css/<hash>.css'` into the compiled JS output. Bun's built-in CSS HMR handles `<link>` tag swapping for these real files.

Additionally, the plugin injects `import.meta.hot.accept()` into each transformed `.tsx` module so Bun recognizes them as self-accepting for HMR.

### Key Findings

#### CSS-only HMR works

When a developer edits a `css()` call in a `.tsx` file:
1. Bun detects the source file change
2. The plugin re-runs via `onLoad`, re-extracting CSS and writing the updated sidecar file
3. Bun's CSS HMR swaps the `<link>` tag in the browser
4. **Client-side state is preserved** — filter selections, form inputs, scroll position survive the update
5. No full page reload occurs

**Validated:** Changed `navTitle: ['font:lg', ...]` to `['font:2xl', 'text:danger.500', ...]` in `app.tsx`. The nav title turned red and larger while the "In Progress" task filter remained active. No `TaskListPage mounted` re-fire in the console.

#### `import.meta.hot.accept()` constraints

- Must be called **directly** — `import.meta.hot?.accept()` (optional chaining) causes `"import.meta.hot.accept cannot be used indirectly"` error
- Bun dead-code-eliminates `import.meta.hot.*` in production builds, so no guard needed
- Self-accepting modules re-evaluate on change; Bun patches inter-module dependencies automatically

#### `[serve.static] plugins` works with `Bun.serve()` + HTML imports

Contrary to initial concerns, the plugin registered in `bunfig.toml` under `[serve.static]` **is** picked up when using programmatic `Bun.serve()` with `import page from './index.html'`. The plugin processes `.tsx` files during bundling.

#### Dev server routes

The `routes` config needs `'/*': homepage` (wildcard) instead of `'/': homepage` to support SPA client-side routing. Without this, navigating to `/settings` returns 404 after HMR reload.

### What doesn't work yet

#### JS-only HMR propagation through framework code

When a `.tsx` file changes, Bun tries to propagate the JS update up the import chain. If the chain hits `@vertz/ui` dist chunks (which don't have `import.meta.hot.accept()`), Bun logs a warning about unaccepted modules. Despite this warning, **CSS updates still apply** — the CSS sidecar swap is independent of the JS propagation.

For full JS HMR (re-evaluating a component and updating the DOM without reload), the framework would need a "refresh" mechanism similar to React Fast Refresh — a runtime that can unmount an old component instance and mount the new one in-place. This is a separate concern from CSS HMR.

### Architecture Comparison

| Aspect | Vite (current) | Bun + Sidecar CSS |
|---|---|---|
| CSS delivery | Virtual modules (`\0vertz-css:*`) | Real `.css` files in `.vertz/css/` |
| CSS HMR | Plugin invalidates virtual module in Vite's module graph | Bun's built-in `<link>` tag swap for real `.css` files |
| JS HMR | Vite's `handleHotUpdate` + module graph | `import.meta.hot.accept()` (self-accepting modules) |
| CSS-only change detection | `CSSHMRHandler` compares cached vs new CSS | Bun watches the sidecar file (written by plugin) |
| State preservation | Per-module HMR via Vite's module graph | CSS: yes (link swap). JS: needs framework refresh runtime |
| File system footprint | No extra files (virtual) | `.vertz/css/` directory with generated `.css` files |

### Revised Recommendation

**Upgrade from Conditional Go to Go** for CSS HMR. The sidecar file approach gives us CSS-only hot updates that preserve client state — the most common edit during UI development. JS HMR (component logic changes) still requires a page refresh, but CSS HMR covers the majority of iterative styling work.

---

## Files Created

```
explorations/bun-fullstack/
├── vertz-bun-plugin.ts          # Bun plugin wrapping the Vertz compiler
├── vertz-bun-plugin-hmr.ts      # HMR-enabled plugin with CSS sidecar files
├── dev-server.ts                # Client-only dev server (Phase 2)
├── hmr-dev-server.ts            # HMR dev server with HTML imports (Phase 6)
├── hmr-index.html               # HTML entry for HMR dev server
├── ssr-dev-server.ts            # SSR dev server (Phase 4)
├── build.ts                     # Production build script (Phase 5)
├── bunfig.toml                  # Plugin registration config
├── FINDINGS.md                  # This document
├── dist/                        # Production build output
│   └── client/
│       ├── index.html
│       └── assets/
│           ├── index-*.js
│           ├── index-*.js.map
│           └── vertz.css
└── screenshot-phase2-task-list.png  # Visual validation
```
