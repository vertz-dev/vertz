---
'@vertz/ui': patch
---

Fix SSR hydration dropping static text between adjacent reactive expressions (#1812)

Added `<!--/child-->` end markers to precisely bound each `__child`'s content during hydration. Previously, the browser would merge adjacent text nodes across `<!--child-->` comment boundaries, causing the hydration cleanup to consume static text that didn't belong to the reactive expression (e.g., "Showing 1–{a} of {b} items" would render as "Showing 1–11 items").
