---
'@vertz/ui-compiler': patch
---

Emit `<!--/child-->` end markers in AOT SSR compiler (#1815)

The AOT SSR path now emits `<!--/child-->` end markers after reactive text expressions, matching the DOM-shim SSR behavior added in #1812. Without end markers, AOT-generated SSR output was vulnerable to the same text node merging issue where hydration cleanup could consume adjacent static text.
