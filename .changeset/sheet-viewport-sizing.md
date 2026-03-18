---
'@vertz/theme-shadcn': patch
---

Fix Sheet panels not taking full viewport height/width after native dialog rewrite. Left/right panels now set `height: 100dvh` and `max-height: none`; top/bottom panels set `width: 100dvw` and `max-width: none` to override the `<dialog>` UA stylesheet constraints.
