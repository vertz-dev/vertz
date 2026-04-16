# @vertz/native-compiler

## 0.2.67

### Patch Changes

- [#2725](https://github.com/vertz-dev/vertz/pull/2725) [`56e7e2f`](https://github.com/vertz-dev/vertz/commit/56e7e2f7a083f58a979a371166abceeecf204ecd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(native-compiler): add repository/license/description fields to package.json

  npm publish with `--provenance` rejected the 0.2.66 publish with:

      npm error code E422
      Error verifying sigstore provenance bundle: Failed to validate
      repository information: package.json: "repository.url" is "",
      expected to match "https://github.com/vertz-dev/vertz" from provenance

  The `@vertz/native-compiler` package had never been published before, and its package.json was missing `repository`, `license`, and `description`. npm's provenance attestation requires the manifest's `repository.url` to match the source repo recorded in the provenance bundle. Added all three fields matching the pattern used by the other `@vertz/*` packages.

## 0.2.66

### Patch Changes

- [#2685](https://github.com/vertz-dev/vertz/pull/2685) [`4cc0aa9`](https://github.com/vertz-dev/vertz/commit/4cc0aa9d170f8fa8ae4f463fb8cff3eefcf1ee6c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix false-positive `batch` import injection when `async batch()` appears as an object method definition

## 0.1.1

### Patch Changes

- [#2265](https://github.com/vertz-dev/vertz/pull/2265) [`36b0f20`](https://github.com/vertz-dev/vertz/commit/36b0f2007822bc5c580d04a30d4ef1ecbee2146b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add form-level onChange with per-input debounce

  `<form onChange={handler}>` fires when any child input changes, receiving all current form values as a `FormValues` object. Per-input `debounce={ms}` delays the callback for text inputs while immediate controls (selects, checkboxes) flush instantly.

  **Breaking:** `onChange` on `<form>` now receives `FormValues` instead of a DOM `Event`. Use `ref` + `addEventListener` for the raw DOM event.
