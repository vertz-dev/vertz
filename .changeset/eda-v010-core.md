---
'@vertz/core': patch
---

Entity-Driven Architecture (EDA) v0.1.0 — core integration.

- Added `EntityRouteEntry` interface and `_entityRoutes` hook in `AppConfig`
- Entity routes registered in Trie via `buildHandler()` alongside module routes
- `router.routes` uses `_entityRoutes` as source of truth when provided by `@vertz/server`
