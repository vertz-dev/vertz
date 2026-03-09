---
'vertz': patch
'@vertz/create-vertz-app': patch
'@vertz/compiler': patch
---

Use `vertz` meta-package in scaffolded apps and add missing subpath exports (`db/sqlite`, `ui-server/bun-plugin`, `theme-shadcn`). Compiler now recognizes `vertz/*` imports alongside `@vertz/*`.
