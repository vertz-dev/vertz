---
'@vertz/ui': patch
---

Fix duplicate route components during production hydration with lazy (code-split) routes. RouterView and Outlet now clear SSR children before appending the resolved lazy component. Also fix disposal scope leak for async route components in RouterView.
