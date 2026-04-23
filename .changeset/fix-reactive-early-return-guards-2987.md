---
'@vertz/native-compiler': patch
'vertz': patch
---

fix(compiler): make early-return guards reactive in component bodies

Closes [#2987](https://github.com/vertz-dev/vertz/issues/2987).

A component of the shape `if (cond) return <Loading/>; return <Ready/>;` froze at the guard branch: the body ran once at mount and never re-ran when `cond` flipped. This broke the documented loading-UX pattern of `query().loading` + early return.

The compiler now detects the guard shape (N consecutive `if (cond) return <jsx>;` at the top of a component body, followed by a single trailing `return <jsx>;`) and rewrites the body to wrap the main return in a chain of `__conditional(() => cond, () => branch, () => fallback)` calls, so the condition is re-evaluated reactively and the DOM swaps between branches without re-mounting the component.

Guards with an `else` branch, multi-statement blocks, or non-guard statements between guards are left alone — the per-return mount-frame wrapper still handles them.
