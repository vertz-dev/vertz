---
'@vertz/ui': patch
'@vertz/fetch': patch
---

fix(ui,fetch): map server 422 validation errors back to form field error signals

Closes [#2981](https://github.com/vertz-dev/vertz/issues/2981).

Server 422 responses were being swallowed. The server emits per-field errors under `body.error.details`, but the fetch client was looking at `body.error.errors`, so `FetchValidationError` never fired. `form()` then fell back to the generic `_form` handler, and per-field UI feedback never appeared.

Two changes make the round-trip work:

- `@vertz/fetch` now reads `error.details` (matching `packages/server/src/entity/error-handler.ts`) and normalizes array paths (e.g. `['items', 0, 'name']`) to dot-notation strings so they line up with form field names. `FetchValidationError` and `isFetchValidationError` are re-exported from `@vertz/fetch` for consumer use.
- `form()` checks for `FetchValidationError` in `submitPipeline` and walks `.errors`, writing each message to the matching field's `error` signal (empty path → `_form`). `onError` receives the same per-field record. Non-validation errors keep the existing `_form` fallback.
