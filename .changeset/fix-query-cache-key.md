---
'@vertz/ui': patch
---

Fix refetch()/clearData() cache key divergence for descriptor-in-thunk queries. Previously, these methods used a different key format than the effect path, causing cache eviction to miss the correct entry and return stale data.
