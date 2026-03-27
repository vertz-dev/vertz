---
'@vertz/ui-server': patch
'@vertz/ui-compiler': patch
'@vertz/cli': patch
---

fix(ui-server, ui-compiler): AOT SSR pipeline composes App layout shell, portable holes, barrel extraction, CSS inlining, and CSS tree-shaking

Five AOT SSR fixes:

1. **App layout composition (#1977)**: The AOT pipeline now wraps page content in the root App layout (header, nav, footer). The build pipeline detects the App component by its RouterView hole, includes it in the AOT manifest, and the runtime pipeline renders the App shell around each page. Gracefully degrades if app render fails.

2. **Portable hole references (#1981)**: The AOT compiler now emits `ctx.holes.ComponentName()` for imported components instead of `__ssr_ComponentName()`. The `__ssr_` prefix is a Bun-internal convention that breaks on non-Bun bundlers (esbuild/workerd). Local components in the same file still use direct `__ssr_*` calls for efficiency.

3. **Side-effect-free barrel (#1982)**: The AOT barrel generation now extracts only the `__ssr_*` function declarations from compiled code, excluding original imports and module-level side effects (createRouter, themeGlobals, etc.). This eliminates ~16MB bundle bloat when bundled with esbuild for workerd.

4. **CSS class name inlining (#1985)**: The AOT compiler now inlines `css()` class names as literal strings in `__ssr_*` functions. Previously, the barrel extraction stripped module-level `const s = css({...})` declarations but functions still referenced `s.root` etc., causing ReferenceError. Now the compiler computes deterministic class names at compile time (same DJB2 hash as the CSS extractor) and replaces references inline.

5. **CSS tree-shaking by HTML usage (#1979)**: SSR responses no longer include ~74KB of unused theme component CSS. `configureTheme()` eagerly compiles all ~40 component styles at import time (outside any SSR context), which previously caused `collectCSS()` to fall back to `getInjectedCSS()` and include everything. Now, when the per-request `cssTracker` is empty, the fallback CSS is filtered by matching class selectors against the rendered HTML — only CSS whose classes actually appear in the page output is included.
