# @vertz/ui-compiler

## 1.0.1

### Patch Changes

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

- [`ff459df`](https://github.com/vertz-dev/vertz/commit/ff459df1d89fe877c1f3f22dc3f9a6e4a83f7322) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix reactivity analyzer to classify `const` variables derived from signal API properties (query, form, createLoader) as computed instead of static. This eliminates the need for manual `effect()` bridges when deriving state from `query()` results — developers can now use plain `const` declarations and the compiler handles reactivity automatically.

- [#743](https://github.com/vertz-dev/vertz/pull/743) [`e6dd5dd`](https://github.com/vertz-dev/vertz/commit/e6dd5dd81343e5a0ed6c3b19e2ce6e4c5250a72a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove Vite dependency. Dev server now uses Bun.serve() natively with two modes:
  HMR mode (default) for fast UI iteration with Fast Refresh, SSR mode (`--ssr`) for
  server-side rendering verification with `bun --watch`.

- [#619](https://github.com/vertz-dev/vertz/pull/619) [`db24090`](https://github.com/vertz-dev/vertz/commit/db24090d13a945c8d1c0fbaa34b117128a9261a3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add tolerant hydration mode for `mount()`. Use `mount(app, '#root', { hydration: 'tolerant' })` to walk existing SSR DOM and attach reactivity instead of clearing and re-rendering. Browser extension nodes are gracefully skipped during hydration. If hydration fails, automatically falls back to full CSR re-render. Compiler emits `__enterChildren`/`__exitChildren`/`__append`/`__staticText` for hydration cursor support.

- [`28399f1`](https://github.com/vertz-dev/vertz/commit/28399f13e43afbb3681421f99ff7c04b412b08cf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix virtual CSS module loading in production build. The load() hook now returns an empty JS module in production instead of raw CSS, which Rollup cannot parse. CSS is still emitted correctly via generateBundle().

- Updated dependencies [[`9348bbd`](https://github.com/vertz-dev/vertz/commit/9348bbd6933ca444531ba946921a23fa1580f152), [`ab344f9`](https://github.com/vertz-dev/vertz/commit/ab344f98a05ef89baf77ec8dc68d6021a3708d87), [`c997f18`](https://github.com/vertz-dev/vertz/commit/c997f1848d08c495feaaf4a7c191f7f98bb5477a), [`2f5dc00`](https://github.com/vertz-dev/vertz/commit/2f5dc000c487c80855373473153ce1e793c6de74), [`f4195b7`](https://github.com/vertz-dev/vertz/commit/f4195b7831b38c30e18c758d7fdd627cfb4a4269), [`c19527e`](https://github.com/vertz-dev/vertz/commit/c19527e815fde35bdeefad9d00ceafa35eae1b0a), [`344799e`](https://github.com/vertz-dev/vertz/commit/344799e618f1e5cc7b59a75cab9b4f7698cfa5d4), [`8487104`](https://github.com/vertz-dev/vertz/commit/84871042c0b0e61a2a6bc06ca1f763b410136832), [`28399f1`](https://github.com/vertz-dev/vertz/commit/28399f13e43afbb3681421f99ff7c04b412b08cf), [`6c07cc7`](https://github.com/vertz-dev/vertz/commit/6c07cc70772243439bd6db889028a56f26245b5b), [`33d4337`](https://github.com/vertz-dev/vertz/commit/33d4337d3263d534c56b7516e46897cf17247792), [`339a3b7`](https://github.com/vertz-dev/vertz/commit/339a3b7d777136f8f39b516b434e92e1baf8da06), [`db24090`](https://github.com/vertz-dev/vertz/commit/db24090d13a945c8d1c0fbaa34b117128a9261a3), [`2711fac`](https://github.com/vertz-dev/vertz/commit/2711fac2d076a33603ef2152c883292b3a3de78e)]:
  - @vertz/ui@0.2.1

## 1.0.0

### Major Changes

- [#283](https://github.com/vertz-dev/vertz/pull/283) [`c38def6`](https://github.com/vertz-dev/vertz/commit/c38def6b6e060f63afeaacd93afa85aae9154833) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - **BREAKING CHANGE:** Eliminate `.value` from public API — signal properties auto-unwrap at compile time

  The compiler now automatically inserts `.value` when accessing signal properties from `query()`, `form()`, and `createLoader()`, eliminating boilerplate from the public API.

  **Before:**

  ```ts
  const tasks = query("/api/tasks");
  const isLoading = tasks.loading.value; // Manual .value access
  const data = tasks.data.value;
  ```

  **After:**

  ```ts
  const tasks = query("/api/tasks");
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
  const tasks = query("/api/tasks");
  const isLoading = tasks.loading.value; // ❌ Remove .value
  const data = tasks.data.value; // ❌ Remove .value
  ```

  #### After (new code):

  ```ts
  const tasks = query("/api/tasks");
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
