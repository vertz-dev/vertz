---
'@vertz/ui': patch
---

Fix `globalCss()` to auto-inject generated CSS into `document.head` via `<style data-vertz-css>` tags, matching the existing behavior of `css()`. Previously, `globalCss()` returned the CSS string but required manual injection.
