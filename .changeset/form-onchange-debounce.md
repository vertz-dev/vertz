---
'@vertz/ui': patch
'@vertz/ui-primitives': patch
'@vertz/native-compiler': patch
---

feat(ui): add form-level onChange with per-input debounce

`<form onChange={handler}>` fires when any child input changes, receiving all current form values as a `FormValues` object. Per-input `debounce={ms}` delays the callback for text inputs while immediate controls (selects, checkboxes) flush instantly.

**Breaking:** `onChange` on `<form>` now receives `FormValues` instead of a DOM `Event`. Use `ref` + `addEventListener` for the raw DOM event.
