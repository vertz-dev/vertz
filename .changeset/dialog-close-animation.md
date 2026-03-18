---
'@vertz/ui-primitives': patch
'@vertz/theme-shadcn': patch
---

Fix dialog close animation not playing with native `<dialog>`. Reorder close logic to call hideDialog() before updating reactive state, force reflow to start CSS animation, prevent native close on Escape, and add ::backdrop fade-out animation.
