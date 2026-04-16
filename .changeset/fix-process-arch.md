---
'@vertz/runtime': patch
---

Add `process.arch` to the vtz runtime bootstrap, fixing sharp and other native modules that construct platform-arch strings from `process.platform` and `process.arch`.
