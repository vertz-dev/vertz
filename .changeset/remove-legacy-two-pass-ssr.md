---
'@vertz/ui-server': patch
---

Remove legacy two-pass SSR (`ssrRenderToString`, `ssrDiscoverQueries`) in favor of single-pass SSR (`ssrRenderSinglePass`) and AOT SSR (`ssrRenderAot`). The `ssrStreamNavQueries` function now uses a shared `runQueryDiscovery()` helper instead of the old two-pass discovery pipeline. Renamed `ssr-render.ts` to `ssr-shared.ts` (shared types and utilities only).
