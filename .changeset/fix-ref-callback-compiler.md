---
'@vertz/ui': patch
'@vertz/native-compiler': patch
---

fix(compiler): emit valid code for callback `ref` props on host elements

Previously, the native compiler always emitted `{expr}.current = {el}` for
the `ref` JSX prop, assuming an object ref. For a callback ref such as
`ref={(el) => { /* ... */ }}`, the output was the invalid JavaScript
`(el) => { /* ... */ }.current = __el0` — a member expression cannot
follow an arrow function with a block body, so the module failed to parse
with "Unexpected token '.'".

The fix routes both forms through a new `__ref(el, value)` runtime helper
(matching the existing inline logic in `jsx-runtime/index.ts`) that calls
the value if it is a function and otherwise assigns to `.current`.

Closes #2788.
