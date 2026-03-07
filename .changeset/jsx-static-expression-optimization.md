---
'@vertz/ui-compiler': patch
---

Skip effect wrapping for static JSX expressions. Non-reactive attributes now emit guarded `setAttribute` instead of `__attr()`, and non-reactive children emit `__insert()` instead of `__child(() => ...)`. This eliminates unnecessary `domEffect()` allocations and wrapper `<span>` elements for static expressions like `css()` style references, imported constants, and utility calls. Also fixes a JsxAnalyzer blind spot where destructured props were not classified as reactive sources.
