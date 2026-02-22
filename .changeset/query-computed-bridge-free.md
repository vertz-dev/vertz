---
'@vertz/ui-compiler': patch
---

Fix reactivity analyzer to classify `const` variables derived from signal API properties (query, form, createLoader) as computed instead of static. This eliminates the need for manual `effect()` bridges when deriving state from `query()` results — developers can now use plain `const` declarations and the compiler handles reactivity automatically.
