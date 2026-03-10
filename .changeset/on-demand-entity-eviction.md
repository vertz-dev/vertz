---
'@vertz/ui': patch
---

Wire on-demand entity eviction into EntityStore.merge(). Orphaned entities (unreferenced for longer than 5 minutes with no pending optimistic layers) are automatically cleaned up whenever new data is merged — no timer or manual calls needed.
