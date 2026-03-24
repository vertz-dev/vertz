---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
---

Add reactive search params via `useSearchParams()` — a Proxy-based API that reads typed, reactive search params from the URL and writes back on assignment. Includes `ExtractSearchParams` type utility for route-path-generic inference, codegen augmentation, and compiler reactive source registration.
