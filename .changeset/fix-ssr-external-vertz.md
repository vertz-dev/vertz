---
'@vertz/cli': patch
---

Fix production SSR build crash when app imports from `vertz/ui` meta-package. The server bundler now correctly externalizes all `vertz/*` subpath imports alongside the existing `@vertz/*` externals.
