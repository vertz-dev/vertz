---
'@vertz/ui': patch
---

Auto-detect `initialPath` in `createRouter` — the second argument is now optional. When omitted or when options are passed as the second argument, the router auto-detects the URL from `window.location` (browser) or SSR context. Explicit `initialUrl` string still works for backward compatibility.
