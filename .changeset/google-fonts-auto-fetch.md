---
'@vertz/ui': patch
'@vertz/ui-server': patch
---

Add `googleFont()` API for automatic Google Fonts fetching.

- `googleFont(family, options)` returns a `FontDescriptor` with `__google` metadata
- Dev server resolves Google Font descriptors at startup and on HMR, downloading `.woff2` files to `.vertz/fonts/` cache
- Subset-aware parsing selects the correct `.woff2` file (latin by default) instead of the first alphabetical subset
- Font metrics extraction handles absolute and root-relative paths from the resolver
- New exports from `@vertz/ui/css`: `googleFont`, `GoogleFontOptions`, `GoogleFontMeta`
