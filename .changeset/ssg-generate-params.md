---
'@vertz/ui': patch
'@vertz/ui-server': patch
'@vertz/cli': patch
---

feat(ui,ui-server,cli): add generateParams for dynamic route SSG

Routes can now define `generateParams` to pre-render dynamic routes at build time. The build pipeline expands these into concrete paths and pre-renders each one to static HTML files.
