# @vertz/ui

## 0.2.74

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.74

## 0.2.73

### Patch Changes

- [#2827](https://github.com/vertz-dev/vertz/pull/2827) [`7e80041`](https://github.com/vertz-dev/vertz/commit/7e80041df6d5708fb54177edeef8bd211e368c7c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(compiler,ui): wrap multi-child component children in a DocumentFragment

  Previously, a component with multiple JSX children compiled to
  `Component({ children: () => [a, b] })`. Consumers such as
  `Context.Provider`, `Suspense`, and `ErrorBoundary` call `children()` and
  expect a single node — they got an array instead, which downstream
  `appendChild` calls rejected. This affected any component that treats
  `children` as a renderable slot, so code like

  ```tsx
  <RouterContext.Provider value={router}>
    <aside>…</aside>
    <main>…</main>
  </RouterContext.Provider>
  ```

  crashed at mount with a generic
  `TypeError: Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'.`

  The compiler now emits a `DocumentFragment`-returning thunk for
  multi-child components, mirroring how `<>…</>` fragments are already
  handled. `Context.Provider` also wraps any hand-written array result in a
  `DocumentFragment` as a defensive fallback, replacing the previous
  dev-only throw (which was unreliable in the browser because
  `process.env.NODE_ENV` is not polyfilled).

  Closes #2821.

- [#2824](https://github.com/vertz-dev/vertz/pull/2824) [`c724744`](https://github.com/vertz-dev/vertz/commit/c724744924b75e215201c0d19b047f4b8a287044) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): let `globalCss()` accept nested at-rules (`@keyframes`, `@media`, `@supports`)

  `globalCss({ '@keyframes spin': { from: {...}, to: {...} } })` used to fail
  typecheck with `TS2353` because the block value type only allowed CSS
  declarations. `GlobalStyleBlock` is now a union — either a declarations map
  or a selector → declarations map — and the runtime wraps nested blocks
  inside their parent at-rule.

  ```ts
  globalCss({
    "@keyframes spin": {
      from: { transform: "rotate(0deg)" },
      to: { transform: "rotate(360deg)" },
    },
    "@media (min-width: 768px)": {
      body: { fontSize: "18px" },
    },
  });
  ```

  Closes #2776.

- [#2833](https://github.com/vertz-dev/vertz/pull/2833) [`5223868`](https://github.com/vertz-dev/vertz/commit/5223868cb3001349065cc246e0ca8a03ad9356f4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(jsx): honor `defaultValue` / `defaultChecked` on `<input>` and `<textarea>`

  The React-style uncontrolled-initial-value props were silently dropped:

  ```tsx
  <textarea defaultValue="Hello world" />  // rendered empty
  <input defaultValue="initial" />          // rendered empty
  <input type="checkbox" defaultChecked /> // rendered unchecked
  ```

  Both have no HTML content attribute, so the compiler's fallback to
  `setAttribute("defaultValue", ...)` was a no-op in the browser.

  The native compiler and the test-time JSX runtime now route these through
  the IDL property path (`el.defaultValue = "..."`, `el.defaultChecked = true`),
  matching how `value` / `checked` are already handled. The SSR DOM shim
  serializes them to the correct initial HTML — `value="..."` for `<input>`,
  text content for `<textarea>`, and the `checked` attribute for
  `<input type="checkbox">` — so the value is visible before hydration.

  Closes #2820.

- [#2852](https://github.com/vertz-dev/vertz/pull/2852) [`b8253ad`](https://github.com/vertz-dev/vertz/commit/b8253ad485fba3fc04164db116ee0192e629b3d2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): query() now accepts AsyncIterable sources for live data

  `query()` accepts an `AsyncIterable<T>` source in addition to promises and SDK
  descriptors. Each yield appends to a reactive `data: T[]` array — perfect for
  chat transcripts, agent runs, log tails, live dashboards, presence streams.

  ```ts
  import { query, fromWebSocket } from "@vertz/ui";

  const ticks = query<TickEvent>(
    (signal) => fromWebSocket<TickEvent>("wss://stream.example/ticks", signal),
    { key: "ticks" }
  );

  // In JSX
  {
    ticks.data.map((t) => <Tick key={t.ts} tick={t} />);
  }
  ```

  The query owns the iterator's lifecycle: `dispose()` (or auto-cleanup on
  component unmount) calls `signal.abort()` _and_ `iterator.return?.()`.
  `refetch()` cancels and starts a fresh iterator, resetting `data` to `[]`
  and flipping `reconnecting` to true. Reactive keys (e.g., a signal-backed
  `sessionId`) automatically restart the iterator when their values change.

  New public API:

  - Stream overload of `query()` returning `QueryStreamResult<T>` (`data: T[]`,
    `reconnecting: boolean`, plus the existing `loading` / `error` / `idle` /
    `refetch` / `dispose`).
  - `fromWebSocket<T>(url, signal)` and `fromEventSource<T>(url, signal)` helpers
    that yield JSON-parsed messages and close on `signal.abort()`.
  - `QueryDisposedReason` (the `signal.reason` set on framework-initiated
    cancellations) and `QueryStreamMisuseError` (thrown for `refetchInterval`
    - stream, missing `key` on stream queries, or source-type swap mid-flight).
  - `serializeQueryKey()` for tuple cache keys (recursively sorts object keys
    so `{a:1,b:2}` and `{b:2,a:1}` hash identically).
  - The Promise overload's thunk now optionally accepts `(signal?: AbortSignal)`
    too, so signal-aware producers (e.g., `fetch(url, { signal })`) get
    cancellation parity. Existing zero-arg thunks continue to compile unchanged.

  See `docs/guides/ui/live-data` for the full guide, including the cursor /
  replay pattern, dedup wrapper, and lifecycle pitfalls.

  Closes #2846.

- Updated dependencies []:
  - @vertz/fetch@0.2.73

## 0.2.72

### Patch Changes

- [#2799](https://github.com/vertz-dev/vertz/pull/2799) [`d8e23a1`](https://github.com/vertz-dev/vertz/commit/d8e23a13049afb0a8611c63081bf799dc9790f77) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui,compiler): emit numeric/boolean raw CSS declarations from `css()` and `variants()`

  Raw object declarations inside nested selectors used to silently drop
  non-string values. Numeric values now flow through the same kebab-case +
  unitless/`px` rules as shorthand tokens, in both the runtime and the AOT
  compiler.

  ```ts
  css({
    card: [
      {
        "&:hover": {
          fontSize: 16, // → font-size: 16px
          opacity: 0.8, // → opacity: 0.8 (unitless)
          marginTop: -8, // → margin-top: -8px
          "--my-tone": 1, // → --my-tone: 1 (custom prop, no unit)
          padding: 0, // → padding: 0 (zero is unitless)
        },
      },
    ],
  });
  ```

  `UnaryExpression(-, NumericLiteral)` and `BooleanLiteral` are also accepted.
  The unitless property list is shared between `packages/ui/src/css/unitless-properties.ts`
  and `native/vertz-compiler-core/src/css_unitless.rs`, with a parity test
  already enforcing they stay in sync.

  Closes #2783.

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

- [#2798](https://github.com/vertz-dev/vertz/pull/2798) [`e2db646`](https://github.com/vertz-dev/vertz/commit/e2db646ea254b60c9bec01d51400c1c46c328c98) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(compiler): emit valid code for callback `ref` props on host elements

  Previously, the native compiler always emitted `{expr}.current = {el}` for
  the `ref` JSX prop, assuming an object ref. For a callback ref such as
  `ref={(el) => { /* ... */ }}`, the output was the invalid JavaScript
  `(el) => { /* ... */ }.current = __el0` — a member expression cannot
  follow an arrow function with a block body, so the module failed to parse
  with "Unexpected token '.'".

  The fix routes both forms through a new `__ref(el, value)` runtime helper
  (matching the existing inline logic in `jsx-runtime/index.ts`) that calls
  the value if it is a function and otherwise assigns to `.current`.

  Closes #2788.

- [#2810](https://github.com/vertz-dev/vertz/pull/2810) [`8d8976d`](https://github.com/vertz-dev/vertz/commit/8d8976dd3d2d2475f37d0df79f8477fd3f58395f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui,schema): coerce FormData to schema-declared types in `form()` (#2771)

  `form()` now coerces FormData values to match the body schema's declared types
  before validation and submission.

  - Boolean fields: checked → `true`; unchecked → `false`; `value="false"`/`"0"`/`"off"` → `false`.
  - Number/BigInt fields: numeric strings → numbers; empty strings dropped (let `optional()`/`default()` apply).
  - Date fields: parseable strings → `Date`.
  - String fields: never coerced, even if the value looks numeric.
  - Multi-value fields: `<input type="checkbox" name="tags" value="..." />` produces `string[]`.
  - The same coercion is applied to blur/change re-validation so live and submit
    errors agree.

  Behavior change: (1) Custom `onSubmit` handlers that pre-coerce values should
  remove that logic to avoid double-coercion. (2) User schemas that switched
  fields to `s.coerce.boolean()` / `s.coerce.number()` as a workaround should
  revert to strict `s.boolean()` / `s.number()` — the UI layer now handles the
  conversion.

  Adds two additive accessors to `@vertz/schema`:

  - `ArraySchema.element` — public getter for the element schema (previously
    `_element` was private).
  - `RefinedSchema.unwrap()` / `SuperRefinedSchema.unwrap()` — return the inner
    schema, so consumers (including the new form coercion path) can walk through
    `.refine()` / `.superRefine()` wrappers to reach the underlying object shape.

- [#2791](https://github.com/vertz-dev/vertz/pull/2791) [`36a459d`](https://github.com/vertz-dev/vertz/commit/36a459d191d732370cb4020533c7f8494622f1b5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add `innerHTML` JSX prop for raw HTML injection

  Vertz now supports rendering raw HTML via an `innerHTML` prop on any HTML
  host element — the equivalent of React's `dangerouslySetInnerHTML`, but
  spelled as a single plain prop:

  ```tsx
  <div innerHTML={trustedMarkup} />
  ```

  The value is inserted verbatim. Callers are responsible for trust and
  sanitization; a `trusted()` helper is exported from `@vertz/ui` for
  marking already-sanitized values. The compiler rejects the React spelling
  (`dangerouslySetInnerHTML`) with a clear error (E0762), blocks pairing
  with children (E0761), and forbids the prop on SVG elements (E0764).
  The prop is reactive — bound signals update the element in place — and
  safe across SSR + hydration (server content is preserved until after
  hydration completes).

  Closes #2761.

- Updated dependencies []:
  - @vertz/fetch@0.2.72

## 0.2.71

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.71

## 0.2.70

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.70

## 0.2.69

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.69

## 0.2.68

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.68

## 0.2.67

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.67

## 0.2.66

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.66

## 0.2.65

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.65

## 0.2.64

### Patch Changes

- [#2651](https://github.com/vertz-dev/vertz/pull/2651) [`840ace1`](https://github.com/vertz-dev/vertz/commit/840ace1f1c4a203e572394f322ee9b5c428537fa) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add missing CSS utility tokens (`font:mono/sans/serif`, `whitespace:pre`, `text-overflow:ellipsis`, `overflow-wrap:break-word`, `truncate` keyword) and support raw Tailwind palette colors (`bg:green.100`, `text:red.700`) resolving directly to oklch values.

- Updated dependencies []:
  - @vertz/fetch@0.2.64

## 0.2.63

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.63

## 0.2.62

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.62

## 0.2.61

### Patch Changes

- [#2613](https://github.com/vertz-dev/vertz/pull/2613) [`7e2cbb5`](https://github.com/vertz-dev/vertz/commit/7e2cbb5fb742ce8bd0f5fac7c2e46a2e43b0b8ef) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix composed component test failures: use style.cssText instead of setAttribute for style bindings in compiler and runtime, add missing DOM shim classes (HTMLHeadingElement, HTMLParagraphElement, PointerEvent), fix style/StyleMap sync, and fix HTMLSelectElement.selectedIndex

- Updated dependencies []:
  - @vertz/fetch@0.2.61

## 0.2.60

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.60

## 0.2.59

### Patch Changes

- [#2517](https://github.com/vertz-dev/vertz/pull/2517) [`6a6282b`](https://github.com/vertz-dev/vertz/commit/6a6282b3525f850fe0db6d11308dcd4801f89bb3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add AppShell layout component for SaaS apps (#1661)

- Updated dependencies []:
  - @vertz/fetch@0.2.59

## 0.2.58

### Patch Changes

- [#2480](https://github.com/vertz-dev/vertz/pull/2480) [`066bf9f`](https://github.com/vertz-dev/vertz/commit/066bf9f0be12865570c13414d595fd6dc77c1761) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): preserve context scope in useContext for effect re-runs (#2477)
  fix(theme-shadcn): center dialog wrapper with viewport sizing and flexbox (#2478)

- [#2479](https://github.com/vertz-dev/vertz/pull/2479) [`4ccb5db`](https://github.com/vertz-dev/vertz/commit/4ccb5db72f7b14f9cb3d50bff77dc26a34c8bd53) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(create-vertz-app): add DialogStackProvider and `w:full` to todo-app template

  fix(ui): fix DialogStackProvider hydration — add `display:contents` so wrapper doesn't break layout

  fix(theme-shadcn): fix dialog centering — add `margin: auto` to wrapper, use explicit panel width `min(28rem, calc(100vw - 2rem))`

- Updated dependencies []:
  - @vertz/fetch@0.2.58

## 0.2.57

### Patch Changes

- [#2464](https://github.com/vertz-dev/vertz/pull/2464) [`f9ac074`](https://github.com/vertz-dev/vertz/commit/f9ac0740448bbcece50886a387184898da625933) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(create-vertz-app): add DialogStackProvider to todo-app template

  The todo-app template's `app.tsx` was missing `DialogStackProvider`, causing a runtime crash when the `TaskItem` component called `useDialogStack()` for delete confirmation.

  fix(ui): fix DialogStackProvider hydration — children silently dropped

  `DialogStackProvider` used `DocumentFragment` + `__insert` which no-ops Node values during hydration. Restructured to use `__enterChildren`/`__exitChildren`/`__append` pattern (matching `ThemeProvider`) so children are properly claimed from SSR DOM.

  fix(runtime): return 200 for routerless apps instead of 404

  Changed `matched_route_patterns` from `Vec<String>` to `Option<Vec<String>>` — `None` means no router (200), `Some(empty)` means router matched nothing (404).

  fix(runtime): wait for API isolate init instead of returning 503

  The API handler now calls `wait_for_init()` instead of returning 503 immediately when the isolate hasn't finished initializing, preventing race conditions on first request.

- Updated dependencies []:
  - @vertz/fetch@0.2.57

## 0.2.56

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.56

## 0.2.55

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.55

## 0.2.54

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.54

## 0.2.53

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.53

## 0.2.52

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.52

## 0.2.51

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.51

## 0.2.50

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.50

## 0.2.49

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.49

## 0.2.48

### Patch Changes

- [#2308](https://github.com/vertz-dev/vertz/pull/2308) [`46397c6`](https://github.com/vertz-dev/vertz/commit/46397c67af30f5441cebdca616f3a1627111312d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): AuthProvider no longer crashes during SSR when auth SDK is partial/undefined

  Guards `auth.signIn.url` and `auth.signUp.url` property access with optional chaining so AuthProvider construction succeeds in the Rust V8 isolate where the auth SDK may not be fully available. Also adds runtime guards in signIn/signUp async bodies to return error Results instead of crashing when SDK methods are undefined.

- [#2265](https://github.com/vertz-dev/vertz/pull/2265) [`36b0f20`](https://github.com/vertz-dev/vertz/commit/36b0f2007822bc5c580d04a30d4ef1ecbee2146b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add form-level onChange with per-input debounce

  `<form onChange={handler}>` fires when any child input changes, receiving all current form values as a `FormValues` object. Per-input `debounce={ms}` delays the callback for text inputs while immediate controls (selects, checkboxes) flush instantly.

  **Breaking:** `onChange` on `<form>` now receives `FormValues` instead of a DOM `Event`. Use `ref` + `addEventListener` for the raw DOM event.

- Updated dependencies []:
  - @vertz/fetch@0.2.48

## 0.2.47

### Patch Changes

- Updated dependencies [[`ca0007f`](https://github.com/vertz-dev/vertz/commit/ca0007f83b5be683fa1dfe4532a4d9ee846630d5)]:
  - @vertz/fetch@0.2.47

## 0.2.46

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.46

## 0.2.45

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.45

## 0.2.44

### Patch Changes

- Updated dependencies [[`8cdfc4c`](https://github.com/vertz-dev/vertz/commit/8cdfc4c136b2e570e68d5e5af99bcf0ec3420c35)]:
  - @vertz/fetch@0.2.44

## 0.2.43

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.43

## 0.2.42

### Patch Changes

- [#2166](https://github.com/vertz-dev/vertz/pull/2166) [`caaee34`](https://github.com/vertz-dev/vertz/commit/caaee3414f28d055b3065dc2d4ef67c9e3856ab9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix context propagation to dynamically imported (code-split) route components. `useContext()` for contexts provided above `RouterView` no longer returns `undefined` when the route is lazy-loaded. Also adds `.catch()` handlers for rejected dynamic imports.

- [#2149](https://github.com/vertz-dev/vertz/pull/2149) [`1eeec6c`](https://github.com/vertz-dev/vertz/commit/1eeec6c95c0ced4d869995dbdce205c3bde92a25) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix Input component focus loss with value+onInput binding: handle IDL properties (value, checked) via Reflect.set in \_\_spread, preserve getter descriptors in withStyles, and emit reactive source parameter from compiler

- Updated dependencies []:
  - @vertz/fetch@0.2.42

## 0.2.41

### Patch Changes

- [#2027](https://github.com/vertz-dev/vertz/pull/2027) [`7f837fc`](https://github.com/vertz-dev/vertz/commit/7f837fc10a0acd4ad77bfc4bcaf733700c8a4f8b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `googleFont()` API for automatic Google Fonts fetching.

  - `googleFont(family, options)` returns a `FontDescriptor` with `__google` metadata
  - Dev server resolves Google Font descriptors at startup and on HMR, downloading `.woff2` files to `.vertz/fonts/` cache
  - Subset-aware parsing selects the correct `.woff2` file (latin by default) instead of the first alphabetical subset
  - Font metrics extraction handles absolute and root-relative paths from the resolver
  - New exports from `@vertz/ui/css`: `googleFont`, `GoogleFontOptions`, `GoogleFontMeta`

- Updated dependencies []:
  - @vertz/fetch@0.2.41

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

- Updated dependencies []:
  - @vertz/fetch@0.2.40

## 0.2.39

### Patch Changes

- [#1949](https://github.com/vertz-dev/vertz/pull/1949) [`7bf733f`](https://github.com/vertz-dev/vertz/commit/7bf733fec92424d08a08dafe3b4c4a5984f084b0) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - chore(auth): align AccessEventBroadcaster with (resourceType, resourceId) pattern

  AccessEvent type and broadcast method signatures now use (orgId, resourceType, resourceId, ...) instead of bare orgId. ClientAccessEvent includes resourceType/resourceId for client-side resource-level filtering. WebSocket connection routing unchanged.

- [#1956](https://github.com/vertz-dev/vertz/pull/1956) [`a948ef1`](https://github.com/vertz-dev/vertz/commit/a948ef160c244fb2e42cd53e7190b8bf6a96f9db) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): context Provider now propagates computed/derived values reactively

  Provider JSX pattern was reading the `value` prop once at initialization, so
  computed values (e.g., `doubled: doubled.value` from computed-transformer
  shorthand expansion) were captured as stale primitives. Consumers never saw
  updates.

  The fix detects when `value` is a getter (compiled JSX wraps non-literals in
  getters) and creates lazy per-property wrappers that re-read the getter on
  each access inside reactive effects, restoring dependency tracking for
  computed and derived expressions.

  Also fixes the native (Rust) compiler's signal transformer which was
  incorrectly expanding signals in shorthand properties (`{ count }` →
  `{ count: count.value }`), breaking signal flow-through to context
  providers. Now matches the TypeScript compiler behavior: signals in
  shorthand stay as SignalImpl objects.

- Updated dependencies []:
  - @vertz/fetch@0.2.39

## 0.2.38

### Patch Changes

- [#1942](https://github.com/vertz-dev/vertz/pull/1942) [`20344c0`](https://github.com/vertz-dev/vertz/commit/20344c0a7df8260ce98034bd0e2de73ef11ecfcd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix popstate handler (browser back/forward) to apply search-param-only optimization — skips SSE prefetch, view transitions, and loaders when only search params changed, matching navigate() behavior

- Updated dependencies []:
  - @vertz/fetch@0.2.38

## 0.2.37

### Patch Changes

- [#1932](https://github.com/vertz-dev/vertz/pull/1932) [`12231be`](https://github.com/vertz-dev/vertz/commit/12231be46d322526be6d8b6752911d88f025e4d0) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix searchParams schema defaults not applied on SPA navigation. The `searchParams` signal was updated after `current`, causing components to read stale values during route change. Both signals are now batched atomically.

- Updated dependencies []:
  - @vertz/fetch@0.2.37

## 0.2.36

### Patch Changes

- [#1899](https://github.com/vertz-dev/vertz/pull/1899) [`94a3244`](https://github.com/vertz-dev/vertz/commit/94a32446298cc6d8b76849abec315e980d5a4341) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix refetch()/clearData() cache key divergence for descriptor-in-thunk queries. Previously, these methods used a different key format than the effect path, causing cache eviction to miss the correct entry and return stale data.

- [#1903](https://github.com/vertz-dev/vertz/pull/1903) [`9281153`](https://github.com/vertz-dev/vertz/commit/9281153c407654e4cf26c5c41af3274128301e3e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix `useSearchParams<'/path'>()` returning `unknown` for routes nested inside parent layout `children`. `ExtractSearchParams` and `RoutePattern` now recursively traverse children with concatenated parent+child paths.

- Updated dependencies []:
  - @vertz/fetch@0.2.36

## 0.2.35

### Patch Changes

- [#1884](https://github.com/vertz-dev/vertz/pull/1884) [`5a80932`](https://github.com/vertz-dev/vertz/commit/5a8093299d96eefd00f0208af61eeb37aef28014) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix query() SSR hydration data loss and reactive re-fetch (#1859, #1861)

  Runtime: compute full dep-hash cache key during client hydration so it matches the SSR key format, fixing SSR data being discarded. Set idle=false in hydration resolve callback.

- Updated dependencies []:
  - @vertz/fetch@0.2.35

## 0.2.34

### Patch Changes

- [#1877](https://github.com/vertz-dev/vertz/pull/1877) [`3399191`](https://github.com/vertz-dev/vertz/commit/339919192bd95b5d212abf7f6d3746101c8d5422) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix query() not re-fetching when reactive state changes after SSR hydration (#1861)

  Runtime: call thunk during SSR hydration (when key is derived) to register reactive deps in the effect.
  Compiler: auto-wrap `query(descriptor)` in a thunk when the argument references reactive variables.

- Updated dependencies []:
  - @vertz/fetch@0.2.34

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.33

## 0.2.32

### Patch Changes

- [#1850](https://github.com/vertz-dev/vertz/pull/1850) [`ca59e8b`](https://github.com/vertz-dev/vertz/commit/ca59e8b824806cc222521677abbdcbb753347969) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): prevent TDZ error in query() with reactive descriptor closures (#1819)

  Moved `unsubscribeBus` and `unregisterFromRegistry` declarations to the
  top of the `query()` function body and converted the inner `dispose`
  function from a hoisted function declaration to a const arrow. This
  prevents bundler scope-hoisting from reordering `let` declarations past
  references, which re-created the TDZ in compiled output despite the
  earlier fix in PR #1822.

- Updated dependencies []:
  - @vertz/fetch@0.2.32

## 0.2.31

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.31

## 0.2.30

### Patch Changes

- [#1817](https://github.com/vertz-dev/vertz/pull/1817) [`0ba086d`](https://github.com/vertz-dev/vertz/commit/0ba086d9bca13cac9e0a27a1cbd199c8b5ca6a07) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix SSR hydration dropping static text between adjacent reactive expressions (#1812)

  Added `<!--/child-->` end markers to precisely bound each `__child`'s content during hydration. Previously, the browser would merge adjacent text nodes across `<!--child-->` comment boundaries, causing the hydration cleanup to consume static text that didn't belong to the reactive expression (e.g., "Showing 1–{a} of {b} items" would render as "Showing 1–11 items").

- [#1822](https://github.com/vertz-dev/vertz/pull/1822) [`1d36182`](https://github.com/vertz-dev/vertz/commit/1d36182b0678378d50d9a063d6471a9114712b6a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix TDZ error when using `query()` with a thunk that returns a descriptor with entity metadata on the first synchronous effect run. Also prevents a double-subscription leak by guarding the eager subscription path.

- Updated dependencies []:
  - @vertz/fetch@0.2.30

## 0.2.29

### Patch Changes

- [#1781](https://github.com/vertz-dev/vertz/pull/1781) [`7771170`](https://github.com/vertz-dev/vertz/commit/777117093d783aaeecc905ec65c4c85363746494) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add reactive search params via `useSearchParams()` — a Proxy-based API that reads typed, reactive search params from the URL and writes back on assignment. Includes `ExtractSearchParams` type utility for route-path-generic inference, codegen augmentation, and compiler reactive source registration.

- Updated dependencies []:
  - @vertz/fetch@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.28

## 0.2.27

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.27

## 0.2.26

### Patch Changes

- [#1752](https://github.com/vertz-dev/vertz/pull/1752) [`8552f21`](https://github.com/vertz-dev/vertz/commit/8552f217350e2acb0caac26ac215a49736b07e55) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `revalidateOn` option to `form()` for per-field re-validation after submit. Fields with errors now re-validate on blur (default), change, or only on submit. Includes single-field validation via schema `.shape` traversal with `OptionalSchema`/`DefaultSchema` unwrapping.

- Updated dependencies []:
  - @vertz/fetch@0.2.26

## 0.2.25

### Patch Changes

- [#1734](https://github.com/vertz-dev/vertz/pull/1734) [`04673a3`](https://github.com/vertz-dev/vertz/commit/04673a32a4849db08d80bb39caf801295fec9832) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove deprecated `ListTransition` component — use `<List animate>` instead

  `ListTransition` and `ListTransitionProps` are no longer exported from `@vertz/ui`. Use `<List animate>` from `@vertz/ui/components`:

  ```tsx
  // Before
  import { ListTransition } from "@vertz/ui";

  <ListTransition
    each={items}
    keyFn={(item) => item.id}
    children={(item) => <TodoItem task={item} />}
  />;

  // After
  import { List } from "@vertz/ui/components";

  <List animate>
    {items.map((item) => (
      <List.Item key={item.id}>
        <TodoItem task={item} />
      </List.Item>
    ))}
  </List>;
  ```

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

- Updated dependencies []:
  - @vertz/fetch@0.2.25

## 0.2.24

### Patch Changes

- [#1712](https://github.com/vertz-dev/vertz/pull/1712) [`a73dd79`](https://github.com/vertz-dev/vertz/commit/a73dd792de1876513914b89ef896fc88243b4cc8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add EmptyState compound component and Skeleton.Text/Circle sub-components

  New `EmptyState` compound component with Icon, Title, Description, and Action slots for empty-data placeholders. New `Skeleton.Text` (multi-line text placeholder) and `Skeleton.Circle` (circular avatar placeholder) sub-components. Skeleton `base` class key renamed to `root` for consistency.

- [#1685](https://github.com/vertz-dev/vertz/pull/1685) [`d58a100`](https://github.com/vertz-dev/vertz/commit/d58a100f18762189be4319b58a4b86f8a774ac95) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): register \_\_on event listener cleanup with disposal scope

  Event listeners attached via `__on()` (the compiler's output for `onClick`, `onSubmit`, etc.) now register their cleanup function with the current disposal scope. This ensures listeners are properly removed when components or dialogs are unmounted, preventing memory leaks in dynamically-opened dialogs.

- [#1704](https://github.com/vertz-dev/vertz/pull/1704) [`0e33400`](https://github.com/vertz-dev/vertz/commit/0e33400d96a9f778f3b936124d7544804f731db9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): full-replacement mode for unkeyed lists prevents stale DOM

  When no `key` prop is provided on list items, `__list` now uses full-replacement mode (dispose all nodes, create all new) instead of reusing by position index. This prevents stale DOM content when list items are filtered, reordered, or replaced. A dev warning is emitted once to encourage adding keys for optimal performance.

- [#1684](https://github.com/vertz-dev/vertz/pull/1684) [`e24615a`](https://github.com/vertz-dev/vertz/commit/e24615a8619ae84b993c18dbdca2671ca254f9bb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-compiler): support JSX spread attributes on intrinsic elements and components

  JSX spread attributes (`<button {...rest}>`, `<Button {...props}>`) were silently dropped by the compiler. Spread attributes now work correctly:

  - **Component calls**: spread emits `...expr` in the props object literal
  - **Intrinsic elements**: spread emits `__spread(el, props)` runtime call that handles event handlers, style, class/className, ref, SVG attributes, and standard HTML attributes
  - **theme-shadcn Button**: removed `applyProps` workaround in favor of native JSX spread

- [#1707](https://github.com/vertz-dev/vertz/pull/1707) [`adea2f1`](https://github.com/vertz-dev/vertz/commit/adea2f15f306d09ecebc56fc1f3841ff4b14b2ba) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Auto-invalidate tenant-scoped queries on tenant switch. When `switchTenant()` succeeds, all active queries with `tenantScoped: true` metadata are automatically cleared and refetched, preventing stale cross-tenant data from being visible.

  **What changed:**

  - `EntityQueryMeta` now includes an optional `tenantScoped` boolean field
  - `registerActiveQuery()` accepts an optional `clearData` callback for data clearing before refetch
  - `invalidateTenantQueries()` exported from `@vertz/ui` — clears data + refetches all tenant-scoped queries
  - `TenantProvider.switchTenant()` calls `invalidateTenantQueries()` automatically on success
  - Codegen emits `tenantScoped: true/false` in entity SDK descriptors based on entity configuration
  - `QueryEnvelopeStore` gains a `delete(queryKey)` method for per-key cleanup

- Updated dependencies [[`adea2f1`](https://github.com/vertz-dev/vertz/commit/adea2f15f306d09ecebc56fc1f3841ff4b14b2ba), [`99c90d9`](https://github.com/vertz-dev/vertz/commit/99c90d9d9176722d60d998a5a8d1eeaf4146c8de)]:
  - @vertz/fetch@0.2.24

## 0.2.23

### Patch Changes

- [#1571](https://github.com/vertz-dev/vertz/pull/1571) [`10f6309`](https://github.com/vertz-dev/vertz/commit/10f6309790bff69c7a1a0ab92e50f78f34b129c3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Expand CSS utility tokens with overflow axis variants, transform scale keywords, fraction dimensions, and color opacity modifiers

- [#1545](https://github.com/vertz-dev/vertz/pull/1545) [`1709f6d`](https://github.com/vertz-dev/vertz/commit/1709f6d933f04600d1b959b51660f2f8f33805d8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Defer onMount callbacks until after JSX evaluation so refs and DOM elements are available inside the callback. The compiler now injects mount frame push/flush around component return expressions. No public API change — onMount keeps its existing signature. Outside compiled components (event handlers, watch), onMount still runs immediately for backward compat.

- [#1556](https://github.com/vertz-dev/vertz/pull/1556) [`1e26cca`](https://github.com/vertz-dev/vertz/commit/1e26cca7eca00291633a2fa6257fc80a1f409b60) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix nested conditional cleanup during hydration — wrap anchor + content in display:contents span to prevent orphaned DOM nodes when parent conditionals re-evaluate (#1553)

- [#1584](https://github.com/vertz-dev/vertz/pull/1584) [`82055ae`](https://github.com/vertz-dev/vertz/commit/82055aefc19e4c3a115152f2e7157389486e792e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): preserve prototype chain in `__list` item proxies (#1581)

  `createItemProxy` used `{}` as the Proxy target, which broke `instanceof` checks
  (e.g., `val instanceof Date`) and `Array.isArray()` for proxied list items.
  Changed to use the initial item value as the target and added a `getPrototypeOf`
  trap that reads from the live signal value. Also added a read-only `set` trap to
  prevent accidental mutation of original items through the proxy.

- [#1634](https://github.com/vertz-dev/vertz/pull/1634) [`a21f762`](https://github.com/vertz-dev/vertz/commit/a21f76239e5c4b112c7be9a4ebea8327c3d2230b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add post-hydration onMount queue and Foreign component for unmanaged DOM subtrees. Fix scope safety in mount/router hydration paths.

- [#1588](https://github.com/vertz-dev/vertz/pull/1588) [`7c146e6`](https://github.com/vertz-dev/vertz/commit/7c146e695b642affeb39134beb0e1eb6475f20a8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix reactive form element properties (`value`, `checked`, `selected`) to use DOM property assignment instead of `setAttribute`. This fixes `<select value={signal}>`, `<input value={signal}>`, `<input checked={signal}>`, and `<option selected={signal}>` not updating the displayed state reactively.

- Updated dependencies []:
  - @vertz/fetch@0.2.23

## 0.2.22

### Patch Changes

- [#1498](https://github.com/vertz-dev/vertz/pull/1498) [`8ed55f6`](https://github.com/vertz-dev/vertz/commit/8ed55f6fc8aa691758606fe044a8b1d74b7bb9bc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert collapsible factory to declarative JSX component with sub-components (Collapsible.Trigger, Collapsible.Content)

- [#1505](https://github.com/vertz-dev/vertz/pull/1505) [`5d64812`](https://github.com/vertz-dev/vertz/commit/5d6481233006f67c21375f3879fda600c86c0cdd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert DatePicker factory to declarative JSX component with sub-components (DatePicker.Trigger, DatePicker.Content)

- [#1500](https://github.com/vertz-dev/vertz/pull/1500) [`180ac91`](https://github.com/vertz-dev/vertz/commit/180ac91f4fbc562581136dd8256f67fcc724fa69) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert HoverCard factory to JSX component with composed primitives

- [#1507](https://github.com/vertz-dev/vertz/pull/1507) [`6d32565`](https://github.com/vertz-dev/vertz/commit/6d32565c2818f9235d02af14a616279f018d0ff5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ResizablePanel factory to JSX component with context-based sub-components

- [#1502](https://github.com/vertz-dev/vertz/pull/1502) [`2e99e39`](https://github.com/vertz-dev/vertz/commit/2e99e3943830d2e2e0b2b44a1b32d8641e63dbe3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ScrollArea factory to JSX component with composed primitives

- [#1503](https://github.com/vertz-dev/vertz/pull/1503) [`1c4916b`](https://github.com/vertz-dev/vertz/commit/1c4916b04eaaef0ee2e27eda1b73c36ae24e665e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ToggleGroup factory to JSX component with composed primitives

- Updated dependencies []:
  - @vertz/fetch@0.2.22

## 0.2.21

### Patch Changes

- [#1422](https://github.com/vertz-dev/vertz/pull/1422) [`a16511c`](https://github.com/vertz-dev/vertz/commit/a16511cd78256fe86d0d69393dd923353d6f445a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - perf(ui): batch effect registration during tolerant hydration

  Add `deferredDomEffect()` variant that defers the first run during hydration.
  `__text` and `__attr` now use deferred effects — SSR content is already correct,
  so the first execution is skipped during the hydration walk. Effects are flushed
  synchronously at `endHydration()`, establishing dependency tracking so reactive
  updates work immediately after.

  Benchmark: 2.5x faster hydration walk phase for 1000 reactive nodes.

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

- [#1311](https://github.com/vertz-dev/vertz/pull/1311) [`a7e37c3`](https://github.com/vertz-dev/vertz/commit/a7e37c3dd29ac75183a085d34b0621d339f8402a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - **Breaking:** `DialogStack.open()` now returns `Promise<DialogResult<T>>` instead of `Promise<T>`. Dismissal resolves with `{ ok: false }` instead of rejecting with `DialogDismissedError`. Use `if (result.ok) { result.data }` instead of try/catch.

- [#1365](https://github.com/vertz-dev/vertz/pull/1365) [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix duplicate route components during production hydration with lazy (code-split) routes. RouterView and Outlet now re-enter hydration when lazy routes resolve, claiming SSR nodes instead of recreating DOM. Add route-aware chunk preloading via route-chunk manifest.

- [#1392](https://github.com/vertz-dev/vertz/pull/1392) [`301c401`](https://github.com/vertz-dev/vertz/commit/301c40192ddec0a306bba997a7f9e4ce4253aa95) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): add mismatch fallback to sync path during hydration re-entry in Outlet and RouterView

- [#1357](https://github.com/vertz-dev/vertz/pull/1357) [`c9d6c7e`](https://github.com/vertz-dev/vertz/commit/c9d6c7ef368efdc905b4e96302798b2db65522aa) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Hydration claim functions (`claimElement`, `claimText`, `claimComment`) now restore the cursor on failure instead of exhausting it. This fixes cursor corruption when composed primitives use `resolveChildren` + `scanSlots` during hydration, where failed slot marker claims would break all subsequent claims.

- [#1490](https://github.com/vertz-dev/vertz/pull/1490) [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert menubar from factory to declarative JSX component with sub-components (Menubar.Menu, Menubar.Trigger, Menubar.Content, Menubar.Item, Menubar.Group, Menubar.Label, Menubar.Separator)

- [#1495](https://github.com/vertz-dev/vertz/pull/1495) [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert `navigationMenu` factory to declarative `NavigationMenu` JSX component with `.List`, `.Item`, `.Trigger`, `.Content`, `.Link`, `.Viewport` sub-components. Importable from `@vertz/ui/components`.

- [#1396](https://github.com/vertz-dev/vertz/pull/1396) [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui,ui-server,cli): add generateParams for dynamic route SSG

  Routes can now define `generateParams` to pre-render dynamic routes at build time. The build pipeline expands these into concrete paths and pre-renders each one to static HTML files.

- [#1346](https://github.com/vertz-dev/vertz/pull/1346) [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Support React-style `style` objects with camelCase properties. `style={{ backgroundColor: 'red' }}` now converts to a CSS string at all levels: JSX runtime, compiler-generated code, reactive `__attr()` bindings, and SSR. Includes auto-px for dimensional numeric values, unitless property detection, and vendor prefix handling.

- [#1468](https://github.com/vertz-dev/vertz/pull/1468) [`f356523`](https://github.com/vertz-dev/vertz/commit/f356523f7054b1b72d7936e3a7e13147904087dc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add type-safe CSS utility validation: `css()` and `variants()` now reject invalid utility class names at compile time with full editor autocomplete. The `UtilityClass` union type is exported for custom type definitions.

- [#1467](https://github.com/vertz-dev/vertz/pull/1467) [`f9eccd5`](https://github.com/vertz-dev/vertz/commit/f9eccd56b2ecc4467b36b8e78bb3a072141ef93c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - refactor(auth): unify AuthProvider with generated auth SDK

  BREAKING: AuthProvider now requires an `auth` prop (AuthSdk interface) instead of creating its own HTTP methods. The `basePath` prop is now optional (used only for access-set and auth operations not yet in the SDK like MFA, forgot/reset password).

  Before:

  ```tsx
  <AuthProvider basePath="/api/auth">
  ```

  After:

  ```tsx
  <AuthProvider auth={api.auth}>
  ```

  - AuthProvider delegates signIn, signUp, signOut, refresh, and providers to the SDK
  - `createAuthMethod()` removed from `@vertz/ui/auth`
  - New `AuthSdk` and `AuthSdkMethod` types exported from `@vertz/ui/auth`
  - `form(useAuth().signIn)` still works — AuthProvider attaches bodySchema from local validation schemas

- [#1297](https://github.com/vertz-dev/vertz/pull/1297) [`4079d6b`](https://github.com/vertz-dev/vertz/commit/4079d6b7567479f5f59648e81773f098c7696d02) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add View Transitions API integration to the router. Navigations can optionally wrap DOM updates in `document.startViewTransition()` for animated page transitions. Supports global, per-route, and per-navigation config with graceful degradation for unsupported browsers, reduced motion, and SSR. Adds `vt-name` CSS shorthand for `view-transition-name`.

- Updated dependencies []:
  - @vertz/fetch@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.19

## 0.2.18

### Patch Changes

- [#1260](https://github.com/vertz-dev/vertz/pull/1260) [`b4cb6b6`](https://github.com/vertz-dev/vertz/commit/b4cb6b6826583c05efcdfd0af0e046a49f6eed91) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - refactor(ui): add canSignals() to avoid double-cast in ProtectedRoute

  Extracted signal-creation logic from can() into shared createAccessCheckRaw() helper.
  Added canSignals() that returns raw ReadonlySignal properties for framework code
  that runs without compiler transforms. Updated createEntitlementGuard to use
  canSignals() — eliminates the `as unknown as ReadonlySignal<boolean>` double-cast.

- [#1256](https://github.com/vertz-dev/vertz/pull/1256) [`c2355f9`](https://github.com/vertz-dev/vertz/commit/c2355f9d3e13feac615b00d48406e4626e92869b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): components returning Node or Signal can now be used as JSX

  Narrowed Outlet return type to HTMLElement. Tightened Suspense and ErrorBoundary
  prop/return types from Node to JSX.Element.
  Refactored ProtectedRoute, AuthGate, AccessGate, UserName, and UserAvatar (in
  @vertz/ui-auth) from manual primitives to compiled Vertz JSX patterns — the
  compiler now handles reactive transforms automatically.

- [#1264](https://github.com/vertz-dev/vertz/pull/1264) [`e5ac67e`](https://github.com/vertz-dev/vertz/commit/e5ac67e24a05e0342a8c470ef741d7729ebeaf58) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - refactor(ui): UserName/UserAvatar update in-place instead of rebuilding subtree

  \_\_child now updates Text.data in-place when the reactive expression returns a
  primitive and the existing content is a single text node, avoiding DOM removal
  and recreation.

  Avatar always renders the img element and toggles visibility via CSS, so
  reactive src/alt changes update attributes in-place instead of rebuilding
  the entire element via \_\_conditional.

- Updated dependencies []:
  - @vertz/fetch@0.2.18

## 0.2.17

### Patch Changes

- [#1253](https://github.com/vertz-dev/vertz/pull/1253) [`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Extract `@vertz/ui-auth` package for JSX-based auth components. Moves `Avatar`, `UserAvatar`, `UserName`, `OAuthButton`, `OAuthButtons`, `AuthGate`, `AccessGate`, and `ProtectedRoute` from `@vertz/ui/auth` into the new `@vertz/ui-auth` package, converting DOM-primitive components to JSX. Non-component exports (`AuthContext`, `useAuth`, `can`, `createAccessProvider`, etc.) remain in `@vertz/ui/auth`.

- [#1236](https://github.com/vertz-dev/vertz/pull/1236) [`6d6a85c`](https://github.com/vertz-dev/vertz/commit/6d6a85c0fd9f354a8d077e2eb1afdcf065344b95) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add user profile display helpers: `UserAvatar`, `UserName`, `Avatar`, `getUserDisplayName`, `getUserInitials`, and `getUserIcon` to `@vertz/ui/auth`. These composable components eliminate defensive boilerplate for displaying authenticated user info (avatars with fallbacks, display names with fallback chains).

- Updated dependencies []:
  - @vertz/fetch@0.2.17

## 0.2.16

### Patch Changes

- [#1108](https://github.com/vertz-dev/vertz/pull/1108) [`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add LRU eviction to MemoryCache with configurable maxSize (default 1000) to prevent unbounded cache growth in query().

- [#1219](https://github.com/vertz-dev/vertz/pull/1219) [`d2f6baf`](https://github.com/vertz-dev/vertz/commit/d2f6baf560db958f56257879d5d69da200ed519d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Auto-detect `initialPath` in `createRouter` — the second argument is now optional. When omitted or when options are passed as the second argument, the router auto-detects the URL from `window.location` (browser) or SSR context. Explicit `initialUrl` string still works for backward compatibility.

- [#1116](https://github.com/vertz-dev/vertz/pull/1116) [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `AccessAnalyzer` to extract `defineAccess()` config and `AccessTypesGenerator` to emit typed entitlement unions, making `ctx.can('typo')` a compile error. Add `RlsPolicyGenerator` to generate RLS policies from `rules.where()` conditions. Add `EntitlementRegistry` + `Entitlement` type to `@vertz/server` and `@vertz/ui/auth` for type-safe entitlement narrowing.

- [#1195](https://github.com/vertz-dev/vertz/pull/1195) [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add runtime image optimization for dynamic images at the edge. The `<Image>` component now rewrites absolute HTTP(S) URLs through `/_vertz/image` when `configureImageOptimizer()` is called. The Cloudflare handler supports an `imageOptimizer` config option using `cf.image` for edge transformation. Dev server includes a passthrough proxy for development.

- [#1173](https://github.com/vertz-dev/vertz/pull/1173) [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add optional onMiss telemetry callback to FieldSelectionTracker for compiler miss detection, and recordFieldMiss method to DiagnosticsCollector for surfacing misses via /\_\_vertz_diagnostics endpoint

- [#1226](https://github.com/vertz-dev/vertz/pull/1226) [`b061fc4`](https://github.com/vertz-dev/vertz/commit/b061fc4d04e851ae1ec6addd9342cec7b1a698f8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix `isBrowser()` returning `true` on server when module-scope code runs outside `ssrStorage.run()` (e.g., HMR re-imports). Now checks `hasSSRResolver()` instead of `getSSRContext()` to correctly identify all server-side code.

- [#1146](https://github.com/vertz-dev/vertz/pull/1146) [`d44234d`](https://github.com/vertz-dev/vertz/commit/d44234de726d5dfa786103b3e5a311754753f08e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Change font() default font-display from 'optional' to 'swap' for better first-visit font rendering.

- [#1170](https://github.com/vertz-dev/vertz/pull/1170) [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add automatic font fallback metric overrides for zero-CLS font loading. The framework now extracts font metrics from .woff2 files at server startup and generates adjusted fallback @font-face blocks with ascent-override, descent-override, line-gap-override, and size-adjust. This eliminates layout shift when custom fonts load with font-display: swap.

- [#1168](https://github.com/vertz-dev/vertz/pull/1168) [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): Image component with build-time optimization

  Add `<Image>` component to `@vertz/ui` that renders an `<img>` element with sensible defaults (lazy loading, async decoding). At build time, the Bun plugin detects static `<Image>` usage and replaces it with optimized `<picture>` markup containing WebP 1x/2x variants and an original-format fallback.

  - Runtime `<Image>` component with priority prop, pass-through attributes
  - AST-based transform using ts-morph for reliable detection
  - Sharp-based image processor with content-hash caching
  - `/__vertz_img/` route for serving optimized images with path traversal protection
  - HTML attribute escaping to prevent XSS in generated markup

- [#1114](https://github.com/vertz-dev/vertz/pull/1114) [`9f6f292`](https://github.com/vertz-dev/vertz/commit/9f6f292137d89064c1d86c2231e1f416fa1abd61) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Wire on-demand entity eviction into EntityStore.merge(). Orphaned entities (unreferenced for longer than 5 minutes with no pending optimistic layers) are automatically cleaned up whenever new data is merged — no timer or manual calls needed.

- [#1176](https://github.com/vertz-dev/vertz/pull/1176) [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - SSR delivery optimizations: consolidate CSS into max 3 style tags, add structured PreloadItem data for HTTP Link headers, support modulepreload injection and Cache-Control headers in SSR handler.

- [#1220](https://github.com/vertz-dev/vertz/pull/1220) [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `isBrowser()` SSR detection utility and migrate all `typeof window/document` guards. Remove `addEventListener`/`removeEventListener` no-op stubs from the SSR DOM shim — browser-only code no longer runs during SSR.

- Updated dependencies [[`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb)]:
  - @vertz/fetch@0.2.16

## 0.2.15

### Patch Changes

- [#1086](https://github.com/vertz-dev/vertz/pull/1086) [`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Redesign access control system with entity-centric `defineAccess()`, plan features/limits with multi-limit resolution, override store with overage billing, plan versioning with grandfathering and grace periods, billing adapter interface with Stripe implementation, and client-side plan event broadcasting.

- [#1102](https://github.com/vertz-dev/vertz/pull/1102) [`d0f0941`](https://github.com/vertz-dev/vertz/commit/d0f09419950bd0d6d9229a11fa9bf07f632fb85d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Generate router module augmentations so `useRouter()` picks up app route types by default after codegen.

  Change router navigation to use a TanStack-style input object with route patterns
  plus typed params, e.g. `navigate({ to: '/tasks/:id', params: { id: '123' } })`,
  with search params passed in the same object.

- Updated dependencies []:
  - @vertz/fetch@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.14

## 0.2.13

### Patch Changes

- [#1046](https://github.com/vertz-dev/vertz/pull/1046) [`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Access Set Bootstrap + Client-Side can(): server computes global entitlement snapshots (computeAccessSet), embeds in JWT acl claim with 2KB overflow strategy, exposes GET /api/auth/access-set with ETag/304 support. Client-side can() function returns reactive AccessCheck signals, AccessGate blocks UI while loading, createAccessProvider hydrates from SSR-injected **VERTZ_ACCESS_SET**. computeEntityAccess() enables per-entity access metadata for can(entitlement, entity). Compiler recognizes can() as signal-api via reactivity manifest.

- [#950](https://github.com/vertz-dev/vertz/pull/950) [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Automatic optimistic updates for entity mutations.

  EntityStore gains an optimistic layer stack (applyLayer/commitLayer/rollbackLayer) that overlays in-flight mutation patches on top of server-truth base data. MutationDescriptor in @vertz/fetch orchestrates the apply→fetch→commit/rollback lifecycle. The query() source switcher reads entity-backed data from EntityStore, so optimistic patches propagate reactively to all consuming queries. Generated createClient auto-wires the handler — zero boilerplate for `await api.todos.update(id, { completed: true })` to optimistically update all queries immediately.

- [#1038](https://github.com/vertz-dev/vertz/pull/1038) [`3a79c2f`](https://github.com/vertz-dev/vertz/commit/3a79c2fad5bfbaed61f252cf2b908592e12a82bd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Deep normalization for EntityStore — cross-entity reactive resolution.

  Write-side: `merge()` extracts nested entity objects, stores them separately, and replaces inline references with bare IDs. Read-side: `resolveReferences()` inside computed signals resolves bare IDs back to live entity objects, creating reactive subscriptions that propagate cross-entity updates automatically.

  Includes relation schema registry (`registerRelationSchema`), reference counting (`addRef`/`removeRef`), smart eviction (`evictOrphans`), and codegen integration to emit `registerRelationSchema` calls in generated client code.

- [#1063](https://github.com/vertz-dev/vertz/pull/1063) [`a82b2ec`](https://github.com/vertz-dev/vertz/commit/a82b2ec1ccc94f278916796783c33d81ffead211) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Feature flag store + reactive access invalidation: InMemoryFlagStore implements per-tenant boolean feature flags. Layer 1 in createAccessContext() now evaluates flag requirements on entitlements — disabled flags produce 'flag_disabled' denial with meta.disabledFlags. computeAccessSet() populates real flag state from FlagStore. Access event broadcaster provides authenticated WebSocket broadcasting for flag_toggled, limit_updated, role_changed, and plan_changed events. Client-side access event client connects with exponential backoff reconnection (1s–30s cap, ±25% jitter). handleAccessEvent() performs inline signal updates for flag/limit changes; role/plan changes trigger jittered refetch. AuthProvider accepts accessEvents prop to wire WebSocket events into the reactive access cascade.

- [#970](https://github.com/vertz-dev/vertz/pull/970) [`1011e51`](https://github.com/vertz-dev/vertz/commit/1011e51fbfe528e35930e3dd5c32b76568b0684a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(router): schema-based route param parsing and validation

  Add `ParamSchema<T>` interface and `params` field to `RouteConfig`. When a route defines a `params` schema, `matchRoute()` validates path params at the routing layer — invalid params result in no match (fallback/404 renders). Valid params are stored as `parsedParams` on `RouteMatch`.

  `useParams()` gains a second overload accepting a `Record<string, unknown>` type parameter for typed parsed params: `useParams<{ id: number }>()`.

- [#1003](https://github.com/vertz-dev/vertz/pull/1003) [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add same-type query revalidation via MutationEventBus. Entity-backed queries now automatically revalidate when a mutation commits for the same entity type. Opt out per-mutation via `skipInvalidation: true` on MutationMeta.

- [#1052](https://github.com/vertz-dev/vertz/pull/1052) [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add client-side auth session management (AuthProvider, useAuth, AuthGate)

  - AuthProvider wraps app with auth context, manages JWT session lifecycle
  - useAuth() returns reactive state + SdkMethods (signIn, signUp, signOut, mfaChallenge, forgotPassword, resetPassword)
  - SdkMethods work with form() for automatic validation and submission
  - Proactive token refresh scheduling (10s before expiry, tab visibility, online/offline handling)
  - AuthGate gates rendering on auth state resolution (shows fallback during loading)
  - SSR hydration via window.**VERTZ_SESSION** (no initial fetch needed)
  - AccessContext integration: AuthProvider auto-manages access set when accessControl=true
  - Server: signin/signup/refresh responses now include expiresAt timestamp

- Updated dependencies [[`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a), [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d)]:
  - @vertz/fetch@0.2.13

## 0.2.12

### Patch Changes

- [#937](https://github.com/vertz-dev/vertz/pull/937) [`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix nested conditional DOM duplication and stable context IDs for HMR.

  Nested `__conditional` calls (from chained ternaries) returned DocumentFragments that lost children after DOM insertion, causing stale text nodes. `normalizeNode()` now wraps fragments in `<span style="display:contents">` for stable parent references.

  Framework-internal contexts (`RouterContext`, `OutletContext`, `DialogStackContext`) now have stable IDs so they survive HMR module re-evaluation without breaking `useContext()`.

- Updated dependencies []:
  - @vertz/fetch@0.2.12

## 0.2.11

### Patch Changes

- [#926](https://github.com/vertz-dev/vertz/pull/926) [`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `ListTransition` component for animated list item enter/exit. New items get `data-presence="enter"`, removed items get `data-presence="exit"` with DOM removal deferred until CSS animation completes. Initial render items are not animated. Uses comment markers (no wrapper element) and keyed reconciliation with proper scope disposal.

  Also wraps `__list` and `listTransition` items in reactive proxies backed by signals. When an item at an existing key changes (e.g., after refetch with index-based keys), the signal updates and any `domEffect` bindings inside the node re-run automatically — without re-creating the DOM node.

- Updated dependencies []:
  - @vertz/fetch@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.5

## 0.2.2

### Patch Changes

- [#861](https://github.com/vertz-dev/vertz/pull/861) [`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix: address second-pass security audit findings — hidden field stripping in action pipeline, CSS value sanitization, empty string coercion guard

## 0.2.0

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

- [#222](https://github.com/vertz-dev/vertz/pull/222) [`9ee0308`](https://github.com/vertz-dev/vertz/commit/9ee03084f71803b04eef5f05ced2f90b52a9fa8e) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - Add subpath exports for focused imports: `@vertz/ui/router`, `@vertz/ui/form`, `@vertz/ui/query`, `@vertz/ui/css`.

### Patch Changes

- [#214](https://github.com/vertz-dev/vertz/pull/214) [`0f1c028`](https://github.com/vertz-dev/vertz/commit/0f1c028dd6bb90e37ac71f60e40ba0be774cca11) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - Fix Suspense async error handling to propagate errors to the nearest ErrorBoundary instead of swallowing them with console.error. When no ErrorBoundary is present, errors are surfaced globally via queueMicrotask to prevent silent failures.

- [#231](https://github.com/vertz-dev/vertz/pull/231) [`7207c4c`](https://github.com/vertz-dev/vertz/commit/7207c4c44c2fc83f67459cbcba8e6010b4d05145) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - `onCleanup()` now throws a `DisposalScopeError` when called outside a disposal scope instead of silently discarding the callback. This fail-fast behavior prevents cleanup leaks (e.g., undisposed queries on route navigation) by surfacing the mistake at the call site, similar to React's invalid hook call error.

- [#229](https://github.com/vertz-dev/vertz/pull/229) [`a454791`](https://github.com/vertz-dev/vertz/commit/a454791e0c6866cbad1d0d96bc3c0688282b021b) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - Fix `globalCss()` to auto-inject generated CSS into `document.head` via `<style data-vertz-css>` tags, matching the existing behavior of `css()`. Previously, `globalCss()` returned the CSS string but required manual injection.

- [#230](https://github.com/vertz-dev/vertz/pull/230) [`e17ccb2`](https://github.com/vertz-dev/vertz/commit/e17ccb261ecebc1ca7d58b75365869cb29253a3c) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - Export `compileTheme` from the public API (`@vertz/ui` and `@vertz/ui/css`). Previously it was only available from `@vertz/ui/internals`, making `defineTheme()` a dead end for users who needed to generate CSS from a theme definition.

- [#234](https://github.com/vertz-dev/vertz/pull/234) [`948f127`](https://github.com/vertz-dev/vertz/commit/948f127bf4b752274800c045d010590f1cc266d8) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - Fix memory leak in `__conditional` — branch functions (`trueFn`/`falseFn`) are now wrapped in disposal scopes so effects and `onCleanup` handlers are properly cleaned up when the condition changes.

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
