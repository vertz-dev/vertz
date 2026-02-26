---
'@vertz/ui': patch
---

Add per-field `setValue()` and `reset()` methods to the `form()` API. `field.setValue(value)` programmatically sets the value and auto-computes dirty state. `field.reset()` restores the field to its initial value and clears error/dirty/touched.
