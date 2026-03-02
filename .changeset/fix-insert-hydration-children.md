---
'@vertz/ui': patch
---

Fix event handlers not attached to SSR-hydrated elements when page content is passed as children function via `__insert`. Layout components using `__insert(parent, children)` where `children` is a function now correctly resolve the thunk during hydration, ensuring inner elements are claimed and event handlers are attached.
