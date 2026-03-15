---
'@vertz/ui-server': patch
---

Add `dataset` property to SSR DOM shim elements, fixing crashes when components access `el.dataset.*` during SSR
