---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
'@vertz/ui-server': patch
---

Support React-style `style` objects with camelCase properties. `style={{ backgroundColor: 'red' }}` now converts to a CSS string at all levels: JSX runtime, compiler-generated code, reactive `__attr()` bindings, and SSR. Includes auto-px for dimensional numeric values, unitless property detection, and vendor prefix handling.
