---
'@vertz/ui': patch
---

Add type-safe CSS utility validation: `css()` and `variants()` now reject invalid utility class names at compile time with full editor autocomplete. The `UtilityClass` union type is exported for custom type definitions.
