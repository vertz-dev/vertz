---
'@vertz/ui': patch
---

Fix searchParams schema defaults not applied on SPA navigation. The `searchParams` signal was updated after `current`, causing components to read stale values during route change. Both signals are now batched atomically.
