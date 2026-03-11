---
'@vertz/ui-primitives': patch
---

Fix `sideEffects` metadata to declare shared chunks as side-effectful, eliminating `ignored-bare-import` warnings during tree-shaking. Add regression test that fails on these warnings.
