---
'@vertz/ui': patch
---

Fix TDZ error when using `query()` with a thunk that returns a descriptor with entity metadata on the first synchronous effect run. Also prevents a double-subscription leak by guarding the eager subscription path.
