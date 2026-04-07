---
'@vertz/runtime': patch
---

Remove Bun dependency from vtzx/vtz fallback paths. When the native binary is unavailable, the CLI now resolves commands from node_modules/.bin directly instead of delegating to bunx/bun.
