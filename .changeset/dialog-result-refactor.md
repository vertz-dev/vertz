---
'@vertz/ui': patch
---

**Breaking:** `DialogStack.open()` now returns `Promise<DialogResult<T>>` instead of `Promise<T>`. Dismissal resolves with `{ ok: false }` instead of rejecting with `DialogDismissedError`. Use `if (result.ok) { result.data }` instead of try/catch.
