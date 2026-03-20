---
'@vertz/theme-shadcn': patch
---

Fix dialog panel CSS hiding non-native dialog elements with data-state="open"

The `&:not([open])` rule on dialog and alert-dialog panel styles assumed native
`<dialog>` elements. When a `<div role="dialog">` used panel styles, the element
was always hidden because `<div>` never has the `[open]` attribute. Changed to
`&:not([open]):not([data-state="open"])` so elements with `data-state="open"` remain visible.
