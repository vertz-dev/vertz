# @vertz/ui-server

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
