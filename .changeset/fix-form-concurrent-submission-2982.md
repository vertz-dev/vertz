---
'@vertz/ui': patch
---

fix(ui): prevent concurrent form submissions (double-click creates duplicates)

Closes [#2982](https://github.com/vertz-dev/vertz/issues/2982).

`form()` did not lock against re-entrant submissions. A double-clicked submit button fired two `submit` events back-to-back; both entered `submitPipeline`, passed validation, and called the SDK — creating duplicate records.

`submitPipeline` now checks `submitting.peek()` synchronously at entry and returns early if a submission is already in flight. `submitting.value = true` is set before any work (so the second synchronous call sees the guard), and a `try/finally` ensures it is reset on every exit path. The pipeline returns a boolean so the `onSubmit` / `submit` wrappers skip their post-processing (form reset) when a call was rejected.
