---
'@vertz/ui-compiler': patch
'@vertz/ui-primitives': patch
---

fix(ui-compiler): object/array literals no longer incorrectly wrapped in computed()

The ReactivityAnalyzer now skips object and array literal initializers during
computed classification, matching the existing behavior for function definitions.
This removes the need for `build*Ctx()` helper workarounds in composed primitives.
