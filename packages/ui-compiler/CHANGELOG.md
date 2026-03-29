# @vertz/ui-compiler

## 0.2.41

### Patch Changes

- Updated dependencies [[`7f837fc`](https://github.com/vertz-dev/vertz/commit/7f837fc10a0acd4ad77bfc4bcaf733700c8a4f8b)]:
  - @vertz/ui@0.2.41

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

- [#1961](https://github.com/vertz-dev/vertz/pull/1961) [`f523a42`](https://github.com/vertz-dev/vertz/commit/f523a4282996d72c17be9f2a674a34a244455cba) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui-compiler): AOT compiler optimizations — compile more components to string-builder functions

  Four optimizations that reduce runtime-fallback classifications:
  1. Derived variable preamble: body-level variable declarations computed from query data are now included in AOT function preambles instead of falling back to runtime.
  2. Map callback block body preservation: `.map()` callbacks with variable declarations before the return statement are preserved instead of falling back to `__esc()`.
  3. If-else chain flattening: if-else and if-else-if return patterns compile to nested ternaries instead of falling back to runtime.
  4. `||` and `??` operator support: when the right operand is JSX, these generate conditional rendering (truthy/non-nullish shows escaped value, falsy/nullish shows JSX fallback).

- Updated dependencies [[`bee011e`](https://github.com/vertz-dev/vertz/commit/bee011e47661b31152ad3dfc589fd45eda2f3e44)]:
  - @vertz/ui@0.2.40

## 0.2.39

### Patch Changes

- Updated dependencies [[`7bf733f`](https://github.com/vertz-dev/vertz/commit/7bf733fec92424d08a08dafe3b4c4a5984f084b0), [`a948ef1`](https://github.com/vertz-dev/vertz/commit/a948ef160c244fb2e42cd53e7190b8bf6a96f9db)]:
  - @vertz/ui@0.2.39

## 0.2.38

### Patch Changes

- [#1938](https://github.com/vertz-dev/vertz/pull/1938) [`93aa341`](https://github.com/vertz-dev/vertz/commit/93aa34166ad4934ec5c7e45fd7d7327e0843d174) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix AOT compiler crash on `.map()` callbacks with closure variables (#1936). The compiler now falls back to runtime evaluation when a map callback defines local variables before its return statement. Also adds graceful fallback from AOT to single-pass SSR when the render function throws at runtime.

- Updated dependencies [[`20344c0`](https://github.com/vertz-dev/vertz/commit/20344c0a7df8260ce98034bd0e2de73ef11ecfcd)]:
  - @vertz/ui@0.2.38

## 0.2.37

### Patch Changes

- Updated dependencies [[`12231be`](https://github.com/vertz-dev/vertz/commit/12231be46d322526be6d8b6752911d88f025e4d0)]:
  - @vertz/ui@0.2.37

## 0.2.36

### Patch Changes

- Updated dependencies [[`94a3244`](https://github.com/vertz-dev/vertz/commit/94a32446298cc6d8b76849abec315e980d5a4341), [`9281153`](https://github.com/vertz-dev/vertz/commit/9281153c407654e4cf26c5c41af3274128301e3e)]:
  - @vertz/ui@0.2.36

## 0.2.35

### Patch Changes

- [#1882](https://github.com/vertz-dev/vertz/pull/1882) [`bb784d0`](https://github.com/vertz-dev/vertz/commit/bb784d052fe4abf27f5f499923de0a1f20a06c1b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix AOT route extraction to handle dynamic imports, function calls, and bare identifiers alongside existing JSX patterns. Fix AOT bundle failures caused by missing helper imports and query variable scope leaks. Fix AOT route matcher to use exact matching instead of prefix matching, preventing `/` from matching all URLs. Externalize relative imports in AOT bundle step to prevent resolution failures in .aot-tmp. Improve AOT bundle error logging with detailed messages and stack traces.

- Updated dependencies [[`5a80932`](https://github.com/vertz-dev/vertz/commit/5a8093299d96eefd00f0208af61eeb37aef28014)]:
  - @vertz/ui@0.2.35

## 0.2.34

### Patch Changes

- [#1876](https://github.com/vertz-dev/vertz/pull/1876) [`8076db5`](https://github.com/vertz-dev/vertz/commit/8076db590be9a593321d6de4cad6590d41e3c83c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix AOT route extraction to handle dynamic imports, function calls, and bare identifiers alongside existing JSX patterns. Improve AOT bundle error logging with detailed messages and stack traces.

- [#1877](https://github.com/vertz-dev/vertz/pull/1877) [`3399191`](https://github.com/vertz-dev/vertz/commit/339919192bd95b5d212abf7f6d3746101c8d5422) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix query() not re-fetching when reactive state changes after SSR hydration (#1861)

  Runtime: call thunk during SSR hydration (when key is derived) to register reactive deps in the effect.
  Compiler: auto-wrap `query(descriptor)` in a thunk when the argument references reactive variables.

- Updated dependencies [[`3399191`](https://github.com/vertz-dev/vertz/commit/339919192bd95b5d212abf7f6d3746101c8d5422)]:
  - @vertz/ui@0.2.34

## 0.2.33

### Patch Changes

- [#1862](https://github.com/vertz-dev/vertz/pull/1862) [`37fb6dc`](https://github.com/vertz-dev/vertz/commit/37fb6dcb125c561ec0113a1ee9314426fa50255e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix shorthand property assignments (`{ offset }`) not unwrapping signal/computed `.value`. The compiler now expands shorthand to `{ offset: offset.value }`, restoring reactive dependency tracking in closures like `query(() => fetch({ offset }))`.

- Updated dependencies []:
  - @vertz/ui@0.2.33

## 0.2.32

### Patch Changes

- [#1854](https://github.com/vertz-dev/vertz/pull/1854) [`ce47098`](https://github.com/vertz-dev/vertz/commit/ce47098edb664d7a005dbdca881efbe63fb4dda2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Wire AOT SSR pipeline end-to-end: compiler generates standalone `(data, ctx)` render functions for query-using components, build emits `aot-routes.js` + `aot-manifest.json`, and `createSSRHandler()` uses AOT render with data prefetch when manifest is available. Falls back to single-pass SSR for routes without AOT entries.

- Updated dependencies [[`ca59e8b`](https://github.com/vertz-dev/vertz/commit/ca59e8b824806cc222521677abbdcbb753347969)]:
  - @vertz/ui@0.2.32

## 0.2.31

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.31

## 0.2.30

### Patch Changes

- [#1823](https://github.com/vertz-dev/vertz/pull/1823) [`3bf1c88`](https://github.com/vertz-dev/vertz/commit/3bf1c882c258ba9989feac2b27d00809af1d6415) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Emit `<!--/child-->` end markers in AOT SSR compiler (#1815)

  The AOT SSR path now emits `<!--/child-->` end markers after reactive text expressions, matching the DOM-shim SSR behavior added in #1812. Without end markers, AOT-generated SSR output was vulnerable to the same text node merging issue where hydration cleanup could consume adjacent static text.

- Updated dependencies [[`0ba086d`](https://github.com/vertz-dev/vertz/commit/0ba086d9bca13cac9e0a27a1cbd199c8b5ca6a07), [`1d36182`](https://github.com/vertz-dev/vertz/commit/1d36182b0678378d50d9a063d6471a9114712b6a)]:
  - @vertz/ui@0.2.30

## 0.2.29

### Patch Changes

- [#1781](https://github.com/vertz-dev/vertz/pull/1781) [`7771170`](https://github.com/vertz-dev/vertz/commit/777117093d783aaeecc905ec65c4c85363746494) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add reactive search params via `useSearchParams()` — a Proxy-based API that reads typed, reactive search params from the URL and writes back on assignment. Includes `ExtractSearchParams` type utility for route-path-generic inference, codegen augmentation, and compiler reactive source registration.

- Updated dependencies [[`7771170`](https://github.com/vertz-dev/vertz/commit/777117093d783aaeecc905ec65c4c85363746494)]:
  - @vertz/ui@0.2.29

## 0.2.28

### Patch Changes

- [#1771](https://github.com/vertz-dev/vertz/pull/1771) [`a5ac6e1`](https://github.com/vertz-dev/vertz/commit/a5ac6e19f5642e3981c0bb96ae8de8bf574c60dc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix AOT SSR classifier for query() + conditional return patterns: guard patterns (if-return + main return) are now classified as 'conditional' instead of 'runtime-fallback', and ternary/&& returns containing JSX are no longer silently dropped from the components array.

- Updated dependencies []:
  - @vertz/ui@0.2.28

## 0.2.27

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies [[`8552f21`](https://github.com/vertz-dev/vertz/commit/8552f217350e2acb0caac26ac215a49736b07e55)]:
  - @vertz/ui@0.2.26

## 0.2.25

### Patch Changes

- [#1732](https://github.com/vertz-dev/vertz/pull/1732) [`841c9ae`](https://github.com/vertz-dev/vertz/commit/841c9ae69b559d25ed443d3c5fa8e21b2fd174bf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove `queryMatch` primitive — use direct conditional rendering instead

  `queryMatch()` has been removed. Replace with direct conditionals on query signal properties:

  ```tsx
  // Before
  {
    queryMatch(tasks, {
      loading: () => <Spinner />,
      error: (err) => <Error error={err} />,
      data: (data) => <List items={data.items} />,
    });
  }

  // After
  {
    tasks.loading && <Spinner />;
  }
  {
    tasks.error && <Error error={tasks.error} />;
  }
  {
    tasks.data && <List items={tasks.data.items} />;
  }
  ```

- Updated dependencies [[`04673a3`](https://github.com/vertz-dev/vertz/commit/04673a32a4849db08d80bb39caf801295fec9832), [`841c9ae`](https://github.com/vertz-dev/vertz/commit/841c9ae69b559d25ed443d3c5fa8e21b2fd174bf)]:
  - @vertz/ui@0.2.25

## 0.2.24

### Patch Changes

- [#1704](https://github.com/vertz-dev/vertz/pull/1704) [`0e33400`](https://github.com/vertz-dev/vertz/commit/0e33400d96a9f778f3b936124d7544804f731db9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): full-replacement mode for unkeyed lists prevents stale DOM

  When no `key` prop is provided on list items, `__list` now uses full-replacement mode (dispose all nodes, create all new) instead of reusing by position index. This prevents stale DOM content when list items are filtered, reordered, or replaced. A dev warning is emitted once to encourage adding keys for optimal performance.

- [#1684](https://github.com/vertz-dev/vertz/pull/1684) [`e24615a`](https://github.com/vertz-dev/vertz/commit/e24615a8619ae84b993c18dbdca2671ca254f9bb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-compiler): support JSX spread attributes on intrinsic elements and components

  JSX spread attributes (`<button {...rest}>`, `<Button {...props}>`) were silently dropped by the compiler. Spread attributes now work correctly:
  - **Component calls**: spread emits `...expr` in the props object literal
  - **Intrinsic elements**: spread emits `__spread(el, props)` runtime call that handles event handlers, style, class/className, ref, SVG attributes, and standard HTML attributes
  - **theme-shadcn Button**: removed `applyProps` workaround in favor of native JSX spread

- Updated dependencies [[`a73dd79`](https://github.com/vertz-dev/vertz/commit/a73dd792de1876513914b89ef896fc88243b4cc8), [`d58a100`](https://github.com/vertz-dev/vertz/commit/d58a100f18762189be4319b58a4b86f8a774ac95), [`0e33400`](https://github.com/vertz-dev/vertz/commit/0e33400d96a9f778f3b936124d7544804f731db9), [`e24615a`](https://github.com/vertz-dev/vertz/commit/e24615a8619ae84b993c18dbdca2671ca254f9bb), [`adea2f1`](https://github.com/vertz-dev/vertz/commit/adea2f15f306d09ecebc56fc1f3841ff4b14b2ba)]:
  - @vertz/ui@0.2.24

## 0.2.23

### Patch Changes

- [#1595](https://github.com/vertz-dev/vertz/pull/1595) [`eb1e2d6`](https://github.com/vertz-dev/vertz/commit/eb1e2d6df1923c2fd7525c58281bb1b13e52750a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix boolean shorthand JSX attributes dropping IDL properties (e.g. `<input checked />` now emits `el.checked = true`)

- [#1571](https://github.com/vertz-dev/vertz/pull/1571) [`10f6309`](https://github.com/vertz-dev/vertz/commit/10f6309790bff69c7a1a0ab92e50f78f34b129c3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Expand CSS utility tokens with overflow axis variants, transform scale keywords, fraction dimensions, and color opacity modifiers

- [#1545](https://github.com/vertz-dev/vertz/pull/1545) [`1709f6d`](https://github.com/vertz-dev/vertz/commit/1709f6d933f04600d1b959b51660f2f8f33805d8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Defer onMount callbacks until after JSX evaluation so refs and DOM elements are available inside the callback. The compiler now injects mount frame push/flush around component return expressions. No public API change — onMount keeps its existing signature. Outside compiled components (event handlers, watch), onMount still runs immediately for backward compat.

- [#1600](https://github.com/vertz-dev/vertz/pull/1600) [`83c3a67`](https://github.com/vertz-dev/vertz/commit/83c3a67ca7de53a7c79fb650250b33b0ed05329f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix extractKeyPropValue descending into nested JSX children when looking for key props

- [#1597](https://github.com/vertz-dev/vertz/pull/1597) [`e085298`](https://github.com/vertz-dev/vertz/commit/e085298955cdc027e1db6117c83912b9fc0cb0b0) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix ReferenceError when .map() index parameter is used as key prop (e.g., `key={i}`)

- [#1602](https://github.com/vertz-dev/vertz/pull/1602) [`4ff38bb`](https://github.com/vertz-dev/vertz/commit/4ff38bbdb34204b6de388a09152a174b7e16406c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove `selected` from `<option>` IDL properties — now uses `setAttribute`/`removeAttribute` instead of `Reflect.set`, fixing happydom cascading auto-selection. Defer `<select value={...}>` IDL property assignment until after children so options exist when `select.value` is set.

- [#1588](https://github.com/vertz-dev/vertz/pull/1588) [`7c146e6`](https://github.com/vertz-dev/vertz/commit/7c146e695b642affeb39134beb0e1eb6475f20a8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix reactive form element properties (`value`, `checked`, `selected`) to use DOM property assignment instead of `setAttribute`. This fixes `<select value={signal}>`, `<input value={signal}>`, `<input checked={signal}>`, and `<option selected={signal}>` not updating the displayed state reactively.

- Updated dependencies [[`10f6309`](https://github.com/vertz-dev/vertz/commit/10f6309790bff69c7a1a0ab92e50f78f34b129c3), [`1709f6d`](https://github.com/vertz-dev/vertz/commit/1709f6d933f04600d1b959b51660f2f8f33805d8), [`1e26cca`](https://github.com/vertz-dev/vertz/commit/1e26cca7eca00291633a2fa6257fc80a1f409b60), [`82055ae`](https://github.com/vertz-dev/vertz/commit/82055aefc19e4c3a115152f2e7157389486e792e), [`a21f762`](https://github.com/vertz-dev/vertz/commit/a21f76239e5c4b112c7be9a4ebea8327c3d2230b), [`7c146e6`](https://github.com/vertz-dev/vertz/commit/7c146e695b642affeb39134beb0e1eb6475f20a8)]:
  - @vertz/ui@0.2.23

## 0.2.22

### Patch Changes

- [#1536](https://github.com/vertz-dev/vertz/pull/1536) [`cd8b41b`](https://github.com/vertz-dev/vertz/commit/cd8b41bb9900f364cd562be9ae64b9644096881a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix signal/computed transforms incorrectly adding .value to callback-local variables that shadow component-level names

- Updated dependencies [[`8ed55f6`](https://github.com/vertz-dev/vertz/commit/8ed55f6fc8aa691758606fe044a8b1d74b7bb9bc), [`5d64812`](https://github.com/vertz-dev/vertz/commit/5d6481233006f67c21375f3879fda600c86c0cdd), [`180ac91`](https://github.com/vertz-dev/vertz/commit/180ac91f4fbc562581136dd8256f67fcc724fa69), [`6d32565`](https://github.com/vertz-dev/vertz/commit/6d32565c2818f9235d02af14a616279f018d0ff5), [`2e99e39`](https://github.com/vertz-dev/vertz/commit/2e99e3943830d2e2e0b2b44a1b32d8641e63dbe3), [`1c4916b`](https://github.com/vertz-dev/vertz/commit/1c4916b04eaaef0ee2e27eda1b73c36ae24e665e)]:
  - @vertz/ui@0.2.22

## 0.2.21

### Patch Changes

- [#1345](https://github.com/vertz-dev/vertz/pull/1345) [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Adopt `className` as the standard JSX prop for CSS classes, matching React convention. The `class` prop remains as a deprecated alias. All components, examples, and docs updated.

- [#1316](https://github.com/vertz-dev/vertz/pull/1316) [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Simplify css() nested selector object shape from `{ property: 'x', value: 'y' }` to plain `{ 'x': 'y' }`. Remove RawDeclaration type. Support both direct object and array-with-objects forms for nested selectors.

- [#1320](https://github.com/vertz-dev/vertz/pull/1320) [`cac4e45`](https://github.com/vertz-dev/vertz/commit/cac4e452bd12b726c077ce2f48605bbc410a680f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Hyphenated JSX prop names (e.g. `data-testid`, `aria-label`) on custom components are now quoted in compiled output, producing valid JavaScript object literals.

- [#1391](https://github.com/vertz-dev/vertz/pull/1391) [`427e519`](https://github.com/vertz-dev/vertz/commit/427e5194a7f783c2accc246409bf146dcfa2f1b7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-compiler): object/array literals no longer incorrectly wrapped in computed()

  The ReactivityAnalyzer now skips object and array literal initializers during
  computed classification, matching the existing behavior for function definitions.
  This removes the need for `build*Ctx()` helper workarounds in composed primitives.

- [#1346](https://github.com/vertz-dev/vertz/pull/1346) [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Support React-style `style` objects with camelCase properties. `style={{ backgroundColor: 'red' }}` now converts to a CSS string at all levels: JSX runtime, compiler-generated code, reactive `__attr()` bindings, and SSR. Includes auto-px for dimensional numeric values, unitless property detection, and vendor prefix handling.

- Updated dependencies [[`a16511c`](https://github.com/vertz-dev/vertz/commit/a16511cd78256fe86d0d69393dd923353d6f445a), [`796ef1a`](https://github.com/vertz-dev/vertz/commit/796ef1a9826f401c6d0b08f424d53609debda029), [`a5b9cbe`](https://github.com/vertz-dev/vertz/commit/a5b9cbe68202345ab09002f7e42c2a5be0c917bf), [`520444e`](https://github.com/vertz-dev/vertz/commit/520444e3bdbbf3140b75ed3754870166544b5f88), [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178), [`fa3d23c`](https://github.com/vertz-dev/vertz/commit/fa3d23ca2e92a4b734c4908ab274d8e75e45cbc0), [`823e301`](https://github.com/vertz-dev/vertz/commit/823e3016dcb4487a7cdf9af61aea940566ffb21c), [`86d33bd`](https://github.com/vertz-dev/vertz/commit/86d33bd56934d62441b031fb72dd86687f0d0845), [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c), [`a7e37c3`](https://github.com/vertz-dev/vertz/commit/a7e37c3dd29ac75183a085d34b0621d339f8402a), [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1), [`301c401`](https://github.com/vertz-dev/vertz/commit/301c40192ddec0a306bba997a7f9e4ce4253aa95), [`c9d6c7e`](https://github.com/vertz-dev/vertz/commit/c9d6c7ef368efdc905b4e96302798b2db65522aa), [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e), [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10), [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e), [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc), [`f356523`](https://github.com/vertz-dev/vertz/commit/f356523f7054b1b72d7936e3a7e13147904087dc), [`f9eccd5`](https://github.com/vertz-dev/vertz/commit/f9eccd56b2ecc4467b36b8e78bb3a072141ef93c), [`4079d6b`](https://github.com/vertz-dev/vertz/commit/4079d6b7567479f5f59648e81773f098c7696d02)]:
  - @vertz/ui@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies [[`b4cb6b6`](https://github.com/vertz-dev/vertz/commit/b4cb6b6826583c05efcdfd0af0e046a49f6eed91), [`c2355f9`](https://github.com/vertz-dev/vertz/commit/c2355f9d3e13feac615b00d48406e4626e92869b), [`e5ac67e`](https://github.com/vertz-dev/vertz/commit/e5ac67e24a05e0342a8c470ef741d7729ebeaf58)]:
  - @vertz/ui@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies [[`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e), [`6d6a85c`](https://github.com/vertz-dev/vertz/commit/6d6a85c0fd9f354a8d077e2eb1afdcf065344b95)]:
  - @vertz/ui@0.2.17

## 0.2.16

### Patch Changes

- [#1193](https://github.com/vertz-dev/vertz/pull/1193) [`02bac2a`](https://github.com/vertz-dev/vertz/commit/02bac2af689750d500f0846d700e89528a02627d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add automatic route code splitting: `defineRoutes()` component factories are rewritten to lazy `import()` calls at build time, enabling per-page code splitting without manual dynamic imports.

- Updated dependencies [[`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136), [`d2f6baf`](https://github.com/vertz-dev/vertz/commit/d2f6baf560db958f56257879d5d69da200ed519d), [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea), [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf), [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb), [`b061fc4`](https://github.com/vertz-dev/vertz/commit/b061fc4d04e851ae1ec6addd9342cec7b1a698f8), [`d44234d`](https://github.com/vertz-dev/vertz/commit/d44234de726d5dfa786103b3e5a311754753f08e), [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c), [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086), [`9f6f292`](https://github.com/vertz-dev/vertz/commit/9f6f292137d89064c1d86c2231e1f416fa1abd61), [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c), [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc)]:
  - @vertz/ui@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies [[`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf), [`d0f0941`](https://github.com/vertz-dev/vertz/commit/d0f09419950bd0d6d9229a11fa9bf07f632fb85d)]:
  - @vertz/ui@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.14

## 0.2.13

### Patch Changes

- [#1046](https://github.com/vertz-dev/vertz/pull/1046) [`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Access Set Bootstrap + Client-Side can(): server computes global entitlement snapshots (computeAccessSet), embeds in JWT acl claim with 2KB overflow strategy, exposes GET /api/auth/access-set with ETag/304 support. Client-side can() function returns reactive AccessCheck signals, AccessGate blocks UI while loading, createAccessProvider hydrates from SSR-injected **VERTZ_ACCESS_SET**. computeEntityAccess() enables per-entity access metadata for can(entitlement, entity). Compiler recognizes can() as signal-api via reactivity manifest.

- [#1007](https://github.com/vertz-dev/vertz/pull/1007) [`a9211ca`](https://github.com/vertz-dev/vertz/commit/a9211ca751305f541987b93d493d349838cf4822) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Skip effect wrapping for static JSX expressions. Non-reactive attributes now emit guarded `setAttribute` instead of `__attr()`, and non-reactive children emit `__insert()` instead of `__child(() => ...)`. This eliminates unnecessary `domEffect()` allocations and wrapper `<span>` elements for static expressions like `css()` style references, imported constants, and utility calls. Also fixes a JsxAnalyzer blind spot where destructured props were not classified as reactive sources.

- [#1052](https://github.com/vertz-dev/vertz/pull/1052) [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add client-side auth session management (AuthProvider, useAuth, AuthGate)
  - AuthProvider wraps app with auth context, manages JWT session lifecycle
  - useAuth() returns reactive state + SdkMethods (signIn, signUp, signOut, mfaChallenge, forgotPassword, resetPassword)
  - SdkMethods work with form() for automatic validation and submission
  - Proactive token refresh scheduling (10s before expiry, tab visibility, online/offline handling)
  - AuthGate gates rendering on auth state resolution (shows fallback during loading)
  - SSR hydration via window.**VERTZ_SESSION** (no initial fetch needed)
  - AccessContext integration: AuthProvider auto-manages access set when accessControl=true
  - Server: signin/signup/refresh responses now include expiresAt timestamp

- Updated dependencies [[`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7), [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a), [`3a79c2f`](https://github.com/vertz-dev/vertz/commit/3a79c2fad5bfbaed61f252cf2b908592e12a82bd), [`a82b2ec`](https://github.com/vertz-dev/vertz/commit/a82b2ec1ccc94f278916796783c33d81ffead211), [`1011e51`](https://github.com/vertz-dev/vertz/commit/1011e51fbfe528e35930e3dd5c32b76568b0684a), [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d), [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05)]:
  - @vertz/ui@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies [[`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9)]:
  - @vertz/ui@0.2.12

## 0.2.11

### Patch Changes

- [#909](https://github.com/vertz-dev/vertz/pull/909) [`275e4c7`](https://github.com/vertz-dev/vertz/commit/275e4c770f55b9e75b44d90f2cb586fff3eaeede) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix signal API variables (form(), query(), createLoader()) being incorrectly wrapped in computed() when they reference other signal API vars through closures. This caused form().\_\_bindElement to be undefined at runtime and form state to be lost on re-evaluation.

- [#917](https://github.com/vertz-dev/vertz/pull/917) [`5ed4c1a`](https://github.com/vertz-dev/vertz/commit/5ed4c1a4c5c9ea946e97b1636011251c6287eaf4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix HMR fast-refresh stability: SSR module reload now uses .ts wrapper to preserve plugin processing, compiler unwraps NonNullExpression in reactivity analyzer, and dev server includes diagnostic logging (VERTZ_DEBUG) and health check endpoint (/\_\_vertz_diagnostics).

- [#920](https://github.com/vertz-dev/vertz/pull/920) [`523bbcb`](https://github.com/vertz-dev/vertz/commit/523bbcb12c1866a8334d5dac278cb51b157a5c7b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(compiler): classify signal API variables passed as function arguments as reactive

  Expressions like `{queryMatch(todosQuery, ...)}` were classified as static because
  `todosQuery` (a signal API variable from `query()`) was only recognized via property
  accesses (`.data`, `.loading`), not when passed as a bare argument. This caused the
  compiler to emit `__insert()` instead of `__child()`, breaking hydration — the SSR
  `<span style="display:contents">` wrapper was never claimed, so reactive content
  (delete dialogs, form updates, checkbox toggles) was invisible after hydration.

- [#926](https://github.com/vertz-dev/vertz/pull/926) [`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Replace reactive-vs-static classification with literal-vs-non-literal for JSX codegen decisions.

  Previously, the compiler used static analysis to determine if an expression was reactive (depends on signals) and only wrapped reactive expressions in `__child()` / `__attr()` / getters. This broke when reactive values flowed through function boundaries (callback parameters, HOFs, proxy-backed objects) because the parameter was classified as static.

  Now, the compiler only checks if an expression is a **literal** (string, number, boolean, null). All non-literal expressions get reactive wrappers (`__child`, `__attr`, getters), and the runtime (`domEffect`) handles actual tracking. Idle effects with no signal dependencies have zero ongoing cost.

  This fixes `.map()` render function parameters, `queryMatch` data handler parameters, and any user-defined HOF that receives reactive data — without workarounds.

- [#913](https://github.com/vertz-dev/vertz/pull/913) [`859e3da`](https://github.com/vertz-dev/vertz/commit/859e3dae660629d5d4f1e13c305c9201ee1d738d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Distinguish reactive reads from stable closure references in computed classification. Callbacks that only call plain methods (`.refetch()`, `.revalidate()`) on signal API vars now stay `static` instead of being unnecessarily wrapped in `computed()`. Only accesses to signal properties (`.data`, `.error`, `.loading`) trigger computed classification.

- Updated dependencies [[`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a)]:
  - @vertz/ui@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.5

## 0.2.4

### Patch Changes

- [#894](https://github.com/vertz-dev/vertz/pull/894) [`a986d07`](https://github.com/vertz-dev/vertz/commit/a986d0788ca0210dfa4f624153d4bda72257a78c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix HMR fast-refresh stability: SSR module reload now uses .ts wrapper to preserve plugin processing, compiler unwraps NonNullExpression in reactivity analyzer, and dev server includes diagnostic logging (VERTZ_DEBUG) and health check endpoint (/\_\_vertz_diagnostics).

- Updated dependencies []:
  - @vertz/ui@0.2.2

## 0.2.3

### Patch Changes

- [#878](https://github.com/vertz-dev/vertz/pull/878) [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove `private: true` so the package is published to npm. Required by `@vertz/cli` and `@vertz/ui-server` at runtime.

- Updated dependencies []:
  - @vertz/ui@0.2.2

## 0.2.2

### Patch Changes

- Updated dependencies [[`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084)]:
  - @vertz/ui@0.2.2

## 1.0.0

### Major Changes

- [#283](https://github.com/vertz-dev/vertz/pull/283) [`c38def6`](https://github.com/vertz-dev/vertz/commit/c38def6b6e060f63afeaacd93afa85aae9154833) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - **BREAKING CHANGE:** Eliminate `.value` from public API — signal properties auto-unwrap at compile time

  The compiler now automatically inserts `.value` when accessing signal properties from `query()`, `form()`, and `createLoader()`, eliminating boilerplate from the public API.

  **Before:**

  ```ts
  const tasks = query('/api/tasks');
  const isLoading = tasks.loading.value; // Manual .value access
  const data = tasks.data.value;
  ```

  **After:**

  ```ts
  const tasks = query('/api/tasks');
  const isLoading = tasks.loading; // Compiler inserts .value automatically
  const data = tasks.data;
  ```

  **Supported APIs:**
  - `query()`: `.data`, `.loading`, `.error` (auto-unwrap) | `.refetch` (plain)
  - `form()`: `.submitting`, `.errors`, `.values` (auto-unwrap) | `.reset`, `.submit`, `.handleSubmit` (plain)
  - `createLoader()`: `.data`, `.loading`, `.error` (auto-unwrap) | `.refetch` (plain)

  **Features:**
  - Works with import aliases: `import { query as fetchData } from '@vertz/ui'`
  - Plain properties (like `.refetch`) are NOT unwrapped
  - Zero runtime overhead - pure compile-time transformation

  ## ⚠️ Breaking Change

  This is a **BREAKING CHANGE** because existing code that manually uses `.value` will need to be updated.

  ### Migration Guide

  **Required action:** Remove `.value` from signal property accesses on `query()`, `form()`, and `createLoader()` results.

  #### Before (old code):

  ```ts
  const tasks = query('/api/tasks');
  const isLoading = tasks.loading.value; // ❌ Remove .value
  const data = tasks.data.value; // ❌ Remove .value
  ```

  #### After (new code):

  ```ts
  const tasks = query('/api/tasks');
  const isLoading = tasks.loading; // ✅ Compiler auto-inserts .value
  const data = tasks.data; // ✅ Compiler auto-inserts .value
  ```

  **Why this is breaking:** If you don't remove the manual `.value`, the compiler will transform `tasks.data.value` into `tasks.data.value.value`, causing runtime errors.

  **Automated migration:** The compiler includes guard logic to detect existing `.value` usage and skip double-transformation, providing a grace period during migration. However, you should still update your code to remove manual `.value` for long-term maintainability.

  **Affected APIs:**
  - `query()` → `.data`, `.loading`, `.error`
  - `form()` → `.submitting`, `.errors`, `.values`
  - `createLoader()` → `.data`, `.loading`, `.error`

  **Non-breaking:** Plain properties like `.refetch`, `.reset`, `.submit`, `.handleSubmit` are NOT affected.

### Minor Changes

- [#267](https://github.com/vertz-dev/vertz/pull/267) [`0a33c14`](https://github.com/vertz-dev/vertz/commit/0a33c142a12a54e0da61423701ca338118ab9c98) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Zero-config SSR: `vertz({ ssr: true })` makes `vite dev` serve SSR'd HTML automatically.

  **@vertz/ui-server:**
  - Add `@vertz/ui-server/dom-shim` subpath with SSRElement, installDomShim, toVNode
  - Add `@vertz/ui-server/jsx-runtime` subpath for server-side JSX rendering

  **@vertz/ui-compiler:**
  - Add `ssr: boolean | SSROptions` to vertzPlugin options
  - Add `configureServer` hook that intercepts HTML requests and renders SSR'd HTML
  - Auto-generate virtual SSR entry module (`\0vertz:ssr-entry`)
  - Handle JSX runtime alias swap for SSR builds

  **@vertz/ui:**
  - Add `@vertz/ui/jsx-runtime` and `@vertz/ui/jsx-dev-runtime` subpath exports
  - Make router SSR-compatible (auto-detect `__SSR_URL__`, skip popstate in SSR)

### Patch Changes

- [#293](https://github.com/vertz-dev/vertz/pull/293) [`259e250`](https://github.com/vertz-dev/vertz/commit/259e2501116f805fed49b95471aaeb4f80515256) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - fix(ui-compiler): SSR routing — correct URL normalization and middleware order
  - Register SSR middleware BEFORE Vite internals (pre-hook) to prevent SPA fallback from rewriting URLs
  - Normalize URLs in SSR entry: strip /index.html suffix
  - Use surgical module invalidation (only SSR entry module, not entire module graph)

- [#199](https://github.com/vertz-dev/vertz/pull/199) [`63f074e`](https://github.com/vertz-dev/vertz/commit/63f074eefa96b49eb72724f8ec377a14a1f2c630) Thanks [@vertz-tech-lead](https://github.com/apps/vertz-tech-lead)! - Initial release of @vertz/ui v0.1 — a compiler-driven reactive UI framework.
  - Reactivity: `signal()`, `computed()`, `effect()`, `batch()`, `untrack()`
  - Compiler: `let` → signal, `const` derived → computed, JSX → DOM helpers, mutation → peek/notify
  - Component model: `ref()`, `onMount()`, `onCleanup()`, `watch()`, `children()`, `createContext()`
  - Error handling: `ErrorBoundary`, `Suspense` with async support
  - CSS-in-JS: `css()` with type-safe properties, `variants()`, `globalCss()`, `s()` shorthand
  - Theming: `defineTheme()`, `ThemeProvider`, CSS variable generation
  - Zero-runtime CSS extraction via compiler plugin
  - Forms: `form()` with schema validation, `formDataToObject()`, SDK method integration
  - Data fetching: `query()` with caching, `MemoryCache`, key derivation
  - SSR: `renderToStream()`, `serializeToHtml()`, `HeadCollector` for streaming HTML
  - Hydration: `hydrate()` with eager/lazy/interaction strategies, component registry
  - Router: `defineRoutes()`, `createRouter()`, `createLink()`, `createOutlet()`, search params
  - Primitives: 15 headless components (Button, Dialog, Select, Menu, Tabs, Accordion, etc.)
  - Testing: `renderTest()`, `findByText()`, `click()`, `type()`, `press()`, `createTestRouter()`
  - Vite plugin: HMR, CSS extraction, codegen watch mode
  - Curated public API: developer-facing exports in main barrel, compiler internals in `@vertz/ui/internals`

- Updated dependencies [[`0a33c14`](https://github.com/vertz-dev/vertz/commit/0a33c142a12a54e0da61423701ca338118ab9c98), [`0f1c028`](https://github.com/vertz-dev/vertz/commit/0f1c028dd6bb90e37ac71f60e40ba0be774cca11), [`7207c4c`](https://github.com/vertz-dev/vertz/commit/7207c4c44c2fc83f67459cbcba8e6010b4d05145), [`a454791`](https://github.com/vertz-dev/vertz/commit/a454791e0c6866cbad1d0d96bc3c0688282b021b), [`e17ccb2`](https://github.com/vertz-dev/vertz/commit/e17ccb261ecebc1ca7d58b75365869cb29253a3c), [`948f127`](https://github.com/vertz-dev/vertz/commit/948f127bf4b752274800c045d010590f1cc266d8), [`9ee0308`](https://github.com/vertz-dev/vertz/commit/9ee03084f71803b04eef5f05ced2f90b52a9fa8e), [`63f074e`](https://github.com/vertz-dev/vertz/commit/63f074eefa96b49eb72724f8ec377a14a1f2c630)]:
  - @vertz/ui@0.2.0
