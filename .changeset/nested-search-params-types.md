---
'@vertz/ui': patch
---

Fix `useSearchParams<'/path'>()` returning `unknown` for routes nested inside parent layout `children`. `ExtractSearchParams` and `RoutePattern` now recursively traverse children with concatenated parent+child paths.
