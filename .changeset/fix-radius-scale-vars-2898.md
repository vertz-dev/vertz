---
'@vertz/theme-shadcn': patch
---

fix(theme-shadcn): emit `--radius-*` scale vars in `configureThemeBase()` [#2898]

`token.radius.sm|md|lg|xl|full` compile to `var(--radius-*)`, but only the single
`--radius` was being emitted — so every consumer shipped with `border-radius: 0`
(squared buttons, cards, inputs, and squared radios/avatars/switches/badges that
should be circles). Emit the full shadcn-style calc-based scale plus
`--radius-full: 9999px` alongside `--radius`.
