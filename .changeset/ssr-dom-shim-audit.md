---
'@vertz/ui': patch
'@vertz/ui-server': patch
---

Add `isBrowser()` SSR detection utility and migrate all `typeof window/document` guards. Remove `addEventListener`/`removeEventListener` no-op stubs from the SSR DOM shim — browser-only code no longer runs during SSR.
