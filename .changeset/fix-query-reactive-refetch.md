---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
---

Fix query() SSR hydration data loss and reactive re-fetch (#1859, #1861)

Runtime: compute full dep-hash cache key during client hydration so it matches the SSR key format, fixing SSR data being discarded. Call thunk inside effect when SSR-hydrated to register reactive deps for re-fetch on state change.
Compiler: auto-wrap `query(descriptor)` in a thunk when the argument references reactive variables.
