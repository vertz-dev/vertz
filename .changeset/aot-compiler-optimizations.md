---
'@vertz/ui-compiler': patch
---

feat(ui-compiler): AOT compiler optimizations — compile more components to string-builder functions

Four optimizations that reduce runtime-fallback classifications:
1. Derived variable preamble: body-level variable declarations computed from query data are now included in AOT function preambles instead of falling back to runtime.
2. Map callback block body preservation: `.map()` callbacks with variable declarations before the return statement are preserved instead of falling back to `__esc()`.
3. If-else chain flattening: if-else and if-else-if return patterns compile to nested ternaries instead of falling back to runtime.
4. `||` and `??` operator support: when the right operand is JSX, these generate conditional rendering (truthy/non-nullish shows escaped value, falsy/nullish shows JSX fallback).
