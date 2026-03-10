---
'@vertz/ui': patch
'@vertz/ui-server': patch
---

Add LRU eviction to MemoryCache with configurable maxSize (default 1000) to prevent unbounded cache growth in query().
