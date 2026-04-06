---
'create-vertz': patch
---

Fix broken npm dependency: use `workspace:^` so the published `create-vertz` accepts any compatible `@vertz/create-vertz-app` version instead of pinning to an exact (possibly unpublished) version.
