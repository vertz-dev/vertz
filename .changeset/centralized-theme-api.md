---
'@vertz/ui': patch
'@vertz/theme-shadcn': patch
---

feat(ui): add centralized theme API — registerTheme() + @vertz/ui/components

Adds `registerTheme()` to `@vertz/ui` and a new `@vertz/ui/components` subpath export. Developers can now register a theme once and import components from a single, stable path instead of threading theme references through local modules.

`@vertz/theme-shadcn` now provides module augmentation for `@vertz/ui/components`, giving full type safety to centralized component imports when the theme package is installed.
