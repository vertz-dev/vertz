---
'@vertz/ui-compiler': patch
---

Fix shorthand property assignments (`{ offset }`) not unwrapping signal/computed `.value`. The compiler now expands shorthand to `{ offset: offset.value }`, restoring reactive dependency tracking in closures like `query(() => fetch({ offset }))`.
