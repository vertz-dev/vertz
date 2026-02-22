# @vertz/ui

## 0.2.1

### Patch Changes

- [#538](https://github.com/vertz-dev/vertz/pull/538) [`7385806`](https://github.com/vertz-dev/vertz/commit/7385806922a6fe68296d8580c8c89b3033bf8c8b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - **BREAKING:** Redesign `form()` API — direct properties, per-field signals, and compiler-assisted DOM binding.

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

- [#489](https://github.com/vertz-dev/vertz/pull/489) [`215635f`](https://github.com/vertz-dev/vertz/commit/215635f4c8ee92826f66b964a107727ad856d81a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - form() attrs() now returns onSubmit for declarative JSX form wiring.

  - `attrs()` accepts optional `SubmitCallbacks` and returns `{ action, method, onSubmit }`
  - Added `resetOnSuccess` option to reset form element after successful submission
  - `__attr()` handles boolean values: `true` sets empty attribute, `false` removes it

- [#500](https://github.com/vertz-dev/vertz/pull/500) [`e878b05`](https://github.com/vertz-dev/vertz/commit/e878b05f640e65d4e2c9037de863d5d05026f7a8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - validate() now handles @vertz/schema ParseError.issues, converting them to field-level errors via duck-typing (no import from @vertz/schema). form() auto-extracts validation schema from SdkMethod.meta.bodySchema — schema option is now optional when the SDK method carries embedded schema metadata.

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
