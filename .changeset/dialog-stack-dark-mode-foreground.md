---
'@vertz/theme-shadcn': patch
---

fix(theme-shadcn): dialog stack panel and title render in dark-mode foreground color

`useDialogStack().confirm()` and other stack-rendered dialogs had unreadable
black title text on dark backgrounds because the global CSS for the
`dialog[data-dialog-wrapper]` panel did not set `color` explicitly. Native
`<dialog>` elements render in the top layer and do not inherit `body` color,
so the panel must set `color: var(--color-foreground)` — the same fix the
scoped `Dialog.Panel` already applies. The title rule now also sets the
foreground color explicitly as a defense-in-depth.

Closes #2756.
