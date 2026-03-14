---
'@vertz/ui': patch
---

Add View Transitions API integration to the router. Navigations can optionally wrap DOM updates in `document.startViewTransition()` for animated page transitions. Supports global, per-route, and per-navigation config with graceful degradation for unsupported browsers, reduced motion, and SSR. Adds `vt-name` CSS shorthand for `view-transition-name`.
