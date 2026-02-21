---
'@vertz/ui-server': patch
---

escapeAttr() now defensively coerces non-string attribute values to strings instead of crashing.
