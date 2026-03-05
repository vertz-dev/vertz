---
'@vertz/ui-server': patch
---

Fix source map line offset in dev server

Breakpoints in browser DevTools were landing 2-3 lines below the intended position. The Bun plugin prepends CSS import and Fast Refresh preamble lines before the compiled code, but the source map was not adjusted for these extra lines. Now the source map mappings are offset by the number of prepended lines, so breakpoints land on the correct line.
