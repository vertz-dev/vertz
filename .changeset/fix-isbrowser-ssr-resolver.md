---
'@vertz/ui': patch
---

Fix `isBrowser()` returning `true` on server when module-scope code runs outside `ssrStorage.run()` (e.g., HMR re-imports). Now checks `hasSSRResolver()` instead of `getSSRContext()` to correctly identify all server-side code.
