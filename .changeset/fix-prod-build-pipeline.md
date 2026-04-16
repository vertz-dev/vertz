---
'@vertz/cli': patch
'@vertz/ui-server': patch
'@vertz/runtime': patch
---

Fix production build pipeline: publish native compiler via platform packages, remove bin link shadowing, align esbuild versions, and hard-fail when native compiler is unavailable
