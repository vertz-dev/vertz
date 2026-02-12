---
'@vertz/ui': patch
---

`onCleanup()` now throws a `DisposalScopeError` when called outside a disposal scope instead of silently discarding the callback. This fail-fast behavior prevents cleanup leaks (e.g., undisposed queries on route navigation) by surfacing the mistake at the call site, similar to React's invalid hook call error.
