# @vertz/ui-server

## 0.2.1

### Patch Changes

- [#716](https://github.com/vertz-dev/vertz/pull/716) [`8144690`](https://github.com/vertz-dev/vertz/commit/8144690d9ffe24bba8bd9e73cd0c16e91a1e1396) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui-server): production SSR handler with nav pre-fetch

  Adds `createSSRHandler()` — a web-standard `(Request) => Response` handler
  for production SSR. Handles initial page loads (two-pass render with query
  pre-fetching) and client-side navigation pre-fetch via SSE (`X-Vertz-Nav`
  header). Works on any runtime: Cloudflare Workers, Bun, Node, Deno.

  Also exports `ssrRenderToString()` and `ssrDiscoverQueries()` for custom
  server setups.

- [#743](https://github.com/vertz-dev/vertz/pull/743) [`e6dd5dd`](https://github.com/vertz-dev/vertz/commit/e6dd5dd81343e5a0ed6c3b19e2ce6e4c5250a72a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove Vite dependency. Dev server now uses Bun.serve() natively with two modes:
  HMR mode (default) for fast UI iteration with Fast Refresh, SSR mode (`--ssr`) for
  server-side rendering verification with `bun --watch`.

- [#680](https://github.com/vertz-dev/vertz/pull/680) [`33d4337`](https://github.com/vertz-dev/vertz/commit/33d4337d3263d534c56b7516e46897cf17247792) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add SSR data threshold for `query()`. Queries can now optionally wait for fast data during SSR via `ssrTimeout` (default: 100ms). Fast queries produce real content in SSR HTML; slow queries fall back to loading state for client hydration. `renderToHTML()` uses a two-pass render: pass 1 discovers queries, awaits them with per-query timeout, pass 2 renders with resolved data. Set `ssrTimeout: 0` to disable SSR data loading.

- [`eb79314`](https://github.com/vertz-dev/vertz/commit/eb7931433ef1b7871df7d2d969a708e0562296ad) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - escapeAttr() now defensively coerces non-string attribute values to strings instead of crashing.

- Updated dependencies [[`9348bbd`](https://github.com/vertz-dev/vertz/commit/9348bbd6933ca444531ba946921a23fa1580f152), [`023f1fc`](https://github.com/vertz-dev/vertz/commit/023f1fc4c6c8a121edf448bcd11421a3add7b9d2), [`869699d`](https://github.com/vertz-dev/vertz/commit/869699d52d9fa685996acb418b8f8fb1bb554f6f), [`ab344f9`](https://github.com/vertz-dev/vertz/commit/ab344f98a05ef89baf77ec8dc68d6021a3708d87), [`c997f18`](https://github.com/vertz-dev/vertz/commit/c997f1848d08c495feaaf4a7c191f7f98bb5477a), [`2f5dc00`](https://github.com/vertz-dev/vertz/commit/2f5dc000c487c80855373473153ce1e793c6de74), [`f4195b7`](https://github.com/vertz-dev/vertz/commit/f4195b7831b38c30e18c758d7fdd627cfb4a4269), [`c19527e`](https://github.com/vertz-dev/vertz/commit/c19527e815fde35bdeefad9d00ceafa35eae1b0a), [`344799e`](https://github.com/vertz-dev/vertz/commit/344799e618f1e5cc7b59a75cab9b4f7698cfa5d4), [`ff459df`](https://github.com/vertz-dev/vertz/commit/ff459df1d89fe877c1f3f22dc3f9a6e4a83f7322), [`e6dd5dd`](https://github.com/vertz-dev/vertz/commit/e6dd5dd81343e5a0ed6c3b19e2ce6e4c5250a72a), [`8487104`](https://github.com/vertz-dev/vertz/commit/84871042c0b0e61a2a6bc06ca1f763b410136832), [`28399f1`](https://github.com/vertz-dev/vertz/commit/28399f13e43afbb3681421f99ff7c04b412b08cf), [`6c07cc7`](https://github.com/vertz-dev/vertz/commit/6c07cc70772243439bd6db889028a56f26245b5b), [`33d4337`](https://github.com/vertz-dev/vertz/commit/33d4337d3263d534c56b7516e46897cf17247792), [`339a3b7`](https://github.com/vertz-dev/vertz/commit/339a3b7d777136f8f39b516b434e92e1baf8da06), [`db24090`](https://github.com/vertz-dev/vertz/commit/db24090d13a945c8d1c0fbaa34b117128a9261a3), [`2711fac`](https://github.com/vertz-dev/vertz/commit/2711fac2d076a33603ef2152c883292b3a3de78e), [`28399f1`](https://github.com/vertz-dev/vertz/commit/28399f13e43afbb3681421f99ff7c04b412b08cf)]:
  - @vertz/ui@0.2.1
  - @vertz/core@0.2.1
  - @vertz/ui-compiler@1.0.1

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
