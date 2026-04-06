# @vertz/native-compiler

## 0.1.1

### Patch Changes

- [#2265](https://github.com/vertz-dev/vertz/pull/2265) [`36b0f20`](https://github.com/vertz-dev/vertz/commit/36b0f2007822bc5c580d04a30d4ef1ecbee2146b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add form-level onChange with per-input debounce

  `<form onChange={handler}>` fires when any child input changes, receiving all current form values as a `FormValues` object. Per-input `debounce={ms}` delays the callback for text inputs while immediate controls (selects, checkboxes) flush instantly.

  **Breaking:** `onChange` on `<form>` now receives `FormValues` instead of a DOM `Event`. Use `ref` + `addEventListener` for the raw DOM event.
