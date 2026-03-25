---
'@vertz/ui-server': patch
'@vertz/ui-compiler': patch
'@vertz/cli': patch
---

Wire AOT SSR pipeline end-to-end: compiler generates standalone `(data, ctx)` render functions for query-using components, build emits `aot-routes.js` + `aot-manifest.json`, and `createSSRHandler()` uses AOT render with data prefetch when manifest is available. Falls back to single-pass SSR for routes without AOT entries.
