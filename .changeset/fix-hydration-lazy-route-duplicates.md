---
'@vertz/ui': patch
'@vertz/ui-server': patch
'@vertz/cli': patch
---

Fix duplicate route components during production hydration with lazy (code-split) routes. RouterView and Outlet now re-enter hydration when lazy routes resolve, claiming SSR nodes instead of recreating DOM. Add route-aware chunk preloading via route-chunk manifest.
