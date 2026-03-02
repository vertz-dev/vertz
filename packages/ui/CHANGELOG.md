# @vertz/ui

## 0.2.1

### Patch Changes

- [#831](https://github.com/vertz-dev/vertz/pull/831) [`9348bbd`](https://github.com/vertz-dev/vertz/commit/9348bbd6933ca444531ba946921a23fa1580f152) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix `__child()` reactive insert hydration: CSR re-render children instead of attempting to hydrate JSX runtime output.

  During SSR hydration, `__child()` claims the `<span style="display:contents">` wrapper but previously skipped its first effect run, assuming SSR content was correct. However, JSX inside reactive callbacks (e.g., `queryMatch` data branch) goes through the JSX runtime which uses `document.createElement()` — not hydration-aware. This caused detached DOM nodes with dead event handlers.

  The fix clears SSR children from the claimed span and re-renders them via CSR by pausing hydration during the first synchronous `domEffect` run. No visual flash occurs since `domEffect` executes synchronously on first call, before browser paint.

- [#612](https://github.com/vertz-dev/vertz/pull/612) [`ab344f9`](https://github.com/vertz-dev/vertz/commit/ab344f98a05ef89baf77ec8dc68d6021a3708d87) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Simplify css() return type — class names are now top-level properties instead of
  nested under .classNames.

  Before: `styles.classNames.card`
  After: `styles.card`

  The `css` property remains accessible as a non-enumerable property, so
  Object.keys() and Object.entries() only yield block names.

  A block named 'css' is now a compile-time and runtime error (reserved name).

  This also fixes a latent compiler bug where css-transformer produced flat
  objects but .classNames access sites were never rewritten.

- [`c997f18`](https://github.com/vertz-dev/vertz/commit/c997f1848d08c495feaaf4a7c191f7f98bb5477a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - **BREAKING:** Redesign `form()` API — direct properties, per-field signals, and compiler-assisted DOM binding.

  ### Removed

  - `form().attrs()` — use direct properties: `form.action`, `form.method`, `form.onSubmit`
  - `form().error(field)` — use per-field signals: `form.title.error`
  - `form().handleSubmit(callbacks)` — use `form.submit(formData?)` and pass callbacks via `FormOptions`
  - `SubmitCallbacks` type — merged into `FormOptions` (`onSuccess`, `onError`, `resetOnSuccess`)

  ### Added

  - Direct properties: `action`, `method`, `onSubmit`, `reset`, `setFieldError`, `submit`
  - Per-field reactive state via Proxy: `form.<field>.error`, `.dirty`, `.touched`, `.value`
  - Form-level computed signals: `form.dirty`, `form.valid`
  - `FieldState<T>` type and `createFieldState()` factory
  - `__bindElement(el)` for compiler-assisted DOM event delegation
  - 3-level signal auto-unwrap in compiler: `form.title.error` → `.value`
  - `__bindElement` transform in JSX compiler for `<form>` elements

  ### Migration

  ```diff
  - const { action, method, onSubmit } = todoForm.attrs({ onSuccess, resetOnSuccess: true });
  + const todoForm = form(sdk, { schema, onSuccess, resetOnSuccess: true });

  - effect(() => { titleError = todoForm.error('title') ?? ''; });
  + {todoForm.title.error}

  - formEl.addEventListener('submit', todoForm.handleSubmit({ onSuccess, onError }));
  + <form onSubmit={todoForm.onSubmit}>
  ```

- [`2f5dc00`](https://github.com/vertz-dev/vertz/commit/2f5dc000c487c80855373473153ce1e793c6de74) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - form() attrs() now returns onSubmit for declarative JSX form wiring.

  - `attrs()` accepts optional `SubmitCallbacks` and returns `{ action, method, onSubmit }`
  - Added `resetOnSuccess` option to reset form element after successful submission
  - `__attr()` handles boolean values: `true` sets empty attribute, `false` removes it

- [#747](https://github.com/vertz-dev/vertz/pull/747) [`f4195b7`](https://github.com/vertz-dev/vertz/commit/f4195b7831b38c30e18c758d7fdd627cfb4a4269) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add per-field `setValue()` and `reset()` methods to the `form()` API. `field.setValue(value)` programmatically sets the value and auto-computes dirty state. `field.reset()` restores the field to its initial value and clears error/dirty/touched.

- [#746](https://github.com/vertz-dev/vertz/pull/746) [`c19527e`](https://github.com/vertz-dev/vertz/commit/c19527e815fde35bdeefad9d00ceafa35eae1b0a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - HTTP error subclasses now expose literal status types (e.g., `FetchNotFoundError.status` is `404`, not `number`), enabling type narrowing after `instanceof` checks. `__element()` now returns specific HTML element types via overloads (e.g., `__element('div')` returns `HTMLDivElement`).

- [#823](https://github.com/vertz-dev/vertz/pull/823) [`344799e`](https://github.com/vertz-dev/vertz/commit/344799e618f1e5cc7b59a75cab9b4f7698cfa5d4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Extend RouterView to render nested layouts via matched chain + OutletContext. Parent layouts stay mounted when navigating between sibling child routes. Replace `createOutlet` with standalone `Outlet` component and shared `OutletContext`.

- [`8487104`](https://github.com/vertz-dev/vertz/commit/84871042c0b0e61a2a6bc06ca1f763b410136832) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add RouterContext, useRouter(), and RouterView for declarative route rendering.

  - `RouterContext` + `useRouter()`: Context-based router access eliminates navigate prop threading
  - `RouterView`: Declarative component that reactively renders the matched route, replacing manual watch + DOM swapping
  - Handles sync and async/lazy components with stale resolution guards
  - Task-manager example updated to use the new APIs

- [`28399f1`](https://github.com/vertz-dev/vertz/commit/28399f13e43afbb3681421f99ff7c04b412b08cf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - validate() now handles @vertz/schema ParseError.issues, converting them to field-level errors via duck-typing (no import from @vertz/schema). form() auto-extracts validation schema from SdkMethod.meta.bodySchema — schema option is now optional when the SDK method carries embedded schema metadata.

- [#709](https://github.com/vertz-dev/vertz/pull/709) [`6c07cc7`](https://github.com/vertz-dev/vertz/commit/6c07cc70772243439bd6db889028a56f26245b5b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Simplify hydration: automatic strategy replaces manual picker.

  - `hydrate(registry)` now auto-detects above/below fold via IntersectionObserver with 200px rootMargin
  - Removed public exports: eagerStrategy, lazyStrategy, visibleStrategy, interactionStrategy, idleStrategy, mediaStrategy
  - Removed unused `registry` field from MountOptions

- [#680](https://github.com/vertz-dev/vertz/pull/680) [`33d4337`](https://github.com/vertz-dev/vertz/commit/33d4337d3263d534c56b7516e46897cf17247792) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add SSR data threshold for `query()`. Queries can now optionally wait for fast data during SSR via `ssrTimeout` (default: 100ms). Fast queries produce real content in SSR HTML; slow queries fall back to loading state for client hydration. `renderToHTML()` uses a two-pass render: pass 1 discovers queries, awaits them with per-query timeout, pass 2 renders with resolved data. Set `ssrTimeout: 0` to disable SSR data loading.

- [#764](https://github.com/vertz-dev/vertz/pull/764) [`339a3b7`](https://github.com/vertz-dev/vertz/commit/339a3b7d777136f8f39b516b434e92e1baf8da06) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add @vertz/theme-shadcn package with configureTheme() API, 5 color palettes (zinc, slate, stone, neutral, gray), and pre-built style definitions for button, badge, card, input, label, separator, and formGroup. Add compound foreground namespaces (primary-foreground, secondary-foreground, etc.) to @vertz/ui COLOR_NAMESPACES and camelCase/collision validation to compileTheme().

- [#619](https://github.com/vertz-dev/vertz/pull/619) [`db24090`](https://github.com/vertz-dev/vertz/commit/db24090d13a945c8d1c0fbaa34b117128a9261a3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add tolerant hydration mode for `mount()`. Use `mount(app, '#root', { hydration: 'tolerant' })` to walk existing SSR DOM and attach reactivity instead of clearing and re-rendering. Browser extension nodes are gracefully skipped during hydration. If hydration fails, automatically falls back to full CSR re-render. Compiler emits `__enterChildren`/`__exitChildren`/`__append`/`__staticText` for hydration cursor support.

- [`2711fac`](https://github.com/vertz-dev/vertz/commit/2711fac2d076a33603ef2152c883292b3a3de78e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add type-safe router: `navigate()`, `useParams()`, and Link `href` are validated
  against defined route paths at compile time. New exports: `useParams<TPath>()`,
  `useRouter<T>()`, `InferRouteMap<T>`, `TypedRoutes<T>`, `TypedRouter<T>`,
  `RoutePaths<T>`, `PathWithParams<T>`, `LinkProps<T>`. Fully backward-compatible —
  existing code compiles unchanged.
- Updated dependencies [[`2f5dc00`](https://github.com/vertz-dev/vertz/commit/2f5dc000c487c80855373473153ce1e793c6de74)]:
  - @vertz/fetch@0.1.1

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
