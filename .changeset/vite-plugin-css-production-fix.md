---
'@vertz/ui-compiler': patch
---

Fix virtual CSS module loading in production build. The load() hook now returns an empty JS module in production instead of raw CSS, which Rollup cannot parse. CSS is still emitted correctly via generateBundle().
