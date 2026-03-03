---
'@vertz/core': patch
---

Make `exports` optional in `createModule()` with default `[]`. Previously, omitting `exports` caused a `TypeError: undefined is not an object` crash.
