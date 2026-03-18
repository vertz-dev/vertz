---
'@vertz/ui-primitives': patch
---

Fix 7 test failures in composed components (context-menu, menubar, carousel, command, hover-card): wire event handlers via JSX instead of dead onMount blocks, fix focus/blur to use bubbling focusin/focusout events, work around happy-dom wrapper identity issue in tests.
