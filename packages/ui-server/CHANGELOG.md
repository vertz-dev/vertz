# @vertz/ui-server

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

### Patch Changes

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

- Updated dependencies [[`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380), [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`c8efe6b`](https://github.com/vertz-dev/vertz/commit/c8efe6b4aef9ea9b9b4e3de414297ce2f829f7bb), [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06), [`4f780bb`](https://github.com/vertz-dev/vertz/commit/4f780bba6bee7a493c9a1e0b8463ea2126a7285b), [`0a33c14`](https://github.com/vertz-dev/vertz/commit/0a33c142a12a54e0da61423701ca338118ab9c98), [`c1e38d0`](https://github.com/vertz-dev/vertz/commit/c1e38d010da1bea95ed9246968fabc22e300a6e9), [`0f1c028`](https://github.com/vertz-dev/vertz/commit/0f1c028dd6bb90e37ac71f60e40ba0be774cca11), [`7207c4c`](https://github.com/vertz-dev/vertz/commit/7207c4c44c2fc83f67459cbcba8e6010b4d05145), [`a454791`](https://github.com/vertz-dev/vertz/commit/a454791e0c6866cbad1d0d96bc3c0688282b021b), [`e17ccb2`](https://github.com/vertz-dev/vertz/commit/e17ccb261ecebc1ca7d58b75365869cb29253a3c), [`948f127`](https://github.com/vertz-dev/vertz/commit/948f127bf4b752274800c045d010590f1cc266d8), [`9ee0308`](https://github.com/vertz-dev/vertz/commit/9ee03084f71803b04eef5f05ced2f90b52a9fa8e), [`63f074e`](https://github.com/vertz-dev/vertz/commit/63f074eefa96b49eb72724f8ec377a14a1f2c630)]:
  - @vertz/core@0.2.0
  - @vertz/server@0.2.0
  - @vertz/ui@0.2.0

## 0.1.0 (2026-02-13)

### Features

- **SSR Core:** Initial server-side rendering implementation

  - `renderToStream()` — Streaming HTML renderer returning `ReadableStream<Uint8Array>`
  - Component-to-HTML serialization with proper escaping
  - Void element handling (no closing tags for `<input>`, `<br>`, etc.)
  - Raw text element handling (`<script>`, `<style>` content not escaped)

- **Out-of-Order Streaming:** Suspense boundary support

  - Slot placeholders (`v-slot-N`) for async content
  - Template chunks (`v-tmpl-N`) streamed when data resolves
  - Client-side replacement scripts with DOM manipulation

- **Hydration Markers:** Atomic component hydration

  - `data-v-id` attributes for component identification
  - `data-v-key` for unique instance tracking
  - Serialized props embedded as `<script type="application/json">`
  - Static components produce zero hydration markers

- **Head Management:** `<head>` metadata collection

  - `HeadCollector` for collecting `<title>`, `<meta>`, `<link>` during render
  - `renderHeadToHtml()` for serializing head entries

- **Asset Pipeline:** Script and stylesheet injection

  - `renderAssetTags()` for generating `<script>` and `<link>` tags
  - Support for `async` and `defer` attributes on scripts

- **Critical CSS:** Above-the-fold CSS inlining

  - `inlineCriticalCss()` with injection prevention
  - Escapes `</style>` sequences to prevent breakout

- **CSP Nonce Support:** Content Security Policy compliance

  - Optional `nonce` parameter on `renderToStream()`
  - All inline scripts include `nonce` attribute when provided
  - Nonce value escaping to prevent attribute injection

- **Testing Utilities:** SSR testing helpers
  - `streamToString()` — Convert stream to string for assertions
  - `collectStreamChunks()` — Collect chunks as array for ordering tests
  - `encodeChunk()` — UTF-8 encoding helper

### Test Coverage

- 66 tests across 10 test files
- 5 integration tests validating all acceptance criteria (IT-5A-1 through IT-5A-5)
- CSP nonce security tests
- Streaming chunk ordering tests
- Hydration marker tests for interactive vs static components
- Edge case handling (empty trees, void elements, raw text elements)

### Documentation

- Comprehensive README with usage examples
- API reference for all public exports
- Security guidance for `rawHtml()` usage
- Examples for Suspense streaming, hydration markers, head management, asset injection, and critical CSS
