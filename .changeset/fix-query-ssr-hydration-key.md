---
'@vertz/ui': patch
---

Fix query() SSR hydration data loss and reactive re-fetch (#1859, #1861)

Runtime: compute full dep-hash cache key during client hydration so it matches the SSR key format, fixing SSR data being discarded. Set idle=false in hydration resolve callback.
