---
'@vertz/runtime': patch
---

Fix `node:util.types.isTypedArray` to use `Object.prototype.toString` tag-set check instead of `instanceof`, preventing false negatives when TypedArrays cross V8 snapshot boundaries (e.g., PGlite NODEFS)
