# @vertz/cli

## 0.2.51

### Patch Changes

- Updated dependencies []:
  - @vertz/codegen@0.2.51
  - @vertz/compiler@0.2.51
  - @vertz/create-vertz-app@0.2.51
  - @vertz/db@0.2.51
  - @vertz/errors@0.2.51
  - @vertz/tui@0.2.51
  - @vertz/ui-server@0.2.51

## 0.2.50

### Patch Changes

- Updated dependencies [[`5ab022d`](https://github.com/vertz-dev/vertz/commit/5ab022d712d2bf297e5ecec9907045b5fe7154ec)]:
  - @vertz/db@0.2.50
  - @vertz/codegen@0.2.50
  - @vertz/compiler@0.2.50
  - @vertz/create-vertz-app@0.2.50
  - @vertz/errors@0.2.50
  - @vertz/tui@0.2.50
  - @vertz/ui-server@0.2.50

## 0.2.49

### Patch Changes

- Updated dependencies [[`3eacdf7`](https://github.com/vertz-dev/vertz/commit/3eacdf7281ef3bace92abf0d3eddd06f8cbbf32a)]:
  - @vertz/db@0.2.49
  - @vertz/codegen@0.2.49
  - @vertz/compiler@0.2.49
  - @vertz/create-vertz-app@0.2.49
  - @vertz/errors@0.2.49
  - @vertz/tui@0.2.49
  - @vertz/ui-server@0.2.49

## 0.2.48

### Patch Changes

- Updated dependencies [[`9fd72d7`](https://github.com/vertz-dev/vertz/commit/9fd72d7b11e0d4890556d89ef29d1a6e050619b1), [`5d23ced`](https://github.com/vertz-dev/vertz/commit/5d23ced8c21e9cd6a3224e8baea78fedd86d1e1b)]:
  - @vertz/db@0.2.48
  - @vertz/codegen@0.2.48
  - @vertz/compiler@0.2.48
  - @vertz/create-vertz-app@0.2.48
  - @vertz/errors@0.2.48
  - @vertz/tui@0.2.48
  - @vertz/ui-server@0.2.48

## 0.2.47

### Patch Changes

- Updated dependencies []:
  - @vertz/codegen@0.2.47
  - @vertz/compiler@0.2.47
  - @vertz/create-vertz-app@0.2.47
  - @vertz/db@0.2.47
  - @vertz/errors@0.2.47
  - @vertz/tui@0.2.47
  - @vertz/ui-server@0.2.47

## 0.2.46

### Patch Changes

- [#2239](https://github.com/vertz-dev/vertz/pull/2239) [`d029bfc`](https://github.com/vertz-dev/vertz/commit/d029bfcef05d9226f6740b5854827904144dc7ba) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(server): allow customizing or removing the `/api/` route prefix (#2131)

  - `createServer({ apiPrefix: '/v1' })` changes all generated routes from `/api/*` to `/v1/*`
  - API-only apps can use `apiPrefix: ''` to mount routes at the root
  - Full-stack apps require a non-empty prefix (enforced at dev server and Cloudflare handler)
  - Auth cookie paths (`Path=`) automatically follow the resolved prefix
  - Cloudflare handler reads `app.apiPrefix` at runtime when not explicitly configured
  - `basePath` option in `@vertz/cloudflare` renamed to `apiPrefix` for consistency

- Updated dependencies [[`d029bfc`](https://github.com/vertz-dev/vertz/commit/d029bfcef05d9226f6740b5854827904144dc7ba)]:
  - @vertz/ui-server@0.2.46
  - @vertz/codegen@0.2.46
  - @vertz/compiler@0.2.46
  - @vertz/create-vertz-app@0.2.46
  - @vertz/db@0.2.46
  - @vertz/errors@0.2.46
  - @vertz/tui@0.2.46

## 0.2.45

### Patch Changes

- Updated dependencies [[`57c5b6f`](https://github.com/vertz-dev/vertz/commit/57c5b6ffe2f79fa374384567ad2e48897dbd5482)]:
  - @vertz/ui-server@0.2.45
  - @vertz/codegen@0.2.45
  - @vertz/compiler@0.2.45
  - @vertz/create-vertz-app@0.2.45
  - @vertz/db@0.2.45
  - @vertz/errors@0.2.45
  - @vertz/tui@0.2.45

## 0.2.44

### Patch Changes

- Updated dependencies []:
  - @vertz/codegen@0.2.44
  - @vertz/compiler@0.2.44
  - @vertz/create-vertz-app@0.2.44
  - @vertz/db@0.2.44
  - @vertz/errors@0.2.44
  - @vertz/tui@0.2.44
  - @vertz/ui-server@0.2.44

## 0.2.43

### Patch Changes

- Updated dependencies [[`d9380cc`](https://github.com/vertz-dev/vertz/commit/d9380cc4b09a98f83df1213b4c380f2984a53579)]:
  - @vertz/ui-server@0.2.43
  - @vertz/codegen@0.2.43
  - @vertz/compiler@0.2.43
  - @vertz/create-vertz-app@0.2.43
  - @vertz/db@0.2.43
  - @vertz/errors@0.2.43
  - @vertz/tui@0.2.43

## 0.2.42

### Patch Changes

- [#2121](https://github.com/vertz-dev/vertz/pull/2121) [`03d361a`](https://github.com/vertz-dev/vertz/commit/03d361a0c21a23776495e3811cdd92226a4454eb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add production deployment pipeline for Cloudflare Workers: `vertz build --target cloudflare`, production constraint enforcement for `vertz start`, and `vertz deploy` command with dry-run support.

- Updated dependencies [[`aca62b0`](https://github.com/vertz-dev/vertz/commit/aca62b09d42330cd81a106b65082b3e17fba7c91), [`1eeec6c`](https://github.com/vertz-dev/vertz/commit/1eeec6c95c0ced4d869995dbdce205c3bde92a25), [`6e3fb13`](https://github.com/vertz-dev/vertz/commit/6e3fb1346d6a0bf5ca2d4a5bb9d5680a85e9ead1)]:
  - @vertz/ui-server@0.2.42
  - @vertz/codegen@0.2.42
  - @vertz/compiler@0.2.42
  - @vertz/create-vertz-app@0.2.42
  - @vertz/db@0.2.42
  - @vertz/errors@0.2.42
  - @vertz/tui@0.2.42

## 0.2.41

### Patch Changes

- Updated dependencies [[`7f837fc`](https://github.com/vertz-dev/vertz/commit/7f837fc10a0acd4ad77bfc4bcaf733700c8a4f8b)]:
  - @vertz/ui-server@0.2.41
  - @vertz/codegen@0.2.41
  - @vertz/compiler@0.2.41
  - @vertz/create-vertz-app@0.2.41
  - @vertz/db@0.2.41
  - @vertz/errors@0.2.41
  - @vertz/tui@0.2.41

## 0.2.40

### Patch Changes

- [#1980](https://github.com/vertz-dev/vertz/pull/1980) [`bee011e`](https://github.com/vertz-dev/vertz/commit/bee011e47661b31152ad3dfc589fd45eda2f3e44) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-server, ui-compiler, ui, theme-shadcn): AOT SSR pipeline composes App layout shell, portable holes, barrel extraction, CSS inlining, and lazy theme CSS

  Five AOT SSR fixes:

  1. **App layout composition (#1977)**: The AOT pipeline now wraps page content in the root App layout (header, nav, footer). The build pipeline detects the App component by its RouterView hole, includes it in the AOT manifest, and the runtime pipeline renders the App shell around each page. Gracefully degrades if app render fails.

  2. **Portable hole references (#1981)**: The AOT compiler now emits `ctx.holes.ComponentName()` for imported components instead of `__ssr_ComponentName()`. The `__ssr_` prefix is a Bun-internal convention that breaks on non-Bun bundlers (esbuild/workerd). Local components in the same file still use direct `__ssr_*` calls for efficiency.

  3. **Side-effect-free barrel (#1982)**: The AOT barrel generation now extracts only the `__ssr_*` function declarations from compiled code, excluding original imports and module-level side effects (createRouter, themeGlobals, etc.). This eliminates ~16MB bundle bloat when bundled with esbuild for workerd.

  4. **CSS class name inlining (#1985)**: The AOT compiler now inlines `css()` class names as literal strings in `__ssr_*` functions. Previously, the barrel extraction stripped module-level `const s = css({...})` declarations but functions still referenced `s.root` etc., causing ReferenceError. Now the compiler computes deterministic class names at compile time (same DJB2 hash as the CSS extractor) and replaces references inline.

  5. **Lazy theme CSS compilation (#1979)**: SSR responses no longer include ~74KB of unused theme component CSS. `configureTheme()` previously compiled all ~40 component styles eagerly via `buildComponents()`. Now each component has its own lazy getter (`lazyComp`/`lazyPrim`) — styles are compiled only when a component is first accessed at render time. `registerTheme()` stores the theme object without accessing `.components`, preserving the per-component lazy getters. As a defense-in-depth fallback, when the per-request `cssTracker` is empty, `collectCSS()` filters the global CSS set by matching class selectors against the rendered HTML.

  6. **Tree-shake unused theme CSS from SSR (#1988)**: `filterCSSByHTML()` now correctly handles standalone `@keyframes` at-rules. Previously, `@keyframes` blocks bypassed the class-selector filter (they don't start with `.`) and were always included — adding ~10KB of dead animation CSS per page. The filter now uses two-pass logic: first pass partitions CSS into class-based rules (filtered by HTML usage), global rules (always kept), and standalone `@keyframes` (deferred); second pass keeps `@keyframes` only if a surviving CSS rule references the animation name.

  7. **AOT CSS extraction for non-Bun bundlers (#1989)**: CSS from `css()` calls is now extracted at AOT compile time and embedded in `aot-manifest.json`. Previously, AOT `__ssr_*` functions used inlined class names (#1985) but the actual CSS rules depended on runtime `css()` side effects. On esbuild/workerd, these side effects are tree-shaken (the `css()` return value is unused) or land in a different module instance's `injectedCSS` Set. Now `compileForSSRAot()` runs `CSSAnalyzer` + `CSSTransformer.extractCSS()` to capture CSS rules at build time. The manifest CSS is used as the primary source in `collectCSSFromModule()`, with `getInjectedCSS()` as a filtered supplement for `variants()`/`keyframes()` CSS that can't be statically extracted.

  8. **Per-route CSS at build time with zero runtime overhead (#1988, #1989)**: CSS filtering moved entirely to build time. `attachPerRouteCss()` scans `__ssr_*` function code for `_[0-9a-f]{8}` class references and embeds only matching CSS rules per route in the manifest. At runtime, `mergeRouteCss()` does a cheap O(n) array concat. The CSS result is cached per route pattern after the first request, eliminating all per-request Set/Array/join allocations that caused GC-induced tail latency spikes under concurrent load.

- Updated dependencies [[`bee011e`](https://github.com/vertz-dev/vertz/commit/bee011e47661b31152ad3dfc589fd45eda2f3e44), [`24977a4`](https://github.com/vertz-dev/vertz/commit/24977a450f9c2206530907909863342325a14bff)]:
  - @vertz/ui-server@0.2.40
  - @vertz/docs@0.1.2
  - @vertz/codegen@0.2.40
  - @vertz/compiler@0.2.40
  - @vertz/create-vertz-app@0.2.40
  - @vertz/db@0.2.40
  - @vertz/errors@0.2.40
  - @vertz/tui@0.2.40

## 0.2.39

### Patch Changes

- [#1954](https://github.com/vertz-dev/vertz/pull/1954) [`d49ca26`](https://github.com/vertz-dev/vertz/commit/d49ca260d25558ee042befbf115757f61fbedd55) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `vertz docs check` command to validate docs site integrity — catches broken sidebar references, broken internal links, and warns about missing frontmatter.

- Updated dependencies [[`d49ca26`](https://github.com/vertz-dev/vertz/commit/d49ca260d25558ee042befbf115757f61fbedd55)]:
  - @vertz/docs@0.1.1
  - @vertz/codegen@0.2.39
  - @vertz/compiler@0.2.39
  - @vertz/create-vertz-app@0.2.39
  - @vertz/db@0.2.39
  - @vertz/errors@0.2.39
  - @vertz/tui@0.2.39
  - @vertz/ui-server@0.2.39

## 0.2.38

### Patch Changes

- [#1937](https://github.com/vertz-dev/vertz/pull/1937) [`3aa67e1`](https://github.com/vertz-dev/vertz/commit/3aa67e1388186a70729c9e71cfeea92060c23e3a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix AOT routes bundle importing react/jsx-dev-runtime instead of Vertz JSX runtime, which caused loadAotManifest() to silently return null and degrade to single-pass SSR

- Updated dependencies [[`93aa341`](https://github.com/vertz-dev/vertz/commit/93aa34166ad4934ec5c7e45fd7d7327e0843d174)]:
  - @vertz/ui-server@0.2.38
  - @vertz/codegen@0.2.38
  - @vertz/compiler@0.2.38
  - @vertz/create-vertz-app@0.2.38
  - @vertz/db@0.2.38
  - @vertz/errors@0.2.38
  - @vertz/tui@0.2.38

## 0.2.37

### Patch Changes

- Updated dependencies []:
  - @vertz/codegen@0.2.37
  - @vertz/compiler@0.2.37
  - @vertz/create-vertz-app@0.2.37
  - @vertz/db@0.2.37
  - @vertz/errors@0.2.37
  - @vertz/tui@0.2.37
  - @vertz/ui-server@0.2.37

## 0.2.36

### Patch Changes

- Updated dependencies [[`0e655d6`](https://github.com/vertz-dev/vertz/commit/0e655d60183badb73103feffbc70c34f6b442e6c), [`ae4859c`](https://github.com/vertz-dev/vertz/commit/ae4859c5b836b083fd563189521ccc6c4be5ffe8)]:
  - @vertz/ui-server@0.2.36
  - @vertz/codegen@0.2.36
  - @vertz/compiler@0.2.36
  - @vertz/create-vertz-app@0.2.36
  - @vertz/db@0.2.36
  - @vertz/errors@0.2.36
  - @vertz/tui@0.2.36

## 0.2.35

### Patch Changes

- [#1882](https://github.com/vertz-dev/vertz/pull/1882) [`bb784d0`](https://github.com/vertz-dev/vertz/commit/bb784d052fe4abf27f5f499923de0a1f20a06c1b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix AOT route extraction to handle dynamic imports, function calls, and bare identifiers alongside existing JSX patterns. Fix AOT bundle failures caused by missing helper imports and query variable scope leaks. Fix AOT route matcher to use exact matching instead of prefix matching, preventing `/` from matching all URLs. Externalize relative imports in AOT bundle step to prevent resolution failures in .aot-tmp. Improve AOT bundle error logging with detailed messages and stack traces.

- Updated dependencies [[`bb784d0`](https://github.com/vertz-dev/vertz/commit/bb784d052fe4abf27f5f499923de0a1f20a06c1b)]:
  - @vertz/ui-server@0.2.35
  - @vertz/codegen@0.2.35
  - @vertz/compiler@0.2.35
  - @vertz/create-vertz-app@0.2.35
  - @vertz/db@0.2.35
  - @vertz/errors@0.2.35
  - @vertz/tui@0.2.35

## 0.2.34

### Patch Changes

- [#1876](https://github.com/vertz-dev/vertz/pull/1876) [`8076db5`](https://github.com/vertz-dev/vertz/commit/8076db590be9a593321d6de4cad6590d41e3c83c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix AOT route extraction to handle dynamic imports, function calls, and bare identifiers alongside existing JSX patterns. Improve AOT bundle error logging with detailed messages and stack traces.

- Updated dependencies []:
  - @vertz/codegen@0.2.34
  - @vertz/compiler@0.2.34
  - @vertz/create-vertz-app@0.2.34
  - @vertz/db@0.2.34
  - @vertz/errors@0.2.34
  - @vertz/tui@0.2.34
  - @vertz/ui-server@0.2.34

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @vertz/codegen@0.2.33
  - @vertz/compiler@0.2.33
  - @vertz/create-vertz-app@0.2.33
  - @vertz/db@0.2.33
  - @vertz/errors@0.2.33
  - @vertz/tui@0.2.33
  - @vertz/ui-server@0.2.33

## 0.2.32

### Patch Changes

- [#1854](https://github.com/vertz-dev/vertz/pull/1854) [`ce47098`](https://github.com/vertz-dev/vertz/commit/ce47098edb664d7a005dbdca881efbe63fb4dda2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Wire AOT SSR pipeline end-to-end: compiler generates standalone `(data, ctx)` render functions for query-using components, build emits `aot-routes.js` + `aot-manifest.json`, and `createSSRHandler()` uses AOT render with data prefetch when manifest is available. Falls back to single-pass SSR for routes without AOT entries.

- Updated dependencies [[`ce47098`](https://github.com/vertz-dev/vertz/commit/ce47098edb664d7a005dbdca881efbe63fb4dda2)]:
  - @vertz/ui-server@0.2.32
  - @vertz/codegen@0.2.32
  - @vertz/compiler@0.2.32
  - @vertz/create-vertz-app@0.2.32
  - @vertz/db@0.2.32
  - @vertz/errors@0.2.32
  - @vertz/tui@0.2.32

## 0.2.31

### Patch Changes

- Updated dependencies [[`75ed113`](https://github.com/vertz-dev/vertz/commit/75ed113c54cf7fdf0d928a300f71fadd58e27ebe), [`86b1b76`](https://github.com/vertz-dev/vertz/commit/86b1b763b3b7598be442c04afe94acae0b5603c2)]:
  - @vertz/db@0.2.31
  - @vertz/ui-server@0.2.31
  - @vertz/codegen@0.2.31
  - @vertz/compiler@0.2.31
  - @vertz/create-vertz-app@0.2.31
  - @vertz/errors@0.2.31
  - @vertz/tui@0.2.31

## 0.2.30

### Patch Changes

- Updated dependencies [[`126bff9`](https://github.com/vertz-dev/vertz/commit/126bff96c0b09b5ab954ca7130857fbca165327e)]:
  - @vertz/db@0.2.30
  - @vertz/codegen@0.2.30
  - @vertz/compiler@0.2.30
  - @vertz/create-vertz-app@0.2.30
  - @vertz/errors@0.2.30
  - @vertz/tui@0.2.30
  - @vertz/ui-server@0.2.30

## 0.2.29

### Patch Changes

- Updated dependencies [[`a5a3d78`](https://github.com/vertz-dev/vertz/commit/a5a3d7880cb18dc09c10ea061308188c3560e0f6)]:
  - @vertz/db@0.2.29
  - @vertz/codegen@0.2.29
  - @vertz/compiler@0.2.29
  - @vertz/create-vertz-app@0.2.29
  - @vertz/errors@0.2.29
  - @vertz/tui@0.2.29
  - @vertz/ui-server@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @vertz/codegen@0.2.28
  - @vertz/compiler@0.2.28
  - @vertz/create-vertz-app@0.2.28
  - @vertz/db@0.2.28
  - @vertz/errors@0.2.28
  - @vertz/tui@0.2.28
  - @vertz/ui-server@0.2.28

## 0.2.27

### Patch Changes

- Updated dependencies [[`73c2d0d`](https://github.com/vertz-dev/vertz/commit/73c2d0db2f9cdab495ade4ee5815e071f8411587), [`c40f504`](https://github.com/vertz-dev/vertz/commit/c40f5048e8ec551318f8daf4b98349c590c11553), [`aa704de`](https://github.com/vertz-dev/vertz/commit/aa704de973e3f661e297d1a3cd2aef6cabdfd02c)]:
  - @vertz/db@0.2.27
  - @vertz/ui-server@0.2.27
  - @vertz/codegen@0.2.27
  - @vertz/compiler@0.2.27
  - @vertz/create-vertz-app@0.2.27
  - @vertz/errors@0.2.27
  - @vertz/tui@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies []:
  - @vertz/codegen@0.2.26
  - @vertz/compiler@0.2.26
  - @vertz/create-vertz-app@0.2.26
  - @vertz/db@0.2.26
  - @vertz/errors@0.2.26
  - @vertz/tui@0.2.26
  - @vertz/ui-server@0.2.26

## 0.2.25

### Patch Changes

- Updated dependencies [[`04673a3`](https://github.com/vertz-dev/vertz/commit/04673a32a4849db08d80bb39caf801295fec9832), [`841c9ae`](https://github.com/vertz-dev/vertz/commit/841c9ae69b559d25ed443d3c5fa8e21b2fd174bf)]:
  - @vertz/create-vertz-app@0.2.25
  - @vertz/codegen@0.2.25
  - @vertz/compiler@0.2.25
  - @vertz/db@0.2.25
  - @vertz/errors@0.2.25
  - @vertz/tui@0.2.25
  - @vertz/ui-server@0.2.25

## 0.2.24

### Patch Changes

- Updated dependencies [[`de3cb15`](https://github.com/vertz-dev/vertz/commit/de3cb15e9ecad1a4cec60cc21b6a9236fd4e6324), [`adea2f1`](https://github.com/vertz-dev/vertz/commit/adea2f15f306d09ecebc56fc1f3841ff4b14b2ba)]:
  - @vertz/ui-server@0.2.24
  - @vertz/codegen@0.2.24
  - @vertz/compiler@0.2.24
  - @vertz/create-vertz-app@0.2.24
  - @vertz/db@0.2.24
  - @vertz/errors@0.2.24
  - @vertz/tui@0.2.24

## 0.2.23

### Patch Changes

- [#1569](https://github.com/vertz-dev/vertz/pull/1569) [`9493358`](https://github.com/vertz-dev/vertz/commit/94933585e51971cdf3dcea36ea9d5981a1fe5e0b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix CLI dev server using `.handler` instead of `.requestHandler` when auth is configured, which caused auth routes (sign-in, sign-up, OAuth, etc.) to 404. The dev server now prefers `requestHandler` when available and falls back to `handler` for non-auth setups.

- Updated dependencies [[`7c146e6`](https://github.com/vertz-dev/vertz/commit/7c146e695b642affeb39134beb0e1eb6475f20a8)]:
  - @vertz/ui-server@0.2.23
  - @vertz/codegen@0.2.23
  - @vertz/compiler@0.2.23
  - @vertz/create-vertz-app@0.2.23
  - @vertz/db@0.2.23
  - @vertz/errors@0.2.23
  - @vertz/tui@0.2.23

## 0.2.22

### Patch Changes

- Updated dependencies [[`59a7f9b`](https://github.com/vertz-dev/vertz/commit/59a7f9bf484c14288b0ca10e0f96c015f3d928bc), [`92262cc`](https://github.com/vertz-dev/vertz/commit/92262cc2d6b2b975994b6d4fc223b35c4ae716a5)]:
  - @vertz/db@0.2.22
  - @vertz/create-vertz-app@0.2.22
  - @vertz/codegen@0.2.22
  - @vertz/compiler@0.2.22
  - @vertz/errors@0.2.22
  - @vertz/tui@0.2.22
  - @vertz/ui-server@0.2.22

## 0.2.21

### Patch Changes

- [#1420](https://github.com/vertz-dev/vertz/pull/1420) [`5c72dc4`](https://github.com/vertz-dev/vertz/commit/5c72dc40807415754963b3b5a5286102b08ded57) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `vertz` meta-package to esbuild external list in production build orchestrator

- [#1328](https://github.com/vertz-dev/vertz/pull/1328) [`64d9742`](https://github.com/vertz-dev/vertz/commit/64d974294c9cd072f72c24d05a69743a367bb223) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Read CLI version from package.json instead of hardcoded value; show version in `vertz create` output

- [#1365](https://github.com/vertz-dev/vertz/pull/1365) [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix duplicate route components during production hydration with lazy (code-split) routes. RouterView and Outlet now re-enter hydration when lazy routes resolve, claiming SSR nodes instead of recreating DOM. Add route-aware chunk preloading via route-chunk manifest.

- [#1396](https://github.com/vertz-dev/vertz/pull/1396) [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui,ui-server,cli): add generateParams for dynamic route SSG

  Routes can now define `generateParams` to pre-render dynamic routes at build time. The build pipeline expands these into concrete paths and pre-renders each one to static HTML files.

- Updated dependencies [[`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178), [`30737c7`](https://github.com/vertz-dev/vertz/commit/30737c73fcf844878b6b781f3b786fac39e6a7b5), [`5eda52e`](https://github.com/vertz-dev/vertz/commit/5eda52e2a74966eb94dcca5af00cb1f1dd8c2fd7), [`0f7b4bc`](https://github.com/vertz-dev/vertz/commit/0f7b4bc228d6ebf294ab9b7a63087324f003cf86), [`2b462a9`](https://github.com/vertz-dev/vertz/commit/2b462a96eaa747bdd6448763a7d76c0e7a4fee21), [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1), [`a897b19`](https://github.com/vertz-dev/vertz/commit/a897b19b36f0851e373f4dce31298c52c11328c7), [`39894f6`](https://github.com/vertz-dev/vertz/commit/39894f6afa95e5e532d625599a6fe80fc47c3574), [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e), [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc)]:
  - @vertz/ui-server@0.2.21
  - @vertz/create-vertz-app@0.2.21
  - @vertz/db@0.2.21
  - @vertz/codegen@0.2.21
  - @vertz/compiler@0.2.21
  - @vertz/errors@0.2.21
  - @vertz/tui@0.2.21

## 0.2.20

### Patch Changes

- [#1280](https://github.com/vertz-dev/vertz/pull/1280) [`acf762c`](https://github.com/vertz-dev/vertz/commit/acf762c91597201689ff08fc9752aa0d1082589c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix production SSR build crash when app imports from `vertz/ui` meta-package. The server bundler now correctly externalizes all `vertz/*` subpath imports alongside the existing `@vertz/*` externals.

- Updated dependencies [[`9a0a313`](https://github.com/vertz-dev/vertz/commit/9a0a3131656bb22a8cdfb351013c3a7a69cdd553)]:
  - @vertz/create-vertz-app@0.2.20
  - @vertz/ui-server@0.2.20
  - @vertz/codegen@0.2.20
  - @vertz/compiler@0.2.20
  - @vertz/db@0.2.20
  - @vertz/errors@0.2.20
  - @vertz/tui@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/codegen@0.2.19
  - @vertz/compiler@0.2.19
  - @vertz/create-vertz-app@0.2.19
  - @vertz/db@0.2.19
  - @vertz/errors@0.2.19
  - @vertz/tui@0.2.19
  - @vertz/ui-server@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies []:
  - @vertz/codegen@0.2.18
  - @vertz/compiler@0.2.18
  - @vertz/create-vertz-app@0.2.18
  - @vertz/db@0.2.18
  - @vertz/errors@0.2.18
  - @vertz/tui@0.2.18
  - @vertz/ui-server@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @vertz/codegen@0.2.17
  - @vertz/compiler@0.2.17
  - @vertz/create-vertz-app@0.2.17
  - @vertz/db@0.2.17
  - @vertz/errors@0.2.17
  - @vertz/tui@0.2.17
  - @vertz/ui-server@0.2.17

## 0.2.16

### Patch Changes

- [#1193](https://github.com/vertz-dev/vertz/pull/1193) [`02bac2a`](https://github.com/vertz-dev/vertz/commit/02bac2af689750d500f0846d700e89528a02627d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add automatic route code splitting: `defineRoutes()` component factories are rewritten to lazy `import()` calls at build time, enabling per-page code splitting without manual dynamic imports.

- [#1216](https://github.com/vertz-dev/vertz/pull/1216) [`c1c0638`](https://github.com/vertz-dev/vertz/commit/c1c06383b8ad50c833b64aa5009fe7b494bb559b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - SSR session injection to eliminate auth loading flash. JWT session data is now injected as `window.__VERTZ_SESSION__` during SSR, so `AuthProvider` hydrates with session data immediately instead of showing a loading state. Zero-config: the CLI auto-wires the session resolver when auth is configured.

- Updated dependencies [[`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136), [`2f574cc`](https://github.com/vertz-dev/vertz/commit/2f574cce9e941c63503efb2e32ecef7b53951725), [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea), [`6317fa3`](https://github.com/vertz-dev/vertz/commit/6317fa32f4f442451db00461b6f891388d66b99e), [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf), [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb), [`391096b`](https://github.com/vertz-dev/vertz/commit/391096b426e1debb6cee06b336768b0e20abc191), [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb), [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c), [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086), [`e1938b0`](https://github.com/vertz-dev/vertz/commit/e1938b0f86129396d22f5db57792cfa805387e62), [`02bac2a`](https://github.com/vertz-dev/vertz/commit/02bac2af689750d500f0846d700e89528a02627d), [`ab3f364`](https://github.com/vertz-dev/vertz/commit/ab3f36478018245cc9473217a9a3bf7b04c6a5cb), [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c), [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc), [`c1c0638`](https://github.com/vertz-dev/vertz/commit/c1c06383b8ad50c833b64aa5009fe7b494bb559b), [`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb)]:
  - @vertz/ui-server@0.2.16
  - @vertz/db@0.2.16
  - @vertz/compiler@0.2.16
  - @vertz/codegen@0.2.16
  - @vertz/create-vertz-app@0.2.16
  - @vertz/errors@0.2.16
  - @vertz/tui@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies [[`d0f0941`](https://github.com/vertz-dev/vertz/commit/d0f09419950bd0d6d9229a11fa9bf07f632fb85d)]:
  - @vertz/codegen@0.2.15
  - @vertz/compiler@0.2.15
  - @vertz/create-vertz-app@0.2.15
  - @vertz/db@0.2.15
  - @vertz/errors@0.2.15
  - @vertz/tui@0.2.15
  - @vertz/ui-server@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies [[`3254588`](https://github.com/vertz-dev/vertz/commit/3254588a2cfb3590eebda53a4648256cc4d51139)]:
  - @vertz/create-vertz-app@0.2.14
  - @vertz/compiler@0.2.14
  - @vertz/codegen@0.2.14
  - @vertz/db@0.2.14
  - @vertz/errors@0.2.14
  - @vertz/tui@0.2.14
  - @vertz/ui-server@0.2.14

## 0.2.13

### Patch Changes

- [#959](https://github.com/vertz-dev/vertz/pull/959) [`127df59`](https://github.com/vertz-dev/vertz/commit/127df59424102142ac1aee9dfcc31b22c2959343) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Wire auto-migrate into the dev server pipeline. Schema file changes now automatically sync the database during `vertz dev`, with graceful skipping for UI-only projects and destructive change warnings.

- [#944](https://github.com/vertz-dev/vertz/pull/944) [`cbda042`](https://github.com/vertz-dev/vertz/commit/cbda042603f9137cea2f032b7c842edc4c341dd7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `vertz start` command to serve production builds. Supports API-only, UI-only, and full-stack modes with SSR, static file serving, CSS inlining, and graceful shutdown.

- Updated dependencies [[`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7), [`127df59`](https://github.com/vertz-dev/vertz/commit/127df59424102142ac1aee9dfcc31b22c2959343), [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a), [`3a79c2f`](https://github.com/vertz-dev/vertz/commit/3a79c2fad5bfbaed61f252cf2b908592e12a82bd), [`efda760`](https://github.com/vertz-dev/vertz/commit/efda76032901138dca7a22acd60ad947a4bdf02a), [`3d2799a`](https://github.com/vertz-dev/vertz/commit/3d2799ac4c3e0d8f65d864b4471e205a64db886a), [`7b125db`](https://github.com/vertz-dev/vertz/commit/7b125db968ba9157ce97932b392cb3be7fcc0344), [`cbda042`](https://github.com/vertz-dev/vertz/commit/cbda042603f9137cea2f032b7c842edc4c341dd7), [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05)]:
  - @vertz/ui-server@0.2.13
  - @vertz/db@0.2.13
  - @vertz/codegen@0.2.13
  - @vertz/errors@0.2.13
  - @vertz/create-vertz-app@0.2.13
  - @vertz/compiler@0.2.13
  - @vertz/tui@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies [[`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9)]:
  - @vertz/ui-server@0.2.12
  - @vertz/codegen@0.2.12
  - @vertz/compiler@0.2.12
  - @vertz/create-vertz-app@0.2.12
  - @vertz/db@0.2.12
  - @vertz/errors@0.2.12
  - @vertz/tui@0.2.12

## 0.2.11

### Patch Changes

- [#918](https://github.com/vertz-dev/vertz/pull/918) [`1fc9e33`](https://github.com/vertz-dev/vertz/commit/1fc9e33a9aa5283898c8974084f519a3caacbabb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove index.html from the framework

  UI apps no longer require an `index.html` file in the project root. The production build now generates the HTML shell programmatically with the correct asset references, eliminating the need for:

  - Manual `index.html` maintenance
  - Fast Refresh runtime stripping during build
  - Dev script tag replacement with hashed entries
  - `./public/` path rewriting

  The `createIndexHtmlStasher` dev server mechanism (which renamed `index.html` during development to prevent Bun from auto-serving it) has been removed entirely.

  `UIBuildConfig` gains an optional `title` field (default: `'Vertz App'`) to set the HTML page title.

- Updated dependencies [[`b2878cf`](https://github.com/vertz-dev/vertz/commit/b2878cfe2acb3d1155ca5e0da13b2ee91c9aea9a), [`5ed4c1a`](https://github.com/vertz-dev/vertz/commit/5ed4c1a4c5c9ea946e97b1636011251c6287eaf4), [`1fc9e33`](https://github.com/vertz-dev/vertz/commit/1fc9e33a9aa5283898c8974084f519a3caacbabb)]:
  - @vertz/ui-server@0.2.11
  - @vertz/codegen@0.2.11
  - @vertz/compiler@0.2.11
  - @vertz/create-vertz-app@0.2.11
  - @vertz/db@0.2.11
  - @vertz/errors@0.2.11
  - @vertz/tui@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies [[`2a2cadc`](https://github.com/vertz-dev/vertz/commit/2a2cadcaf6dee9eee9c4f869bb387f7bff67a123)]:
  - @vertz/create-vertz-app@0.2.8
  - @vertz/codegen@0.2.8
  - @vertz/compiler@0.2.8
  - @vertz/db@0.2.8
  - @vertz/errors@0.2.8
  - @vertz/tui@0.2.8
  - @vertz/ui-server@0.2.8

## 0.2.7

### Patch Changes

- chore: republish as 0.2.7 (0.2.6 stuck in npm ghost state)

- Updated dependencies []:
  - @vertz/codegen@0.2.7
  - @vertz/compiler@0.2.7
  - @vertz/create-vertz-app@0.2.7
  - @vertz/db@0.2.7
  - @vertz/errors@0.2.7
  - @vertz/tui@0.2.7
  - @vertz/ui-server@0.2.7

## 0.2.6

### Patch Changes

- [#899](https://github.com/vertz-dev/vertz/pull/899) [`ecbc594`](https://github.com/vertz-dev/vertz/commit/ecbc594830c8fcb2dea2e7b66d8b04aa2d58a47d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(cli): add esbuild dependency, use bun shebang, remove dead ink/react deps

  - Added missing `esbuild` to dependencies (externalized in bundle but not declared)
  - Changed CLI shebang from `#!/usr/bin/env node` to `#!/usr/bin/env bun` so the framework's Bun-dependent features (bun:sqlite, Bun.serve) work correctly
  - Removed unused ink-based components (Banner, DiagnosticDisplay, DiagnosticSummary) and their ink/react dependencies

- Updated dependencies []:
  - @vertz/codegen@0.2.6
  - @vertz/compiler@0.2.6
  - @vertz/create-vertz-app@0.2.6
  - @vertz/db@0.2.6
  - @vertz/errors@0.2.6
  - @vertz/tui@0.2.6
  - @vertz/ui-server@0.2.6

## 0.2.5

### Patch Changes

- [#897](https://github.com/vertz-dev/vertz/pull/897) [`d72c099`](https://github.com/vertz-dev/vertz/commit/d72c0997f38c723a4b8c077a91b09f15eaea931f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(release): use workspace:^ protocol and unify fixed version group

  Two changes to prevent broken npm installs caused by version gaps:

  1. Changed all `workspace:*` to `workspace:^` so published packages use
     caret ranges (e.g., `"^0.2.3"`) instead of exact versions (`"0.2.3"`).
     This makes installs resilient when an exact patch version is missing.

  2. Expanded the changeset `fixed` group to include all 20 publishable
     packages. Every release now bumps all packages to the same version,
     eliminating version gaps between sibling dependencies.

- Updated dependencies []:
  - @vertz/codegen@0.2.5
  - @vertz/compiler@0.2.5
  - @vertz/create-vertz-app@0.2.5
  - @vertz/db@0.2.5
  - @vertz/errors@0.2.5
  - @vertz/tui@0.2.5
  - @vertz/ui-server@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [[`a986d07`](https://github.com/vertz-dev/vertz/commit/a986d0788ca0210dfa4f624153d4bda72257a78c)]:
  - @vertz/ui-server@0.2.4
  - @vertz/compiler@0.2.4
  - @vertz/db@0.2.4
  - @vertz/codegen@0.2.4

## 0.2.3

### Patch Changes

- [#882](https://github.com/vertz-dev/vertz/pull/882) [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove deprecated module system (`createModule`, `createModuleDef`, services, routers) from public API. The entity + action pattern is now the only supported way to define routes. Internal infrastructure (Trie router, middleware runner, schema validation, CORS, error handling) is preserved.

- Updated dependencies [[`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`2e86c55`](https://github.com/vertz-dev/vertz/commit/2e86c55e3c04f3c534bf0dc124d18dcdc5d9eefc), [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b)]:
  - @vertz/create-vertz-app@0.2.2
  - @vertz/ui-server@0.2.3
  - @vertz/codegen@0.2.3
  - @vertz/compiler@0.2.3
  - @vertz/tui@0.2.3
  - @vertz/db@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @vertz/tui@0.2.2
  - @vertz/ui-server@0.2.2
  - @vertz/db@0.2.2
  - @vertz/compiler@0.2.2
  - @vertz/codegen@0.2.2

## 0.2.0

### Minor Changes

- [#331](https://github.com/vertz-dev/vertz/pull/331) [`2cfb2b9`](https://github.com/vertz-dev/vertz/commit/2cfb2b9a39640b5f1f006de3caadd54aebfe6421) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `vertz build` production build command and `vertz create` project scaffold

### Patch Changes

- [#272](https://github.com/vertz-dev/vertz/pull/272) [`6669f6f`](https://github.com/vertz-dev/vertz/commit/6669f6f73733376816f99c1658803475cf91a5bb) Thanks [@vertz-devops](https://github.com/apps/vertz-devops)! - Replace Dagger with Turborepo for CI pipeline

  Migrate from Dagger to Turborepo for improved reliability, caching, and local/CI parity.

  **Breaking changes:**

  - Removed `codegen` property from `VertzConfig` interface in `@vertz/compiler`. This was an unused configuration option that created a circular dependency. Codegen configuration should be passed directly to codegen functions.

  **Key improvements:**

  - Content-hash-based caching for deterministic builds
  - Identical commands run locally and in CI
  - No external engine dependencies (Dagger was causing instability)
  - Fixed circular dependency between @vertz/compiler and @vertz/codegen by removing type re-exports

  **Migration notes:**

  - `bun run ci` now uses Turborepo instead of Dagger
  - `bun run ci:affected` runs only tasks for packages changed since main
  - All existing package scripts remain unchanged

- Updated dependencies [[`db53497`](https://github.com/vertz-dev/vertz/commit/db534979df714d51227a34b4d5b80960e34ec33c), [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`2ec4dd3`](https://github.com/vertz-dev/vertz/commit/2ec4dd3be1ac13f74015e977a699cd59fd7291bc), [`f3b132a`](https://github.com/vertz-dev/vertz/commit/f3b132af4f6ff39e967d4ca3d33f7e6ee12eff84), [`6669f6f`](https://github.com/vertz-dev/vertz/commit/6669f6f73733376816f99c1658803475cf91a5bb), [`6814cd8`](https://github.com/vertz-dev/vertz/commit/6814cd8da818cd0b36deaea132ca589cf6a03a89)]:
  - @vertz/db@0.2.0
  - @vertz/compiler@0.2.0
  - @vertz/codegen@0.2.0
