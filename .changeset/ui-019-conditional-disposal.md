---
'@vertz/ui': patch
---

Fix memory leak in `__conditional` — branch functions (`trueFn`/`falseFn`) are now wrapped in disposal scopes so effects and `onCleanup` handlers are properly cleaned up when the condition changes.
