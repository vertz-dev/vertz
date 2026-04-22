# @vertz/theme-shadcn

## 0.2.79

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.79
  - @vertz/ui-primitives@0.2.79

## 0.2.78

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.78
  - @vertz/ui-primitives@0.2.78

## 0.2.77

### Patch Changes

- [#2904](https://github.com/vertz-dev/vertz/pull/2904) [`6a1adab`](https://github.com/vertz-dev/vertz/commit/6a1adab795218a347c96e831d0628457dd72b796) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(theme-shadcn): emit `--radius-*` scale vars in `configureThemeBase()` [#2898]

  `token.radius.sm|md|lg|xl|full` compile to `var(--radius-*)`, but only the single
  `--radius` was being emitted — so every consumer shipped with `border-radius: 0`
  (squared buttons, cards, inputs, and squared radios/avatars/switches/badges that
  should be circles). Emit the full shadcn-style calc-based scale plus
  `--radius-full: 9999px` alongside `--radius`.

- Updated dependencies [[`6a1adab`](https://github.com/vertz-dev/vertz/commit/6a1adab795218a347c96e831d0628457dd72b796), [`9819901`](https://github.com/vertz-dev/vertz/commit/9819901b97226bbdffb090a7261ee2e3828d163c), [`4d9b23d`](https://github.com/vertz-dev/vertz/commit/4d9b23d1cac81ab88388f044d5988b2d0704f363)]:
  - @vertz/ui@0.2.77
  - @vertz/ui-primitives@0.2.77

## 0.2.76

### Patch Changes

- Updated dependencies [[`8a9546d`](https://github.com/vertz-dev/vertz/commit/8a9546d4725f5aa1572ab0dbf96e20abb6063413)]:
  - @vertz/ui-primitives@0.2.76
  - @vertz/ui@0.2.76

## 0.2.75

### Patch Changes

- Updated dependencies [[`84c68fc`](https://github.com/vertz-dev/vertz/commit/84c68fc7672891b6e65cdcd3096c872a1141a044)]:
  - @vertz/ui@0.2.75
  - @vertz/ui-primitives@0.2.75

## 0.2.74

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.74
  - @vertz/ui-primitives@0.2.74

## 0.2.73

### Patch Changes

- Updated dependencies [[`7e80041`](https://github.com/vertz-dev/vertz/commit/7e80041df6d5708fb54177edeef8bd211e368c7c), [`c724744`](https://github.com/vertz-dev/vertz/commit/c724744924b75e215201c0d19b047f4b8a287044), [`5223868`](https://github.com/vertz-dev/vertz/commit/5223868cb3001349065cc246e0ca8a03ad9356f4), [`b8253ad`](https://github.com/vertz-dev/vertz/commit/b8253ad485fba3fc04164db116ee0192e629b3d2)]:
  - @vertz/ui@0.2.73
  - @vertz/ui-primitives@0.2.73

## 0.2.72

### Patch Changes

- [#2806](https://github.com/vertz-dev/vertz/pull/2806) [`37b9ce7`](https://github.com/vertz-dev/vertz/commit/37b9ce76537f1c405388654f8af08ab91c649ad8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(theme-shadcn): dialog stack panel and title render in dark-mode foreground color

  `useDialogStack().confirm()` and other stack-rendered dialogs had unreadable
  black title text on dark backgrounds because the global CSS for the
  `dialog[data-dialog-wrapper]` panel did not set `color` explicitly. Native
  `<dialog>` elements render in the top layer and do not inherit `body` color,
  so the panel must set `color: var(--color-foreground)` — the same fix the
  scoped `Dialog.Panel` already applies. The title rule now also sets the
  foreground color explicitly as a defense-in-depth.

  Closes #2756.

- [#2795](https://github.com/vertz-dev/vertz/pull/2795) [`8bed545`](https://github.com/vertz-dev/vertz/commit/8bed5454aeeec6c374ceb43bccc92841442d87da) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - refactor(ui): drop shorthand-string CSS API in favour of object-form `css()` +
  `token.*`

  The array-form `css()` API is gone. `css()` and `variants()` now accept only
  object-form `StyleBlock` trees:

  ```tsx
  // Before
  css({ card: ["bg:background", "p:4", "rounded:lg"] });

  // After
  css({
    card: {
      backgroundColor: token.color.background,
      padding: token.spacing[4],
      borderRadius: token.radius.lg,
    },
  });
  ```

  Removed from the public API: `StyleEntry`, `StyleValue`, `UtilityClass`, `s`,
  `parseShorthand`, `resolveToken`, `ShorthandParseError`, `TokenResolveError`,
  `InlineStyleError`, `isKnownProperty`, `isValidColorToken`, and all
  token-table helpers.

  The Rust compiler (`@vertz/native-compiler`) is smaller: the array-form
  shorthand parser, the 1,900-line token tables, and the diagnostic pass that
  validated shorthand strings have all been deleted. Only object-form extraction
  remains.

  Closes #1988.

- Updated dependencies [[`d8e23a1`](https://github.com/vertz-dev/vertz/commit/d8e23a13049afb0a8611c63081bf799dc9790f77), [`8bed545`](https://github.com/vertz-dev/vertz/commit/8bed5454aeeec6c374ceb43bccc92841442d87da), [`e2db646`](https://github.com/vertz-dev/vertz/commit/e2db646ea254b60c9bec01d51400c1c46c328c98), [`8d8976d`](https://github.com/vertz-dev/vertz/commit/8d8976dd3d2d2475f37d0df79f8477fd3f58395f), [`36a459d`](https://github.com/vertz-dev/vertz/commit/36a459d191d732370cb4020533c7f8494622f1b5)]:
  - @vertz/ui@0.2.72
  - @vertz/ui-primitives@0.2.72

## 0.2.71

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.71
  - @vertz/ui-primitives@0.2.71

## 0.2.70

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.70
  - @vertz/ui-primitives@0.2.70

## 0.2.69

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.69
  - @vertz/ui-primitives@0.2.69

## 0.2.68

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.68
  - @vertz/ui-primitives@0.2.68

## 0.2.67

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.67
  - @vertz/ui-primitives@0.2.67

## 0.2.66

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.66
  - @vertz/ui-primitives@0.2.66

## 0.2.65

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.65
  - @vertz/ui-primitives@0.2.65

## 0.2.64

### Patch Changes

- Updated dependencies [[`840ace1`](https://github.com/vertz-dev/vertz/commit/840ace1f1c4a203e572394f322ee9b5c428537fa)]:
  - @vertz/ui@0.2.64
  - @vertz/ui-primitives@0.2.64

## 0.2.63

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.63
  - @vertz/ui-primitives@0.2.63

## 0.2.62

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.62
  - @vertz/ui-primitives@0.2.62

## 0.2.61

### Patch Changes

- Updated dependencies [[`7e2cbb5`](https://github.com/vertz-dev/vertz/commit/7e2cbb5fb742ce8bd0f5fac7c2e46a2e43b0b8ef)]:
  - @vertz/ui@0.2.61
  - @vertz/ui-primitives@0.2.61

## 0.2.60

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.60
  - @vertz/ui-primitives@0.2.60

## 0.2.59

### Patch Changes

- [#2517](https://github.com/vertz-dev/vertz/pull/2517) [`6a6282b`](https://github.com/vertz-dev/vertz/commit/6a6282b3525f850fe0db6d11308dcd4801f89bb3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add AppShell layout component for SaaS apps (#1661)

- Updated dependencies [[`6a6282b`](https://github.com/vertz-dev/vertz/commit/6a6282b3525f850fe0db6d11308dcd4801f89bb3)]:
  - @vertz/ui-primitives@0.2.59
  - @vertz/ui@0.2.59

## 0.2.58

### Patch Changes

- [#2480](https://github.com/vertz-dev/vertz/pull/2480) [`066bf9f`](https://github.com/vertz-dev/vertz/commit/066bf9f0be12865570c13414d595fd6dc77c1761) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): preserve context scope in useContext for effect re-runs (#2477)
  fix(theme-shadcn): center dialog wrapper with viewport sizing and flexbox (#2478)

- [#2471](https://github.com/vertz-dev/vertz/pull/2471) [`a31284d`](https://github.com/vertz-dev/vertz/commit/a31284df9dc6efb4ccb10dfedbc37afaf5e07c3a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove default layout styles (border, padding, text) from List.Item theme — List is a functional primitive, not a layout component

- [#2479](https://github.com/vertz-dev/vertz/pull/2479) [`4ccb5db`](https://github.com/vertz-dev/vertz/commit/4ccb5db72f7b14f9cb3d50bff77dc26a34c8bd53) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(create-vertz-app): add DialogStackProvider and `w:full` to todo-app template

  fix(ui): fix DialogStackProvider hydration — add `display:contents` so wrapper doesn't break layout

  fix(theme-shadcn): fix dialog centering — add `margin: auto` to wrapper, use explicit panel width `min(28rem, calc(100vw - 2rem))`

- Updated dependencies [[`066bf9f`](https://github.com/vertz-dev/vertz/commit/066bf9f0be12865570c13414d595fd6dc77c1761), [`4ccb5db`](https://github.com/vertz-dev/vertz/commit/4ccb5db72f7b14f9cb3d50bff77dc26a34c8bd53)]:
  - @vertz/ui@0.2.58
  - @vertz/ui-primitives@0.2.58

## 0.2.57

### Patch Changes

- Updated dependencies [[`f9ac074`](https://github.com/vertz-dev/vertz/commit/f9ac0740448bbcece50886a387184898da625933)]:
  - @vertz/ui@0.2.57
  - @vertz/ui-primitives@0.2.57

## 0.2.56

### Patch Changes

- [#2459](https://github.com/vertz-dev/vertz/pull/2459) [`52ebef6`](https://github.com/vertz-dev/vertz/commit/52ebef61c623f77becfde5bef8115a32daf027a6) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(build): use native compiler for library builds so Provider children are thunked

  Library packages (ui-primitives, theme-shadcn) were compiled with Bun's JSX fallback
  instead of the native Rust compiler. The fallback doesn't wrap JSX children in thunks,
  causing context-based components (List, Tabs, Dialog, etc.) to throw "must be used
  inside" errors because children evaluate before the Provider sets up context.

- Updated dependencies [[`52ebef6`](https://github.com/vertz-dev/vertz/commit/52ebef61c623f77becfde5bef8115a32daf027a6)]:
  - @vertz/ui-primitives@0.2.56
  - @vertz/ui@0.2.56

## 0.2.55

### Patch Changes

- [#2436](https://github.com/vertz-dev/vertz/pull/2436) [`b998c86`](https://github.com/vertz-dev/vertz/commit/b998c861136c07939abe06d025b0f61f21f7ff18) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(theme-shadcn): preserve children getter descriptors in themed List wrapper to prevent eager evaluation before ListContext.Provider is active

- Updated dependencies []:
  - @vertz/ui@0.2.55
  - @vertz/ui-primitives@0.2.55

## 0.2.54

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.54
  - @vertz/ui-primitives@0.2.54

## 0.2.53

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.53
  - @vertz/ui-primitives@0.2.53

## 0.2.52

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.52
  - @vertz/ui-primitives@0.2.52

## 0.2.51

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.51
  - @vertz/ui-primitives@0.2.51

## 0.2.50

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.50
  - @vertz/ui-primitives@0.2.50

## 0.2.49

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.49
  - @vertz/ui-primitives@0.2.49

## 0.2.48

### Patch Changes

- Updated dependencies [[`46397c6`](https://github.com/vertz-dev/vertz/commit/46397c67af30f5441cebdca616f3a1627111312d), [`36b0f20`](https://github.com/vertz-dev/vertz/commit/36b0f2007822bc5c580d04a30d4ef1ecbee2146b)]:
  - @vertz/ui@0.2.48
  - @vertz/ui-primitives@0.2.48

## 0.2.47

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.47
  - @vertz/ui-primitives@0.2.47

## 0.2.46

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.46
  - @vertz/ui-primitives@0.2.46

## 0.2.45

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.45
  - @vertz/ui-primitives@0.2.45

## 0.2.44

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.44
  - @vertz/ui-primitives@0.2.44

## 0.2.43

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.43
  - @vertz/ui-primitives@0.2.43

## 0.2.42

### Patch Changes

- Updated dependencies [[`caaee34`](https://github.com/vertz-dev/vertz/commit/caaee3414f28d055b3065dc2d4ef67c9e3856ab9), [`1eeec6c`](https://github.com/vertz-dev/vertz/commit/1eeec6c95c0ced4d869995dbdce205c3bde92a25)]:
  - @vertz/ui@0.2.42
  - @vertz/ui-primitives@0.2.42

## 0.2.41

### Patch Changes

- Updated dependencies [[`7f837fc`](https://github.com/vertz-dev/vertz/commit/7f837fc10a0acd4ad77bfc4bcaf733700c8a4f8b)]:
  - @vertz/ui@0.2.41
  - @vertz/ui-primitives@0.2.41

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

- [#1994](https://github.com/vertz-dev/vertz/pull/1994) [`7c89bf1`](https://github.com/vertz-dev/vertz/commit/7c89bf196ff00ce8d17744f43a40f2dadfb5d989) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix: prevent client-side crash when composed primitives fail to resolve in the bundle

  Primitives in configureTheme() are now lazily initialized — each is created only on first access instead of all 29 being eagerly initialized during registerTheme(). This isolates import resolution failures to the specific primitive that's broken, rather than crashing the entire theme.

  Also adds a guard in withStyles() that throws a descriptive error when a component is undefined, replacing the opaque "Cannot convert undefined or null to object" crash.

- [#1975](https://github.com/vertz-dev/vertz/pull/1975) [`26b36bd`](https://github.com/vertz-dev/vertz/commit/26b36bd725a13c5d0c72c00a1e3addb2deb832c9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(theme-shadcn): flatten configureTheme override API — `colors` replaces `overrides.tokens.colors`

  **BREAKING:** `ThemeConfig.overrides` is removed. Use `ThemeConfig.colors` instead:

  ```ts
  // Before
  configureTheme({
    overrides: { tokens: { colors: { primary: { DEFAULT: "#7c3aed" } } } },
  });

  // After
  configureTheme({ colors: { primary: { DEFAULT: "#7c3aed" } } });
  ```

- Updated dependencies [[`bee011e`](https://github.com/vertz-dev/vertz/commit/bee011e47661b31152ad3dfc589fd45eda2f3e44), [`7c89bf1`](https://github.com/vertz-dev/vertz/commit/7c89bf196ff00ce8d17744f43a40f2dadfb5d989)]:
  - @vertz/ui@0.2.40
  - @vertz/ui-primitives@0.2.40

## 0.2.39

### Patch Changes

- Updated dependencies [[`7bf733f`](https://github.com/vertz-dev/vertz/commit/7bf733fec92424d08a08dafe3b4c4a5984f084b0), [`a948ef1`](https://github.com/vertz-dev/vertz/commit/a948ef160c244fb2e42cd53e7190b8bf6a96f9db)]:
  - @vertz/ui@0.2.39
  - @vertz/ui-primitives@0.2.39

## 0.2.38

### Patch Changes

- Updated dependencies [[`20344c0`](https://github.com/vertz-dev/vertz/commit/20344c0a7df8260ce98034bd0e2de73ef11ecfcd)]:
  - @vertz/ui@0.2.38
  - @vertz/ui-primitives@0.2.38

## 0.2.37

### Patch Changes

- Updated dependencies [[`12231be`](https://github.com/vertz-dev/vertz/commit/12231be46d322526be6d8b6752911d88f025e4d0)]:
  - @vertz/ui@0.2.37
  - @vertz/ui-primitives@0.2.37

## 0.2.36

### Patch Changes

- Updated dependencies [[`94a3244`](https://github.com/vertz-dev/vertz/commit/94a32446298cc6d8b76849abec315e980d5a4341), [`9281153`](https://github.com/vertz-dev/vertz/commit/9281153c407654e4cf26c5c41af3274128301e3e)]:
  - @vertz/ui@0.2.36
  - @vertz/ui-primitives@0.2.36

## 0.2.35

### Patch Changes

- Updated dependencies [[`5a80932`](https://github.com/vertz-dev/vertz/commit/5a8093299d96eefd00f0208af61eeb37aef28014)]:
  - @vertz/ui@0.2.35
  - @vertz/ui-primitives@0.2.35

## 0.2.34

### Patch Changes

- Updated dependencies [[`3399191`](https://github.com/vertz-dev/vertz/commit/339919192bd95b5d212abf7f6d3746101c8d5422)]:
  - @vertz/ui@0.2.34
  - @vertz/ui-primitives@0.2.34

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.33
  - @vertz/ui-primitives@0.2.33

## 0.2.32

### Patch Changes

- Updated dependencies [[`ca59e8b`](https://github.com/vertz-dev/vertz/commit/ca59e8b824806cc222521677abbdcbb753347969)]:
  - @vertz/ui@0.2.32
  - @vertz/ui-primitives@0.2.32

## 0.2.31

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.31
  - @vertz/ui-primitives@0.2.31

## 0.2.30

### Patch Changes

- Updated dependencies [[`0ba086d`](https://github.com/vertz-dev/vertz/commit/0ba086d9bca13cac9e0a27a1cbd199c8b5ca6a07), [`1d36182`](https://github.com/vertz-dev/vertz/commit/1d36182b0678378d50d9a063d6471a9114712b6a)]:
  - @vertz/ui@0.2.30
  - @vertz/ui-primitives@0.2.30

## 0.2.29

### Patch Changes

- Updated dependencies [[`7771170`](https://github.com/vertz-dev/vertz/commit/777117093d783aaeecc905ec65c4c85363746494)]:
  - @vertz/ui@0.2.29
  - @vertz/ui-primitives@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.28
  - @vertz/ui-primitives@0.2.28

## 0.2.27

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.27
  - @vertz/ui-primitives@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies [[`8552f21`](https://github.com/vertz-dev/vertz/commit/8552f217350e2acb0caac26ac215a49736b07e55)]:
  - @vertz/ui@0.2.26
  - @vertz/ui-primitives@0.2.26

## 0.2.25

### Patch Changes

- Updated dependencies [[`04673a3`](https://github.com/vertz-dev/vertz/commit/04673a32a4849db08d80bb39caf801295fec9832), [`841c9ae`](https://github.com/vertz-dev/vertz/commit/841c9ae69b559d25ed443d3c5fa8e21b2fd174bf)]:
  - @vertz/ui@0.2.25
  - @vertz/ui-primitives@0.2.25

## 0.2.24

### Patch Changes

- [#1712](https://github.com/vertz-dev/vertz/pull/1712) [`a73dd79`](https://github.com/vertz-dev/vertz/commit/a73dd792de1876513914b89ef896fc88243b4cc8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add EmptyState compound component and Skeleton.Text/Circle sub-components

  New `EmptyState` compound component with Icon, Title, Description, and Action slots for empty-data placeholders. New `Skeleton.Text` (multi-line text placeholder) and `Skeleton.Circle` (circular avatar placeholder) sub-components. Skeleton `base` class key renamed to `root` for consistency.

- [#1710](https://github.com/vertz-dev/vertz/pull/1710) [`bc21689`](https://github.com/vertz-dev/vertz/commit/bc21689349e116a76a33290f64152ec50087ae01) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(theme-shadcn): add explicit text:foreground to components with bg:background

  Components that set `bg:background` without a corresponding `text:foreground` could show black text on dark backgrounds when rendered in the browser's top-layer (e.g., Dialog/AlertDialog via `showModal()`). Fixed by adding explicit `text:foreground` to all affected components: Dialog, AlertDialog, Calendar, Carousel, Menubar, DatePicker, Pagination, and Button outline variant.

- [#1684](https://github.com/vertz-dev/vertz/pull/1684) [`e24615a`](https://github.com/vertz-dev/vertz/commit/e24615a8619ae84b993c18dbdca2671ca254f9bb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-compiler): support JSX spread attributes on intrinsic elements and components

  JSX spread attributes (`<button {...rest}>`, `<Button {...props}>`) were silently dropped by the compiler. Spread attributes now work correctly:

  - **Component calls**: spread emits `...expr` in the props object literal
  - **Intrinsic elements**: spread emits `__spread(el, props)` runtime call that handles event handlers, style, class/className, ref, SVG attributes, and standard HTML attributes
  - **theme-shadcn Button**: removed `applyProps` workaround in favor of native JSX spread

- Updated dependencies [[`a73dd79`](https://github.com/vertz-dev/vertz/commit/a73dd792de1876513914b89ef896fc88243b4cc8), [`d58a100`](https://github.com/vertz-dev/vertz/commit/d58a100f18762189be4319b58a4b86f8a774ac95), [`0e33400`](https://github.com/vertz-dev/vertz/commit/0e33400d96a9f778f3b936124d7544804f731db9), [`e24615a`](https://github.com/vertz-dev/vertz/commit/e24615a8619ae84b993c18dbdca2671ca254f9bb), [`adea2f1`](https://github.com/vertz-dev/vertz/commit/adea2f15f306d09ecebc56fc1f3841ff4b14b2ba)]:
  - @vertz/ui-primitives@0.2.24
  - @vertz/ui@0.2.24

## 0.2.23

### Patch Changes

- [#1626](https://github.com/vertz-dev/vertz/pull/1626) [`8a31e2a`](https://github.com/vertz-dev/vertz/commit/8a31e2a3b50b053eb45bae3ced0a4e71f3f9d6b0) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Reset list-style, margin, and padding on breadcrumb ol to prevent numbered list markers from overlapping text

- [#1585](https://github.com/vertz-dev/vertz/pull/1585) [`18b300a`](https://github.com/vertz-dev/vertz/commit/18b300adadcdea445ab708b10c2600489e865f52) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add captionLayout prop to Calendar for month/year dropdown navigation

- [#1618](https://github.com/vertz-dev/vertz/pull/1618) [`f609e2d`](https://github.com/vertz-dev/vertz/commit/f609e2d93773f4b11d3b981e8a50af643abbf0c4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Command component styling: empty state starts hidden, increased list top-padding for input-to-results gap

- [#1617](https://github.com/vertz-dev/vertz/pull/1617) [`67821b4`](https://github.com/vertz-dev/vertz/commit/67821b4309bf62c2aedbc538c0fcc1c732a9014f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(theme-shadcn): ContextMenu content has min-width, all-sided padding, and visual consistency with DropdownMenu

- [#1594](https://github.com/vertz-dev/vertz/pull/1594) [`e57868e`](https://github.com/vertz-dev/vertz/commit/e57868ee9097c53722237b3d2cf5bee1ffff085b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Forward `captionLayout` prop through DatePicker to enable dropdown month/year navigation

- [#1623](https://github.com/vertz-dev/vertz/pull/1623) [`c150205`](https://github.com/vertz-dev/vertz/commit/c15020541ab92cd80ee610753c62c36c47d8eded) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Drawer rendering small at bottom-left by adding dialog UA style resets (margin, width, border, outline), ::backdrop styles, and hidden-when-closed rules to all panel directions

- [#1599](https://github.com/vertz-dev/vertz/pull/1599) [`5830045`](https://github.com/vertz-dev/vertz/commit/58300458245c75756f00006f0a2325d72c44a726) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix dialog panel CSS hiding non-native dialog elements with data-state="open"

  The `&:not([open])` rule on dialog and alert-dialog panel styles assumed native
  `<dialog>` elements. When a `<div role="dialog">` used panel styles, the element
  was always hidden because `<div>` never has the `[open]` attribute. Changed to
  `&:not([open]):not([data-state="open"])` so elements with `data-state="open"` remain visible.

- [#1619](https://github.com/vertz-dev/vertz/pull/1619) [`5ee3712`](https://github.com/vertz-dev/vertz/commit/5ee37128a448324c6129378d7e3873b813dd3623) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix HoverCard styling: upgrade border-radius to lg, add outline-none, add zoom animation alongside fade for consistent appearance with other floating components

- [#1621](https://github.com/vertz-dev/vertz/pull/1621) [`028e703`](https://github.com/vertz-dev/vertz/commit/028e70302c252b529b0d94aceb1334cace3c9795) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix menubar submenus being mispositioned and pushing sibling items by enabling floating positioning (`bottom-start` placement) in the themed menubar component

- [#1620](https://github.com/vertz-dev/vertz/pull/1620) [`14e032c`](https://github.com/vertz-dev/vertz/commit/14e032c00a2af9a6c3d7f53bce548343990ac953) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Select dropdown open/close animation: correct keyframe names and defer display:none until exit animation completes

- Updated dependencies [[`18b300a`](https://github.com/vertz-dev/vertz/commit/18b300adadcdea445ab708b10c2600489e865f52), [`f609e2d`](https://github.com/vertz-dev/vertz/commit/f609e2d93773f4b11d3b981e8a50af643abbf0c4), [`173e9cb`](https://github.com/vertz-dev/vertz/commit/173e9cb0fc08e00f618eeedde1101b760c6de4b2), [`10f6309`](https://github.com/vertz-dev/vertz/commit/10f6309790bff69c7a1a0ab92e50f78f34b129c3), [`e57868e`](https://github.com/vertz-dev/vertz/commit/e57868ee9097c53722237b3d2cf5bee1ffff085b), [`1709f6d`](https://github.com/vertz-dev/vertz/commit/1709f6d933f04600d1b959b51660f2f8f33805d8), [`1e26cca`](https://github.com/vertz-dev/vertz/commit/1e26cca7eca00291633a2fa6257fc80a1f409b60), [`82055ae`](https://github.com/vertz-dev/vertz/commit/82055aefc19e4c3a115152f2e7157389486e792e), [`a21f762`](https://github.com/vertz-dev/vertz/commit/a21f76239e5c4b112c7be9a4ebea8327c3d2230b), [`7c146e6`](https://github.com/vertz-dev/vertz/commit/7c146e695b642affeb39134beb0e1eb6475f20a8), [`9caf0bc`](https://github.com/vertz-dev/vertz/commit/9caf0bce30d59cd284dbf9687ee2c79765bbb563), [`14e032c`](https://github.com/vertz-dev/vertz/commit/14e032c00a2af9a6c3d7f53bce548343990ac953)]:
  - @vertz/ui-primitives@0.2.23
  - @vertz/ui@0.2.23

## 0.2.22

### Patch Changes

- [#1498](https://github.com/vertz-dev/vertz/pull/1498) [`8ed55f6`](https://github.com/vertz-dev/vertz/commit/8ed55f6fc8aa691758606fe044a8b1d74b7bb9bc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert collapsible factory to declarative JSX component with sub-components (Collapsible.Trigger, Collapsible.Content)

- [#1505](https://github.com/vertz-dev/vertz/pull/1505) [`5d64812`](https://github.com/vertz-dev/vertz/commit/5d6481233006f67c21375f3879fda600c86c0cdd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert DatePicker factory to declarative JSX component with sub-components (DatePicker.Trigger, DatePicker.Content)

- [#1535](https://github.com/vertz-dev/vertz/pull/1535) [`179829d`](https://github.com/vertz-dev/vertz/commit/179829d9df73097aead0d666a1b130c9a138573b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix dialog close animation not playing with native `<dialog>`. Reorder close logic to call hideDialog() before updating reactive state, force reflow to start CSS animation, prevent native close on Escape, and add ::backdrop fade-out animation.

- [#1532](https://github.com/vertz-dev/vertz/pull/1532) [`8ab61a4`](https://github.com/vertz-dev/vertz/commit/8ab61a414fb759f6c086db6ee6e1aec95545daf9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add global CSS rule to hide `dialog:not([open])` elements, preventing content flash during SSR-to-hydration transition

- [#1500](https://github.com/vertz-dev/vertz/pull/1500) [`180ac91`](https://github.com/vertz-dev/vertz/commit/180ac91f4fbc562581136dd8256f67fcc724fa69) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert HoverCard factory to JSX component with composed primitives

- [#1533](https://github.com/vertz-dev/vertz/pull/1533) [`e5d8d4d`](https://github.com/vertz-dev/vertz/commit/e5d8d4d49da65c13fb5c76ec279314052273da30) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Popover and DropdownMenu content panels taking full width instead of fitting content

- [#1504](https://github.com/vertz-dev/vertz/pull/1504) [`32dc39b`](https://github.com/vertz-dev/vertz/commit/32dc39b9f23b89aa387be49303fc6fcc4dceccdd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove unnecessary type castings from themed primitive components. Eliminated `as ComposedProps` and `as ThemedComponent` casts across 23 files where proper type inference works naturally through `withStyles()` and `Object.assign`. Only JSX-to-HTMLElement narrowing casts (3 in drawer.tsx) remain with SAFETY comments.

- [#1507](https://github.com/vertz-dev/vertz/pull/1507) [`6d32565`](https://github.com/vertz-dev/vertz/commit/6d32565c2818f9235d02af14a616279f018d0ff5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ResizablePanel factory to JSX component with context-based sub-components

- [#1502](https://github.com/vertz-dev/vertz/pull/1502) [`2e99e39`](https://github.com/vertz-dev/vertz/commit/2e99e3943830d2e2e0b2b44a1b32d8641e63dbe3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ScrollArea factory to JSX component with composed primitives

- [#1534](https://github.com/vertz-dev/vertz/pull/1534) [`fabfb87`](https://github.com/vertz-dev/vertz/commit/fabfb879cd93dbcedbae4490996e8ce9cedf9457) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Select: click-outside dismiss, add chevron SVG icon, float dropdown over content

- [#1538](https://github.com/vertz-dev/vertz/pull/1538) [`9b8af7b`](https://github.com/vertz-dev/vertz/commit/9b8af7b7645cf274e5b2eaacb1680822cd115063) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Sheet panels not taking full viewport height/width after native dialog rewrite. Left/right panels now set `height: 100dvh` and `max-height: none`; top/bottom panels set `width: 100dvw` and `max-width: none` to override the `<dialog>` UA stylesheet constraints.

- [#1503](https://github.com/vertz-dev/vertz/pull/1503) [`1c4916b`](https://github.com/vertz-dev/vertz/commit/1c4916b04eaaef0ee2e27eda1b73c36ae24e665e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ToggleGroup factory to JSX component with composed primitives

- Updated dependencies [[`8ed55f6`](https://github.com/vertz-dev/vertz/commit/8ed55f6fc8aa691758606fe044a8b1d74b7bb9bc), [`5d64812`](https://github.com/vertz-dev/vertz/commit/5d6481233006f67c21375f3879fda600c86c0cdd), [`179829d`](https://github.com/vertz-dev/vertz/commit/179829d9df73097aead0d666a1b130c9a138573b), [`4c96794`](https://github.com/vertz-dev/vertz/commit/4c967943b0289542b0162556e299a309e4a86f1f), [`180ac91`](https://github.com/vertz-dev/vertz/commit/180ac91f4fbc562581136dd8256f67fcc724fa69), [`e248ac3`](https://github.com/vertz-dev/vertz/commit/e248ac37bb9639d213ad5326d70db08a59adb7ff), [`6d32565`](https://github.com/vertz-dev/vertz/commit/6d32565c2818f9235d02af14a616279f018d0ff5), [`2e99e39`](https://github.com/vertz-dev/vertz/commit/2e99e3943830d2e2e0b2b44a1b32d8641e63dbe3), [`fabfb87`](https://github.com/vertz-dev/vertz/commit/fabfb879cd93dbcedbae4490996e8ce9cedf9457), [`1c4916b`](https://github.com/vertz-dev/vertz/commit/1c4916b04eaaef0ee2e27eda1b73c36ae24e665e)]:
  - @vertz/ui-primitives@0.2.22
  - @vertz/ui@0.2.22

## 0.2.21

### Patch Changes

- [#1317](https://github.com/vertz-dev/vertz/pull/1317) [`e093f38`](https://github.com/vertz-dev/vertz/commit/e093f38d9e64a42582f508b7d22ed274e1210681) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - `AlertDialog.Action` and `AlertDialog.Cancel` now accept `onClick` and other event handler props. Previously these were silently ignored because `AlertDialogSlotProps` only allowed `children` and `class`.

- [#1485](https://github.com/vertz-dev/vertz/pull/1485) [`796ef1a`](https://github.com/vertz-dev/vertz/commit/796ef1a9826f401c6d0b08f424d53609debda029) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert calendar from factory API to declarative JSX component. `Calendar` is now a PascalCase component importable from `@vertz/ui/components`, replacing the lowercase `calendar` factory.

- [#1488](https://github.com/vertz-dev/vertz/pull/1488) [`a5b9cbe`](https://github.com/vertz-dev/vertz/commit/a5b9cbe68202345ab09002f7e42c2a5be0c917bf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert carousel from factory pattern to declarative JSX component with Carousel.Slide, Carousel.Previous, and Carousel.Next sub-components

- [#1461](https://github.com/vertz-dev/vertz/pull/1461) [`520444e`](https://github.com/vertz-dev/vertz/commit/520444e3bdbbf3140b75ed3754870166544b5f88) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add centralized theme API — registerTheme() + @vertz/ui/components

  Adds `registerTheme()` to `@vertz/ui` and a new `@vertz/ui/components` subpath export. Developers can now register a theme once and import components from a single, stable path instead of threading theme references through local modules.

  `@vertz/theme-shadcn` now provides module augmentation for `@vertz/ui/components`, giving full type safety to centralized component imports when the theme package is installed.

- [#1345](https://github.com/vertz-dev/vertz/pull/1345) [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Adopt `className` as the standard JSX prop for CSS classes, matching React convention. The `class` prop remains as a deprecated alias. All components, examples, and docs updated.

- [#1497](https://github.com/vertz-dev/vertz/pull/1497) [`fa3d23c`](https://github.com/vertz-dev/vertz/commit/fa3d23ca2e92a4b734c4908ab274d8e75e45cbc0) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert command factory to declarative JSX component with sub-components (Command.Input, Command.List, Command.Empty, Command.Item, Command.Group, Command.Separator)

- [#1489](https://github.com/vertz-dev/vertz/pull/1489) [`823e301`](https://github.com/vertz-dev/vertz/commit/823e3016dcb4487a7cdf9af61aea940566ffb21c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(theme-shadcn): convert contextMenu factory to JSX component

  Convert the `contextMenu` primitive from an imperative factory function to a
  declarative JSX component with `.Trigger`, `.Content`, `.Item`, `.Group`,
  `.Label`, and `.Separator` sub-components.

  - Add `ComposedContextMenu` in `@vertz/ui-primitives` (context-based sub-component wiring)
  - Replace imperative `createThemedContextMenu` factory with `withStyles()` wrapper
  - Promote from lowercase `contextMenu` factory to PascalCase `ContextMenu` compound proxy
  - Importable from `@vertz/ui/components` as `ContextMenu`
  - No `document.createElement` — fully declarative JSX

- [#1487](https://github.com/vertz-dev/vertz/pull/1487) [`86d33bd`](https://github.com/vertz-dev/vertz/commit/86d33bd56934d62441b031fb72dd86687f0d0845) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert drawer factory to declarative JSX component with sub-components (Trigger, Content, Header, Title, Description, Footer, Handle)

- [#1316](https://github.com/vertz-dev/vertz/pull/1316) [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Simplify css() nested selector object shape from `{ property: 'x', value: 'y' }` to plain `{ 'x': 'y' }`. Remove RawDeclaration type. Support both direct object and array-with-objects forms for nested selectors.

- [#1355](https://github.com/vertz-dev/vertz/pull/1355) [`cda8b4b`](https://github.com/vertz-dev/vertz/commit/cda8b4b75a52eab1459b41adf686bbe90e5fcf97) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Move event handler wiring (`wireEventHandlers`, `isKnownEventHandler`, `ElementEventHandlers`) from `@vertz/theme-shadcn` to `@vertz/ui-primitives/utils`. Add `applyProps()` utility that combines event wiring and attribute forwarding. Theme components now delegate DOM behavior to primitives.

- [#1383](https://github.com/vertz-dev/vertz/pull/1383) [`4f5c101`](https://github.com/vertz-dev/vertz/commit/4f5c101424c2f7009ef750b2c12c220f377e0813) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-primitives,theme-shadcn): wire missing DropdownMenu onOpenChange, AlertDialog Header, and Select indicator/chevron

  - DropdownMenu: add `onOpenChange` to `ComposedDropdownMenuProps` and themed `DropdownMenuRootProps`, forward to `Menu.Root`
  - AlertDialog: expose `Header` sub-component on `ThemedAlertDialogComponent` type and factory
  - Select: add check indicator (`data-part="indicator"`) to items and chevron icon (`data-part="chevron"`) to trigger, wire `itemIndicator` class through themed factory

- [#1330](https://github.com/vertz-dev/vertz/pull/1330) [`aacd22a`](https://github.com/vertz-dev/vertz/commit/aacd22a3ccf72d92ed89381708ca826fcbcda9ae) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - `Input` and `Textarea` now wire `on*` props (e.g. `onInput`, `onChange`, `onFocus`) as event listeners instead of setting them as string attributes. Also adds `onInput` and `onChange` to the shared `ElementEventHandlers` interface.

- [#1490](https://github.com/vertz-dev/vertz/pull/1490) [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert menubar from factory to declarative JSX component with sub-components (Menubar.Menu, Menubar.Trigger, Menubar.Content, Menubar.Item, Menubar.Group, Menubar.Label, Menubar.Separator)

- [#1495](https://github.com/vertz-dev/vertz/pull/1495) [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert `navigationMenu` factory to declarative `NavigationMenu` JSX component with `.List`, `.Item`, `.Trigger`, `.Content`, `.Link`, `.Viewport` sub-components. Importable from `@vertz/ui/components`.

- [#1389](https://github.com/vertz-dev/vertz/pull/1389) [`027890d`](https://github.com/vertz-dev/vertz/commit/027890d736a3b47f545e3e110693f118041042b2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Wire `label` class key through Select: add `label` to `SelectClasses`, render a visible group label element in `SelectGroup`, and pass `label` styles in `createThemedSelect()`.

- [#1415](https://github.com/vertz-dev/vertz/pull/1415) [`d760784`](https://github.com/vertz-dev/vertz/commit/d76078402df8eed4888589fd128142bb10e6d69a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Sheet overlay no longer blocks pointer events when closed. Added `pointer-events: none` to the overlay's closed state in both the theme CSS and the composed component's inline style.

- Updated dependencies [[`f933062`](https://github.com/vertz-dev/vertz/commit/f93306200b0d994280b45ecd7c62a76d35e699e3), [`a16511c`](https://github.com/vertz-dev/vertz/commit/a16511cd78256fe86d0d69393dd923353d6f445a), [`796ef1a`](https://github.com/vertz-dev/vertz/commit/796ef1a9826f401c6d0b08f424d53609debda029), [`a5b9cbe`](https://github.com/vertz-dev/vertz/commit/a5b9cbe68202345ab09002f7e42c2a5be0c917bf), [`520444e`](https://github.com/vertz-dev/vertz/commit/520444e3bdbbf3140b75ed3754870166544b5f88), [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178), [`fa3d23c`](https://github.com/vertz-dev/vertz/commit/fa3d23ca2e92a4b734c4908ab274d8e75e45cbc0), [`646fc3f`](https://github.com/vertz-dev/vertz/commit/646fc3f82d21c79447a6560e40a08f8463709167), [`823e301`](https://github.com/vertz-dev/vertz/commit/823e3016dcb4487a7cdf9af61aea940566ffb21c), [`86d33bd`](https://github.com/vertz-dev/vertz/commit/86d33bd56934d62441b031fb72dd86687f0d0845), [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c), [`a7e37c3`](https://github.com/vertz-dev/vertz/commit/a7e37c3dd29ac75183a085d34b0621d339f8402a), [`cda8b4b`](https://github.com/vertz-dev/vertz/commit/cda8b4b75a52eab1459b41adf686bbe90e5fcf97), [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1), [`301c401`](https://github.com/vertz-dev/vertz/commit/301c40192ddec0a306bba997a7f9e4ce4253aa95), [`4f5c101`](https://github.com/vertz-dev/vertz/commit/4f5c101424c2f7009ef750b2c12c220f377e0813), [`c9d6c7e`](https://github.com/vertz-dev/vertz/commit/c9d6c7ef368efdc905b4e96302798b2db65522aa), [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e), [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10), [`427e519`](https://github.com/vertz-dev/vertz/commit/427e5194a7f783c2accc246409bf146dcfa2f1b7), [`86fb89b`](https://github.com/vertz-dev/vertz/commit/86fb89bc7b7f681c45fd2ac823ab493a91574b38), [`41565d7`](https://github.com/vertz-dev/vertz/commit/41565d7960871c4a1f38f4019894302a4a7e7ff1), [`0d973b0`](https://github.com/vertz-dev/vertz/commit/0d973b03a06e8d53e23c4be315bfcc23ec1d534e), [`72348fe`](https://github.com/vertz-dev/vertz/commit/72348fe2fb0dfd8e63ec5f9f4db3973ecb3e494e), [`027890d`](https://github.com/vertz-dev/vertz/commit/027890d736a3b47f545e3e110693f118041042b2), [`d760784`](https://github.com/vertz-dev/vertz/commit/d76078402df8eed4888589fd128142bb10e6d69a), [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e), [`cba472a`](https://github.com/vertz-dev/vertz/commit/cba472a554330cab18778c7c60e088e50a39a4ec), [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc), [`9a6eb66`](https://github.com/vertz-dev/vertz/commit/9a6eb6635b4c9776c3062e6d89ef79955435baa9), [`f356523`](https://github.com/vertz-dev/vertz/commit/f356523f7054b1b72d7936e3a7e13147904087dc), [`f9eccd5`](https://github.com/vertz-dev/vertz/commit/f9eccd56b2ecc4467b36b8e78bb3a072141ef93c), [`4079d6b`](https://github.com/vertz-dev/vertz/commit/4079d6b7567479f5f59648e81773f098c7696d02)]:
  - @vertz/ui-primitives@0.2.21
  - @vertz/ui@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.20
  - @vertz/ui-primitives@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.19
  - @vertz/ui-primitives@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies [[`b4cb6b6`](https://github.com/vertz-dev/vertz/commit/b4cb6b6826583c05efcdfd0af0e046a49f6eed91), [`c2355f9`](https://github.com/vertz-dev/vertz/commit/c2355f9d3e13feac615b00d48406e4626e92869b), [`e5ac67e`](https://github.com/vertz-dev/vertz/commit/e5ac67e24a05e0342a8c470ef741d7729ebeaf58)]:
  - @vertz/ui@0.2.18
  - @vertz/ui-primitives@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies [[`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e), [`6d6a85c`](https://github.com/vertz-dev/vertz/commit/6d6a85c0fd9f354a8d077e2eb1afdcf065344b95)]:
  - @vertz/ui@0.2.17
  - @vertz/ui-primitives@0.2.17

## 0.2.16

### Patch Changes

- [#1155](https://github.com/vertz-dev/vertz/pull/1155) [`548d9fb`](https://github.com/vertz-dev/vertz/commit/548d9fb98dcf043bae7fc729d55b9a91a28f4de6) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `@vertz/theme-shadcn/base` subpath export with `configureThemeBase()` for lightweight theme setup without bundling 38 style factories and 30+ component factories.

- Updated dependencies [[`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136), [`d2f6baf`](https://github.com/vertz-dev/vertz/commit/d2f6baf560db958f56257879d5d69da200ed519d), [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea), [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf), [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb), [`b061fc4`](https://github.com/vertz-dev/vertz/commit/b061fc4d04e851ae1ec6addd9342cec7b1a698f8), [`7de4b67`](https://github.com/vertz-dev/vertz/commit/7de4b67985065450262fa6f5a3acdc6b269f177e), [`d44234d`](https://github.com/vertz-dev/vertz/commit/d44234de726d5dfa786103b3e5a311754753f08e), [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c), [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086), [`9f6f292`](https://github.com/vertz-dev/vertz/commit/9f6f292137d89064c1d86c2231e1f416fa1abd61), [`9ea1dc0`](https://github.com/vertz-dev/vertz/commit/9ea1dc08a892918af7fbe5433293cf7c370f34f0), [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c), [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc)]:
  - @vertz/ui@0.2.16
  - @vertz/ui-primitives@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies [[`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf), [`d0f0941`](https://github.com/vertz-dev/vertz/commit/d0f09419950bd0d6d9229a11fa9bf07f632fb85d)]:
  - @vertz/ui@0.2.15
  - @vertz/ui-primitives@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.14
  - @vertz/ui-primitives@0.2.14

## 0.2.13

### Patch Changes

- Updated dependencies [[`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7), [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a), [`3a79c2f`](https://github.com/vertz-dev/vertz/commit/3a79c2fad5bfbaed61f252cf2b908592e12a82bd), [`a82b2ec`](https://github.com/vertz-dev/vertz/commit/a82b2ec1ccc94f278916796783c33d81ffead211), [`1011e51`](https://github.com/vertz-dev/vertz/commit/1011e51fbfe528e35930e3dd5c32b76568b0684a), [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d), [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05)]:
  - @vertz/ui@0.2.13
  - @vertz/ui-primitives@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies [[`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9)]:
  - @vertz/ui@0.2.12
  - @vertz/ui-primitives@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies [[`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a)]:
  - @vertz/ui@0.2.11
  - @vertz/ui-primitives@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.8
  - @vertz/ui-primitives@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.7
  - @vertz/ui-primitives@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.6
  - @vertz/ui-primitives@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.5
  - @vertz/ui-primitives@0.2.5

## 0.2.2

### Patch Changes

- Updated dependencies [[`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084)]:
  - @vertz/ui@0.2.2
  - @vertz/ui-primitives@0.2.2
