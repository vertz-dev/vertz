---
'@vertz/ui-compiler': patch
---

Fix boolean shorthand JSX attributes dropping IDL properties (e.g. `<input checked />` now emits `el.checked = true`)
