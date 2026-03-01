---
'@vertz/ui': patch
---

Extend RouterView to render nested layouts via matched chain + OutletContext. Parent layouts stay mounted when navigating between sibling child routes. Replace `createOutlet` with standalone `Outlet` component and shared `OutletContext`.
