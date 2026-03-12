---
'@vertz/ui-compiler': patch
'@vertz/ui-server': patch
'@vertz/cli': patch
---

Add automatic route code splitting: `defineRoutes()` component factories are rewritten to lazy `import()` calls at build time, enabling per-page code splitting without manual dynamic imports.
