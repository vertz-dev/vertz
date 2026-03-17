---
'@vertz/create-vertz-app': patch
---

Stop exporting components directly from theme package. Scaffolded apps now use `registerTheme()` + `@vertz/ui/components` imports instead of destructuring from `configureTheme()`.
