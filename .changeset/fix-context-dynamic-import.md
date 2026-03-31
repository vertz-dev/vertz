---
'@vertz/ui': patch
---

Fix context propagation to dynamically imported (code-split) route components. `useContext()` for contexts provided above `RouterView` no longer returns `undefined` when the route is lazy-loaded. Also adds `.catch()` handlers for rejected dynamic imports.
