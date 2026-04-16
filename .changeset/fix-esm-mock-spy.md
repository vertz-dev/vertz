---
'@vertz/runtime': patch
---

Fix `vi.mock()` and `spyOn()` on ESM module exports by adding a spy_exports compiler transform that converts `export` declarations to mutable `let` bindings with setter registration, mock proxy generation for CJS/opaque modules, and `mocked_bare_specifiers` to prevent synthetic module intercepts from bypassing `vi.mock()`
