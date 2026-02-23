---
'@vertz/ui': patch
'@vertz/ui-server': patch
---

Add SSR data threshold for `query()`. Queries can now optionally wait for fast data during SSR via `ssrTimeout` (default: 100ms). Fast queries produce real content in SSR HTML; slow queries fall back to loading state for client hydration. `renderToHTML()` uses a two-pass render: pass 1 discovers queries, awaits them with per-query timeout, pass 2 renders with resolved data. Set `ssrTimeout: 0` to disable SSR data loading.
