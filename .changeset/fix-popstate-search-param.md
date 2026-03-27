---
'@vertz/ui': patch
---

Fix popstate handler (browser back/forward) to apply search-param-only optimization — skips SSE prefetch, view transitions, and loaders when only search params changed, matching navigate() behavior
