---
'@vertz/ui-primitives': patch
'@vertz/theme-shadcn': patch
---

Sheet overlay no longer blocks pointer events when closed. Added `pointer-events: none` to the overlay's closed state in both the theme CSS and the composed component's inline style.
